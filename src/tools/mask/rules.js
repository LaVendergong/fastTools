/**
 * 数据脱敏规则与执行逻辑（纯函数）
 * 每种类型按各自的行业惯例打码：手机号留前 3 后 4、身份证留前 6 后 4 等
 */

/** 通用打码：保留前 keepStart 与后 keepEnd 位 */
export function partialMask(value, keepStart, keepEnd, char = '*') {
  const text = String(value ?? '')
  if (!text) return ''
  if (text.length <= keepStart + keepEnd) return char.repeat(text.length)

  // 注意 slice(-0) 等价于 slice(0)，会把整串拼回来，所以 0 要单独处理
  const head = keepStart > 0 ? text.slice(0, keepStart) : ''
  const tail = keepEnd > 0 ? text.slice(-keepEnd) : ''
  return head + char.repeat(text.length - keepStart - keepEnd) + tail
}

const ID_CARD = /\b\d{17}[\dXx]\b/g
const BANK_CARD = /\b\d{16,19}\b/g
const PHONE = /\b1[3-9]\d{9}\b/g
const EMAIL = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const LANDLINE = /\b0\d{2,3}-?\d{7,8}\b/g

/**
 * 顺序很重要：先长后短，避免 18 位身份证被当成银行卡二次处理。
 * 已经打码的部分含有 * 号，后续规则自然不会再命中。
 */
export const RULES = [
  {
    id: 'idcard',
    name: '身份证',
    sample: '330102199003071234 → 330102********1234',
    apply: (text, char) => replaceAll(text, ID_CARD, (m) => `${m.slice(0, 6)}${char.repeat(8)}${m.slice(-4)}`),
  },
  {
    id: 'bankcard',
    name: '银行卡',
    sample: '6222021234567890123 → 6222 **** **** 0123',
    apply: (text, char) =>
      replaceAll(text, BANK_CARD, (m) => {
        // 中间按 4 位一组打码，长度与原文一致
        const groups = char.repeat(m.length - 8).match(/.{1,4}/g) || []
        return `${m.slice(0, 4)} ${groups.join(' ')} ${m.slice(-4)}`
      }),
  },
  {
    id: 'phone',
    name: '手机号',
    sample: '13812345678 → 138****5678',
    apply: (text, char) => replaceAll(text, PHONE, (m) => `${m.slice(0, 3)}${char.repeat(4)}${m.slice(-4)}`),
  },
  {
    id: 'landline',
    name: '座机',
    sample: '0571-88886666 → 0571-****6666',
    apply: (text, char) =>
      replaceAll(text, LANDLINE, (m) => {
        const digits = m.replace('-', '')
        const head = m.includes('-') ? `${m.split('-')[0]}-` : ''
        return `${head}${char.repeat(Math.max(1, digits.length - 4 - head.replace('-', '').length))}${digits.slice(-4)}`
      }),
  },
  {
    id: 'email',
    name: '邮箱',
    sample: 'zhangsan@example.com → zh****@example.com',
    apply: (text) =>
      replaceAll(text, EMAIL, (m, m1, m2) => {
        const head = m1.slice(0, 2)
        const tail = m1.length > 2 ? '****' : '**'
        return `${head}${tail}@${m2}`
      }),
  },
  {
    id: 'ip',
    name: 'IPv4',
    sample: '192.168.1.100 → 192.168.*.*',
    apply: (text) =>
      replaceAll(text, IPV4, (m) => {
        const parts = m.split('.')
        return `${parts[0]}.${parts[1]}.*.*`
      }),
  },
]

function replaceAll(text, regex, replacer) {
  let count = 0
  const out = String(text).replace(regex, (...args) => {
    count += 1
    return replacer(...args)
  })
  return { text: out, count }
}

/**
 * 依次应用选中的内置规则与自定义规则。
 * @param {string} text 原文
 * @param {{types?: string[], char?: string, custom?: Array<{pattern: string, keepStart: number, keepEnd: number}>}} options
 * @returns {{text: string, counts: Record<string, number>, invalid: string[]}}
 */
export function maskText(text, options = {}) {
  const { types, char = '*', custom = [] } = options
  const enabled = new Set(types ?? RULES.map((r) => r.id))

  let current = String(text ?? '')
  const counts = {}
  const invalid = []

  for (const rule of RULES) {
    if (!enabled.has(rule.id)) continue
    const res = rule.apply(current, char)
    current = res.text
    if (res.count) counts[rule.id] = (counts[rule.id] || 0) + res.count
  }

  for (const [index, item] of custom.entries()) {
    const pattern = String(item.pattern || '').trim()
    if (!pattern) continue
    let re
    try {
      re = new RegExp(pattern, 'g')
    } catch {
      invalid.push(pattern)
      continue
    }
    const keepStart = Number(item.keepStart) || 0
    const keepEnd = Number(item.keepEnd) || 0
    const res = replaceAll(current, re, (m) => partialMask(m, keepStart, keepEnd, char))
    current = res.text
    if (res.count) counts[`custom-${index}`] = res.count
  }

  return { text: current, counts, invalid }
}
