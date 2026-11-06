/**
 * 隐函数与不等式的几何计算
 * 只做「表达式分类 + 采样 + 等值线」，不依赖 Vue、画布或 Path2D，
 * 调用方通过 evaluateAt(wx, wy) 提供求值能力。
 */

// explicit: y = f(x) / implicit: F(x,y) = 0 / ineq: 区域填充 / points: 点集
export function classify(text) {
  const t = String(text || '').trim()
  if (!t) return 'empty'

  // 点集：(1,2) (3,4)，也支持 (1,2), (3,4) 或 (1,2);(3,4)
  if (/^\(/.test(t) && /\)$/.test(t.replace(/[,;\s]+$/, ''))) return 'points'

  const eq = t.indexOf('=')
  if (/[<>]/.test(t)) return 'ineq'
  if (eq <= 0) return 'explicit'

  const left = t.slice(0, eq).trim()
  // 左边是单个字母（y / r / 自定义名）才算显式函数，其余按隐函数处理
  return /^[a-zA-Zθ]$/.test(left) ? 'explicit' : 'implicit'
}

// x^2+y^2=25 → (x^2+y^2)-(25)
export function implicitBody(text) {
  const eq = text.indexOf('=')
  const left = text.slice(0, eq).trim()
  const right = text.slice(eq + 1).trim()
  if (!right) throw new Error('等号右边为空')
  return `(${left})-(${right})`
}

// y > x^2-4 → { body: '(y)-(x^2-4)', positive: true }
export function ineqBody(text) {
  const m = /^(.*?)(<=|>=|<|>)(.*)$/.exec(text)
  if (!m) throw new Error('无法解析不等式')
  const left = m[1].trim()
  const op = m[2]
  const right = m[3].trim()
  if (!left || !right) throw new Error('不等式两侧不能为空')
  return {
    body: `(${left})-(${right})`,
    positive: op === '>' || op === '>=',
    strict: op === '<' || op === '>',
  }
}

/**
 * 在 w×h 的画布上按 cols×rows 网格采样 F(x,y)。
 * @param {{w:number,h:number,cols:number,rows:number,bounds:object,evaluateAt:(wx:number,wy:number)=>number}} opts
 * @returns {{values:Float64Array,stepX:number,stepY:number,cols:number,rows:number,firstError:string,finite:number}}
 */
export function sampleField({ w, h, cols, rows, bounds, evaluateAt }) {
  const values = new Float64Array((cols + 1) * (rows + 1))
  const stepX = w / cols
  const stepY = h / rows
  let firstError = ''
  let finite = 0

  const toWorldX = (px) => bounds.xMin + (px / w) * (bounds.xMax - bounds.xMin)
  const toWorldY = (py) => bounds.yMin + ((h - py) / h) * (bounds.yMax - bounds.yMin)

  for (let j = 0; j <= rows; j += 1) {
    const wy = toWorldY(j * stepY)
    for (let i = 0; i <= cols; i += 1) {
      const wx = toWorldX(i * stepX)
      let v = NaN
      try {
        v = evaluateAt(wx, wy)
      } catch (err) {
        if (!firstError) firstError = err.message
        v = NaN
      }
      if (Number.isFinite(v)) finite += 1
      values[j * (cols + 1) + i] = Number.isFinite(v) ? v : NaN
    }
  }

  return { values, stepX, stepY, cols, rows, firstError, finite }
}

/**
 * marching squares：把采样场转成等值线线段
 * 返回 [[x1, y1, x2, y2], ...]，调用方自行拼 Path2D 或 canvas 指令
 */
export function contourSegments(field) {
  const { values, stepX, stepY, cols, rows } = field
  const at = (i, j) => values[j * (cols + 1) + i]
  const segments = []

  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const v00 = at(i, j)
      const v10 = at(i + 1, j)
      const v01 = at(i, j + 1)
      const v11 = at(i + 1, j + 1)
      if (![v00, v10, v01, v11].every(Number.isFinite)) continue

      const pts = []
      const edge = (a, b, x1, y1, x2, y2) => {
        if (a === 0 || b === 0) return
        if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
          const t = a / (a - b)
          pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t])
        }
      }

      const x0 = i * stepX
      const y0 = j * stepY
      const x1 = (i + 1) * stepX
      const y1 = (j + 1) * stepY

      edge(v00, v10, x0, y0, x1, y0) // 上
      edge(v10, v11, x1, y0, x1, y1) // 右
      edge(v01, v11, x0, y1, x1, y1) // 下
      edge(v00, v01, x0, y0, x0, y1) // 左

      if (pts.length === 2) {
        segments.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]])
      } else if (pts.length === 4) {
        segments.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]])
        segments.push([pts[2][0], pts[2][1], pts[3][0], pts[3][1]])
      }
    }
  }

  return segments
}

/**
 * 不等式区域蒙版：低分辨率逐点判断，返回 alpha 数组交给调用方上色
 * @returns {{width:number,height:number,alpha:Uint8Array,inside:number}}
 */
export function ineqAlphaMask({ w, h, scale = 3, bounds, positive, evaluateAt }) {
  const width = Math.max(1, Math.ceil(w / scale))
  const height = Math.max(1, Math.ceil(h / scale))
  const alpha = new Uint8Array(width * height)

  const toWorldX = (px) => bounds.xMin + (px / w) * (bounds.xMax - bounds.xMin)
  const toWorldY = (py) => bounds.yMin + ((h - py) / h) * (bounds.yMax - bounds.yMin)

  let inside = 0
  for (let j = 0; j < height; j += 1) {
    const wy = toWorldY(j * scale)
    for (let i = 0; i < width; i += 1) {
      const wx = toWorldX(i * scale)
      let v = NaN
      try {
        v = evaluateAt(wx, wy)
      } catch {
        v = NaN
      }
      const hit = Number.isFinite(v) && (positive ? v > 0 : v < 0)
      if (hit) {
        alpha[j * width + i] = 1
        inside += 1
      }
    }
  }

  return { width, height, alpha, inside }
}

export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
}
