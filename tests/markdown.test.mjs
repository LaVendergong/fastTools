// Markdown 编辑的纯逻辑
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { escapeHtml } from '../src/lib/format.js'
import { applyTemplate, markdownStats, safeFileName } from '../src/tools/markdown/editor.js'

/* ---------------- 模板插入 ---------------- */

test('applyTemplate: 没有选中时用占位文本', () => {
  const res = applyTemplate('hello', 5, 5, '**$1**')
  assert.equal(res.text, 'hello**文本**')
  assert.equal(res.caret, 'hello**文本**'.length)
})

test('applyTemplate: 有选中时包裹选中内容', () => {
  const res = applyTemplate('say hello world', 4, 9, '**$1**')
  assert.equal(res.text, 'say **hello** world')
  assert.equal(res.caret, 'say **hello**'.length)
})

test('applyTemplate: wrapSelection=false 时选区被模板替换（Tab 缩进语义）', () => {
  // 与组件原行为一致：无论是否包裹，选区都会被模板替换掉
  const res = applyTemplate('abc', 1, 2, '  ', false)
  assert.equal(res.text, 'a  c')
  assert.equal(res.caret, 3)
})

test('applyTemplate: 插入到中间保持前后文', () => {
  const res = applyTemplate('ab', 1, 1, 'X')
  assert.equal(res.text, 'aXb')
  assert.equal(res.caret, 2)
})

test('applyTemplate: 越界的选区会被收敛', () => {
  const res = applyTemplate('abc', 99, 120, 'X')
  assert.equal(res.text, 'abcX')

  const neg = applyTemplate('abc', -5, 1, 'X')
  assert.equal(neg.text, 'Xbc')
})

test('applyTemplate: 空文本也能插入', () => {
  const res = applyTemplate('', 0, 0, '# $1')
  assert.equal(res.text, '# 文本')
})

/* ---------------- 文件名清洗 ---------------- */

test('safeFileName: 去掉非法字符并截断', () => {
  assert.equal(safeFileName('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij')
  assert.equal(safeFileName('  周报  '), '周报')
  assert.equal(safeFileName('换\n行'), '换行')
})

test('safeFileName: 超长截到 60 字', () => {
  assert.equal(safeFileName('x'.repeat(100)).length, 60)
})

test('safeFileName: 空或全非法字符回落为「未命名」', () => {
  assert.equal(safeFileName(''), '未命名')
  assert.equal(safeFileName('///'), '未命名')
  assert.equal(safeFileName(null), '未命名')
})

/* ---------------- 统计 ---------------- */

test('markdownStats: 中英文按词计数', () => {
  const stats = markdownStats('hello world\n你好 世界')
  assert.equal(stats.words, 4)
  assert.equal(stats.lines, 2)
  assert.equal(stats.chars, 'hello world\n你好 世界'.length)
})

test('markdownStats: 空文本', () => {
  assert.deepEqual(markdownStats(''), { words: 0, chars: 0, lines: 0 })
})

/* ---------------- 转义（与编辑器共用） ---------------- */

test('escapeHtml: lib/format 里的实现覆盖五个字符', () => {
  assert.equal(escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;')
})
