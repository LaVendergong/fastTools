<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { evaluate } from '../calculator/expr'
import { readJSON } from '../../lib/storage'

const COLORS = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#000000', '#c7449a', '#0e8a8a']
const STORAGE_KEY = 'toolbox:graphing'
const DEFAULT_VIEW = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 }

const saved = readJSON(STORAGE_KEY)

let seq = 1
const expressions = ref(
  saved.expressions?.length
    ? saved.expressions.map((e) => ({ ...e, id: seq++, error: '' }))
    : [{ id: seq++, text: 'y = sin(x)', color: COLORS[0], visible: true, error: '' }],
)

const view = reactive({ ...DEFAULT_VIEW, ...(saved.view || {}) })
const params = ref([])
const hover = ref(null)
const wrapEl = ref(null)
const canvasEl = ref(null)
const size = reactive({ w: 900, h: 560 })

const toScreenX = (x) => ((x - view.xMin) / (view.xMax - view.xMin)) * size.w
const toScreenY = (y) => size.h - ((y - view.yMin) / (view.yMax - view.yMin)) * size.h
const toWorldX = (px) => view.xMin + (px / size.w) * (view.xMax - view.xMin)
const toWorldY = (py) => view.yMin + ((size.h - py) / size.h) * (view.yMax - view.yMin)

const viewLabel = computed(
  () => `x: ${fmt(view.xMin)} ~ ${fmt(view.xMax)}`,
)

// 去掉开头形如 "y =" / "r =" / "f = " 的左边（参数定义 a = 2 已被 isParamDef 提前排除）
const stripY = (text) => text.replace(/^\s*[a-zA-Zθ]\s*=\s*/, '').trim()
const isParamDef = (text) => /^\s*[a-zA-Z]\w*\s*=\s*-?\d*\.?\d+\s*$/.test(text)

function fmt(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 10000 || abs < 0.001)) return n.toExponential(2)
  return String(Number(n.toFixed(3)))
}

function niceStep(span, target) {
  const raw = span / target
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / pow
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * pow
}

function varsAt(x, y = 0) {
  const vars = { x, y, theta: 0 }
  for (const p of params.value) vars[p.name] = p.value
  return vars
}

/* ---------------- 表达式分类 ---------------- */

// explicit: y = f(x) / polar: r = f(theta) / implicit: F(x,y) = 0 / ineq: 区域填充 / points: 点集
function classify(text) {
  const t = text.trim()
  if (!t) return 'empty'

  // 点集：(1,2) (3,4)，支持写成 (1,2), (3,4) 或 (1,2);(3,4)
  if (/^\(/.test(t) && /\)$/.test(t.replace(/[,;\s]+$/, ''))) return 'points'

  const eq = t.indexOf('=')
  const hasCompare = /[<>]/.test(t)

  if (hasCompare) return 'ineq'
  if (eq <= 0) return 'explicit'

  const left = t.slice(0, eq).trim()
  // 左边是单个字母（y / r / 自定义名）才算显式函数，其余按隐函数处理
  if (/^[a-zA-Zθ]$/.test(left)) return 'explicit'
  return 'implicit'
}

// 从 "(1,2) (3,4)" 里抽出所有坐标表达式对
function parsePoints(text) {
  const out = []
  const re = /\(\s*([^(),]+?)\s*,\s*([^(),]+?)\s*\)/g
  let m
  while ((m = re.exec(text)) !== null) out.push([m[1], m[2]])
  return out
}

/* ---------------- 最小二乘拟合 ---------------- */

function solve3(matrix) {
  const a = matrix.map((row) => [...row])
  for (let i = 0; i < 3; i++) {
    let pivot = i
    for (let j = i + 1; j < 3; j++) {
      if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j
    }
    if (Math.abs(a[pivot][i]) < 1e-12) return null
    ;[a[i], a[pivot]] = [a[pivot], a[i]]
    for (let j = i + 1; j < 3; j++) {
      const f = a[j][i] / a[i][i]
      for (let k = i; k < 4; k++) a[j][k] -= f * a[i][k]
    }
  }
  const x = [0, 0, 0]
  for (let i = 2; i >= 0; i--) {
    let sum = a[i][3]
    for (let k = i + 1; k < 3; k++) sum -= a[i][k] * x[k]
    x[i] = sum / a[i][i]
  }
  return x
}

