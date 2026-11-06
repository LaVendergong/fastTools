// 文本编辑器的纯逻辑
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  detectLang,
  escapeHtml,
  findMatches,
  lineOfOffset,
  lineStartOffset,
  MAX_MATCHES,
  nextMatch,
  replaceAllMatches,
} from '../src/tools/editor/text.js'

/* ---------------- 语言识别 / 转义 ---------------- */

test('detectLang: 按扩展名映射，未知回退纯文本', () => {
  assert.equal(detectLang('a.ts'), 'typescript')
  assert.equal(detectLang('App.vue'), 'xml')
  assert.equal(detectLang('readme.md'), 'markdown')
  assert.equal(detectLang('Main.java'), 'java')
  assert.equal(detectLang('archive.xyz'), 'plaintext')
  assert.equal(detectLang('Dockerfile'), 'plaintext')
})

test('escapeHtml: 五个特殊字符都转义', () => {
  assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
})

/* ---------------- 查找 ---------------- */

test('findMatches: 字面量匹配，大小写可选', () => {
  const text = 'foo Foo foo'
  assert.equal(findMatches(text, 'foo').length, 3)
  assert.deepEqual(
    findMatches(text, 'foo').map((m) => [m.start, m.end]),
    [
      [0, 3],
      [4, 7],
      [8, 11],
    ],
  )
  assert.equal(findMatches(text, 'foo', { caseSensitive: true }).length, 2)
})

test('findMatches: 空查询返回空数组', () => {
  assert.deepEqual(findMatches('abc', ''), [])
})

test('findMatches: 正则模式返回正确区间', () => {
  const matches = findMatches('a1 b22 c333', '\\d+', { regex: true })
  assert.deepEqual(
    matches.map((m) => [m.start, m.end]),
    [
      [1, 2],
      [4, 6],
      [8, 11],
    ],
  )
})

test('findMatches: 非法正则不抛错', () => {
  assert.deepEqual(findMatches('abc', '([', { regex: true }), [])
})

test('findMatches: 可匹配空串的正则不会死循环', () => {
  const matches = findMatches('abc', 'x*', { regex: true })
  assert.equal(matches.length, 4) // 4 个位置各一个空匹配
  assert.ok(matches.every((m) => m.start === m.end))
})

test('findMatches: 结果数量有上限', () => {
  const long = 'a'.repeat(MAX_MATCHES + 500)
  assert.equal(findMatches(long, 'a').length, MAX_MATCHES)
})

/* ---------------- 替换 ---------------- */

test('replaceAllMatches: 字面量全部替换并返回数量', () => {
  const res = replaceAllMatches('a-b-a-b', 'a', 'X')
  assert.equal(res.text, 'X-b-X-b')
  assert.equal(res.count, 2)
})

test('replaceAllMatches: 区分大小写', () => {
  assert.equal(replaceAllMatches('Aa', 'a', 'X', { caseSensitive: true }).text, 'AX')
  assert.equal(replaceAllMatches('Aa', 'a', 'X').text, 'XX')
})

test('replaceAllMatches: 正则保留捕获组', () => {
  const res = replaceAllMatches('key = 1', '(\\w+) = (\\d+)', '$2 -> $1', { regex: true })
  assert.equal(res.text, '1 -> key')
  assert.equal(res.count, 1)
})

test('replaceAllMatches: 无匹配时原样返回', () => {
  const res = replaceAllMatches('abc', 'z', 'X')
  assert.equal(res.text, 'abc')
  assert.equal(res.count, 0)
})

/* ---------------- 定位 ---------------- */

test('nextMatch: 向后查找并回绕', () => {
  const matches = [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
    { start: 8, end: 11 },
  ]
  assert.deepEqual(nextMatch(matches, 4), matches[1])
  assert.deepEqual(nextMatch(matches, 8), matches[2])
  assert.deepEqual(nextMatch(matches, 9), matches[0]) // 已在最后一处之后，回绕到第一个
  assert.equal(nextMatch([], 0), null)
})

test('nextMatch: 向前查找并回绕到最后一个', () => {
  const matches = [
    { start: 0, end: 3 },
    { start: 4, end: 7 },
  ]
  // 光标在第二处开头时，向前应跳到第一处
  assert.deepEqual(nextMatch(matches, 4, true), matches[0])
  // 已在最前面，回绕到最后一个
  assert.deepEqual(nextMatch(matches, 0, true), matches[1])
})

test('lineStartOffset: 返回起始偏移、长度与总行数', () => {
  const text = 'aa\nbbbb\nc'
  assert.deepEqual(lineStartOffset(text, 1), { start: 0, length: 2, total: 3, line: 1 })
  assert.deepEqual(lineStartOffset(text, 2), { start: 3, length: 4, total: 3, line: 2 })
  assert.deepEqual(lineStartOffset(text, 3), { start: 8, length: 1, total: 3, line: 3 })
})

test('lineStartOffset: 越界时收敛到首行或末行', () => {
  const text = 'aa\nbb'
  assert.equal(lineStartOffset(text, 0).line, 1)
  assert.equal(lineStartOffset(text, 99).line, 2)
  assert.equal(lineStartOffset(text, 99).start, 3)
})

test('lineOfOffset: 偏移量换算行号', () => {
  const text = 'aa\nbbbb\nc'
  assert.equal(lineOfOffset(text, 0), 1)
  assert.equal(lineOfOffset(text, 2), 1)
  assert.equal(lineOfOffset(text, 3), 2)
  assert.equal(lineOfOffset(text, 8), 3)
  assert.equal(lineOfOffset(text, 999), 3) // 超出长度按末尾算
})
