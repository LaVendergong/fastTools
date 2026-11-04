// 正则匹配放入 Worker：灾难性回溯时主线程不会卡死，超时由主线程终止
const LIMIT = 500

self.onmessage = (e) => {
  const { id, source, flags, text } = e.data

  try {
    const re = new RegExp(source, flags)
    const single = !flags.includes('g')
    const matches = []

    while (true) {
      const m = re.exec(text)
      if (!m) break
      matches.push({
        index: m.index,
        value: m[0],
        groups: m.slice(1),
        named: m.groups ? { ...m.groups } : null,
      })
      if (single) break
      if (m[0] === '') re.lastIndex++ // 空匹配防死循环
      if (matches.length >= LIMIT) {
        self.postMessage({ id, ok: true, matches, truncated: true })
        return
      }
    }

    self.postMessage({ id, ok: true, matches, truncated: false })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message })
  }
}
