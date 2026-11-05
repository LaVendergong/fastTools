<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch, nextTick } from 'vue'
import { readJSON } from '../../lib/storage'

const STORAGE_KEY = 'toolbox:watermark'

const POSITIONS = [
  { id: 'top-left', name: '左上' },
  { id: 'top-center', name: '上中' },
  { id: 'top-right', name: '右上' },
  { id: 'middle-left', name: '左中' },
  { id: 'center', name: '正中' },
  { id: 'middle-right', name: '右中' },
  { id: 'bottom-left', name: '左下' },
  { id: 'bottom-center', name: '下中' },
  { id: 'bottom-right', name: '右下' },
]

const saved = readJSON(STORAGE_KEY)

const config = reactive({
  text: saved.text ?? '© 我的水印',
  fontScale: saved.fontScale ?? 0.045, // 相对图片宽度
  color: saved.color ?? '#FFFFFF',
  opacity: saved.opacity ?? 70,
  angle: saved.angle ?? -20,
  position: saved.position ?? 'bottom-right',
  margin: saved.margin ?? 0.03,
  tile: saved.tile ?? false,
  shadow: saved.shadow ?? true,
})

const images = ref([])
const activeIndex = ref(0)
const fileInputEl = ref(null)
const canvasEl = ref(null)
const exporting = ref(false)
const message = ref('')
const dragOver = ref(false)

const current = computed(() => images.value[activeIndex.value] || null)
const hasImages = computed(() => images.value.length > 0)

/* ---------------- 绘制 ---------------- */

