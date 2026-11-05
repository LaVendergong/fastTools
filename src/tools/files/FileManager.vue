<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import JSZip from 'jszip'
import { requestOpenFile } from '../../lib/appBus'
import {
  createDir,
  ensurePermission,
  fileKind,
  formatSize,
  formatTime,
  forgetLocalDirectory,
  getOpfsRoot,
  iconOf,
  listDir,
  loadLocalDirectory,
  moveEntry,
  pickLocalDirectory,
  readFileBlob,
  readFileText,
  removeEntry,
  renameEntry,
  storageEstimate,
  supportsLocalDir,
  supportsOpfs,
  writeFile,
  extOf,
} from './fs'

const backend = ref('opfs') // opfs | local
const rootHandle = ref(null)
const stack = ref([]) // [{ name, handle }]
const entries = ref([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const sortBy = ref('name') // name | size | time
const storage = ref(null)
const dragOver = ref(false)
const localSupported = supportsLocalDir()
const opfsSupported = supportsOpfs()

const creating = ref(null) // { kind: 'dir' | 'file', name: string }
const menu = ref(null) // { x, y, entry }
const renaming = ref(null) // { entry, name }
const preview = ref(null) // { entry, kind, text, url, editing, saved }
const fileInputEl = ref(null)
const nameInputEl = ref(null)
const zipBusy = ref('') // 正在处理的条目名
const zipProgress = ref(0)
const notice = ref('')

const currentDir = computed(() =>
  stack.value.length ? stack.value[stack.value.length - 1].handle : rootHandle.value,
)
const pathLabel = computed(() =>
  [backend.value === 'opfs' ? '本站空间' : '本地目录', ...stack.value.map((s) => s.name)].join(' / '),
)

const visibleEntries = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const list = entries.value.filter((e) => !kw || e.name.toLowerCase().includes(kw))
  const sorted = [...list].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    if (sortBy.value === 'size') return b.size - a.size
    if (sortBy.value === 'time') return b.mtime - a.mtime
    return a.name.localeCompare(b.name, 'zh-CN')
  })
  return sorted
})

const usageText = computed(() => {
  if (backend.value !== 'opfs' || !storage.value) return ''
  const { usage, quota } = storage.value
  return `已用 ${formatSize(usage)} / 配额 ${formatSize(quota)}`
})
const usagePercent = computed(() => {
  if (!storage.value?.quota) return 0
  return Math.min(100, (storage.value.usage / storage.value.quota) * 100)
})

/* ---------------- 初始化 ---------------- */

async function initBackend(kind = backend.value) {
  loading.value = true
  error.value = ''
  entries.value = []
  try {
    if (kind === 'opfs') {
      rootHandle.value = await getOpfsRoot()
    } else {
      let handle = await loadLocalDirectory()
      if (!handle) handle = await pickLocalDirectory()
      if (!handle) throw new Error('未挂载本地目录')
      rootHandle.value = handle
    }
    backend.value = kind
    stack.value = []
    await refresh()
  } catch (e) {
    error.value = e.message
    entries.value = []
  } finally {
    loading.value = false
  }
}

async function refresh() {
  if (!currentDir.value) return
  loading.value = true
  error.value = ''
  try {
    entries.value = await listDir(currentDir.value)
  } catch (e) {
    error.value = e.message
    entries.value = []
  } finally {
    loading.value = false
  }
  updateStorage()
}

async function updateStorage() {
  if (backend.value === 'opfs') storage.value = await storageEstimate()
}

/* ---------------- 导航 ---------------- */

async function enter(entry) {
  if (entry.kind !== 'dir') {
    // 压缩包双击直接解压到当前目录
    if (isZip(entry)) {
      await unzipEntry(entry)
      return
    }
    // 文本文件交给文本编辑器打开（可直接写回原文件）
    if (fileKind(entry) === 'text') {
      requestOpenFile(entry.handle, entry.name)
      return
    }
    openPreview(entry)
    return
  }
  stack.value.push({ name: entry.name, handle: entry.handle })
  keyword.value = ''
  await refresh()
}

