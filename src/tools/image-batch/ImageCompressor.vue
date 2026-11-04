<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:imgcompress'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const opts = reactive({
  format: saved.format ?? 'keep', // keep | jpeg | webp | png
  quality: saved.quality ?? 0.82,
  maxSide: saved.maxSide ?? 0, // 0 = 原始尺寸
})

const items = ref([])
const dragOver = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref('')
const fileInputEl = ref(null)

let seq = 0

const total = computed(() => {
  const before = items.value.reduce((s, i) => s + (i.origSize || 0), 0)
  const after = items.value.reduce((s, i) => s + (i.outSize || 0), 0)
  return { before, after, saved: before - after }
})

const savedPercent = computed(() => {
  if (!total.value.before) return 0
  return Math.round((total.value.saved / total.value.before) * 100)
})

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function mimeOf(format, type) {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  if (format === 'png') return 'image/png'
  return type && type.startsWith('image/') ? type : 'image/jpeg'
}

function extOf(mime) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/gif') return 'gif'
  return 'png'
}

function baseName(name) {
  return name.replace(/\.[^.]+$/, '')
}

/* ---------------- 处理 ---------------- */

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* 回退到 Image */
    }
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })
  return img
}

async function compress(item) {
  const bitmap = item.bitmap
  const srcW = bitmap.width || bitmap.naturalWidth
  const srcH = bitmap.height || bitmap.naturalHeight

  const maxSide = Number(opts.maxSide) || 0
  const scale = maxSide > 0 ? Math.min(1, maxSide / Math.max(srcW, srcH)) : 1
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // PNG 透明背景转 JPEG 时补白
  const mime = mimeOf(opts.format, item.type)
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, mime, mime === 'image/png' ? undefined : Number(opts.quality)),
  )

  if (item.outUrl) URL.revokeObjectURL(item.outUrl)

  return {
    blob,
    outUrl: URL.createObjectURL(blob),
    outSize: blob.size,
    outName: `${baseName(item.name)}.${extOf(mime)}`,
    width: w,
    height: h,
  }
}

async function processAll() {
  if (!items.value.length) return
  busy.value = true
  error.value = ''
  for (const item of items.value) {
    if (!item.bitmap) continue
    try {
      Object.assign(item, await compress(item))
      item.done = true
    } catch (e) {
      item.err = e.message
    }
  }
  busy.value = false
}

/* ---------------- 文件 ---------------- */

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'))
  if (!files.length) {
    error.value = '请选择图片文件（PNG / JPEG / WebP / GIF）'
    return
  }
  error.value = ''

  for (const file of files) {
    try {
      const bitmap = await loadBitmap(file)
      items.value.push({
        id: ++seq,
        name: file.name,
        type: file.type,
        origSize: file.size,
        srcUrl: URL.createObjectURL(file),
        bitmap,
        width: bitmap.width || bitmap.naturalWidth,
        height: bitmap.height || bitmap.naturalHeight,
        outUrl: '',
        outSize: 0,
        outName: '',
        done: false,
        err: '',
      })
    } catch (e) {
      error.value = `读取失败：${file.name}`
    }
  }
  await processAll()
}

function onPick(e) {
  // 必须先把 FileList 拷贝成数组，再清空 input，否则清空后数组也跟着空了
  const files = [...(e.target.files || [])]
  e.target.value = ''
  if (files.length) addFiles(files)
}

function onDrop(e) {
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (files?.length) addFiles(files)
}

function removeItem(id) {
  const idx = items.value.findIndex((i) => i.id === id)
  if (idx < 0) return
  const item = items.value[idx]
  URL.revokeObjectURL(item.srcUrl)
  if (item.outUrl) URL.revokeObjectURL(item.outUrl)
  items.value.splice(idx, 1)
}

function clearAll() {
  items.value.forEach((i) => {
    URL.revokeObjectURL(i.srcUrl)
    if (i.outUrl) URL.revokeObjectURL(i.outUrl)
  })
  items.value = []
  message.value = ''
}

function download(item) {
  if (!item.outUrl) return
  const a = document.createElement('a')
  a.href = item.outUrl
  a.download = item.outName
  a.click()
}

async function downloadAll() {
  const done = items.value.filter((i) => i.done && i.outUrl)
  if (!done.length) return
  message.value = `开始下载 ${done.length} 个文件…`
  for (const item of done) {
    download(item)
    await new Promise((r) => setTimeout(r, 320))
  }
  setTimeout(() => {
    if (message.value.startsWith('开始下载')) message.value = ''
  }, 2000)
}

/* ---------------- 选项变化后重算 ---------------- */

let timer = null
watch(
  () => [opts.format, opts.quality, opts.maxSide],
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(opts))
      processAll()
    }, 260)
  },
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  items.value.forEach((i) => {
    URL.revokeObjectURL(i.srcUrl)
    if (i.outUrl) URL.revokeObjectURL(i.outUrl)
  })
})
</script>

