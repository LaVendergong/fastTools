/**
 * HTTP 响应解析：JSON 美化、状态分级
 */

/** 响应体尽量格式化成可读 JSON，非 JSON 原样返回 */
export function prettyBody(text, contentType = '') {
  if (contentType.includes('json') || /^\s*[[{]/.test(text)) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }
  return text
}

/** 整理成组件直接使用的响应对象 */
export function makeResponse({ status, statusText, ms, text, headers }) {
  const contentType = (headers || []).find((h) => h.key.toLowerCase() === 'content-type')?.value || ''
  return {
    status,
    statusText,
    ms,
    size: new Blob([text]).size,
    headers: headers || [],
    body: prettyBody(text, contentType),
  }
}

/** 状态码 → 颜色分级 */
export function statusClass(status) {
  const s = Number(status) || 0
  if (s >= 500) return 'bad'
  if (s >= 400) return 'warn'
  if (s >= 300) return 'info'
  return 'ok'
}