async function goUp() {
  if (!stack.value.length) return
  stack.value.pop()
  await refresh()
}

async function jumpTo(index) {
  stack.value = stack.value.slice(0, index)
  await refresh()
}

/* ---------------- 新建 / 上传 ---------------- */

function startCreate(kind) {
  if (!currentDir.value) return
  creating.value = { kind, name: kind === 'dir' ? '新建文件夹' : '新建文本.txt' }
  nextTick(() => {
    nameInputEl.value?.focus()
    nameInputEl.value?.select()
  })
}

async function confirmCreate() {
  const task = creating.value
  if (!task) return
  const name = task.name.trim()
  if (!name) {
    creating.value = null
    return
  }
  creating.value = null
  try {
    if (entries.value.some((e) => e.name === name)) throw new Error(`「${name}」已存在`)
    if (task.kind === 'dir') await createDir(currentDir.value, name)
    else await writeFile(currentDir.value, name, '')
    await refresh()
  } catch (e) {
    error.value = e.message
  }
}

function cancelCreate() {
  creating.value = null
}

function pickFiles() {
  fileInputEl.value?.click()
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length || !currentDir.value) return
  loading.value = true
  try {
    for (const file of files) {
      await writeFile(currentDir.value, file.name, file)
    }
    await refresh()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function onFileChange(e) {
  uploadFiles(e.target.files)
  e.target.value = ''
}

function onDrop(e) {
  dragOver.value = false
  uploadFiles(e.dataTransfer?.files)
}

/* ---------------- 重命名 / 删除 / 下载 ---------------- */

function startRename(entry) {
  menu.value = null
  renaming.value = { entry, name: entry.name }
  nextTick(() => {
    const el = document.querySelector('.fm .r-input')
    el?.focus()
    el?.select()
  })
}

async function confirmRename() {
  const task = renaming.value
  if (!task) return
  const name = task.name.trim()
  renaming.value = null
  if (!name || name === task.entry.name) return
  try {
    await renameEntry(currentDir.value, task.entry.name, name)
    await refresh()
  } catch (e) {
    error.value = e.message
  }
}

async function remove(entry) {
  menu.value = null
  const label = entry.kind === 'dir' ? `文件夹「${entry.name}」及其全部内容` : `文件「${entry.name}」`
  if (!window.confirm(`确定删除${label}？此操作不可撤销。`)) return
  try {
    await removeEntry(currentDir.value, entry.name)
    if (preview.value?.entry?.name === entry.name) closePreview()
    await refresh()
  } catch (e) {
    error.value = e.message
  }
}

async function download(entry) {
  menu.value = null
  try {
    const blob = await readFileBlob(entry.handle)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = entry.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  } catch (e) {
    error.value = e.message
  }
}

/* ---------------- ZIP 打包 / 解压 ---------------- */

async function collectFiles(dirHandle, prefix = '') {
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

function uniqueName(base, ext = '') {
  const taken = new Set(entries.value.map((e) => e.name))
  let name = `${base}${ext}`
  let i = 1
  while (taken.has(name)) name = `${base} (${i++})${ext}`
  return name
}

async function zipEntry(entry) {
  menu.value = null
  if (zipBusy.value) return
  error.value = ''
  notice.value = ''
  zipBusy.value = entry.name
  zipProgress.value = 0

  try {
    const zip = new JSZip()

    if (entry.kind === 'dir') {
      const files = await collectFiles(entry.handle)
      if (!files.length) {
        error.value = '这个文件夹是空的，没什么可打包'
        return
      }
      for (const file of files) {
        const blob = await readFileBlob(file.handle)
        zip.file(`${entry.name}/${file.path}`, blob)
      }
    } else {
      const blob = await readFileBlob(entry.handle)
      zip.file(entry.name, blob)
    }

    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (meta) => {
        zipProgress.value = Math.round(meta.percent)
      },
    )

    const base = entry.kind === 'dir' ? entry.name : entry.name.replace(/\.[^.]+$/, '')
    const name = uniqueName(base, '.zip')
    await writeFile(currentDir.value, name, blob)
    await refresh()
    notice.value = `已打包 ${name}（${formatSize(blob.size)}）`
  } catch (e) {
    error.value = `打包失败：${e.message}`
  } finally {
    zipBusy.value = ''
    zipProgress.value = 0
  }
}

async function resolveNestedDir(rootDir, segments) {
  let dir = rootDir
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create: true })
  }
  return dir
}

