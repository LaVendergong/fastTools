<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const fileInputEl = ref(null)
const imageEl = ref(null)
const dragOver = ref(false)
const count = ref(6)
const imageInfo = ref(null) // { name, width, height, url }
const colors = ref([])
const loading = ref(false)
const error = ref('')
/* ---------------- 取色算法 ---------------- */

function rgbToHsl(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

const hex = (r, g, b) =>
  `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()

function extract(target, limit) {
  const img = imageEl.value
  if (!img || !img.naturalWidth) return []

  const maxSide = 160
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data

  // 量化到 5 位每通道后分桶统计
  const buckets = new Map()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }

  const list = [...buckets.values()].sort((a, b) => b.count - a.count)
  const total = list.reduce((sum, b) => sum + b.count, 0)

  // 颜色相近的桶合并（避免一堆近似色霸榜）
  const picked = []
  for (const bucket of list) {
    const r = Math.round(bucket.r / bucket.count)
    const g = Math.round(bucket.g / bucket.count)
    const b = Math.round(bucket.b / bucket.count)
    const tooClose = picked.some(
      (p) => Math.abs(p.r - r) + Math.abs(p.g - g) + Math.abs(p.b - b) < 42,
    )
    if (tooClose) {
      const near = picked.find(
        (p) => Math.abs(p.r - r) + Math.abs(p.g - g) + Math.abs(p.b - b) < 42,
      )
      if (near) near.percent += (bucket.count / total) * 100
      continue
    }
    picked.push({ r, g, b, percent: (bucket.count / total) * 100 })
    if (picked.length >= limit) break
  }

  return picked.map((p) => ({
    ...p,
    hex: hex(p.r, p.g, p.b),
    percent: Math.max(0.1, Math.round(p.percent * 10) / 10),
    hsl: rgbToHsl(p.r, p.g, p.b),
  }))
}

/* ---------------- 图片加载 ---------------- */

async function loadFile(file) {
  if (!file) return
  if (imageInfo.value?.url) URL.revokeObjectURL(imageInfo.value.url)
  error.value = ''
  loading.value = true
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })
  } catch {
    error.value = '图片读取失败，请换一张试试'
    loading.value = false
    return
  }
  imageEl.value = img
  imageInfo.value = { name: file.name, width: img.naturalWidth, height: img.naturalHeight, url }
  colors.value = extract(img, count.value)
  loading.value = false
}

function onPickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  loadFile(file)
}

function onDrop(e) {
  dragOver.value = false
  loadFile(e.dataTransfer?.files?.[0])
}

function onCountChange() {
  if (imageEl.value) colors.value = extract(imageEl.value, count.value)
}

/* ---------------- 操作 ---------------- */


const cssVariables = computed(() =>
  colors.value.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join('\n'),
)

const dominant = computed(() => colors.value[0] || null)

function reset() {
  if (imageInfo.value?.url) URL.revokeObjectURL(imageInfo.value.url)
  imageEl.value = null
  imageInfo.value = null
  colors.value = []
  error.value = ''
}

onBeforeUnmount(reset)
</script>

<template>
  <div
    class="pal"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <button class="btn primary" @click="fileInputEl?.click()">选择图片</button>
      <span class="file-name">{{ imageInfo ? imageInfo.name : '也可以把图片拖进来' }}</span>
      <span v-if="imageInfo" class="size">{{ imageInfo.width }} × {{ imageInfo.height }}</span>

      <span class="spacer" />

      <label class="opt">
        取色数量
        <select v-model.number="count" class="select" @change="onCountChange">
          <option v-for="n in [4, 6, 8, 12]" :key="n" :value="n">{{ n }} 种</option>
        </select>
      </label>
      <button class="btn" :disabled="!colors.length" @click="copy(cssVariables, 'css')">
        {{ copied === 'css' ? '已复制' : '复制 CSS 变量' }}
      </button>
      <button class="btn" :disabled="!colors.length" @click="reset">清空</button>
    </div>

    <div class="body">
      <section class="preview">
        <img v-if="imageInfo" :src="imageInfo.url" class="image" alt="预览" />
        <div v-else class="placeholder">
          <p class="big">拖入一张图片</p>
          <p class="small">自动提取画面里的主要颜色，用于配色参考</p>
        </div>
        <p v-if="loading" class="loading">分析中…</p>
      </section>

      <aside class="panel">
        <template v-if="colors.length">
          <div
            v-if="dominant"
            class="dominant"
            :style="{ background: dominant.hex }"
            :title="`主色 ${dominant.hex}，点击复制`"
            @click="copy(dominant.hex, 'dom')"
          >
            <span class="dom-hex">{{ dominant.hex }}</span>
            <span class="dom-pct">主色 · {{ dominant.percent }}%</span>
          </div>

          <div class="list">
            <button
              v-for="c in colors"
              :key="c.hex"
              class="row"
              :title="`点击复制 ${c.hex}`"
              @click="copy(c.hex, c.hex)"
            >
              <span class="swatch" :style="{ background: c.hex }" />
              <span class="meta">
                <span class="code">{{ c.hex }}</span>
                <span class="sub">
                  rgb({{ c.r }}, {{ c.g }}, {{ c.b }}) · hsl({{ c.hsl.h }}, {{ c.hsl.s }}%, {{ c.hsl.l }}%)
                </span>
              </span>
              <span class="pct">{{ c.percent }}%</span>
              <span v-if="copied === c.hex" class="copied">已复制</span>
            </button>
          </div>

          <pre class="css">{{ cssVariables }}</pre>
        </template>

        <div v-else class="empty">
          <p>{{ error || '还没有提取结果' }}</p>
        </div>
      </aside>
    </div>

    <input ref="fileInputEl" type="file" accept="image/*" hidden @change="onPickFile" />
  </div>
</template>

<style scoped>
.pal {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.pal.dragging {
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
.opt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.select {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  font-size: 11px;
  outline: none;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.preview {
  position: relative;
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
  overflow: hidden;
}
.image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: var(--shadow-2);
}
.placeholder {
  text-align: center;
}
.placeholder .big {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-dim);
}
.placeholder .small {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-faint);
}
.loading {
  position: absolute;
  bottom: 12px;
  margin: 0;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10.5px;
}
.panel {
  flex: none;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.dominant {
  flex: none;
  height: 84px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}
.dom-hex {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.dom-pct {
  font-size: 10.5px;
  opacity: 0.9;
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 5px 6px;
  border-radius: 6px;
  text-align: left;
  color: var(--text);
}
.row:hover {
  background: var(--fill-1);
}
.swatch {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}
.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  font-weight: 600;
}
.sub {
  font-size: 9.5px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pct {
  flex: none;
  font-size: 10.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.copied {
  flex: none;
  font-size: 9.5px;
  color: var(--accent);
}
.css {
  flex: none;
  max-height: 92px;
  margin: 0 8px 8px;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--code-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  overflow: auto;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.empty p {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-faint);
  text-align: center;
}
</style>
