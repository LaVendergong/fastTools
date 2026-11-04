<script setup>
import { computed, reactive, ref, watch } from 'vue'

const FILTER_DEFAULTS = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, blur: 0 }
const SCALES = [25, 50, 75, 100]
const FORMATS = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/webp', label: 'WebP' },
]

const fileInputEl = ref(null)
const imageEl = ref(null)
const photo = ref(null) // { src, width, height, name, size, type }
const filters = reactive({ ...FILTER_DEFAULTS })
const rotate = ref(0)
const flipH = ref(false)
const flipV = ref(false)
const scale = ref(100)
const format = ref('image/jpeg')
const quality = ref(85)
const exporting = ref(false)
const result = ref(null) // { size, url, width, height, name }
const copied = ref(false)

const supported = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml']

const filterCss = computed(
  () =>
    `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) grayscale(${filters.grayscale}%) blur(${filters.blur}px)`,
)

const transformCss = computed(
  () => `rotate(${rotate.value}deg) scaleX(${flipH.value ? -1 : 1}) scaleY(${flipV.value ? -1 : 1})`,
)

const outputSize = computed(() => {
  if (!photo.value) return null
  const w = Math.max(1, Math.round((photo.value.width * scale.value) / 100))
  const h = Math.max(1, Math.round((photo.value.height * scale.value) / 100))
  return rotate.value % 180 === 0 ? { w, h } : { w: h, h: w }
})

const qualityEnabled = computed(() => format.value !== 'image/png')

function formatSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function loadFile(file) {
  if (!file) return
  if (!file.type.startsWith('image/')) return

  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    imageEl.value = image
    photo.value = {
      src: url,
      width: image.naturalWidth,
      height: image.naturalHeight,
      name: file.name,
      size: file.size,
      type: file.type,
    }
    result.value = null
    reset()
    undoStack.value = []
    redoStack.value = []
    pushSnapshot(0)
  }
  image.src = url
}

function onPick(e) {
  loadFile(e.target.files?.[0])
  e.target.value = ''
}

function onDrop(e) {
  loadFile(e.dataTransfer?.files?.[0])
}

/* ---- 撤销 / 重做 ---- */
const undoStack = ref([])
const redoStack = ref([])
let snapshotTimer = null

function snapshotText() {
  return JSON.stringify({
    filters: { ...filters },
    rotate: rotate.value,
    flipH: flipH.value,
    flipV: flipV.value,
    scale: scale.value,
  })
}

function applySnapshot(text) {
  const data = JSON.parse(text)
  Object.assign(filters, data.filters)
  rotate.value = data.rotate
  flipH.value = data.flipH
  flipV.value = data.flipV
  scale.value = data.scale
  result.value = null
}

function pushSnapshot(delay = 320) {
  clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(() => {
    const text = snapshotText()
    if (undoStack.value[undoStack.value.length - 1] === text) return
    undoStack.value.push(text)
    if (undoStack.value.length > 60) undoStack.value.shift()
    redoStack.value = []
  }, delay)
}

function undo() {
  if (undoStack.value.length < 2) return
  redoStack.value.push(undoStack.value.pop())
  applySnapshot(undoStack.value[undoStack.value.length - 1])
}

function redo() {
  const next = redoStack.value.pop()
  if (!next) return
  undoStack.value.push(next)
  applySnapshot(next)
}

watch(
  () => [
    filters.brightness,
    filters.contrast,
    filters.saturate,
    filters.grayscale,
    filters.blur,
    rotate.value,
    flipH.value,
    flipV.value,
    scale.value,
  ],
  () => pushSnapshot(),
)

