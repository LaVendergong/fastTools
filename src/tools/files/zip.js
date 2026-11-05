/**
 * 压缩包服务：打包目录/文件、解压到指定目录
 * 只依赖 File System Access 句柄与 jszip，不碰任何组件状态
 */
import JSZip from 'jszip'
// 带扩展名：Node 的 ESM 解析器要求显式 .js，Vite 也接受
import { readFileBlob, writeFile } from './fs.js'

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

/** 目录为空时抛出的错误码，交给调用方翻译成提示文案 */
export const EMPTY_DIR = 'EMPTY_DIR'
export const EMPTY_ZIP = 'EMPTY_ZIP'

/**
 * 把一个文件或目录打成一个 zip Blob。
 * @param {{name: string, kind: 'file'|'dir', handle: FileSystemHandle}} entry
 * @param {(percent: number) => void} [onProgress]
 */
export async function zipEntryToBlob(entry, onProgress) {
  const zip = new JSZip()

  if (entry.kind === 'dir') {
    const files = await collectFiles(entry.handle)
    if (!files.length) throw new Error(EMPTY_DIR)
    for (const file of files) {
      // 保留外层目录名，别人收到也能看到文件夹
      zip.file(`${entry.name}/${file.path}`, await readFileBlob(file.handle))
    }
  } else {
    zip.file(entry.name, await readFileBlob(entry.handle))
  }

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => onProgress?.(Math.round(meta.percent)),
  )
}

/**
 * 把 zip Blob 解压进 targetDir（调用方负责先建好目标文件夹）。
 * @returns {Promise<{ count: number }>} 解出的文件数
 */
export async function extractZipInto(targetDir, blob, onProgress) {
  const zip = await JSZip.loadAsync(blob)
  const files = Object.values(zip.files).filter((f) => !f.dir)
  if (!files.length) throw new Error(EMPTY_ZIP)

  const prefix = commonPrefix(files.map((f) => f.name))

  let done = 0
  for (const file of files) {
    const rel = file.name.startsWith(prefix) ? file.name.slice(prefix.length) : file.name
    const segments = rel.split('/').filter(Boolean)
    const fileName = segments.pop()
    if (!fileName) continue

    let dir = targetDir
    for (const seg of segments) {
      dir = await dir.getDirectoryHandle(seg, { create: true })
    }
    await writeFile(dir, fileName, await file.async('blob'))

    done += 1
    onProgress?.(Math.round((done / files.length) * 100))
  }

  return { count: done }
}