async function unzipEntry(entry) {
  menu.value = null
  if (zipBusy.value) return
  error.value = ''
  notice.value = ''
  zipBusy.value = entry.name
  zipProgress.value = 0

  try {
    const blob = await readFileBlob(entry.handle)
    const zip = await JSZip.loadAsync(blob)
    const files = Object.values(zip.files).filter((f) => !f.dir)

    if (!files.length) {
      error.value = '压缩包里没有文件'
      return
    }

    const folder = uniqueName(entry.name.replace(/\.zip$/i, ''))
    const targetDir = await createDir(currentDir.value, folder)

    // 若所有条目都在同一个顶层目录下（如 zip-test/a.txt），剥掉这层，避免解压后多套一层文件夹
    const segmentsList = files.map((f) => f.name.split('/').filter(Boolean))
    let prefix = ''
    if (
      segmentsList.length &&
      segmentsList.every((s) => s.length > 1) &&
      segmentsList.every((s) => s[0] === segmentsList[0][0])
    ) {
      prefix = `${segmentsList[0][0]}/`
    }

    let done = 0
    for (const file of files) {
      const rel = file.name.startsWith(prefix) ? file.name.slice(prefix.length) : file.name
      const segments = rel.split('/').filter(Boolean)
      const fileName = segments.pop()
      if (!fileName) continue
      const dir = await resolveNestedDir(targetDir, segments)
      const data = await file.async('blob')
      await writeFile(dir, fileName, data)
      done += 1
      zipProgress.value = Math.round((done / files.length) * 100)
    }

    await refresh()
    notice.value = `已解压 ${files.length} 个文件到「${folder}」`
  } catch (e) {
    error.value = `解压失败：${e.message}`
  } finally {
    zipBusy.value = ''
    zipProgress.value = 0
  }
}

const isZip = (entry) => entry.kind === 'file' && /\.zip$/i.test(entry.name)

/* ---------------- 拖拽移动 ---------------- */

let draggingEntry = null
function onDragStart(entry, e) {
  draggingEntry = entry
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', entry.name)
}

async function onDropOnFolder(target, e) {
  e.stopPropagation()
  const source = draggingEntry
  draggingEntry = null
  if (!source || source.name === target.name || source.kind !== 'file') return
  try {
    await moveEntry(currentDir.value, source.name, target.handle)
    await refresh()
  } catch (err) {
    error.value = err.message
  }
}

/* ---------------- 预览 ---------------- */

async function openPreview(entry) {
  const kind = fileKind(entry)
  const state = { entry, kind, text: '', url: '', editing: false, saved: false }
  try {
    if (kind === 'text') {
      state.text = await readFileText(entry.handle)
    } else if (['image', 'audio', 'video', 'pdf'].includes(kind)) {
      const blob = await readFileBlob(entry.handle)
      state.url = URL.createObjectURL(blob)
    }
  } catch (e) {
    error.value = e.message
  }
  preview.value = state
}

function closePreview() {
  if (preview.value?.url) URL.revokeObjectURL(preview.value.url)
  preview.value = null
}

async function savePreview() {
  if (!preview.value) return
  const { entry, text } = preview.value
  try {
    await writeFile(currentDir.value, entry.name, text)
    preview.value.saved = true
    setTimeout(() => {
      if (preview.value) preview.value.saved = false
    }, 1500)
    await refresh()
  } catch (e) {
    error.value = e.message
  }
}

/* ---------------- 右键菜单 ---------------- */

