/**
 * 请求历史：同一个 method + url 只保留最新一条，超出上限截断
 */
export function mergeHistory(list, entry, limit = 20) {
  const rest = (list || []).filter(
    (h) => !(h.url === entry.url && h.method === entry.method),
  )
  return [entry, ...rest].slice(0, limit)
}
