<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const fileInputEl = ref(null)
const dragOver = ref(false)
const loading = ref(false)
const error = ref('')
const info = ref(null) // { name, size, width, height, url }
const tags = ref([])
const cleanSize = ref(0)
const cleanUrl = ref('')
const saved = ref(false)

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

const LABELS = {
  0x010f: '相机厂商',
  0x0110: '相机型号',
  0x0112: '方向',
  0x0131: '软件',
  0x0132: '修改时间',
  0x9003: '拍摄时间',
  0x829a: '曝光时间',
  0x829d: '光圈',
  0x8827: 'ISO',
  0x920a: '焦距',
  0xa002: '像素宽',
  0xa003: '像素高',
  0x9286: '用户注释',
  0x010e: '图像描述',
  0x013b: '作者',
  0x8298: '版权',
}

/* ---------------- JPEG 段解析 ---------------- */

function collectApp1(view) {
  const segments = []
  let i = 2
  while (i < view.byteLength - 4) {
    if (view.getUint8(i) !== 0xff) {
      i += 1
      continue
    }
    const marker = view.getUint8(i + 1)
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    if (marker === 0xda) break // 图像数据开始
    const len = view.getUint16(i + 2)
    if (marker === 0xe1) segments.push({ start: i, length: len + 2 })
    i += 2 + len
  }
  return segments
}

function readTiff(view, base) {
  const little = view.getUint16(base) === 0x4949
  const u16 = (o) => view.getUint16(base + o, little)
  const u32 = (o) => view.getUint32(base + o, little)

  const entryValue = (offset) => {
    const tag = u16(offset)
    const type = u16(offset + 2)
    const count = u32(offset + 4)
    const size = (TYPE_SIZE[type] || 1) * count
    const valueOffset = size <= 4 ? offset + 8 : u32(offset + 8)

    if (type === 2) {
      let text = ''
      for (let i = 0; i < count; i += 1) {
        const code = view.getUint8(base + valueOffset + i)
        if (code === 0) break
        text += String.fromCharCode(code)
      }
      return { tag, value: text.trim() }
    }
    if (type === 3) {
      if (count === 1) return { tag, value: u16(valueOffset) }
      return { tag, value: Array.from({ length: count }, (_, i) => u16(valueOffset + i * 2)) }
    }
    if (type === 4) {
      if (count === 1) return { tag, value: u32(valueOffset) }
      return { tag, value: Array.from({ length: count }, (_, i) => u32(valueOffset + i * 4)) }
    }
    if (type === 5 || type === 10) {
      const values = []
      for (let i = 0; i < count; i += 1) {
        const num = u32(valueOffset + i * 8)
        const den = u32(valueOffset + i * 8 + 4)
        values.push(den ? num / den : 0)
      }
      return { tag, value: count === 1 ? values[0] : values }
    }
    return { tag, value: null }
  }

  const readIfd = (offset) => {
    if (!offset || offset + 2 > view.byteLength - base) return {}
    const count = u16(offset)
    const out = {}
    for (let i = 0; i < count; i += 1) {
      const entry = offset + 2 + i * 12
      if (entry + 12 > view.byteLength - base) break
      try {
        const { tag, value } = entryValue(entry)
        out[tag] = value
      } catch {
        /* 跳过损坏条目 */
      }
    }
    return out
  }

  const ifd0 = readIfd(u32(4))
  const exif = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {}
  const gps = ifd0[0x8825] ? readIfd(ifd0[0x8825]) : {}
  return { ifd0, exif, gps }
}

function gpsDecimal(coords, ref) {
  if (!Array.isArray(coords) || coords.length < 3) return null
  const [d, m, s] = coords
  let value = d + m / 60 + s / 3600
  if (ref === 'S' || ref === 'W') value = -value
  return value
}

