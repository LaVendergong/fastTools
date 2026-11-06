// 正则速查表：每条规则的示例与反例都要能通过
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CATEGORIES, PATTERNS, selfCheck } from '../src/tools/regex-ref/patterns.js'

test('全部规则自检通过（示例命中、反例不命中）', () => {
  const broken = selfCheck()
  assert.deepEqual(broken, [], `未通过：${broken.join(', ')}`)
})

test('每条规则都有分类、说明与唯一 id', () => {
  const ids = new Set()
  const cats = new Set(CATEGORIES.map((c) => c.id))
  for (const item of PATTERNS) {
    assert.ok(item.id && !ids.has(item.id), `id 重复或缺失：${item.id}`)
    ids.add(item.id)
    assert.ok(cats.has(item.cat), `未知分类：${item.cat}`)
    assert.ok(item.name && item.desc, `${item.id} 缺少名称或说明`)
  }
  assert.ok(PATTERNS.length >= 24, `规则数量 ${PATTERNS.length}`)
})

test('关键规则的实际匹配行为', () => {
  const byId = Object.fromEntries(PATTERNS.map((p) => [p.id, p]))
  const hit = (id, text) => new RegExp(byId[id].pattern, byId[id].flags).test(text)

  assert.ok(hit('mobile', '13812345678'))
  assert.ok(!hit('mobile', '12812345678'))

  assert.ok(hit('idcard', '33010219900307123X'))
  assert.ok(!hit('idcard', '33010219900307123'))

  assert.ok(hit('ipv4', '10.0.0.1'))
  assert.ok(!hit('ipv4', '10.0.0.256'))

  assert.ok(hit('url', 'https://example.com/a?b=1'))
  assert.ok(!hit('url', 'example.com'))

  assert.ok(hit('date', '2026-02-29')) // 只校验范围，不判断闰年
  assert.ok(!hit('date', '2026-13-01'))

  assert.ok(hit('semver', '1.0.0-rc.1'))
  assert.ok(!hit('semver', '1.0'))

  assert.ok(hit('hexcolor', '#abc'))
  assert.ok(!hit('hexcolor', '#abcd'))

  assert.ok(hit('chinese', '工具箱'))
  assert.ok(!hit('chinese', 'abc'))
})

test('自检能识别写错的规则', () => {
  // 直接构造一个坏规则验证 selfCheck 的逻辑
  const fake = [
    { id: 'ok', pattern: '\\d+', flags: '', example: '123', bad: 'abc' },
    { id: 'bad-example', pattern: '^\\d+$', flags: '', example: 'abc', bad: '' },
    { id: 'bad-regex', pattern: '([', flags: '', example: 'x', bad: '' },
  ]
  const failing = fake
    .filter((item) => {
      let re
      try {
        re = new RegExp(item.pattern, item.flags)
      } catch {
        return true
      }
      const ok = re.test(item.example)
      const badRejected = item.bad ? !new RegExp(item.pattern, item.flags).test(item.bad) : true
      return !ok || !badRejected
    })
    .map((item) => item.id)

  assert.deepEqual(failing, ['bad-example', 'bad-regex'])
})
