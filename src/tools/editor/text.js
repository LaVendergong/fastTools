/**
 * 文本编辑器的纯逻辑：语法识别、转义、查找匹配、替换、行号换算
 * 不依赖 DOM 与 Vue，可直接在 Node 里测
 */

export const MAX_MATCHES = 3000

export const EXT_LANG = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'css',
  less: 'css',
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
  py: 'python',
  java: 'java',
  sh: 'bash',
  bash: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  go: 'go',
  rs: 'rust',
}

export function detectLang(fileName) {
  const ext = (String(fileName).split('.').pop() || '').toLowerCase()
  return EXT_LANG[ext] || 'plaintext'
}

export function escapeHtml(input) {
  return String(input).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

/**
 * 找出所有匹配区间。
 * 正则模式下最多 MAX_MATCHES 条，空匹配会强制推进 lastIndex 避免死循环。
 */
export function findMatches(text, needle, { regex = false, caseSensitive = false } = {}) {
  const source = String(text ?? '')
  const query = String(needle ?? '')
  if (!query) return []

  const out = []

  if (regex) {
    let re
    try {
      re = new RegExp(query, caseSensitive ? 'g' : 'gi')
    } catch {
      return []
    }
    let m
    while ((m = re.exec(source)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length })
      if (m[0] === '') re.lastIndex += 1
      if (out.length >= MAX_MATCHES) break
    }
    return out
  }

  const hay = caseSensitive ? source : source.toLowerCase()
  const target = caseSensitive ? query : query.toLowerCase()
  let idx = hay.indexOf(target)
  while (idx !== -1) {
    out.push({ start: idx, end: idx + query.length })
    idx = hay.indexOf(target, idx + Math.max(1, query.length))
    if (out.length >= MAX_MATCHES) break
  }
  return out
}

/**
 * 全部替换。正则模式保留 $1 这类捕获组语义。
 * @returns {{text: string, count: number}}
 */
export function replaceAllMatches(text, needle, replacement, { regex = false, caseSensitive = false } = {}) {
  const source = String(text ?? '')
  const matches = findMatches(source, needle, { regex, caseSensitive })
  if (!matches.length) return { text: source, count: 0 }

  if (regex) {
    const re = new RegExp(String(needle), caseSensitive ? 'g' : 'gi')
    return { text: source.replace(re, replacement), count: matches.length }
  }

  let out = ''
  let last = 0
  for (const m of matches) {
    out += source.slice(last, m.start) + replacement
    last = m.end
  }
  out += source.slice(last)
  return { text: out, count: matches.length }
}

/** 从光标位置找下一处（backward 时往前找，到头回绕） */
export function nextMatch(matches, position, backward = false) {
  if (!matches.length) return null
  if (backward) {
    const before = [...matches].reverse().find((m) => m.start < position)
    return before || matches[matches.length - 1]
  }
  return matches.find((m) => m.start >= position) || matches[0]
}

/** 第 line 行（1 起）的起始偏移、长度与总行数 */
export function lineStartOffset(text, line) {
  const source = String(text ?? '')
  const lines = source.split('\n')
  const target = Math.min(Math.max(1, Math.floor(line) || 1), lines.length)

  let start = 0
  for (let i = 0; i < target - 1; i += 1) start += lines[i].length + 1

  return { start, length: lines[target - 1].length, total: lines.length, line: target }
}

/** 偏移量 → 行号（1 起） */
export function lineOfOffset(text, offset) {
  const source = String(text ?? '')
  const pos = Math.max(0, Math.min(Number(offset) || 0, source.length))
  return source.slice(0, pos).split('\n').length
}
