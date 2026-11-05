/**
 * 最小二乘拟合与点集解析（纯函数，与画布状态无关）
 * 从 GraphingTool.vue 抽出来，方便单独测试
 */

export function defaultFormat(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 10000 || abs < 0.001)) return n.toExponential(2)
  return String(Number(n.toFixed(3)))
}

// 高斯消元解 3 元一次方程组（带主元选取）
export function solve3(matrix) {
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

export function fitLinear(pts, fmt = defaultFormat) {
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

export function fitQuadratic(pts, fmt = defaultFormat) {
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

export function rSquared(pts, predict) {
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

// 表格录入的数据 → 数值点，过滤掉空行和非法值
export function tablePoints(entry) {
  return (entry.data || [])
    .map((row) => [Number(row[0]), Number(row[1])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
}

// 从 "(1,2) (3,4)" 中抽出坐标表达式对（不求值，可能含参数）
export function parsePoints(text) {
  const out = []
  const re = /\(\s*([^(),]+?)\s*,\s*([^(),]+?)\s*\)/g
  let m
  while ((m = re.exec(text)) !== null) out.push([m[1], m[2]])
  return out
}