function fitLinear(pts) {
  const n = pts.length
  if (n < 2) return null
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  let num = 0
  let den = 0
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my)
    den += (x - mx) ** 2
  }
  if (!den) return null
  const b = num / den
  const a = my - b * mx
  return {
    predict: (x) => a + b * x,
    label: `ŷ = ${fmt(a)} ${b >= 0 ? '+' : '−'} ${fmt(Math.abs(b))}x`,
  }
}

function fitQuadratic(pts) {
  const n = pts.length
  if (n < 3) return null
  let s1 = 0
  let s2 = 0
  let s3 = 0
  let s4 = 0
  let ty = 0
  let txy = 0
  let tx2y = 0
  for (const [x, y] of pts) {
    const x2 = x * x
    s1 += x
    s2 += x2
    s3 += x2 * x
    s4 += x2 * x2
    ty += y
    txy += x * y
    tx2y += x2 * y
  }
  const sol = solve3([
    [n, s1, s2, ty],
    [s1, s2, s3, txy],
    [s2, s3, s4, tx2y],
  ])
  if (!sol) return null
  const [a, b, c] = sol
  return {
    predict: (x) => a + b * x + c * x * x,
    label: `ŷ = ${fmt(a)} ${b >= 0 ? '+' : '−'} ${fmt(Math.abs(b))}x ${
      c >= 0 ? '+' : '−'
    } ${fmt(Math.abs(c))}x²`,
  }
}

function rSquared(pts, predict) {
  const n = pts.length
  if (!n) return 0
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  let ssRes = 0
  let ssTot = 0
  for (const [x, y] of pts) {
    ssRes += (y - predict(x)) ** 2
    ssTot += (y - my) ** 2
  }
  if (ssTot === 0) return 1
  return 1 - ssRes / ssTot
}