<template>
  <div
    class="imgc"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <button class="btn primary" @click="fileInputEl?.click()">选择图片</button>
      <span class="hint">也可以直接把图片拖进来，支持多张</span>

      <span class="spacer" />

      <label class="opt">
        输出格式
        <select v-model="opts.format" class="select">
          <option value="keep">保持原格式</option>
          <option value="webp">WebP（最小）</option>
          <option value="jpeg">JPEG</option>
          <option value="png">PNG（无损）</option>
        </select>
      </label>

      <label class="opt" :class="{ muted: opts.format === 'png' }">
        质量
        <input
          v-model.number="opts.quality"
          class="range"
          type="range"
          min="0.4"
          max="1"
          step="0.02"
          :disabled="opts.format === 'png'"
        />
        <span class="val">{{ Math.round(opts.quality * 100) }}%</span>
      </label>

      <label class="opt">
        最长边
        <select v-model.number="opts.maxSide" class="select">
          <option :value="0">不缩放</option>
          <option :value="1920">1920px</option>
          <option :value="1280">1280px</option>
          <option :value="800">800px</option>
          <option :value="400">400px</option>
        </select>
      </label>
    </div>

    <div v-if="items.length" class="summary">
      <span class="stat">
        {{ items.length }} 张 · 原始 {{ formatBytes(total.before) }} → 压缩后
        {{ formatBytes(total.after) }}
      </span>
      <span class="saved" :class="{ weak: savedPercent <= 0 }">
        {{ savedPercent > 0 ? `节省 ${savedPercent}%` : '已是最小体积' }}
      </span>
      <span class="spacer" />
      <span v-if="busy" class="processing">处理中…</span>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="busy || !items.length" @click="downloadAll">
        全部下载
      </button>
    </div>

    <div class="scroll">
      <div v-if="!items.length" class="empty">
        <p class="big">拖入图片开始压缩</p>
        <p class="small">支持 PNG / JPEG / WebP / GIF，可批量；全部在本地处理，不上传</p>
      </div>

      <div v-else class="grid">
        <article v-for="item in items" :key="item.id" class="card">
          <div class="thumb">
            <img :src="item.outUrl || item.srcUrl" :alt="item.name" />
            <button class="del" title="移除" @click="removeItem(item.id)">✕</button>
            <span v-if="item.done" class="badge">{{ item.width }}×{{ item.height }}</span>
          </div>

          <div class="meta">
            <p class="name" :title="item.name">{{ item.outName || item.name }}</p>
            <p class="size">
              {{ formatBytes(item.origSize) }}
              <span class="arrow">→</span>
              <b :class="{ up: item.outSize >= item.origSize }">{{ formatBytes(item.outSize) }}</b>
              <span
                v-if="item.origSize"
                class="rate"
                :class="{ up: item.outSize >= item.origSize }"
              >
                {{ Math.round(((item.origSize - item.outSize) / item.origSize) * 100) }}%
              </span>
            </p>
            <p v-if="item.err" class="err">{{ item.err }}</p>
          </div>

          <button class="mini" :disabled="!item.outUrl" @click="download(item)">下载</button>
        </article>
      </div>
    </div>

    <p v-if="message" class="msg">{{ message }}</p>
    <p v-if="error" class="err-bar">{{ error }}</p>

    <input ref="fileInputEl" type="file" accept="image/*" multiple hidden @change="onPick" />
  </div>
</template>

<style scoped>
.imgc {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.imgc.dragging {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
  border-radius: 10px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
  white-space: nowrap;
}
.btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover:not(:disabled) {
  background: var(--accent-strong);
}
.hint {
  font-size: 10.5px;
  color: var(--text-faint);
}
.opt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.opt.muted {
  opacity: 0.5;
}
.select {
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
}
.range {
  width: 84px;
  accent-color: var(--accent);
}
.val {
  width: 30px;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.spacer {
  margin-left: auto;
}
.summary {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--fill-1);
}
.stat {
  font-size: 11px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.saved {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--success-soft);
  color: var(--success);
  font-size: 10.5px;
  font-weight: 600;
}
.saved.weak {
  background: var(--warn-soft);
  color: var(--warn);
}
.processing {
  font-size: 10.5px;
  color: var(--accent);
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.empty {
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
}
.empty .big {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.empty .small {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-faint);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 9px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: 7px;
  background: var(--surface-4);
  overflow: hidden;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.del {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 9px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.card:hover .del {
  opacity: 1;
}
.badge {
  position: absolute;
  bottom: 5px;
  left: 5px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}
.meta {
  min-width: 0;
}
.name {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.size {
  margin: 2px 0 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.size b {
  color: var(--success);
  font-weight: 600;
}
.size b.up {
  color: var(--warn);
}
.arrow {
  opacity: 0.6;
}
.rate {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--success-soft);
  color: var(--success);
  font-size: 9px;
}
.rate.up {
  background: var(--warn-soft);
  color: var(--warn);
}
.mini {
  padding: 3px 0;
  border-radius: 5px;
  background: var(--fill-1);
  font-size: 10.5px;
  color: var(--accent);
}
.mini:hover:not(:disabled) {
  background: var(--accent-soft);
}
.mini:disabled {
  opacity: 0.4;
}
.err {
  margin: 2px 0 0;
  font-size: 9.5px;
  color: var(--danger);
}
.msg {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--accent);
}
.err-bar {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--danger);
}
</style>
