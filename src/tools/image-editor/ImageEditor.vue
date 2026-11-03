<script setup>
import { computed, reactive, ref } from 'vue'

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

function reset() {
  Object.assign(filters, FILTER_DEFAULTS)
  rotate.value = 0
  flipH.value = false
  flipV.value = false
  scale.value = 100
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
        <img
          v-if="photo"
          :src="photo.src"
          class="photo"
          :style="{ filter: filterCss, transform: transformCss }"
          alt="编辑预览"
        />
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
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
  background: #f5f5f7;
  border: 1.5px dashed rgba(0, 0, 0, 0.18);
  cursor: pointer;
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
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.panel-head {
  flex: none;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
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
  background: #fff;
  font-size: 12px;
  outline: none;
}
.segmented {
  flex: 1;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
}
.segmented button {
  flex: 1;
  padding: 2px 0;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-dim);
}
.segmented button.on {
  background: #fff;
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
  background: #0071e3;
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
  color: #1d7a34;
}
.saved {
  font-size: 11px;
  color: #1d7a34;
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
  background: #fff;
  border: 1px solid rgba(29, 122, 52, 0.3);
  color: #1d7a34;
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