function tablePoints(e) {
  return (e.data || [])
    .map((row) => [Number(row[0]), Number(row[1])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
}

// x^2+y^2=25 → (x^2+y^2)-(25)
function implicitBody(text) {
  const eq = text.indexOf('=')
  const left = text.slice(0, eq).trim()
  const right = text.slice(eq + 1).trim()
  if (!right) throw new Error('等号右边为空')
  return `(${left})-(${right})`
}

// y > x^2-4 → { body: '(y)-(x^2-4)', positive: true }（positive 表示填充 F>0 的一侧）
function ineqBody(text) {
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

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/* ---------------- 隐函数：marching squares ---------------- */

function sampleField(body, w, h, cols, rows) {
  const values = new Float64Array((cols + 1) * (rows + 1))
  const stepX = w / cols
  const stepY = h / rows
  let firstError = ''
  let finite = 0

  for (let j = 0; j <= rows; j++) {
    const wy = toWorldY(j * stepY)
    for (let i = 0; i <= cols; i++) {
      const wx = toWorldX(i * stepX)
      let v = NaN
      try {
        v = evaluate(body, { vars: varsAt(wx, wy) })
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

function contourPath(field) {
  const { values, stepX, stepY, cols, rows } = field
  const at = (i, j) => values[j * (cols + 1) + i]
  const path = new Path2D()

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
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
        path.moveTo(pts[0][0], pts[0][1])
        path.lineTo(pts[1][0], pts[1][1])
      } else if (pts.length === 4) {
        path.moveTo(pts[0][0], pts[0][1])
        path.lineTo(pts[1][0], pts[1][1])
        path.moveTo(pts[2][0], pts[2][1])
        path.lineTo(pts[3][0], pts[3][1])
      }
    }
  }
  return path
}

/* ---------------- 参数（a = 1 这类定义自动生成滑块） ---------------- */

function syncParams() {
  const found = []
  for (const e of expressions.value) {
    const m = /^\s*([a-zA-Z]\w*)\s*=\s*(-?\d*\.?\d+)\s*$/.exec(e.text)
    if (!m) continue
    found.push({ name: m[1], value: Number(m[2]) })
  }

  params.value = found.map((p) => {
    const old = params.value.find((x) => x.name === p.name)
    if (old) return { ...old, value: old.value }
    const span = Math.max(2, Math.abs(p.value) * 2 || 4)
    return { name: p.name, value: p.value, min: -span, max: span, step: 0.1 }
  })
}

/* ---------------- 绘制 ---------------- */

function draw() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(100, Math.round(size.w))
  const h = Math.max(100, Math.round(size.h))

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  drawGrid(ctx, w, h)
  drawCurves(ctx, w, h)
  drawHover(ctx, w, h)
}

function drawGrid(ctx, w, h) {
  const stepX = niceStep(view.xMax - view.xMin, 10)
  const stepY = niceStep(view.yMax - view.yMin, 8)

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
    const px = Math.round(toScreenX(x)) + 0.5
    ctx.moveTo(px, 0)
    ctx.lineTo(px, h)
  }
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    const py = Math.round(toScreenY(y)) + 0.5
    ctx.moveTo(0, py)
    ctx.lineTo(w, py)
  }
  ctx.stroke()

  // 坐标轴
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  const axisY = toScreenY(0)
  const axisX = toScreenX(0)
  if (axisY >= 0 && axisY <= h) {
    ctx.moveTo(0, Math.round(axisY) + 0.5)
    ctx.lineTo(w, Math.round(axisY) + 0.5)
  }
  if (axisX >= 0 && axisX <= w) {
    ctx.moveTo(Math.round(axisX) + 0.5, 0)
    ctx.lineTo(Math.round(axisX) + 0.5, h)
  }
  ctx.stroke()

  // 刻度数字
  ctx.fillStyle = 'rgba(0, 0, 0, 0.44)'
  ctx.font = '11px -apple-system, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const labelY = Math.min(h - 15, Math.max(2, axisY + 4))
  for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
    if (Math.abs(x) < stepX / 1000) continue
    ctx.fillText(fmt(x), toScreenX(x), labelY)
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const labelX = Math.min(w - 42, Math.max(4, axisX + 6))
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    if (Math.abs(y) < stepY / 1000) continue
    ctx.fillText(fmt(y), labelX, toScreenY(y))
  }
}

