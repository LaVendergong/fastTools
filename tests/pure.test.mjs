// 纯函数单元测试：node --test tests/
// 这些模块不依赖 Vue 和 DOM，可以直接在 Node 里跑
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { commonPrefix, collectFiles } from '../src/tools/files/zip.js'
import { fitLinear, fitQuadratic, rSquared } from '../src/tools/graphing/fitting.js'
import { buildRequest, buildUrl, proxyEndpoint, utf8ToBase64, withQueryParam } from '../src/tools/http/build.js'
import { mergeHistory } from '../src/tools/http/history.js'
import { prettyBody, statusClass } from '../src/tools/http/response.js'

/* ---------------- 压缩包公共前缀 ---------------- */

test('commonPrefix: 同一顶层目录要剥掉', () => {
  assert.equal(commonPrefix(['proj/a.txt', 'proj/b.txt']), 'proj/')
  assert.equal(commonPrefix(['proj/a.txt', 'proj/sub/b.txt']), 'proj/')
})

test('commonPrefix: 无公共顶层目录时不剥', () => {
  assert.equal(commonPrefix(['a.txt', 'b.txt']), '')
  assert.equal(commonPrefix(['x/a.txt', 'y/b.txt']), '')
  assert.equal(commonPrefix([]), '')
})

/* ---------------- 最小二乘拟合 ---------------- */

const PTS = [
  [1, 2],
  [2, 4],
  [3, 9],
]

test('fitLinear: (1,2)(2,4)(3,9) 得 b=3.5, a=-2', () => {
  const fit = fitLinear(PTS)
  assert.ok(fit)
  assert.equal(fit.predict(1), 1.5) // -2 + 3.5*1
  assert.equal(fit.predict(3), 8.5)
  assert.match(fit.label, /-2/)
  assert.match(fit.label, /3\.5/)
})

test('fitLinear: R² = 0.9423', () => {
  const r2 = rSquared(PTS, fitLinear(PTS).predict)
  assert.ok(Math.abs(r2 - 0.9423) < 0.0001, `实际 ${r2}`)
})

test('fitQuadratic: 三点必过，R² = 1', () => {
  const fit = fitQuadratic(PTS)
  assert.ok(fit)
  for (const [x, y] of PTS) {
    assert.ok(Math.abs(fit.predict(x) - y) < 1e-9)
  }
  assert.ok(Math.abs(rSquared(PTS, fit.predict) - 1) < 1e-9)
})

test('fit: 点数不足返回 null', () => {
  assert.equal(fitLinear([[1, 1]]), null)
  assert.equal(fitQuadratic([[1, 1], [2, 2]]), null)
})

/* ---------------- URL 构建 ---------------- */

test('buildUrl: 追加参数并保留已有查询串', () => {
  assert.equal(buildUrl('https://a.com/x', [{ key: 'k', value: 'v' }]), 'https://a.com/x?k=v')
  assert.equal(
    buildUrl('https://a.com/x?a=1', [{ key: 'k', value: 'v' }]),
    'https://a.com/x?a=1&k=v',
  )
})

test('buildUrl: 空 base / 空 key 时原样', () => {
  assert.equal(buildUrl('', [{ key: 'k', value: 'v' }]), '')
  assert.equal(buildUrl('https://a.com/x', [{ key: '  ', value: 'v' }]), 'https://a.com/x')
})

test('withQueryParam: 非法 URL 原样返回', () => {
  assert.equal(withQueryParam('not a url', 'k', 'v'), 'not a url')
  assert.equal(withQueryParam('https://a.com', 'k', 'v'), 'https://a.com/?k=v')
})

test('utf8ToBase64: 与 Node Buffer 结果一致（中文）', () => {
  assert.equal(utf8ToBase64('中文'), Buffer.from('中文', 'utf8').toString('base64'))
  assert.equal(utf8ToBase64('hello'), 'aGVsbG8=')
})

/* ---------------- 请求组装 ---------------- */

test('buildRequest: bearer 认证自动加头', () => {
  const { init } = buildRequest({
    url: 'https://a.com',
    method: 'GET',
    headers: [],
    auth: { type: 'bearer', token: 'abc' },
  })
  assert.equal(init.headers.Authorization, 'Bearer abc')
})

test('buildRequest: 已有 Authorization 不覆盖', () => {
  const { init } = buildRequest({
    url: 'https://a.com',
    method: 'GET',
    headers: [{ key: 'authorization', value: 'custom' }],
    auth: { type: 'bearer', token: 'abc' },
  })
  assert.equal(init.headers.authorization, 'custom')
  assert.equal(init.headers.Authorization, undefined)
})

