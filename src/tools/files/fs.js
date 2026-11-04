/*
 * 文件系统抽象：OPFS（本站私有沙盒）与「已授权的本地目录」共用同一套 handle API。
 * FileSystemDirectoryHandle / FileSystemFileHandle 在两种后端上行为一致，
 * 所以上层只需要关心 handle，不需要区分后端。
 */

const DB_NAME = 'toolbox-fs'
const STORE = 'handles'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveHandle(key, handle) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function loadHandle(key) {
  const db = await openDb()
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

export async function clearHandle(key) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/* ---------------- 后端 ---------------- */

export const supportsOpfs = () => Boolean(navigator.storage?.getDirectory)
export const supportsLocalDir = () => typeof window.showDirectoryPicker === 'function'

export async function getOpfsRoot() {
  if (!supportsOpfs()) throw new Error('当前浏览器不支持本站文件空间（OPFS）')
  return navigator.storage.getDirectory()
}

export async function pickLocalDirectory() {
  if (!supportsLocalDir()) throw new Error('当前浏览器不支持挂载本地目录，请使用 Chrome / Edge')
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  const granted = await ensurePermission(handle)
  if (!granted) throw new Error('未获得目录读写权限')
  await saveHandle('local-dir', handle)
  return handle
}

export async function ensurePermission(handle) {
  const opts = { mode: 'readwrite' }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

export async function loadLocalDirectory() {
  const handle = await loadHandle('local-dir')
  if (!handle) return null
  const granted = await ensurePermission(handle)
  return granted ? handle : null
}

export async function forgetLocalDirectory() {
  await clearHandle('local-dir')
}

/* ---------------- 目录操作 ---------------- */

export async function listDir(dirHandle) {
  const entries = []
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      let size = 0
      let mtime = 0
      let type = ''
      try {
        const file = await handle.getFile()
        size = file.size
        mtime = file.lastModified
        type = file.type
      } catch {
        /* 个别条目可能已失效 */
      }
      entries.push({ name, kind: 'file', handle, size, mtime, type })
    } else {
      entries.push({ name, kind: 'dir', handle, size: 0, mtime: 0, type: '' })
    }
  }
  return entries
}

/** 按路径数组逐级取 handle */
export async function resolvePath(root, segments) {
  let current = root
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment)
  }
  return current
}

export async function createDir(dirHandle, name) {
  return dirHandle.getDirectoryHandle(name, { create: true })
}

export async function writeFile(dirHandle, name, data) {
  const fileHandle = await dirHandle.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
  return fileHandle
}

export async function readFileText(handle) {
  const file = await handle.getFile()
  return file.text()
}

export async function readFileBlob(handle) {
  const file = await handle.getFile()
  return file
}

export async function removeEntry(dirHandle, name) {
  await dirHandle.removeEntry(name, { recursive: true })
}

async function copyDir(srcHandle, dstHandle) {
  for (const entry of await listDir(srcHandle)) {
    if (entry.kind === 'file') {
      await writeFile(dstHandle, entry.name, await entry.handle.getFile())
    } else {
      const sub = await dstHandle.getDirectoryHandle(entry.name, { create: true })
      await copyDir(entry.handle, sub)
    }
  }
}

/** 重命名：先复制到新名字，再删旧条目（OPFS 无全平台 move API） */
export async function renameEntry(dirHandle, oldName, newName) {
  if (oldName === newName) return
  const entries = await listDir(dirHandle)
  const target = entries.find((e) => e.name === oldName)
  if (!target) throw new Error('条目不存在')
  if (entries.some((e) => e.name === newName)) throw new Error('同名文件或文件夹已存在')

  if (target.kind === 'file') {
    await writeFile(dirHandle, newName, await target.handle.getFile())
  } else {
    const newDir = await dirHandle.getDirectoryHandle(newName, { create: true })
    await copyDir(target.handle, newDir)
  }
  await dirHandle.removeEntry(oldName, { recursive: true })
}

export async function moveEntry(srcDir, name, dstDir) {
  const entries = await listDir(srcDir)
  const target = entries.find((e) => e.name === name)
  if (!target) throw new Error('条目不存在')
  if (target.kind === 'file') {
    await writeFile(dstDir, name, await target.handle.getFile())
  } else {
    const newDir = await dstDir.getDirectoryHandle(name, { create: true })
    await copyDir(target.handle, newDir)
  }
  await srcDir.removeEntry(name, { recursive: true })
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}

/* ---------------- 文件类型 ---------------- */

const TEXT_EXT = [
  'txt', 'md', 'markdown', 'json', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'css', 'scss',
  'html', 'htm', 'xml', 'yml', 'yaml', 'csv', 'tsv', 'log', 'sql', 'py', 'java', 'c', 'cpp', 'h',
  'go', 'rs', 'sh', 'bat', 'ini', 'conf', 'env', 'gitignore',
]

export function extOf(name) {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export function fileKind(entry) {
  if (entry.kind === 'dir') return 'dir'
  const ext = extOf(entry.name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'].includes(ext)) return 'audio'
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video'
  if (['pdf'].includes(ext)) return 'pdf'
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return 'archive'
  if (TEXT_EXT.includes(ext) || (entry.type || '').startsWith('text/')) return 'text'
  return 'file'
}

export function iconOf(kind, ext) {
  if (kind === 'dir') return '📁'
  if (kind === 'image') return '🖼️'
  if (kind === 'audio') return '🎵'
  if (kind === 'video') return '🎬'
  if (kind === 'pdf') return '📕'
  if (kind === 'archive') return '🗜️'
  if (kind === 'text') {
    if (['js', 'ts', 'jsx', 'tsx', 'vue'].includes(ext)) return '📜'
    if (['json'].includes(ext)) return '🧾'
    if (['md', 'markdown'].includes(ext)) return '📝'
    return '📄'
  }
  return '📦'
}

export function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