function drawCurves(ctx, w, h) {
  const vars = varsAt(0)
  for (const e of expressions.value) {
    if (!e.visible || !e.text.trim() || isParamDef(e.text)) continue

    const kind = e.kind === 'table' ? 'table' : e.polar ? 'polar' : classify(e.text)
    if (kind === 'empty') continue

    let firstError = ''

    // 表格：数据点 + 可选最小二乘拟合
    if (kind === 'table') {
      const pts = tablePoints(e)
      if (!pts.length) {
        if (e.fitText !== '请至少填写一行有效数据') e.fitText = '请至少填写一行有效数据'
      } else if (e.fitText === '请至少填写一行有效数据') {
        e.fitText = ''
      }

      ctx.save()
      // 数据点
      for (const [wx, wy] of pts) {
        const sx = toScreenX(wx)
        const sy = toScreenY(wy)
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue
        ctx.beginPath()
        ctx.arc(sx, sy, 4, 0, Math.PI * 2)
        ctx.fillStyle = e.color
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.stroke()
      }

      // 拟合曲线
      if (e.fit === 'linear' || e.fit === 'quad') {
        const fitted = e.fit === 'linear' ? fitLinear(pts) : fitQuadratic(pts)
        if (!fitted) {
          const text = `拟合至少需要 ${e.fit === 'linear' ? 2 : 3} 个有效点`
          if (e.fitText !== text) e.fitText = text
        } else {
          const r2 = rSquared(pts, fitted.predict)
          const text = `${fitted.label}　R² = ${r2.toFixed(4)}`
          if (e.fitText !== text) e.fitText = text

          ctx.beginPath()
          let started = false
          for (let px = 0; px <= w; px += 2) {
            const wx = toWorldX(px)
            const wy = fitted.predict(wx)
            if (!Number.isFinite(wy)) {
              started = false
              continue
            }
            const py = toScreenY(wy)
            if (py < -h * 2 || py > h * 3) {
              started = false
              continue
            }
            if (started) ctx.lineTo(px, py)
            else {
              ctx.moveTo(px, py)
              started = true
            }
          }
          ctx.strokeStyle = e.color
          ctx.lineWidth = 1.8
          ctx.setLineDash([7, 5])
          ctx.stroke()
          ctx.setLineDash([])
        }
      } else if (e.fitText) {
        e.fitText = ''
      }

      ctx.restore()
      if (e.error !== firstError) e.error = firstError
      continue
    }

    // 点集：(1,2) (3,4)，坐标里可以引用参数和常量
    if (kind === 'points') {
      const pairs = parsePoints(e.text)
      const pts = []
      if (!pairs.length) firstError = '点的写法：(1,2) (3,4)'
      for (const [xs, ys] of pairs) {
        try {
          const wx = evaluate(xs, { vars: varsAt(0) })
          const wy = evaluate(ys, { vars: varsAt(0) })
          if (Number.isFinite(wx) && Number.isFinite(wy)) pts.push([wx, wy])
          else firstError = '点的坐标不是有效数值'
        } catch (err) {
          firstError = err.message
        }
      }

      ctx.save()
      for (const [wx, wy] of pts) {
        const sx = toScreenX(wx)
        const sy = toScreenY(wy)
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue

        ctx.beginPath()
        ctx.arc(sx, sy, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = e.color
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.stroke()

        // 点不多时标出坐标
        if (pts.length <= 20) {
          ctx.font = '11px -apple-system, "PingFang SC", sans-serif'
          ctx.fillStyle = e.color
          ctx.fillText(`(${fmt(wx)}, ${fmt(wy)})`, sx + 7, sy - 7)
        }
      }
      ctx.restore()

      if (e.error !== firstError) e.error = firstError
      continue
    }

    // 隐函数 F(x,y)=0：等值线
    if (kind === 'implicit') {
      try {
        const body = implicitBody(e.text)
        const field = sampleField(body, w, h, 150, Math.round((150 * h) / w))
        if (!field.finite) {
          firstError = field.firstError || '无法在该范围内求值'
        }
        const path = contourPath(field)
        ctx.save()
        ctx.strokeStyle = e.color
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.stroke(path)
        ctx.restore()
      } catch (err) {
        firstError = err.message
      }
      if (e.error !== firstError) e.error = firstError
      continue
    }

    // 不等式：填充区域 + 边界线
    if (kind === 'ineq') {
      try {
        const parsed = ineqBody(e.text)
        const field = sampleField(parsed.body, w, h, 120, Math.round((120 * h) / w))
        if (!field.finite) {
          firstError = field.firstError || '无法在该范围内求值'
        }
        const [r, g, b] = hexToRgb(e.color)

        // 低分辨率蒙版放大绘制，比逐块 fillRect 快得多
        const scale = 3
        const mw = Math.max(1, Math.ceil(w / scale))
        const mh = Math.max(1, Math.ceil(h / scale))
        const off = document.createElement('canvas')
        off.width = mw
        off.height = mh
        const octx = off.getContext('2d')
        const img = octx.createImageData(mw, mh)

        for (let j = 0; j < mh; j++) {
          const wy = toWorldY(j * scale)
          for (let i = 0; i < mw; i++) {
            const wx = toWorldX(i * scale)
            let v = NaN
            try {
              v = evaluate(parsed.body, { vars: varsAt(wx, wy) })
            } catch {
              v = NaN
            }
            const inside = Number.isFinite(v) && (parsed.positive ? v > 0 : v < 0)
            const idx = (j * mw + i) * 4
            img.data[idx] = r
            img.data[idx + 1] = g
            img.data[idx + 2] = b
            img.data[idx + 3] = inside ? 46 : 0
          }
        }

        octx.putImageData(img, 0, 0)
        ctx.save()
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(off, 0, 0, mw, mh, 0, 0, w, h)

        // 边界线（半透明虚线更符合"不包括边界"的直觉）
        ctx.strokeStyle = e.color
        ctx.lineWidth = parsed.strict ? 1.5 : 2
        if (parsed.strict) ctx.setLineDash([5, 4])
        ctx.stroke(contourPath(field))
        ctx.restore()
      } catch (err) {
        firstError = err.message
      }
      if (e.error !== firstError) e.error = firstError
      continue
    }

    const body = stripY(e.text)
    if (!body) continue

    ctx.beginPath()
    ctx.strokeStyle = e.color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    let started = false

    // 极坐标：r = f(theta)，转成 x = r·cosθ、y = r·sinθ
    if (kind === 'polar') {
      const steps = 900
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 4
        Object.assign(vars, { x: 0, theta })
        let r
        try {
          r = evaluate(body, { vars })
        } catch (err) {
          firstError = err.message
          break
        }
        if (!Number.isFinite(r)) {
          started = false
          continue
        }
        const wx = r * Math.cos(theta)
        const wy = r * Math.sin(theta)
        const px = toScreenX(wx)
        const py = toScreenY(wy)
        if (!Number.isFinite(px) || !Number.isFinite(py) || py < -h || py > h * 2) {
          started = false
          continue
        }
        if (started) ctx.lineTo(px, py)
        else {
          ctx.moveTo(px, py)
          started = true
        }
      }
      ctx.stroke()
      if (e.error !== firstError) e.error = firstError
      continue
    }

    for (let px = 0; px <= w; px += 1) {
      const x = toWorldX(px)
      Object.assign(vars, { x })
      let y
      try {
        y = evaluate(body, { vars })
      } catch (err) {
        firstError = err.message
        break
      }
      if (!Number.isFinite(y)) {
        started = false
        continue
      }
      const py = toScreenY(y)
      if (py < -h || py > h * 2) {
        started = false
        continue
      }
      if (started) ctx.lineTo(px, py)
      else {
        ctx.moveTo(px, py)
        started = true
      }
    }
    ctx.stroke()

    if (e.error !== firstError) e.error = firstError
  }
}

