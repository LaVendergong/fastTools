import { onBeforeUnmount, ref } from 'vue'

/**
 * 统一的「复制并提示」逻辑。
 * 各工具原来各自实现了一份：写剪贴板、把 copied 设成某个 key、1.2 秒后清空。
 *
 * const { copied, copy } = useCopy()
 * copy(text, 'json')   // 模板里 copied === 'json' 时显示「已复制」
 */
export function useCopy(resetDelay = 1200) {
  const copied = ref('')
  let timer = null

  async function copy(text, tag = '') {
    if (text === null || text === undefined || text === '') return false
    try {
      await navigator.clipboard.writeText(String(text))
      copied.value = tag
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (copied.value === tag) copied.value = ''
      }, resetDelay)
      return true
    } catch {
      // 非安全上下文或用户拒绝授权时静默失败
      return false
    }
  }

  onBeforeUnmount(() => clearTimeout(timer))

  return { copied, copy }
}
