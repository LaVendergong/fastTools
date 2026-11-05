// 极简应用内事件通道：用于工具之间「打开另一个工具并带上参数」这类跨组件协作
const handlers = new Map()
const pending = new Map()

// 粘性事件：没有监听者时暂存一次，等监听者注册后补发
// （系统用「本应用打开 txt」时，App 可能还没挂载完）
const STICKY = new Set(['open-tool', 'open-file'])

export const appBus = {
  on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event).add(fn)

    if (pending.has(event)) {
      const payload = pending.get(event)
      pending.delete(event)
      setTimeout(() => fn(payload), 0)
    }

    return () => handlers.get(event)?.delete(fn)
  },
  emit(event, payload) {
    const set = handlers.get(event)
    if (!set || !set.size) {
      if (STICKY.has(event)) pending.set(event, payload)
      return
    }
    set.forEach((fn) => fn(payload))
  },
}

// 待打开的文件句柄（文件管理器双击 txt、或系统关联启动时写入）
export const pendingFile = {
  handle: null,
  name: '',
  line: 0,
}

/** 请求在文本编辑器中打开一个文件句柄，line 可选（跳到指定行） */
export function requestOpenFile(handle, name, line = 0) {
  pendingFile.handle = handle
  pendingFile.name = name
  pendingFile.line = line
  appBus.emit('open-file', { handle, name, line })
  appBus.emit('open-tool', 'editor')
}