function drawHover(ctx, w, h) {
  if (!hover.value) return
  const { px, py, x, y } = hover.value

  ctx.save()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(px, 0)
  ctx.lineTo(px, h)
  ctx.moveTo(0, py)
  ctx.lineTo(w, py)
  ctx.stroke()
  ctx.restore()

  for (const e of expressions.value) {
    if (!e.visible || !e.text.trim() || isParamDef(e.text)) continue
    // 点集、隐函数、不等式没有「某个 x 对应的一个 y」，不画悬停点
    const kind = e.polar ? 'polar' : classify(e.text)
    if (kind === 'points' || kind === 'implicit' || kind === 'ineq') continue
    try {
      const yv = evaluate(stripY(e.text), { vars: varsAt(x) })
      if (!Number.isFinite(yv)) continue
      const spy = toScreenY(yv)
      if (spy < -40 || spy > h + 40) continue
      ctx.beginPath()
      ctx.fillStyle = e.color
      ctx.arc(toScreenX(x), spy, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    } catch {
      /* 忽略 */
    }
  }

  const label = `(${fmt(x)}, ${fmt(y)})`
  ctx.font = '11px -apple-system, system-ui, sans-serif'
  const tw = ctx.measureText(label).width + 12
  let lx = px + 14
  let ly = py + 14
  if (lx + tw > w) lx = px - tw - 14
  if (ly + 20 > h) ly = py - 26

  ctx.fillStyle = 'rgba(0, 0, 0, 0.76)'
  ctx.beginPath()
  ctx.roundRect(lx, ly, tw, 20, 5)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, lx + 6, ly + 10)
}

/* ---------------- 交互 ---------------- */

let dragging = null

function onMouseDown(e) {
  dragging = { x: e.clientX, y: e.clientY, view: { ...view } }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e) {
  if (!dragging) return
  const dx = e.clientX - dragging.x
  const dy = e.clientY - dragging.y
  const spanX = dragging.view.xMax - dragging.view.xMin
  const spanY = dragging.view.yMax - dragging.view.yMin
  const wx = (dx / size.w) * spanX
  const wy = (dy / size.h) * spanY

  view.xMin = dragging.view.xMin - wx
  view.xMax = dragging.view.xMax - wx
  view.yMin = dragging.view.yMin + wy
  view.yMax = dragging.view.yMax + wy
  hover.value = null
  draw()
}

