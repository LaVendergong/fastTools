/** 通用格式化工具，避免每个组件各写一份 */

export function formatSize(bytes, base = 1024) {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= base && i < units.length - 1) {
    value /= base
    i += 1
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatDate(date) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function formatDateTime(date) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return `${formatDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatNumber(value, digits = 2) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}

/** 转义 HTML 特殊字符（高亮、预览兜底用） */
export function escapeHtml(input) {
  return String(input).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}
