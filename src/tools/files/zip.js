/**
 * 压缩包相关的纯逻辑：递归收集文件、计算公共顶层目录
 * 只依赖 File System Access API 的句柄，不碰组件状态
 */

// 递归收集目录下所有文件句柄，返回 { path, handle }
export async function collectFiles(dirHandle, prefix = '') {
  const out = []
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      out.push({ path: `${prefix}${name}`, handle })
    } else {
      out.push(...(await collectFiles(handle, `${prefix}${name}/`)))
    }
  }
  return out
}

/**
 * 压缩包里如果所有条目都在同一个顶层目录下（如 zip-test/a.txt），
 * 解压时应该剥掉这层，否则会多套一个同名文件夹。
 * 返回需要剥掉的前缀（含斜杠），没有公共前缀时返回 ''。
 */
export function commonPrefix(names) {
  const segments = names.map((name) => String(name).split('/').filter(Boolean))
  if (!segments.length) return ''
  if (!segments.every((s) => s.length > 1)) return ''

  const first = segments[0][0]
  if (!segments.every((s) => s[0] === first)) return ''
  return `${first}/`
}
