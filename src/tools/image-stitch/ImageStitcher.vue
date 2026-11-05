<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'

const VERTICAL = 'vertical'
const HORIZONTAL = 'horizontal'

const items = ref([]) // { id, name, bitmap, url }
const dir = ref(VERTICAL)
const gap = ref(12)
const bg = ref('#ffffff')
const radius = ref(8)
const maxWidth = ref(0) // 0 = 按最大图宽度
const canvasEl = ref(null)
const dragOver = ref(false)
const busy = ref(false)
const message = ref('')
const fileInputEl = ref(null)

let seq = 0

const totalSize = ref({ w: 0, h: 0 })

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* 回退 */
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

async function addFiles(list) {
  const files = [...list].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  busy.value = true
  for (const file of files) {
    try {
      const bitmap = await loadBitmap(file)
      items.value.push({
        id: ++seq,
        name: file.name,
        bitmap,
        url: URL.createObjectURL(file),
        w: bitmap.width || bitmap.naturalWidth,
        h: bitmap.height || bitmap.naturalHeight,
      })
    } catch {
      message.value = `${file.name} 读取失败`
    }
  }
  busy.value = false
}

function onPick(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  if (files.length) addFiles(files)
}

function onDrop(e) {
  dragOver.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

function removeItem(id) {
  items.value = items.value.filter((i) => i.id !== id)
}

function move(id, delta) {
  const index = items.value.findIndex((i) => i.id === id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= items.value.length) return
  const list = [...items.value]
  ;[list[index], list[target]] = [list[target], list[index]]
  items.value = list
}

function clearAll() {
  items.value = []
  totalSize.value = { w: 0, h: 0 }
  message.value = ''
}

function roundRect(ctx, x, y, w, h, r) {
  const radiusValue = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radiusValue)
  } else {
    ctx.moveTo(x + radiusValue, y)
    ctx.arcTo(x + w, y, x + w, y + h, radiusValue)
    ctx.arcTo(x + w, y + h, x, y + h, radiusValue)
    ctx.arcTo(x, y + h, x, y, radiusValue)
    ctx.arcTo(x, y, x + w, y, radiusValue)
  }
  ctx.closePath()
}

function draw() {
  const canvas = canvasEl.value
  if (!canvas) return
  const list = items.value
  if (!list.length) {
    canvas.width = 0
    canvas.height = 0
    totalSize.value = { w: 0, h: 0 }
    return
  }

  const G = Number(gap.value) || 0
  const R = Number(radius.value) || 0
  const target = Number(maxWidth.value) || 0

  // 计算每张图在画布中的尺寸
  let plan = []
  let width = 0
  let height = 0

  if (dir.value === VERTICAL) {
    width = target || Math.max(...list.map((i) => i.w))
    plan = list.map((item) => {
      const scale = width / item.w
      return { item, w: width, h: Math.round(item.h * scale) }
    })
    height = plan.reduce((sum, p) => sum + p.h, 0) + G * (plan.length - 1)
  } else {
    height = target || Math.max(...list.map((i) => i.h))
    plan = list.map((item) => {
      const scale = height / item.h
      return { item, h: height, w: Math.round(item.w * scale) }
    })
    width = plan.reduce((sum, p) => sum + p.w, 0) + G * (plan.length - 1)
  }

  // 限制最大边，避免画布过大导致内存问题
  const MAX_SIDE = 8000
  const shrink = Math.min(1, MAX_SIDE / Math.max(width, height))
  if (shrink < 1) {
    width = Math.round(width * shrink)
    height = Math.round(height * shrink)
    plan = plan.map((p) => ({
      ...p,
      w: Math.round(p.w * shrink),
      h: Math.round(p.h * shrink),
    }))
  }

  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg.value
  ctx.fillRect(0, 0, width, height)

  let x = 0
  let y = 0
  for (const p of plan) {
    ctx.save()
    roundRect(ctx, x, y, p.w, p.h, R)
    ctx.clip()
    ctx.drawImage(p.item.bitmap, x, y, p.w, p.h)
    ctx.restore()

    if (dir.value === VERTICAL) y += p.h + G
    else x += p.w + G
  }

  totalSize.value = { w: width, h: height }
}

watch([items, dir, gap, bg, radius, maxWidth], draw, { deep: true })

