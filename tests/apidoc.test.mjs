// 接口文档生成：字段拍平与 Markdown 输出
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildMarkdown, flattenFields, toMarkdownTable, typeOf } from '../src/tools/api-doc/fields.js'

const SAMPLE = {
  code: 0,
  message: 'ok',
  data: {
    total: 2,
    list: [
      { userId: 1, userName: 'zhangsan', tags: ['a', 'b'] },
      { userId: 2, userName: 'lisi', extra: true },
    ],
  },
}

test('typeOf: 基础类型判断', () => {
  assert.equal(typeOf(1), 'number')
  assert.equal(typeOf('x'), 'string')
  assert.equal(typeOf(null), 'null')
  assert.equal(typeOf([]), 'array')
  assert.equal(typeOf({}), 'object')
})

test('flattenFields: 嵌套对象用点号，数组用 []', () => {
  const { rows } = flattenFields(SAMPLE)
  const paths = rows.map((r) => r.path)

  assert.ok(paths.includes('code'))
  assert.ok(paths.includes('data'))
  assert.ok(paths.includes('data.total'))
  assert.ok(paths.includes('data.list[]'))
  assert.ok(paths.includes('data.list[].userId'))
})

test('flattenFields: 数组元素字段取并集', () => {
  const { rows } = flattenFields(SAMPLE)
  const names = rows.map((r) => r.path)
  assert.ok(names.includes('data.list[].userName'))
  // 只有第二个元素才有的字段也要列出来
  assert.ok(names.includes('data.list[].extra'))
})

test('flattenFields: 类型与示例', () => {
  const { rows } = flattenFields(SAMPLE)
  const byPath = Object.fromEntries(rows.map((r) => [r.path, r]))

  assert.equal(byPath.code.type, 'number')
  assert.equal(byPath['data.list[]'].type, 'array<object>')
  assert.equal(byPath['data.list[].tags'].type, 'array<string>')
  assert.equal(byPath.message.sample, '"ok"')
  assert.equal(byPath.code.sample, '0')
})

test('flattenFields: 长字符串示例截断', () => {
  const { rows } = flattenFields({ text: 'x'.repeat(50) })
  assert.ok(rows[0].sample.endsWith('…"'))
  assert.ok(rows[0].sample.length < 40)
})

test('flattenFields: 空对象与空数组', () => {
  const { rows } = flattenFields({ empty: {}, list: [] })
  const byPath = Object.fromEntries(rows.map((r) => [r.path, r]))
  assert.equal(byPath.empty.type, 'object')
  assert.equal(byPath.empty.sample, '{}')
  assert.equal(byPath.list.type, 'array<unknown>')
})

test('flattenFields: 超过行数上限时标记 truncated', () => {
  const big = {}
  for (let i = 0; i < 50; i += 1) big[`k${i}`] = i
  const { rows, truncated } = flattenFields(big, { maxRows: 10 })
  assert.equal(rows.length, 10)
  assert.equal(truncated, true)
})

test('toMarkdownTable: 表头、转义与缩进', () => {
  const rows = [
    { path: 'data', type: 'object', sample: '{1 个字段}', depth: 0 },
    { path: 'data.a|b', type: 'string', sample: '"x"', depth: 1 },
  ]
  const md = toMarkdownTable(rows)
  assert.ok(md.startsWith('| 字段 | 类型 | 示例 | 说明 |'))
  assert.ok(md.includes('`data.a\\|b`'), '竖线要转义')
  assert.ok(md.includes('&nbsp;&nbsp;'), '子字段要缩进')

  const noSample = toMarkdownTable(rows, { withSample: false })
  assert.ok(noSample.startsWith('| 字段 | 类型 | 说明 |'))
})

test('buildMarkdown: 含方法、路径、两段表格', () => {
  const md = buildMarkdown({
    name: '用户列表',
    method: 'get',
    url: '/system/user/list',
    description: '分页查询',
    params: '{"pageNum": 1}',
    response: JSON.stringify(SAMPLE),
  })

  assert.ok(md.startsWith('## 用户列表'))
  assert.ok(md.includes('`GET` /system/user/list'))
  assert.ok(md.includes('### 请求参数'))
  assert.ok(md.includes('### 响应字段'))
  assert.ok(md.includes('`data.list[].userName`'))
})

test('buildMarkdown: 参数为空时省略该段', () => {
  const md = buildMarkdown({ name: 'X', params: '', response: '{"a":1}' })
  assert.ok(!md.includes('### 请求参数'))
  assert.ok(md.includes('### 响应字段'))
})

test('buildMarkdown: 非法 JSON 给出提示而不是崩溃', () => {
  const md = buildMarkdown({ name: 'X', response: '{oops' })
  assert.ok(md.includes('JSON 解析失败'))
})