function parseExif(buffer) {
  const view = new DataView(buffer)
  const segments = collectApp1(view)
  const exifSeg = segments.find((seg) => view.getUint32(seg.start + 4) === 0x45786966)

  if (!exifSeg) return { segments, tags: [] }

  const tiffBase = exifSeg.start + 10 // FF E1 + len(2) + "Exif\0\0"(6)
  let parsed
  try {
    parsed = readTiff(view, tiffBase)
  } catch {
    return { segments, tags: [] }
  }

  const list = []
  const push = (tag, value, format) => {
    if (value === undefined || value === null || value === '') return
    list.push({ label: LABELS[tag] || `0x${tag.toString(16)}`, value: format ? format(value) : String(value) })
  }

  for (const tag of [0x010f, 0x0110, 0x0131, 0x0132, 0x010e, 0x013b, 0x8298]) {
    push(tag, parsed.ifd0[tag])
  }
  for (const tag of [0x9003, 0x829a, 0x829d, 0x8827, 0x920a, 0xa002, 0xa003]) {
    push(tag, parsed.exif[tag], (v) => {
      if (tag === 0x829a && typeof v === 'number') return v >= 0.3 ? `${v}s` : `1/${Math.round(1 / v)}s`
      if (tag === 0x829d) return `f/${Number(v).toFixed(1)}`
      if (tag === 0x8827) return `ISO ${v}`
      if (tag === 0x920a) return `${Number(v).toFixed(0)} mm`
      return String(v)
    })
  }

  const lat = gpsDecimal(parsed.gps[0x0002], parsed.gps[0x0001])
  const lng = gpsDecimal(parsed.gps[0x0004], parsed.gps[0x0003])
  if (lat !== null && lng !== null) {
    list.unshift({
      label: 'GPS 定位',
      value: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      danger: true,
    })
  }
  if (parsed.gps[0x0005] !== undefined) {
    list.push({ label: '海拔', value: `${Number(parsed.gps[0x0005]).toFixed(0)} m` })
  }

  return { segments, tags: list }
}

/* ---------------- 读图 / 清除 ---------------- */

async function loadFile(file) {
  if (!file) return
  if (!/jpe?g$/i.test(file.name) && file.type !== 'image/jpeg') {
    error.value = '目前只支持 JPEG（EXIF 主要存在于 JPEG 中，PNG 一般不含）'
    return
  }

  loading.value = true
  error.value = ''
  saved.value = false
  if (cleanUrl.value) URL.revokeObjectURL(cleanUrl.value)
  cleanUrl.value = ''
  cleanSize.value = 0
  if (info.value?.url) URL.revokeObjectURL(info.value.url)

  try {
    const buffer = await file.arrayBuffer()
    const { segments, tags: parsedTags } = parseExif(buffer)
    tags.value = parsedTags

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    await new Promise((resolve) => {
      img.onload = resolve
      img.onerror = resolve
    })

    info.value = {
      name: file.name,
      size: file.size,
      width: img.naturalWidth,
      height: img.naturalHeight,
      url,
    }

    // 清除：去掉所有 APP1 段（Exif + XMP）
    if (segments.length) {
      const bytes = new Uint8Array(buffer)
      const drop = segments.reduce((sum, s) => sum + s.length, 0)
      const out = new Uint8Array(bytes.length - drop)
      let read = 0
      let write = 0
      for (const seg of segments) {
        out.set(bytes.subarray(read, seg.start), write)
        write += seg.start - read
        read = seg.start + seg.length
      }
      out.set(bytes.subarray(read), write)

      const blob = new Blob([out], { type: 'image/jpeg' })
      cleanSize.value = blob.size
      cleanUrl.value = URL.createObjectURL(blob)
    }
  } catch (e) {
    error.value = `读取失败：${e.message}`
  } finally {
    loading.value = false
  }
}

function onPick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  loadFile(file)
}

function onDrop(e) {
  dragOver.value = false
  loadFile(e.dataTransfer?.files?.[0])
}

function downloadClean() {
  if (!cleanUrl.value || !info.value) return
  const a = document.createElement('a')
  a.href = cleanUrl.value
  a.download = info.value.name.replace(/(\.[^.]+)$/, '-clean$1')
  a.click()
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}

function reset() {
  if (info.value?.url) URL.revokeObjectURL(info.value.url)
  if (cleanUrl.value) URL.revokeObjectURL(cleanUrl.value)
  info.value = null
  tags.value = []
  cleanUrl.value = ''
  cleanSize.value = 0
  error.value = ''
}