function download() {
  const canvas = canvasEl.value
  if (!canvas || !canvas.width) return
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stitched-${Date.now()}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
    message.value = `已导出 ${canvas.width} × ${canvas.height} PNG`
  }, 'image/png')
}

onBeforeUnmount(() => {
  items.value.forEach((i) => URL.revokeObjectURL(i.url))
})
</script>

<template>
  <div
    class="stitch"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <button class="btn primary" @click="fileInputEl?.click()">选择图片</button>
      <span class="hint-inline">按列表顺序拼接，可上下调序</span>

      <span class="divider" />

      <div class="seg">
        <button :class="{ on: dir === VERTICAL }" @click="dir = VERTICAL">纵向</button>
        <button :class="{ on: dir === HORIZONTAL }" @click="dir = HORIZONTAL">横向</button>
      </div>

      <label class="opt">
        间距
        <input v-model.number="gap" class="num" type="number" min="0" max="200" />
      </label>
      <label class="opt">
        圆角
        <input v-model.number="radius" class="num" type="number" min="0" max="100" />
      </label>
      <label class="opt">
        {{ dir === VERTICAL ? '宽度' : '高度' }}
        <input v-model.number="maxWidth" class="num wide" type="number" min="0" placeholder="自动" />
      </label>
      <label class="opt">
        背景
        <input v-model="bg" type="color" class="color" />
      </label>

      <span class="spacer" />
      <span v-if="totalSize.w" class="stat">{{ totalSize.w }} × {{ totalSize.h }} px</span>
      <button class="btn" :disabled="!items.length" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!items.length" @click="download">导出 PNG</button>
    </div>

    <div v-if="!items.length" class="empty">
      <p class="big">拖入多张图片，拼成一张长图</p>
      <p class="small">
        适合把聊天记录、教程步骤、设计稿片段合成一张；支持纵向/横向、间距、圆角与背景色。
        图片只在本机处理。
      </p>
    </div>

    <div v-else class="body">
      <aside class="list">
        <div v-for="(item, i) in items" :key="item.id" class="row">
          <span class="idx">{{ i + 1 }}</span>
          <img :src="item.url" class="thumb" :alt="item.name" />
          <div class="meta">
            <p class="name" :title="item.name">{{ item.name }}</p>
            <p class="sub">{{ item.w }} × {{ item.h }}</p>
          </div>
          <div class="order">
            <button class="mini" :disabled="i === 0" @click="move(item.id, -1)">↑</button>
            <button class="mini" :disabled="i === items.length - 1" @click="move(item.id, 1)">↓</button>
          </div>
          <button class="mini del" @click="removeItem(item.id)">✕</button>
        </div>
      </aside>

      <section class="preview">
        <div class="canvas-wrap">
          <canvas ref="canvasEl" class="canvas" />
        </div>
      </section>
    </div>

    <p v-if="busy" class="msg">读取图片中…</p>
    <p v-if="message" class="msg">{{ message }}</p>

    <input ref="fileInputEl" type="file" accept="image/*" multiple hidden @change="onPick" />
  </div>
</template>

<style scoped>
.stitch {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.stitch.dragging {
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
.hint-inline {
  font-size: 10.5px;
  color: var(--text-faint);
}
.divider {
  width: 1px;
  height: 15px;
  background: var(--border);
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  padding: 3px 11px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.opt {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.num {
  width: 52px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
  text-align: center;
}
.num.wide {
  width: 64px;
}
.num:focus {
  border-color: var(--accent);
}
.color {
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: none;
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
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
  flex: none;
  width: 240px;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}
.row:last-child {
  border-bottom: none;
}
.idx {
  flex: none;
  width: 14px;
  font-size: 9.5px;
  color: var(--text-faint);
}
.thumb {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 5px;
  object-fit: cover;
  background: var(--surface-4);
}
.meta {
  flex: 1;
  min-width: 0;
}
.name {
  margin: 0;
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  margin: 1px 0 0;
  font-size: 9px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.order {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mini {
  width: 18px;
  height: 16px;
  border-radius: 3px;
  font-size: 9px;
  color: var(--text-dim);
  background: var(--fill-1);
}
.mini:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
}
.mini:disabled {
  opacity: 0.3;
}
.mini.del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-4);
  overflow: auto;
}
.canvas-wrap {
  margin: auto;
  padding: 14px;
}
.canvas {
  display: block;
  max-width: 100%;
  box-shadow: var(--shadow-1);
}
.msg {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--accent);
}
</style>