test('buildRequest: basic 认证按 UTF-8 编码', () => {
  const { init } = buildRequest({
    url: 'https://a.com',
    method: 'GET',
    headers: [],
    auth: { type: 'basic', user: '用户', pass: 'p@ss' },
  })
  const expected = `Basic ${Buffer.from('用户:p@ss', 'utf8').toString('base64')}`
  assert.equal(init.headers.Authorization, expected)
})

test('buildRequest: apikey 走 query 时改 URL 不加头', () => {
  const { url, init } = buildRequest({
    url: 'https://a.com/x',
    method: 'GET',
    headers: [],
    auth: { type: 'apikey', keyName: 'k', keyValue: 'v', keyIn: 'query' },
  })
  assert.equal(url, 'https://a.com/x?k=v')
  assert.equal(init.headers.k, undefined)
})

test('buildRequest: JSON body 自动补 Content-Type', () => {
  const { init } = buildRequest({
    url: 'https://a.com',
    method: 'POST',
    headers: [],
    hasBody: true,
    bodyType: 'json',
    body: '{"a":1}',
  })
  assert.equal(init.body, '{"a":1}')
  assert.equal(init.headers['Content-Type'], 'application/json')
})

test('buildRequest: formdata 不手写 Content-Type（交给浏览器生成 boundary）', () => {
  const { init } = buildRequest({
    url: 'https://a.com',
    method: 'POST',
    headers: [],
    hasBody: true,
    bodyType: 'formdata',
    formRows: [{ key: 'a', value: '1' }],
  })
  assert.equal(init.headers['Content-Type'], undefined)
  assert.ok(init.body instanceof FormData)
})

test('buildRequest: GET 不带 body', () => {
  const { init } = buildRequest({
    url: 'https://a.com',
    method: 'GET',
    headers: [],
    hasBody: false,
    bodyType: 'json',
    body: '{"a":1}',
  })
  assert.equal(init.body, undefined)
})

test('proxyEndpoint: 开启代理时改写地址', () => {
  assert.equal(
    proxyEndpoint('https://a.com/x', { canProxy: true, useProxy: true }),
    '/__proxy?target=https%3A%2F%2Fa.com%2Fx',
  )
  assert.equal(proxyEndpoint('https://a.com/x', { canProxy: false, useProxy: true }), 'https://a.com/x')
})

/* ---------------- 响应解析 ---------------- */

test('prettyBody: JSON 美化、非 JSON 原样、坏 JSON 不炸', () => {
  assert.equal(prettyBody('{"a":1}', 'application/json'), '{\n  "a": 1\n}')
  assert.equal(prettyBody('plain text', 'text/plain'), 'plain text')
  assert.equal(prettyBody('{oops', 'application/json'), '{oops')
})

test('statusClass: 按区间分级', () => {
  assert.equal(statusClass(200), 'ok')
  assert.equal(statusClass(301), 'info')
  assert.equal(statusClass(404), 'warn')
  assert.equal(statusClass(500), 'bad')
  assert.equal(statusClass(undefined), 'ok')
})

/* ---------------- 历史记录 ---------------- */

test('mergeHistory: 同 method+url 只留最新，且不超过上限', () => {
  const a = { method: 'GET', url: '/a', status: 200 }
  const b = { method: 'GET', url: '/b', status: 200 }
  const a2 = { method: 'GET', url: '/a', status: 500 }

  const list = mergeHistory(mergeHistory([], a), b)
  const withDup = mergeHistory(list, a2)
  assert.equal(withDup.length, 2)
  assert.equal(withDup[0].status, 500) // 新的在前面
  assert.equal(withDup[1].url, '/b')

  let long = []
  for (let i = 0; i < 30; i += 1) long = mergeHistory(long, { method: 'GET', url: `/${i}` })
  assert.equal(long.length, 20)
})

/* ---------------- 递归收集（用假句柄） ---------------- */

test('collectFiles: 递归拼出相对路径', async () => {
  const file = (name) => ({ kind: 'file', name })
  const dir = (entries) => ({
    kind: 'directory',
    async *entries() {
      for (const [name, handle] of entries) yield [name, handle]
    },
  })

  const root = dir([
    ['a.txt', file('a.txt')],
    ['sub', dir([['b.txt', file('b.txt')], ['deep', dir([['c.txt', file('c.txt')]])]])],
  ])

  const list = await collectFiles(root)
  assert.deepEqual(list.map((f) => f.path).sort(), ['a.txt', 'sub/b.txt', 'sub/deep/c.txt'])
})