function openMenu(entry, e) {
  e.preventDefault()
  const rect = e.currentTarget.getBoundingClientRect()
  menu.value = { x: rect.left, y: rect.bottom + 4, entry }
}

function onDocClick() {
  menu.value = null
}

/* ---------------- 生命周期 ---------------- */

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  await initBackend('opfs')
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  closePreview()
})
</script>

<template>
  <div class="fm">
    <aside class="side">
      <p class="side-title">位置</p>
      <button class="place" :class="{ on: backend === 'opfs' }" @click="initBackend('opfs')">
        <span class="p-icon">🗄️</span>
        <span class="p-text">
          <span class="p-name">本站空间</span>
          <span class="p-sub">OPFS 私有沙盒</span>
        </span>
      </button>
      <button
        class="place"
        :class="{ on: backend === 'local' }"
        :disabled="!localSupported"
        :title="localSupported ? '挂载一个真实文件夹' : '当前浏览器不支持挂载本地目录'"
        @click="initBackend('local')"
      >
        <span class="p-icon">💻</span>
        <span class="p-text">
          <span class="p-name">本地目录</span>
          <span class="p-sub">{{ localSupported ? '授权后可读写' : 'Chrome / Edge 可用' }}</span>
        </span>
      </button>

      <div v-if="backend === 'opfs' && storage" class="usage">
        <div class="bar"><i :style="{ width: usagePercent + '%' }" /></div>
        <p class="usage-text">{{ usageText }}</p>
      </div>

      <p v-if="backend === 'local'" class="side-tip">
        <button class="link" @click="forgetLocalDirectory(); initBackend('opfs')">取消挂载</button>
      </p>

      <div class="side-bottom">
        <p class="side-title">说明</p>
        <p class="note">
          本站空间属于这个站点私有，刷新或关掉浏览器都不会丢；本地目录只在你自己授权后才可读写，文件真实存在磁盘上。
        </p>
      </div>
    </aside>

    <section class="main">
      <div class="bar">
        <button class="icon-btn" :disabled="!stack.length" title="上一级" @click="goUp">↑</button>
        <button class="icon-btn" title="刷新" @click="refresh">⟳</button>
        <div class="crumbs">
          <button class="crumb" @click="jumpTo(0)">
            {{ backend === 'opfs' ? '本站空间' : '本地目录' }}
          </button>
          <template v-for="(s, i) in stack" :key="i">
            <span class="sep">/</span>
            <button class="crumb" @click="jumpTo(i + 1)">{{ s.name }}</button>
          </template>
        </div>
        <input v-model="keyword" class="search" placeholder="搜索当前目录" />
        <select v-model="sortBy" class="sort">
          <option value="name">按名称</option>
          <option value="size">按大小</option>
          <option value="time">按时间</option>
        </select>
      </div>

      <div class="actions">
        <button class="btn" @click="startCreate('dir')">＋ 文件夹</button>
        <button class="btn" @click="startCreate('file')">＋ 文本</button>
        <button class="btn" @click="pickFiles">↑ 上传文件</button>

        <span v-if="zipBusy" class="zip-status">
          {{ zipBusy }} · {{ zipProgress }}%
          <i class="zip-bar"><b :style="{ width: zipProgress + '%' }" /></i>
        </span>
        <span v-else-if="error" class="err">{{ error }}</span>
        <span v-else-if="notice" class="notice">{{ notice }}</span>
        <span v-else class="count">{{ visibleEntries.length }} 项</span>
      </div>

      <div
        class="grid-wrap"
        :class="{ dragging: dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <p v-if="loading" class="tip">读取中…</p>
        <p v-else-if="!visibleEntries.length && !creating" class="tip">
          {{ keyword ? '没有匹配的文件' : '这个文件夹是空的，拖文件进来或点上方按钮' }}
        </p>

        <div v-else class="grid">
          <div v-if="creating" class="creating">
            <span class="c-icon">{{ creating.kind === 'dir' ? '📁' : '📄' }}</span>
            <input
              ref="nameInputEl"
              v-model="creating.name"
              class="c-input"
              spellcheck="false"
              @keyup.enter="confirmCreate"
              @keyup.esc="cancelCreate"
              @blur="confirmCreate"
            />
          </div>

          <div
            v-for="entry in visibleEntries"
            :key="entry.name"
            class="cell"
            :class="{ dir: entry.kind === 'dir', active: preview?.entry?.name === entry.name }"
            :draggable="entry.kind === 'file'"
            @dblclick="enter(entry)"
            @click="entry.kind === 'file' ? openPreview(entry) : null"
            @contextmenu="openMenu(entry, $event)"
            @dragstart="onDragStart(entry, $event)"
            @dragover.prevent
            @drop="onDropOnFolder(entry, $event)"
          >
            <span class="icon">{{ iconOf(fileKind(entry), extOf(entry.name)) }}</span>

            <input
              v-if="renaming && renaming.entry.name === entry.name"
              v-model="renaming.name"
              class="r-input"
              spellcheck="false"
              @click.stop
              @keyup.enter="confirmRename"
              @keyup.esc="renaming = null"
              @blur="confirmRename"
            />
            <span v-else class="name" :title="entry.name">{{ entry.name }}</span>

            <span class="meta">
              {{ entry.kind === 'dir' ? '文件夹' : formatSize(entry.size) }}
              <template v-if="entry.mtime"> · {{ formatTime(entry.mtime) }}</template>
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 预览面板 -->
    <aside v-if="preview" class="preview">
      <div class="pv-head">
        <span class="pv-name" :title="preview.entry.name">{{ preview.entry.name }}</span>
        <button class="pv-close" @click="closePreview">✕</button>
      </div>

      <div class="pv-body">
        <template v-if="preview.kind === 'text'">
          <textarea v-model="preview.text" class="pv-text" spellcheck="false" />
        </template>
        <template v-else-if="preview.kind === 'image'">
          <img :src="preview.url" class="pv-image" alt="" />
        </template>
        <template v-else-if="preview.kind === 'audio'">
          <audio :src="preview.url" controls class="pv-audio" />
        </template>
        <template v-else-if="preview.kind === 'video'">
          <video :src="preview.url" controls class="pv-video" />
        </template>
        <template v-else-if="preview.kind === 'pdf'">
          <iframe :src="preview.url" class="pv-frame" title="PDF 预览" />
        </template>
        <template v-else>
          <p class="pv-tip">该类型不支持预览，可下载后查看。</p>
        </template>
      </div>

      <div class="pv-foot">
        <span class="pv-meta">{{ formatSize(preview.entry.size) }}</span>
        <template v-if="preview.kind === 'text'">
          <button class="btn primary" @click="savePreview">
            {{ preview.saved ? '已保存' : '保存' }}
          </button>
        </template>
        <button class="btn" @click="download(preview.entry)">下载</button>
      </div>
    </aside>

    <!-- 右键菜单 -->
    <div v-if="menu" class="menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <button @click="enter(menu.entry)">{{ menu.entry.kind === 'dir' ? '打开' : '预览' }}</button>
      <button :disabled="!!zipBusy" @click="zipEntry(menu.entry)">打包为 zip</button>
      <button v-if="isZip(menu.entry)" :disabled="!!zipBusy" @click="unzipEntry(menu.entry)">
        解压到当前目录
      </button>
      <button @click="startRename(menu.entry)">重命名</button>
      <button v-if="menu.entry.kind === 'file'" @click="download(menu.entry)">下载</button>
      <button class="danger" @click="remove(menu.entry)">删除</button>
    </div>

    <input ref="fileInputEl" type="file" multiple hidden @change="onFileChange" />
  </div>