/* ---- 裁剪 ---- */
const cropMode = ref(false)
const crop = reactive({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
const CROP_PRESETS = [
  { label: '自由', w: 0.8, h: 0.8 },
  { label: '1:1', w: 0.7, h: 0.7 },
  { label: '4:3', w: 0.8, h: 0.6 },
  { label: '16:9', w: 0.9, h: 0.506 },
]

function setPreset(p) {
  crop.w = p.w
  crop.h = p.h
  crop.x = (1 - p.w) / 2
  crop.y = (1 - p.h) / 2
}

function applyCrop() {
  const img = imageEl.value
  if (!img || !photo.value) return

  const sx = Math.round(crop.x * img.naturalWidth)
  const sy = Math.round(crop.y * img.naturalHeight)
  const sw = Math.max(1, Math.round(crop.w * img.naturalWidth))
  const sh = Math.max(1, Math.round(crop.h * img.naturalHeight))

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

  const dataUrl = canvas.toDataURL('image/png')
  const next = new Image()
  next.onload = () => {
    imageEl.value = next
    photo.value = { ...photo.value, src: dataUrl, width: sw, height: sh }
    cropMode.value = false
    crop.x = 0.1
    crop.y = 0.1
    crop.w = 0.8
    crop.h = 0.8
    result.value = null
    undoStack.value = []
    redoStack.value = []
    pushSnapshot(0)
  }
  next.src = dataUrl
}

function reset() {
  Object.assign(filters, FILTER_DEFAULTS)
  rotate.value = 0
  flipH.value = false
  flipV.value = false
  scale.value = 100
  cropMode.value = false
  result.value = null
}

function rotateBy(deg) {
  rotate.value = (rotate.value + deg + 360) % 360
}

async function exportImage() {
  if (!photo.value || !imageEl.value) return
  exporting.value = true

  try {
    const image = imageEl.value
    const rotated = rotate.value % 180 !== 0
    const drawW = Math.max(1, Math.round((photo.value.width * scale.value) / 100))
    const drawH = Math.max(1, Math.round((photo.value.height * scale.value) / 100))

    const canvas = document.createElement('canvas')
    canvas.width = rotated ? drawH : drawW
    canvas.height = rotated ? drawW : drawH
    const ctx = canvas.getContext('2d')

    // JPEG 不支持透明，先铺白底
    if (format.value === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    ctx.filter = filterCss.value
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((rotate.value * Math.PI) / 180)
    ctx.scale(flipH.value ? -1 : 1, flipV.value ? -1 : 1)
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, format.value, quality.value / 100))
    if (!blob) return

    if (result.value) URL.revokeObjectURL(result.value.url)
    const ext = format.value.split('/')[1].replace('jpeg', 'jpg')
    const name = (photo.value.name.replace(/\.[^.]+$/, '') || 'image') + `-edited.${ext}`

    result.value = {
      size: blob.size,
      url: URL.createObjectURL(blob),
      width: canvas.width,
      height: canvas.height,
      name,
      saved: photo.value.size ? Math.round((1 - blob.size / photo.value.size) * 100) : 0,
    }
  } finally {
    exporting.value = false
  }
}

async function copySize() {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText(`${result.value.width}×${result.value.height}, ${formatSize(result.value.size)}`)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="editor">
    <div class="bar">
      <button class="tbtn" @click="fileInputEl?.click()">打开图片</button>
      <i class="vline" />
      <button class="tbtn" :disabled="!photo" @click="rotateBy(90)">旋转 90°</button>
      <button class="tbtn" :disabled="!photo" @click="rotateBy(-90)">旋转 -90°</button>
      <button class="tbtn" :class="{ on: flipH }" :disabled="!photo" @click="flipH = !flipH">
        水平翻转
      </button>
      <button class="tbtn" :class="{ on: flipV }" :disabled="!photo" @click="flipV = !flipV">
        垂直翻转
      </button>
      <i class="vline" />
      <button class="tbtn" :disabled="!photo || undoStack.length < 2" title="撤销" @click="undo">
        撤销
      </button>
      <button class="tbtn" :disabled="!redoStack.length" title="重做" @click="redo">重做</button>
      <button class="tbtn" :disabled="!photo" @click="reset">重置</button>
      <span v-if="photo" class="meta">
        {{ photo.name }} · {{ photo.width }}×{{ photo.height }} · {{ formatSize(photo.size) }}
      </span>
      <input ref="fileInputEl" type="file" accept="image/*" class="hidden" @change="onPick" />
    </div>

    <div class="body">
      <div
        class="canvas-area"
        :class="{ empty: !photo }"
        @dragover.prevent
        @drop.prevent="onDrop"
        @click="!photo && fileInputEl?.click()"
      >
        <div v-if="photo" class="photo-wrap">
          <img
            :src="photo.src"
            class="photo"
            :style="{ filter: filterCss, transform: transformCss }"
            alt="编辑预览"
          />
          <div
            v-if="cropMode"
            class="crop-mask"
            :style="{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
            }"
          >
            <span class="crop-label">{{ Math.round(crop.w * 100) }}% × {{ Math.round(crop.h * 100) }}%</span>
          </div>
        </div>
        <div v-else class="placeholder">
          <div class="drop-icon">🖼️</div>
          <p class="drop-title">拖入图片或点击选择</p>
          <p class="drop-sub">支持 PNG / JPEG / WebP / GIF / BMP / SVG，本地处理不上传</p>
        </div>
      </div>

      <div class="side">
        <div class="panel">
          <div class="panel-head"><span class="panel-title">调整</span></div>
          <div class="pane">
            <div class="crop-row">
              <button
                class="tbtn"
                :class="{ on: cropMode }"
                :disabled="!photo"
                @click="cropMode = !cropMode"
              >
                {{ cropMode ? '退出裁剪' : '裁剪' }}
              </button>
              <template v-if="cropMode">
                <button v-for="p in CROP_PRESETS" :key="p.label" class="chip" @click="setPreset(p)">
                  {{ p.label }}
                </button>
                <button class="tbtn primary" @click="applyCrop">应用</button>
              </template>
            </div>

            <div v-if="cropMode" class="crop-sliders">
              <div class="ctrl">
                <label>水平</label>
                <input v-model.number="crop.x" type="range" min="0" max="0.9" step="0.01" />
                <span class="val">{{ Math.round(crop.x * 100) }}%</span>
              </div>
              <div class="ctrl">
                <label>垂直</label>
                <input v-model.number="crop.y" type="range" min="0" max="0.9" step="0.01" />
                <span class="val">{{ Math.round(crop.y * 100) }}%</span>
              </div>
              <div class="ctrl">
                <label>宽度</label>
                <input v-model.number="crop.w" type="range" min="0.05" max="1" step="0.01" />
                <span class="val">{{ Math.round(crop.w * 100) }}%</span>
              </div>
              <div class="ctrl">
                <label>高度</label>
                <input v-model.number="crop.h" type="range" min="0.05" max="1" step="0.01" />
                <span class="val">{{ Math.round(crop.h * 100) }}%</span>
              </div>
            </div>

            <div class="ctrl">
              <label>亮度</label>
              <input v-model.number="filters.brightness" type="range" min="0" max="200" />
              <span class="val">{{ filters.brightness }}%</span>
            </div>
            <div class="ctrl">
              <label>对比度</label>
              <input v-model.number="filters.contrast" type="range" min="0" max="200" />
              <span class="val">{{ filters.contrast }}%</span>
            </div>
            <div class="ctrl">
              <label>饱和度</label>
              <input v-model.number="filters.saturate" type="range" min="0" max="200" />
              <span class="val">{{ filters.saturate }}%</span>
            </div>
            <div class="ctrl">
              <label>灰度</label>
              <input v-model.number="filters.grayscale" type="range" min="0" max="100" />
              <span class="val">{{ filters.grayscale }}%</span>
            </div>
            <div class="ctrl">
              <label>模糊</label>
              <input v-model.number="filters.blur" type="range" min="0" max="20" step="0.5" />
              <span class="val">{{ filters.blur }}px</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><span class="panel-title">输出</span></div>
          <div class="pane">
            <div class="ctrl">
              <label>格式</label>
              <select v-model="format" class="select">
                <option v-for="f in FORMATS" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
              <span class="val">{{ outputSize ? `${outputSize.w}×${outputSize.h}` : '—' }}</span>
            </div>
            <div class="ctrl">
              <label>质量</label>
              <input
                v-model.number="quality"
                type="range"
                min="10"
                max="100"
                :disabled="!qualityEnabled"
              />
              <span class="val">{{ qualityEnabled ? `${quality}%` : '—' }}</span>
            </div>
            <div class="ctrl">
              <label>缩放</label>
              <div class="segmented">
                <button
                  v-for="s in SCALES"
                  :key="s"
                  :class="{ on: scale === s }"
                  @click="scale = s"
                >
                  {{ s }}%
                </button>
              </div>
            </div>

            <button class="export" :disabled="!photo || exporting" @click="exportImage">
              {{ exporting ? '导出中…' : '导出' }}
            </button>

            <div v-if="result" class="result">
              <p class="result-line">
                <code>{{ formatSize(result.size) }}</code>
                <span v-if="result.saved > 0" class="saved">比原图小 {{ result.saved }}%</span>
              </p>
              <p class="result-sub">
                {{ result.width }}×{{ result.height }} · {{ format.split('/')[1].toUpperCase() }}
              </p>
              <div class="result-actions">
                <a class="download" :href="result.url" :download="result.name">保存到本地</a>
                <button class="copy" @click="copySize">{{ copied ? '已复制' : '复制信息' }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
}
.tbtn {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn.on {
  border-color: transparent;
  background: rgba(0, 122, 255, 0.12);
  color: var(--accent);
}
.tbtn:disabled {
  opacity: 0.4;
  cursor: default;
}
.vline {
  width: 1px;
  height: 18px;
  background: var(--border);
  flex: none;
}
.meta {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hidden {
  display: none;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 10px;
}
.canvas-area {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: auto;
  border-radius: 10px;
  background: #3a3a3c;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.canvas-area.empty {
  background: var(--surface-2);
  border: 1.5px dashed rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
.photo-wrap {
  position: relative;
  display: inline-flex;
  max-width: 100%;
  max-height: 100%;
}
.crop-mask {
  position: absolute;
  border: 2px solid #fff;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.crop-label {
  position: absolute;
  left: 4px;
  top: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--fill-3);
  color: #fff;
  font-size: 10px;
  white-space: nowrap;
}
.crop-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border);
}
.crop-row .tbtn.on {
  border-color: transparent;
  background: rgba(0, 122, 255, 0.14);
  color: var(--accent);
}
.chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--fill-1);
  font-size: 11px;
  color: var(--text-dim);
}
.chip:hover {
  background: rgba(0, 122, 255, 0.12);
  color: var(--accent);
}
.photo {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: filter 0.1s ease;
  background: repeating-conic-gradient(#e6e6e8 0% 25%, #fff 0% 50%) 50% / 16px 16px;
}
.placeholder {
  text-align: center;
}
.drop-icon {
  font-size: 34px;
}
.drop-title {
  margin: 8px 0 4px;
  font-size: 14px;
  font-weight: 500;
}
.drop-sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim);
}
.side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.panel-head {
  flex: none;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.pane {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
}
.ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}
.ctrl label {
  flex: none;
  width: 46px;
  font-size: 12px;
  color: var(--text-dim);
}
.ctrl input[type='range'] {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.ctrl input[type='range']:disabled {
  opacity: 0.4;
}
.val {
  flex: none;
  width: 54px;
  font-size: 11.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.select {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 12px;
  outline: none;
}
.segmented {
  flex: 1;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--fill-1);
}
.segmented button {
  flex: 1;
  padding: 2px 0;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-dim);
}
.segmented button.on {
  background: var(--panel-bg);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.export {
  width: 100%;
  margin-top: 8px;
  padding: 7px 0;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-size: 12.5px;
  font-weight: 500;
}
.export:hover:not(:disabled) {
  background: var(--accent-strong);
}
.export:disabled {
  opacity: 0.45;
  cursor: default;
}
.result {
  margin-top: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  background: rgba(52, 199, 89, 0.08);
}
.result-line {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.result-line code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--success);
}
.saved {
  font-size: 11px;
  color: var(--success);
}
.result-sub {
  margin: 3px 0 8px;
  font-size: 11px;
  color: var(--text-dim);
}
.result-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.download {
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--panel-bg);
  border: 1px solid rgba(29, 122, 52, 0.3);
  color: var(--success);
  font-size: 11.5px;
  text-decoration: none;
}
.download:hover {
  background: rgba(52, 199, 89, 0.12);
}
.copy {
  font-size: 11.5px;
  color: var(--accent);
}
</style>