const savedBytes = computed(() => {
  if (!info.value || !cleanSize.value) return 0
  return info.value.size - cleanSize.value
})

function formatBytes(bytes) {
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

onBeforeUnmount(reset)
</script>

<template>
  <div
    class="exif"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <button class="btn primary" @click="fileInputEl?.click()">选择 JPEG</button>
      <span class="hint-inline">或直接把照片拖进来</span>
      <span class="spacer" />
      <button class="btn" :disabled="!cleanUrl" @click="downloadClean">
        {{ saved ? '已保存' : '下载无 EXIF 版本' }}
      </button>
      <button class="btn" :disabled="!info" @click="reset">清空</button>
    </div>

    <p v-if="error" class="err-bar">{{ error }}</p>

    <div v-if="!info" class="empty">
      <p class="big">拖入一张照片查看 EXIF</p>
      <p class="small">
        照片里常藏着拍摄设备、时间、甚至 GPS 坐标。这里可以查看这些信息，并一键导出移除 EXIF 的版本，
        发图前先脱敏。全部在本地处理，图片不会上传。
      </p>
    </div>

    <div v-else class="body">
      <section class="preview">
        <img :src="info.url" :alt="info.name" class="photo" />
        <div class="file-info">
          <p class="file-name">{{ info.name }}</p>
          <p class="file-meta">
            {{ info.width }} × {{ info.height }} · {{ formatBytes(info.size) }}
            <template v-if="cleanSize">
              → 清除后 {{ formatBytes(cleanSize) }}
              <span class="saved">（少 {{ formatBytes(savedBytes) }}）</span>
            </template>
          </p>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-head">
          <span class="panel-title">EXIF 信息</span>
          <span class="count">{{ tags.length ? `${tags.length} 项` : '无' }}</span>
        </div>

        <div v-if="tags.length" class="tags">
          <div v-for="tag in tags" :key="tag.label" class="tag-row" :class="{ danger: tag.danger }">
            <span class="k">{{ tag.label }}</span>
            <span class="v">{{ tag.value }}</span>
          </div>
        </div>
        <div v-else class="no-tags">
          <p>这张图片不含 EXIF 信息（或被社交软件清理过了）</p>
        </div>

        <p v-if="tags.some((t) => t.danger)" class="warn">
          检测到 GPS 定位信息，公开分享前建议移除
        </p>
      </aside>
    </div>

    <p class="hint">
      「下载无 EXIF 版本」会移除所有 APP1 段（含 Exif 与 XMP），图像像素数据原样保留，画质不受影响。
    </p>

    <input ref="fileInputEl" type="file" accept="image/jpeg" hidden @change="onPick" />
  </div>
</template>

<style scoped>
.exif {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.exif.dragging {
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
.btn.primary:hover {
  background: var(--accent-strong);
}
.hint-inline {
  font-size: 10.5px;
  color: var(--text-faint);
}
.spacer {
  margin-left: auto;
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
  padding: 20px;
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
  max-width: 440px;
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
.preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-4);
  overflow: hidden;
}
.photo {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
  padding: 10px;
}
.file-info {
  flex: none;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--panel-bg);
}
.file-name {
  margin: 0;
  font-size: 11.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-meta {
  margin: 2px 0 0;
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.saved {
  color: var(--success);
}
.panel {
  flex: none;
  width: 320px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.panel-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.panel-title {
  font-size: 11.5px;
  font-weight: 600;
}
.count {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-faint);
}
.tags {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0;
}
.tag-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 4px 12px;
}
.tag-row:hover {
  background: var(--fill-1);
}
.tag-row.danger {
  background: var(--danger-soft);
}
.k {
  flex: none;
  width: 84px;
  font-size: 10.5px;
  color: var(--text-faint);
}
.v {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text);
  word-break: break-all;
}
.no-tags {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.no-tags p {
  margin: 0;
  font-size: 11px;
  color: var(--text-faint);
  text-align: center;
  line-height: 1.7;
}
.warn {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  background: var(--danger-soft);
  font-size: 10px;
  color: var(--danger);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
</style>
