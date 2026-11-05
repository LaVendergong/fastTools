<script setup>
import { computed, ref } from 'vue'

let pdfLib = null
async function ensurePdf() {
  if (!pdfLib) pdfLib = await import('pdf-lib')
  return pdfLib
}

const MODES = [
  { id: 'merge', name: '合并', desc: '多个 PDF 合成一个' },
  { id: 'split', name: '拆分', desc: '提取指定页码' },
  { id: 'image', name: '图片转 PDF', desc: '每张图一页 A4' },
]

const mode = ref('merge')
const files = ref([]) // { id, name, size, bytes, pages, url }
const rangeText = ref('1-3')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const fileInputEl = ref(null)
const dragOver = ref(false)

let seq = 0

const accept = computed(() =>
  mode.value === 'image' ? 'image/png,image/jpeg' : 'application/pdf',
)

const totalPages = computed(() => files.value.reduce((sum, f) => sum + (f.pages || 0), 0))

function formatSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/* ---------------- 文件读取 ---------------- */

async function addFiles(list) {
  const picked = [...list].filter((f) =>
    mode.value === 'image' ? /image\/(png|jpe?g)/.test(f.type) : f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
  )
  if (!picked.length) {
    error.value = mode.value === 'image' ? '请选择 PNG / JPEG 图片' : '请选择 PDF 文件'
    return
  }
  error.value = ''

  for (const file of picked) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let pages = 0
    if (mode.value !== 'image') {
      try {
        const { PDFDocument } = await ensurePdf()
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
        pages = doc.getPageCount()
      } catch (e) {
        error.value = `${file.name} 解析失败：${e.message}`
        continue
      }
    }
    files.value.push({
      id: ++seq,
      name: file.name,
      size: file.size,
      bytes,
      pages,
    })
  }
}

function onPick(e) {
  const list = [...(e.target.files || [])]
  e.target.value = ''
  if (list.length) addFiles(list)
}