function withAlpha(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function draw(canvas, img, width) {
  const scale = width / img.naturalWidth
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)

  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  const fontSize = Math.max(8, Math.round(w * config.fontScale))
  const margin = Math.round(w * config.margin)
  const alpha = config.opacity / 100
  const angle = (config.angle * Math.PI) / 180

  ctx.font = `600 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.fillStyle = withAlpha(config.color, alpha)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (config.shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = Math.max(2, fontSize * 0.12)
    ctx.shadowOffsetY = Math.max(1, fontSize * 0.04)
  }

  if (config.tile) {
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(angle)
    const textWidth = ctx.measureText(config.text).width
    const stepX = textWidth + fontSize * 3
    const stepY = fontSize * 5
    const radius = Math.ceil(Math.hypot(w, h) / 2)
    for (let y = -radius; y <= radius; y += stepY) {
      for (let x = -radius; x <= radius; x += stepX) {
        ctx.fillText(config.text, x, y)
      }
    }
    ctx.restore()
    return
  }

  const textWidth = ctx.measureText(config.text).width
  const halfH = fontSize * 0.7

  let x = w / 2
  let y = h / 2
  if (config.position.includes('left')) x = margin + textWidth / 2
  else if (config.position.includes('right')) x = w - margin - textWidth / 2
  if (config.position.startsWith('top')) y = margin + halfH
  else if (config.position.startsWith('bottom')) y = h - margin - halfH

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.fillText(config.text, 0, 0)
  ctx.restore()
}

let raf = null
function repaint() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const canvas = canvasEl.value
    const img = current.value?.img
    if (!canvas || !img) return
    const maxWidth = Math.min(img.naturalWidth, 900)
    draw(canvas, img, maxWidth)
  })
}

/* ---------------- 图片管理 ---------------- */

function pickFiles() {
  fileInputEl.value?.click()
}

async function loadFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    }).catch(() => {})
    images.value.push({
      name: file.name,
      url,
      img,
      width: img.naturalWidth,
      height: img.naturalHeight,
    })
  }
  activeIndex.value = images.value.length - files.length
  await nextTick()
  repaint()
}

function onFileChange(e) {
  loadFiles(e.target.files)
  e.target.value = ''
}

function onDrop(e) {
  dragOver.value = false
  loadFiles(e.dataTransfer?.files)
}

function selectImage(index) {
  activeIndex.value = index
  repaint()
}

function removeImage(index) {
  const target = images.value[index]
  if (target) URL.revokeObjectURL(target.url)
  images.value.splice(index, 1)
  if (activeIndex.value >= images.value.length) {
    activeIndex.value = Math.max(0, images.value.length - 1)
  }
  repaint()
}

function clearAll() {
  for (const img of images.value) URL.revokeObjectURL(img.url)
  images.value = []
  activeIndex.value = 0
  message.value = ''
}

/* ---------------- 导出 ---------------- */

function exportOne(item) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    draw(canvas, item.img, item.img.naturalWidth)
    canvas.toBlob((blob) => {
      if (!blob) return resolve(false)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = item.name.replace(/\.[^.]+$/, '') + '-watermark.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      resolve(true)
    }, 'image/png')
  })
}

async function exportCurrent() {
  if (!current.value) return
  exporting.value = true
  await exportOne(current.value)
  exporting.value = false
  message.value = '已导出当前图片'
  setTimeout(() => (message.value = ''), 1800)
}

async function exportAll() {
  if (!images.value.length) return
  exporting.value = true
  let done = 0
  for (const item of images.value) {
    const ok = await exportOne(item)
    if (ok) done += 1
    // 连续下载之间留点间隔，避免被浏览器拦截
    await new Promise((r) => setTimeout(r, 320))
  }
  exporting.value = false
  message.value = `已导出 ${done} 张（浏览器若提示允许多文件下载请选择允许）`
  setTimeout(() => (message.value = ''), 4000)
}

/* ---------------- 持久化 ---------------- */

let saveTimer = null
watch(
  config,
  () => {
    repaint()
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config }))
    }, 300)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearTimeout(saveTimer)
  clearAll()
})
</script>

<template>
  <div
    class="wm"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <button class="btn primary" @click="pickFiles">选择图片</button>
      <span class="file-name">{{ current ? current.name : '把图片拖进来也可以' }}</span>
      <span v-if="current" class="size">{{ current.width }} × {{ current.height }}</span>
      <span class="spacer" />
      <span v-if="message" class="msg">{{ message }}</span>
      <button class="btn" :disabled="!hasImages || exporting" @click="exportCurrent">导出当前</button>
      <button class="btn" :disabled="images.length < 2 || exporting" @click="exportAll">
        {{ exporting ? '导出中…' : `导出全部 (${images.length})` }}
      </button>
      <button class="btn" :disabled="!hasImages" @click="clearAll">清空</button>
    </div>

    <div class="body">
      <section class="preview">
        <canvas v-if="hasImages" ref="canvasEl" class="canvas" />
        <div v-else class="drop-hint">
          <p class="big">拖入图片开始</p>
          <p class="small">支持 PNG / JPEG / WebP，全部本地处理不上传</p>
        </div>
      </section>

      <aside class="panel">
        <div class="field">
          <label>水印文字</label>
          <input v-model="config.text" class="input" spellcheck="false" placeholder="输入水印文字" />
        </div>

        <div class="field">
          <label>大小 {{ Math.round(config.fontScale * 1000) / 10 }}%</label>
          <input v-model.number="config.fontScale" class="slider" type="range" min="0.01" max="0.15" step="0.005" />
        </div>

        <div class="field row">
          <label>颜色</label>
          <input v-model="config.color" type="color" class="color" />
          <label class="inline">不透明度 {{ config.opacity }}%</label>
          <input v-model.number="config.opacity" class="slider flex" type="range" min="5" max="100" />
        </div>

        <div class="field">
          <label>旋转 {{ config.angle }}°</label>
          <input v-model.number="config.angle" class="slider" type="range" min="-90" max="90" />
        </div>

        <div class="field">
          <label>位置</label>
          <div class="pos-grid">
            <button
              v-for="p in POSITIONS"
              :key="p.id"
              class="pos"
              :class="{ on: config.position === p.id && !config.tile }"
              :title="p.name"
              @click="config.position = p.id; config.tile = false"
            />
          </div>
        </div>

        <div class="field row">
          <label class="chk"><input v-model="config.tile" type="checkbox" />平铺整张图</label>
          <label class="chk"><input v-model="config.shadow" type="checkbox" />文字阴影</label>
        </div>

        <div v-if="!config.tile" class="field">
          <label>边距 {{ Math.round(config.margin * 100) }}%</label>
          <input v-model.number="config.margin" class="slider" type="range" min="0" max="0.15" step="0.005" />
        </div>
      </aside>
    </div>

    <div v-if="images.length" class="thumbs">
      <button
        v-for="(item, i) in images"
        :key="i"
        class="thumb"
        :class="{ on: i === activeIndex }"
        @click="selectImage(i)"
      >
        <img :src="item.url" alt="" />
        <span class="thumb-remove" @click.stop="removeImage(i)">✕</span>
      </button>
    </div>

    <input ref="fileInputEl" type="file" accept="image/*" multiple hidden @change="onFileChange" />
  </div>
</template>

<style scoped>
.wm {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.wm.dragging {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
  border-radius: 10px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
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
.file-name {
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.size {
  flex: none;
  font-size: 10.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.spacer {
  margin-left: auto;
}
.msg {
  flex: none;
  font-size: 10.5px;
  color: var(--accent);
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
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-4);
  background-image: repeating-conic-gradient(
    rgba(0, 0, 0, 0.04) 0% 25%,
    transparent 0% 50%
  );
  background-size: 16px 16px;
  overflow: auto;
}
.canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: var(--shadow-2);
  border-radius: 4px;
}
.drop-hint {
  text-align: center;
}
.drop-hint .big {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-dim);
}
.drop-hint .small {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-faint);
}
.panel {
  flex: none;
  width: 258px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow-y: auto;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.field.row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.field label {
  font-size: 10.5px;
  color: var(--text-faint);
}
.input {
  width: 100%;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 12px;
}
.input:focus {
  border-color: var(--accent);
}
.slider {
  width: 100%;
  height: 4px;
  appearance: none;
  border-radius: 99px;
  background: var(--fill-2);
  outline: none;
  cursor: pointer;
}
.slider.flex {
  flex: 1;
  min-width: 60px;
  width: auto;
}
.slider::-webkit-slider-thumb {
  appearance: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--accent);
}
.color {
  width: 36px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: none;
  cursor: pointer;
}
.inline {
  font-size: 10px;
  color: var(--text-faint);
  white-space: nowrap;
}
.chk {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-dim);
  cursor: pointer;
}
.pos-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 96px;
}
.pos {
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--fill-1);
}
.pos:hover {
  border-color: var(--accent);
}
.pos.on {
  border-color: transparent;
  background: var(--accent);
}
.thumbs {
  flex: none;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.thumb {
  position: relative;
  flex: none;
  width: 54px;
  height: 54px;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  background: var(--fill-2);
}
.thumb.on {
  border-color: var(--accent);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-remove {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 14px;
  height: 14px;
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 8px;
}
.thumb:hover .thumb-remove {
  display: flex;
}
</style>