</template>

<style scoped>
.fm {
  position: relative;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: 178px 1fr auto;
  gap: 10px;
}

/* ---- 侧栏 ---- */
.side {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.side-title {
  margin: 4px 8px 2px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-faint);
}
.place {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  text-align: left;
  color: var(--text);
}
.place:hover:not(:disabled) {
  background: var(--fill-1);
}
.place.on {
  background: var(--accent-soft);
  color: var(--accent);
}
.place:disabled {
  opacity: 0.45;
  cursor: default;
}
.p-icon {
  flex: none;
  font-size: 14px;
}
.p-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.p-name {
  font-size: 12px;
  font-weight: 500;
}
.p-sub {
  font-size: 10px;
  color: var(--text-faint);
}
.usage {
  margin: 6px 8px 0;
}
.bar {
  height: 4px;
  border-radius: 99px;
  background: var(--fill-2);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--accent);
}
.usage-text {
  margin: 4px 0 0;
  font-size: 10px;
  color: var(--text-faint);
}
.side-tip {
  margin: 4px 8px 0;
}
.side-bottom {
  margin-top: auto;
}
.note {
  margin: 0 8px;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
.link {
  font-size: 10.5px;
  color: var(--accent);
}

/* ---- 主区 ---- */
.main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
}
.icon-btn {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  color: var(--text-dim);
  font-size: 13px;
}
.icon-btn:hover:not(:disabled) {
  background: var(--fill-1);
  color: var(--text);
}
.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.crumbs {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  white-space: nowrap;
}
.crumb {
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text);
}
.crumb:hover {
  background: var(--fill-1);
}
.sep {
  font-size: 10px;
  color: var(--text-faint);
}
.search {
  flex: none;
  width: 132px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  outline: none;
  font-size: 11.5px;
}
.sort {
  flex: none;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  outline: none;
}
.actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn {
  padding: 5px 11px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
}
.btn:hover {
  background: var(--fill-1);
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-faint);
}
.err {
  margin-left: auto;
  font-size: 11px;
  color: var(--danger);
}
.notice {
  margin-left: auto;
  font-size: 11px;
  color: var(--success);
}
.zip-status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  max-width: 260px;
  overflow: hidden;
  white-space: nowrap;
}
.zip-bar {
  display: block;
  width: 54px;
  height: 4px;
  border-radius: 99px;
  background: var(--fill-2);
  overflow: hidden;
}
.zip-bar b {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--accent);
  transition: width 0.2s ease;
}