function onDrop(e) {
  dragOver.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

function removeFile(id) {
  files.value = files.value.filter((f) => f.id !== id)
}

function move(id, delta) {
  const index = files.value.findIndex((f) => f.id === id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= files.value.length) return
  const list = [...files.value]
  ;[list[index], list[target]] = [list[target], list[index]]
  files.value = list
}

function clearAll() {
  files.value = []
  error.value = ''
  notice.value = ''
}

/* ---------------- 页码解析 ---------------- */

function parseRanges(text, max) {
  const result = []
  for (const part of String(text).split(/[,，\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) throw new Error(`页码格式不对：${part}（示例：1-3,5）`)
    const start = Number(m[1])
    const end = m[2] ? Number(m[2]) : start
    if (start < 1 || end < start) throw new Error(`页码范围不对：${part}`)
    if (end > max) throw new Error(`超出总页数（共 ${max} 页）：${part}`)
    for (let i = start; i <= end; i += 1) result.push(i - 1)
  }
  return [...new Set(result)]
}

/* ---------------- 执行 ---------------- */

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

async function run() {
  if (!files.value.length) {
    error.value = '先添加文件'
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''

  try {
    const { PDFDocument } = await ensurePdf()

    if (mode.value === 'merge') {
      const out = await PDFDocument.create()
      let count = 0
      for (const file of files.value) {
        const src = await PDFDocument.load(file.bytes, { ignoreEncryption: true })
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach((page) => {
          out.addPage(page)
          count += 1
        })
      }
      const bytes = await out.save()
      download(bytes, 'merged.pdf')
      notice.value = `已合并 ${files.value.length} 个文件，共 ${count} 页（${formatSize(bytes.length)}）`
    } else if (mode.value === 'split') {
      const file = files.value[0]
      const src = await PDFDocument.load(file.bytes, { ignoreEncryption: true })
      const indices = parseRanges(rangeText.value, src.getPageCount())
      const out = await PDFDocument.create()
      const pages = await out.copyPages(src, indices)
      pages.forEach((page) => out.addPage(page))
      const bytes = await out.save()
      download(bytes, `${file.name.replace(/\.pdf$/i, '')}-pages.pdf`)
      notice.value = `已提取 ${indices.length} 页（${formatSize(bytes.length)}）`
    } else {
      const out = await PDFDocument.create()
      const A4 = [595.28, 841.89]
      const margin = 24
      for (const file of files.value) {
        const isPng = /\.png$/i.test(file.name) || file.name.toLowerCase().endsWith('.png')
        let image
        try {
          image = isPng ? await out.embedPng(file.bytes) : await out.embedJpg(file.bytes)
        } catch {
          // png 声明不对时再兜底试一次 jpg
          image = isPng ? await out.embedJpg(file.bytes) : await out.embedPng(file.bytes)
        }
        const page = out.addPage(A4)
        const maxW = A4[0] - margin * 2
        const maxH = A4[1] - margin * 2
        const scale = Math.min(maxW / image.width, maxH / image.height, 1)
        const w = image.width * scale
        const h = image.height * scale
        page.drawImage(image, {
          x: (A4[0] - w) / 2,
          y: (A4[1] - h) / 2,
          width: w,
          height: h,
        })
      }
      const bytes = await out.save()
      download(bytes, 'images.pdf')
      notice.value = `已生成 ${files.value.length} 页 PDF（${formatSize(bytes.length)}）`
    }
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    class="pdf"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <div class="seg">
        <button v-for="m in MODES" :key="m.id" :class="{ on: mode === m.id }" @click="mode = m.id; clearAll()">
          {{ m.name }}
        </button>
      </div>
      <span class="mode-desc">{{ MODES.find((m) => m.id === mode)?.desc }}</span>

      <span class="spacer" />
      <button class="btn" @click="fileInputEl?.click()">
        {{ mode === 'image' ? '选择图片' : '选择 PDF' }}
      </button>
      <button class="btn" :disabled="!files.length" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="busy || !files.length" @click="run">
        {{ busy ? '处理中…' : mode === 'merge' ? '合并下载' : mode === 'split' ? '提取下载' : '生成 PDF' }}
      </button>
    </div>

    <p v-if="error" class="err-bar">{{ error }}</p>

    <div v-if="!files.length" class="empty">
      <p class="big">
        {{ mode === 'image' ? '拖入图片（PNG / JPEG）' : '拖入 PDF 文件' }}
      </p>
      <p class="small">
        {{ mode === 'merge' ? '可以选多个，按列表顺序合并；可上下调整次序。' : '' }}
        {{ mode === 'split' ? '只选一个文件，然后在下方填要提取的页码。' : '' }}
        {{ mode === 'image' ? '每张图会单独占一页 A4，等比缩放并居中。' : '' }}
        文件只在本机处理，不会上传。
      </p>
    </div>

    <div v-else class="body">
      <div class="list">
        <div v-for="(file, i) in files" :key="file.id" class="row">
          <span class="idx">{{ i + 1 }}</span>
          <div class="meta">
            <p class="name" :title="file.name">{{ file.name }}</p>
            <p class="sub">
              {{ formatSize(file.size) }}
              <template v-if="file.pages"> · {{ file.pages }} 页</template>
            </p>
          </div>
          <div v-if="mode === 'merge'" class="order">
            <button class="mini" :disabled="i === 0" title="上移" @click="move(file.id, -1)">↑</button>
            <button
              class="mini"
              :disabled="i === files.length - 1"
              title="下移"
              @click="move(file.id, 1)"
            >
              ↓
            </button>
          </div>
          <button class="mini del" title="移除" @click="removeFile(file.id)">✕</button>
        </div>
      </div>

      <div class="side">
        <template v-if="mode === 'split'">
          <label class="field-label">提取页码</label>
          <input v-model="rangeText" class="field-input mono" placeholder="1-3,5" spellcheck="false" />
          <p class="field-hint">
            共 {{ files[0]?.pages || 0 }} 页，支持 <code>1-3</code>、<code>1,3,5</code> 或组合
          </p>
        </template>

        <div class="summary">
          <span class="sum-label">{{ mode === 'mount' ? '' : '合计' }}</span>
          <span class="sum-value">
            {{ files.length }} 个文件
            <template v-if="mode !== 'image'"> · {{ totalPages }} 页</template>
          </span>
        </div>
      </div>
    </div>

    <p v-if="notice" class="notice">{{ notice }}</p>

    <p class="hint">
      基于 pdf-lib，纯前端处理。合并保留原页面尺寸与内容；拆分输出所选页组成的新文件；
      图片转 PDF 默认 A4 竖版、24pt 页边距，图片不会放大超过原始尺寸。
    </p>

    <input ref="fileInputEl" type="file" :accept="accept" multiple hidden @change="onPick" />
  </div>
</template>

<style scoped>
.pdf {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.pdf.dragging {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
  border-radius: 10px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.mode-desc {
  font-size: 10.5px;
  color: var(--text-faint);
}
.spacer {
  margin-left: auto;
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
.err-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  text-align: center;
}
.empty .big {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.empty .small {
  margin: 0;
  max-width: 460px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-faint);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.list {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}
.row:last-child {
  border-bottom: none;
}
.idx {
  flex: none;
  width: 20px;
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.meta {
  flex: 1;
  min-width: 0;
}
.name {
  margin: 0;
  font-size: 11.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  margin: 2px 0 0;
  font-size: 9.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.order {
  display: flex;
  gap: 3px;
}
.mini {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-dim);
  background: var(--fill-1);
}
.mini:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.35;
}
.mini.del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.side {
  flex: none;
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field-label {
  font-size: 10.5px;
  color: var(--text-faint);
}
.field-input {
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 12px;
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.field-hint {
  margin: 0;
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--text-faint);
}
.field-hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
.summary {
  margin-top: auto;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.sum-label {
  font-size: 10px;
  color: var(--text-faint);
}
.sum-value {
  font-size: 11.5px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.notice {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--success);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
</style>
