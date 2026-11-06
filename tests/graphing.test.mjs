// 隐函数 / 不等式的几何计算
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classify,
  contourSegments,
  hexToRgb,
  implicitBody,
  ineqAlphaMask,
  ineqBody,
  sampleField,
} from '../src/tools/graphing/implicit.js'

/* ---------------- 表达式分类 ---------------- */

test('classify: 四类表达式与空输入', () => {
  assert.equal(classify(''), 'empty')
  assert.equal(classify('y = sin(x)'), 'explicit')
  assert.equal(classify('y = 2*x + 1'), 'explicit')
  assert.equal(classify('x^2+y^2=25'), 'implicit')
  assert.equal(classify('y > x^2-4'), 'ineq')
  assert.equal(classify('x <= 3'), 'ineq')
  assert.equal(classify('(1,2) (3,4)'), 'points')
  assert.equal(classify('(1,2), (3,4),'), 'points')
})

test('implicitBody / ineqBody: 转成 F(x,y) 形式', () => {
  assert.equal(implicitBody('x^2+y^2=25'), '(x^2+y^2)-(25)')
  assert.throws(() => implicitBody('x^2+y^2='), /等号右边为空/)

  const gt = ineqBody('y > x^2-4')
  assert.equal(gt.body, '(y)-(x^2-4)')
  assert.equal(gt.positive, true)
  assert.equal(gt.strict, true)

  const le = ineqBody('y <= 3')
  assert.equal(le.positive, false)
  assert.equal(le.strict, false)

  assert.throws(() => ineqBody('y'), /无法解析不等式/)
})

/* ---------------- 采样 ---------------- */

const BOUNDS = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }

test('sampleField: 全部求值成功时 finite 等于网格点数', () => {
  const field = sampleField({
    w: 200,
    h: 200,
    cols: 20,
    rows: 20,
    bounds: BOUNDS,
    evaluateAt: (x, y) => x * x + y * y - 25,
  })
  assert.equal(field.finite, 21 * 21)
  assert.equal(field.firstError, '')
  assert.equal(field.values.length, 21 * 21)
})

test('sampleField: 求值抛错时记录首个错误且该点记为 NaN', () => {
  let calls = 0
  const field = sampleField({
    w: 100,
    h: 100,
    cols: 2,
    rows: 2,
    bounds: BOUNDS,
    evaluateAt: () => {
      calls += 1
      throw new Error('boom')
    },
  })
  assert.equal(calls, 9)
  assert.equal(field.finite, 0)
  assert.equal(field.firstError, 'boom')
  assert.ok(Number.isNaN(field.values[0]))
})

/* ---------------- 等值线 ---------------- */

test('contourSegments: x²+y²=25 画出接近半径 5 的圆', () => {
  const size = 200
  const field = sampleField({
    w: size,
    h: size,
    cols: 100,
    rows: 100,
    bounds: BOUNDS,
    evaluateAt: (x, y) => x * x + y * y - 25,
  })
  const segments = contourSegments(field)
  assert.ok(segments.length > 100, `线段数 ${segments.length}`)

  // 屏幕中心 = 世界原点，缩放 10px/单位，半径 5 → 50px
  for (const [x1, y1, x2, y2] of segments) {
    for (const [px, py] of [
      [x1, y1],
      [x2, y2],
    ]) {
      const r = Math.hypot(px - size / 2, py - size / 2) / 10
      assert.ok(Math.abs(r - 5) < 0.3, `点半径 ${r.toFixed(3)} 偏离圆`)
    }
  }
})

test('contourSegments: 常数值场没有等值线', () => {
  const field = sampleField({
    w: 50,
    h: 50,
    cols: 5,
    rows: 5,
    bounds: BOUNDS,
    evaluateAt: () => 1,
  })
  assert.equal(contourSegments(field).length, 0)
})

/* ---------------- 不等式蒙版 ---------------- */

test('ineqAlphaMask: y > 0 只填充上半部分', () => {
  const mask = ineqAlphaMask({
    w: 100,
    h: 100,
    scale: 2,
    bounds: BOUNDS,
    positive: true,
    evaluateAt: (x, y) => y,
  })
  assert.equal(mask.width, 50)
  assert.equal(mask.height, 50)
  assert.ok(mask.inside > 0)

  // 上半（j 小）应命中，下半（j 大）不命中
  const at = (i, j) => mask.alpha[j * mask.width + i]
  assert.equal(at(25, 0), 1)
  assert.equal(at(25, mask.height - 1), 0)
})

test('ineqAlphaMask: 全部求值失败时不填充', () => {
  const mask = ineqAlphaMask({
    w: 60,
    h: 60,
    bounds: BOUNDS,
    positive: true,
    evaluateAt: () => {
      throw new Error('nope')
    },
  })
  assert.equal(mask.inside, 0)
})

/* ---------------- 颜色 ---------------- */

test('hexToRgb: 解析 #rrggbb', () => {
  assert.deepEqual(hexToRgb('#c74440'), [199, 68, 64])
  assert.deepEqual(hexToRgb('2d70b3'), [45, 112, 179])
})