function onDragEnd() {
  dragging = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  persist()
}

function onMouseMove(e) {
  if (!canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  hover.value = { px, py, x: toWorldX(px), y: toWorldY(py) }
  draw()
}

function onMouseLeave() {
  hover.value = null
  draw()
}

function onWheel(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const wx = toWorldX(mx)
  const wy = toWorldY(my)
  const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15

  view.xMin = wx - (wx - view.xMin) * factor
  view.xMax = wx + (view.xMax - wx) * factor
  view.yMin = wy - (wy - view.yMin) * factor
  view.yMax = wy + (view.yMax - wy) * factor
  draw()
  persist()
}

function zoom(factor) {
  const cx = (view.xMin + view.xMax) / 2
  const cy = (view.yMin + view.yMax) / 2
  view.xMin = cx + (view.xMin - cx) * factor
  view.xMax = cx + (view.xMax - cx) * factor
  view.yMin = cy + (view.yMin - cy) * factor
  view.yMax = cy + (view.yMax - cy) * factor
  draw()
  persist()
}

function resetView() {
  Object.assign(view, DEFAULT_VIEW)
  hover.value = null
  draw()
  persist()
}

function exportPng() {
  if (!canvasEl.value) return
  const a = document.createElement('a')
  a.href = canvasEl.value.toDataURL('image/png')
  a.download = 'graph.png'
  a.click()
}

/* ---------------- 表达式管理 ---------------- */

function addExpression() {
  expressions.value.push({
    id: seq++,
    kind: 'expr',
    text: '',
    color: COLORS[expressions.value.length % COLORS.length],
    visible: true,
    polar: false,
    error: '',
  })
}

// 表格：录入若干 (x, y) 数据点，可做最小二乘拟合
function addTable() {
  expressions.value.push({
    id: seq++,
    kind: 'table',
    text: '表格',
    data: [
      [1, 2],
      [2, 4],
      [3, 9],
    ],
    fit: 'linear',
    fitText: '',
    color: COLORS[expressions.value.length % COLORS.length],
    visible: true,
    polar: false,
    error: '',
  })
}

function removeExpression(id) {
  if (expressions.value.length === 1) {
    expressions.value[0].text = ''
    return
  }
  expressions.value = expressions.value.filter((e) => e.id !== id)
}

function setColor(e) {
  const index = COLORS.indexOf(e.color)
  e.color = COLORS[(index + 1) % COLORS.length]
}

/* ---------------- 持久化与生命周期 ---------------- */

let saveTimer
function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        expressions: expressions.value.map(({ id, ...rest }) => rest),
        view: { ...view },
      }),
    )
  }, 400)
}

watch(
  () =>
    expressions.value
      .map(
        (e) =>
          `${e.id}|${e.text}|${e.visible}|${e.color}|${e.polar}|${e.kind || ''}|${e.fit || ''}|${
            e.kind === 'table' ? JSON.stringify(e.data) : ''
          }`,
      )
      .join(';'),
  () => {
    syncParams()
    draw()
    persist()
  },
)

/* 参数动画：让滑块自动往复变化 */
const animating = ref({})
let rafId = null

