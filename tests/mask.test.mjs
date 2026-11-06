// 数据脱敏规则
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { maskText, partialMask, RULES } from '../src/tools/mask/rules.js'

test('手机号：留前 3 后 4', () => {
  const res = maskText('联系 13812345678 谢谢')
  assert.equal(res.text, '联系 138****5678 谢谢')
  assert.equal(res.counts.phone, 1)
})

test('身份证：留前 6 后 4', () => {
  const res = maskText('身份证 330102199003071234')
  assert.equal(res.text, '身份证 330102********1234')
  assert.equal(res.counts.idcard, 1)
})

test('身份证优先于银行卡，不会被二次处理', () => {
  const res = maskText('330102199003071234')
  assert.equal(res.counts.idcard, 1)
  assert.equal(res.counts.bankcard, undefined)
})

test('银行卡：中间按 4 位分组打码', () => {
  const res = maskText('6222021234567890123')
  assert.equal(res.text, '6222 **** **** *** 0123')
  assert.equal(res.counts.bankcard, 1)

  const short = maskText('6222021234567890') // 16 位
  assert.equal(short.text, '6222 **** **** 7890')
})

test('邮箱：本地部分留前 2 位', () => {
  const res = maskText('dev@example.com 与 a@b.cn')
  assert.equal(res.text, 'de****@example.com 与 a**@b.cn')
  assert.equal(res.counts.email, 2)
})

test('IPv4：只留前两段', () => {
  const res = maskText('192.168.1.100 与 10.0.0.8')
  assert.equal(res.text, '192.168.*.* 与 10.0.*.*')
  assert.equal(res.counts.ip, 2)
})

test('座机：区号保留，号码后 4 位保留', () => {
  const res = maskText('0571-88886666')
  assert.equal(res.text, '0571-****6666')
  assert.equal(res.counts.landline, 1)
})

test('掩码字符可替换', () => {
  const res = maskText('13812345678', { char: '●' })
  assert.equal(res.text, '138●●●●5678')
})

test('只启用的规则才生效', () => {
  const res = maskText('13812345678 dev@example.com', { types: ['email'] })
  assert.equal(res.text, '13812345678 de****@example.com')
  assert.equal(res.counts.phone, undefined)
})

test('自定义正则：保留前后位数', () => {
  const res = maskText('订单 ORD-12345678 已完成', {
    types: [],
    custom: [{ pattern: 'ORD-\\d{8}', keepStart: 4, keepEnd: 0 }],
  })
  assert.equal(res.text, '订单 ORD-******** 已完成')
  assert.equal(res.counts['custom-0'], 1)
})

test('自定义正则写错会记录在 invalid 里', () => {
  const res = maskText('abc', { custom: [{ pattern: '([', keepStart: 0, keepEnd: 0 }] })
  assert.deepEqual(res.invalid, ['(['])
  assert.equal(res.text, 'abc')
})

test('partialMask：短串整体打码', () => {
  assert.equal(partialMask('abc', 3, 3), '***')
  assert.equal(partialMask('abcdef', 2, 2), 'ab**ef')
  assert.equal(partialMask('', 1, 1), '')
})

test('多条规则同时生效并分别计数', () => {
  const res = maskText('13812345678 dev@example.com 192.168.1.1')
  assert.equal(res.counts.phone, 1)
  assert.equal(res.counts.email, 1)
  assert.equal(res.counts.ip, 1)
  assert.ok(!res.text.includes('13812345678'))
})

test('规则表结构完整', () => {
  for (const rule of RULES) {
    assert.ok(rule.id && rule.name && typeof rule.apply === 'function')
    assert.ok(rule.sample.includes('→'), `${rule.id} 缺少示例`)
  }
})
