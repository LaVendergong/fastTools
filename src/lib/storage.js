/**
 * 本地存储读写：所有工具都是「读一个 JSON 对象当默认配置，改动后写回」的模式。
 * 统一在这里兜异常（隐私模式、配额满、旧数据格式不对）。
 */

export function readJSON(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 忽略 */
  }
}

/**
 * 防抖写入器：输入类工具每敲一个字都会触发 watch，
 * 直接写 localStorage 会有明显的同步开销。
 */
export function createWriter(key, delay = 400) {
  let timer = null
  const flush = (value) => {
    clearTimeout(timer)
    writeJSON(key, value)
  }
  const schedule = (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => writeJSON(key, value), delay)
  }
  return { flush, schedule, cancel: () => clearTimeout(timer) }
}