.grid-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.grid-wrap.dragging {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
}
.tip {
  margin: 40px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-dim);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(94px, 1fr));
  gap: 6px;
  align-content: start;
}
.cell,
.creating {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px 8px;
  border-radius: 8px;
  cursor: default;
  user-select: none;
}
.cell:hover {
  background: var(--fill-1);
}
.cell.active {
  background: var(--accent-soft);
}
.icon {
  font-size: 26px;
  line-height: 1;
}
.name,
.c-input,
.r-input {
  width: 100%;
  font-size: 11.5px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.c-input,
.r-input {
  padding: 2px 4px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
}
.meta {
  font-size: 10px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.c-icon {
  font-size: 26px;
}

/* ---- 预览 ---- */
.preview {
  width: 320px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.pv-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.pv-name {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-close {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-dim);
}
.pv-close:hover {
  background: var(--fill-2);
}
.pv-body {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 8px;
  overflow: auto;
}
.pv-text {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--code-bg);
  color: var(--text);
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
}
.pv-image,
.pv-video {
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  border-radius: 6px;
}
.pv-audio {
  width: 100%;
  margin: auto;
}
.pv-frame {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 6px;
}
.pv-tip {
  margin: auto;
  font-size: 11.5px;
  color: var(--text-dim);
}
.pv-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-top: 1px solid var(--border);
  background: var(--fill-1);
}
.pv-meta {
  margin-right: auto;
  font-size: 10.5px;
  color: var(--text-faint);
}

/* ---- 右键菜单 ---- */
.menu {
  position: fixed;
  z-index: 60;
  min-width: 118px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-2);
}
.menu button {
  display: block;
  width: 100%;
  padding: 5px 9px;
  border-radius: 5px;
  text-align: left;
  font-size: 12px;
  color: var(--text);
}
.menu button:hover {
  background: var(--fill-1);
}
.menu button.danger {
  color: var(--danger);
}
</style>