function toggleAnim(p) {
  if (animating.value[p.name]) {
    animating.value[p.name] = false
    return
  }
  animating.value[p.name] = true
  let dir = 1
  const stepSize = (p.max - p.min) / 240

  const step = () => {
    if (!animating.value[p.name]) return
    let next = p.value + dir * stepSize
    if (next >= p.max) {
      next = p.max
      dir = -1
    } else if (next <= p.min) {
      next = p.min
      dir = 1
    }
    p.value = Number(next.toFixed(4))
    draw()
    rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
}

watch(
  () => params.value.map((p) => `${p.name}|${p.value}`).join(';'),
  () => draw(),
)

let observer
onMounted(() => {
  syncParams()
  const wrap = wrapEl.value
  if (wrap) {
    observer = new ResizeObserver(() => {
      size.w = wrap.clientWidth
      size.h = wrap.clientHeight
      draw()
    })
    observer.observe(wrap)
  }
  draw()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(saveTimer)
  onDragEnd()
})
</script>

<template>
  <div class="graph-tool">
    <aside class="side">
      <div class="side-head">
        <span>函数</span>
        <span class="mini">{{ expressions.length }} 条</span>
      </div>

      <div class="exprs">
        <div
          v-for="e in expressions"
          :key="e.id"
          class="expr"
          :class="{ off: !e.visible, wide: e.kind === 'table' }"
        >
          <button
            class="dot"
            :style="{ background: e.color, borderColor: e.color }"
            :title="e.visible ? '隐藏' : '显示'"
            @click="e.visible = !e.visible"
            @contextmenu.prevent="setColor(e)"
          />
          <button
            v-if="e.kind !== 'table'"
            class="mode-btn"
            :class="{ polar: e.polar }"
            :title="e.polar ? '极坐标：r = f(theta)' : '直角坐标：y = f(x)'"
            @click="e.polar = !e.polar"
          >
            {{ e.polar ? 'r' : 'y' }}
          </button>
          <span v-else class="mode-btn table" title="数据表格">▦</span>

          <div class="expr-main">
            <template v-if="e.kind === 'table'">
              <div class="tbl">
                <div class="tbl-row head">
                  <span>x</span>
                  <span>y</span>
                  <span />
                </div>
                <div v-for="(row, ri) in e.data" :key="ri" class="tbl-row">
                  <input v-model.number="row[0]" class="cell" type="number" step="any" />
                  <input v-model.number="row[1]" class="cell" type="number" step="any" />
                  <button class="cell-del" title="删除这行" @click="e.data.splice(ri, 1)">✕</button>
                </div>
                <div class="tbl-foot">
                  <button class="link-btn" @click="e.data.push([0, 0])">＋ 行</button>
                  <select v-model="e.fit" class="fit-select">
                    <option value="none">不拟合</option>
                    <option value="linear">线性拟合</option>
                    <option value="quad">二次拟合</option>
                  </select>
                </div>
                <p v-if="e.fitText" class="fit-text">{{ e.fitText }}</p>
              </div>
            </template>

            <template v-else>
              <input
                v-model="e.text"
                class="input"
                spellcheck="false"
                :placeholder="
                  e.polar ? 'r = 3*cos(2*theta)' : 'y = sin(x) / x^2+y^2=25 / y > x^2-4 / (1,2) (3,4)'
                "
                @keydown.enter="addExpression"
              />
              <p v-if="e.error" class="err">{{ e.error }}</p>
            </template>
          </div>
          <button class="del" title="删除" @click="removeExpression(e.id)">✕</button>
        </div>

        <div class="add-row">
          <button class="add" @click="addExpression">＋ 添加函数</button>
          <button class="add" @click="addTable">▦ 表格</button>
        </div>
      </div>

      <div class="params">
        <p class="params-title">参数（输入 a = 2 自动生成滑块）</p>
        <div v-for="p in params" :key="p.name" class="param">
          <button
            class="anim"
            :class="{ on: animating[p.name] }"
            :title="animating[p.name] ? '暂停动画' : '播放动画'"
            @click="toggleAnim(p)"
          >
            {{ animating[p.name] ? '❚❚' : '▶' }}
          </button>
          <span class="pname">{{ p.name }}</span>
          <input
            v-model.number="p.value"
            type="range"
            :min="p.min"
            :max="p.max"
            :step="p.step"
          />
          <input
            v-model.number="p.value"
            class="pnum"
            type="number"
            :min="p.min"
            :max="p.max"
            :step="p.step"
          />
        </div>
        <p v-if="!params.length" class="empty-param">还没有参数</p>
      </div>

      <div class="tips">
        拖动平移 · 滚轮缩放 · 双击重置 · 点击圆点隐藏 · 右键圆点换色
        <br />
        支持 sin cos tan ln log sqrt abs exp、^、π、e、|x|
      </div>
    </aside>

    <section class="canvas-area">
      <div class="toolbar">
        <button @click="zoom(1 / 1.35)">＋</button>
        <button @click="zoom(1.35)">－</button>
        <button @click="resetView">重置</button>
        <button @click="exportPng">导出 PNG</button>
        <span class="range">{{ viewLabel }}</span>
      </div>
      <div ref="wrapEl" class="canvas-wrap">
        <canvas
          ref="canvasEl"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseleave="onMouseLeave"
          @wheel.prevent="onWheel"
          @dblclick="resetView"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.graph-tool {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: 292px 1fr;
  gap: 10px;
}
.side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.side-head {
  flex: none;
  display: flex;
  align-items: center;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  font-size: 12px;
  font-weight: 600;
}
.mini {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 400;
}
.exprs {
  flex: none;
  max-height: 42%;
  overflow: auto;
  padding: 6px;
}
.expr {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px;
  border-radius: 6px;
}
.expr:hover {
  background: var(--hover);
}
/* 表格行占满整行，避免在窄侧栏里被挤压 */
.expr.wide {
  flex-wrap: wrap;
}
.expr.wide .expr-main {
  flex: 1 0 100%;
  margin-top: 3px;
}
.expr.off .input {
  opacity: 0.45;
}
.dot {
  flex: none;
  width: 13px;
  height: 13px;
  margin-top: 5px;
  border-radius: 50%;
  border: 1.5px solid;
}
.dot:hover {
  filter: brightness(1.1);
}
.expr-main {
  flex: 1;
  min-width: 0;
}
.input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}
.err {
  margin: 3px 0 0;
  font-size: 10.5px;
  color: var(--danger);
  line-height: 1.4;
}
.del {
  flex: none;
  width: 18px;
  padding-top: 5px;
  font-size: 10px;
  color: var(--text-dim);
  opacity: 0;
}
.expr:hover .del {
  opacity: 1;
}
.del:hover {
  color: var(--danger);
}
.add-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}
.add {
  flex: 1;
  padding: 5px 0;
  border-radius: 6px;
  border: 1px dashed var(--border-strong);
  font-size: 11.5px;
  color: var(--text-dim);
}
.mode-btn.table {
  background: var(--fill-2);
  font-size: 10px;
}
.tbl {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 5px 6px;
  border-radius: 7px;
  background: var(--fill-1);
}
.tbl-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tbl-row.head span {
  flex: 1;
  font-size: 9.5px;
  color: var(--text-faint);
  padding-left: 2px;
}
.tbl-row.head span:last-child {
  flex: 0 0 16px;
}
.cell {
  flex: 1;
  min-width: 0;
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.cell:focus {
  border-color: var(--accent);
}
.cell-del {
  flex: 0 0 16px;
  height: 16px;
  border-radius: 3px;
  font-size: 8px;
  color: var(--text-faint);
}
.cell-del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.tbl-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.link-btn {
  font-size: 10px;
  color: var(--accent);
  padding: 1px 3px;
  border-radius: 3px;
}
.link-btn:hover {
  background: var(--accent-soft);
}
.fit-select {
  flex: 1;
  min-width: 0;
  padding: 1px 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 10px;
}
.fit-text {
  margin: 3px 0 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 1.5;
  color: var(--accent);
  word-break: break-all;
}
.add:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.params {
  flex: none;
  padding: 8px 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  max-height: 30%;
  overflow: auto;
}
.params-title {
  margin: 0 0 6px;
  font-size: 10.5px;
  color: var(--text-dim);
}
.param {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}
.mode-btn {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 2px;
  border-radius: 5px;
  background: var(--fill-2);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.mode-btn.polar {
  background: rgba(199, 68, 64, 0.14);
  color: #c74440;
}
.anim {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 8px;
  color: var(--text-dim);
  background: var(--fill-1);
}
.anim.on {
  background: var(--accent-soft);
  color: var(--accent);
}
.pname {
  flex: none;
  width: 16px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}
.param input[type='range'] {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.pnum {
  flex: none;
  width: 62px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.empty-param {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-dim);
}
.tips {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-dim);
}
.canvas-area {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
}
.toolbar button {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
}
.toolbar button:hover {
  background: var(--hover);
}
.range {
  margin-left: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
}
.canvas-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}
.canvas-wrap canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
</style>
