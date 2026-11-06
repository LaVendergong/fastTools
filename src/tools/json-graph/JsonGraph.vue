<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
import { buildTree, edgePath, labelOf, layoutTree, NODE_H } from './layout.js'

const { copied, copy } = useCopy()

const SAMPLE = `{
  "code": 0,
  "message": "ok",
  "data": {
    "total": 2,
    "list": [
      {
        "id": 1,
        "name": "张三",
        "role": "admin",
        "active": true,
        "tags": ["backend", "vue"]
      },
      {
        "id": 2,
        "name": "李四",
        "role": "user",
        "active": false,
        "profile": null
      }
    ]
  }
}`

const STORAGE_KEY = 'toolbox:jsongraph'

const saved = readJSON(STORAGE_KEY)

const input = ref(saved.input ?? SAMPLE)
const error = ref('')
const root = ref(null)
const collapsed = ref(new Set())
const scale = ref(1)
const tx = ref(24)
const ty = ref(24)
const svgEl = ref(null)
const wrapEl = ref(null)
const message = ref('')
const dragging = ref(false)

/* ---------------- 解析 ---------------- */

// 建树与布局在 ./layout.js

function parse() {
  error.value = ''
  root.value = null
  if (!input.value.trim()) return
  try {
    const data = JSON.parse(input.value)
    root.value = buildTree(data, '$', '')
  } catch (e) {
    error.value = e.message
  }
}

/* ---------------- 布局 ---------------- */

const layout = computed(() => layoutTree(root.value, collapsed.value))

// 画布视口 = 容器像素尺寸，这样 1:1 缩放时文字是真实大小
const viewW = ref(820)
const viewH = ref(560)

const viewBox = computed(() => `0 0 ${viewW.value} ${viewH.value}`)

/* ---------------- 交互 ---------------- */

function toggle(node) {
  if (node.type !== 'object' && node.type !== 'array') return
  const next = new Set(collapsed.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  collapsed.value = next
}

function collapseAll() {
  const next = new Set()
  const walk = (node) => {
    if (node.children.length) {
      next.add(node.id)
      node.children.forEach(walk)
    }
  }
  if (root.value) walk(root.value)
  // 根节点保持展开，否则什么都看不到
  if (root.value) next.delete(root.value.id)
  collapsed.value = next
}

function expandAll() {
  collapsed.value = new Set()
}

function zoom(delta) {
  const next = Math.min(3, Math.max(0.3, scale.value + delta))
  scale.value = Number(next.toFixed(2))
}

// 适应画布：整图缩放进可视区并居中（限制最小比例，避免文字糊成一片）
function fit() {
  const { width, height } = layout.value
  if (!width || !height) return
  const pad = 28
  const k = Math.min(
    (viewW.value - pad * 2) / width,
    (viewH.value - pad * 2) / height,
  )
  scale.value = Number(Math.min(1.6, Math.max(0.55, k)).toFixed(2))
  tx.value = Math.max(pad, (viewW.value - width * scale.value) / 2)
  ty.value = Math.max(pad, (viewH.value - height * scale.value) / 2)
}

/* 滚轮缩放 + 拖拽平移（viewBox 单位就是像素，1:1 跟随） */

function onWheel(e) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  zoom(e.deltaY > 0 ? -0.12 : 0.12)
}

let panStart = null
function onPointerDown(e) {
  if (e.button !== 0) return
  dragging.value = true
  panStart = { x: e.clientX, y: e.clientY, tx: tx.value, ty: ty.value }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e) {
  if (!panStart) return
  tx.value = panStart.tx + (e.clientX - panStart.x)
  ty.value = panStart.ty + (e.clientY - panStart.y)
}

function onPointerUp() {
  panStart = null
  dragging.value = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

/* ---------------- 导出 / 复制 ---------------- */


function svgMarkup() {
  const svg = svgEl.value
  if (!svg) return ''
  const { width, height } = layout.value
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(Math.round(width)))
  clone.setAttribute('height', String(Math.round(height)))
  // 导出时用内容尺寸，并去掉画布的平移缩放
  clone.setAttribute('viewBox', `0 0 ${Math.round(width)} ${Math.round(height)}`)
  const content = clone.querySelector('g[data-content]')
  if (content) content.setAttribute('transform', 'translate(0,0) scale(1)')
  return new XMLSerializer().serializeToString(clone)
}

function downloadSvg() {
  const text = svgMarkup()
  if (!text) return
  const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'json-graph.svg'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

async function downloadPng() {
  const text = svgMarkup()
  if (!text) return
  const { width, height } = layout.value
  const ratio = 2
  const img = new Image()
  const svgBlob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--panel-bg').trim() || '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    canvas.toBlob((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'json-graph.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 3000)
    })
  }
  img.onerror = () => {
    message.value = 'PNG 导出失败，可改用 SVG'
    URL.revokeObjectURL(url)
  }
  img.src = url
}

function loadSample() {
  input.value = SAMPLE
}

function formatInput() {
  try {
    input.value = JSON.stringify(JSON.parse(input.value), null, 2)
    message.value = '已格式化'
  } catch (e) {
    error.value = e.message
  }
  setTimeout(() => {
    if (message.value === '已格式化') message.value = ''
  }, 1500)
}

/* ---------------- 生命周期 ---------------- */

let saveTimer = null
watch(
  input,
  () => {
    collapsed.value = new Set()
    parse()
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ input: input.value }))
    }, 400)
  },
  { immediate: true },
)

// 只在换了一份 JSON 时自动适应，折叠/展开保留当前视角
watch(root, () => {
  if (root.value) requestAnimationFrame(fit)
})

let observer = null

onMounted(() => {
  parse()
  const wrap = wrapEl.value
  if (wrap) {
    const sync = () => {
      viewW.value = Math.max(320, wrap.clientWidth)
      viewH.value = Math.max(220, wrap.clientHeight)
      fit()
    }
    observer = new ResizeObserver(sync)
    observer.observe(wrap)
    sync()
  }
  setTimeout(fit, 80)
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  observer?.disconnect()
  onPointerUp()
})

function typeClass(node) {
  return `t-${node.type}`
}
</script>

<template>
  <div class="jg">
    <div class="toolbar">
      <button class="btn primary" @click="expandAll">展开全部</button>
      <button class="btn" @click="collapseAll">折叠全部</button>
      <span class="divider" />
      <button class="btn" @click="zoom(-0.15)">－</button>
      <span class="zoom">{{ Math.round(scale * 100) }}%</span>
      <button class="btn" @click="zoom(0.15)">＋</button>
      <button class="btn" @click="fit">适应画布</button>
      <span class="spacer" />
      <span class="stat">{{ layout.nodes.length }} 个节点</span>
      <button class="btn" :disabled="!root" @click="downloadSvg">导出 SVG</button>
      <button class="btn" :disabled="!root" @click="downloadPng">导出 PNG</button>
    </div>

    <div class="body">
      <section class="pane">
        <header>
          <span class="pane-title">JSON</span>
          <button class="link" @click="formatInput">格式化</button>
          <button class="link" @click="loadSample">示例</button>
        </header>
        <textarea
          v-model="input"
          class="code"
          spellcheck="false"
          placeholder="粘贴 JSON，右侧自动生成结构图"
        />
        <p v-if="error" class="err-bar">{{ error }}</p>
        <p v-if="message" class="msg">{{ message }}</p>
      </section>

      <section class="canvas-pane">
        <div
          ref="wrapEl"
          class="canvas-wrap"
          :class="{ dragging }"
          @pointerdown="onPointerDown"
          @wheel="onWheel"
        >
          <svg ref="svgEl" class="graph" :viewBox="viewBox" preserveAspectRatio="xMinYMin meet">
            <g data-content :transform="`translate(${tx},${ty}) scale(${scale})`">
              <path
                v-for="edge in layout.edges"
                :key="edge.id"
                :d="edgePath(edge)"
                class="edge"
              />

              <g
                v-for="item in layout.nodes"
                :key="item.node.id"
                class="node"
                :class="typeClass(item.node)"
                :transform="`translate(${item.x},${item.y})`"
                @click="toggle(item.node)"
              >
                <rect :width="item.w" :height="NODE_H" rx="6" />
                <text :x="10" :y="NODE_H / 2 + 4">{{ labelOf(item.node) }}</text>
                <text
                  v-if="item.node.children.length"
                  :x="item.w - 9"
                  :y="NODE_H / 2 + 4"
                  class="toggle"
                  text-anchor="end"
                >
                  {{ collapsed.has(item.node.id) ? '+' : '−' }}
                </text>
              </g>
            </g>
          </svg>

          <div v-if="!root && !error" class="empty">粘贴 JSON 后这里会显示结构图</div>
        </div>
        <p class="tip">拖拽平移 · Ctrl/⌘ + 滚轮缩放 · 点击节点折叠</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.jg {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.btn {
  padding: 4px 11px;
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
.divider {
  width: 1px;
  height: 15px;
  background: var(--border);
  margin: 0 2px;
}
.zoom {
  min-width: 38px;
  text-align: center;
  font-size: 10.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10px;
  color: var(--text-faint);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.pane {
  flex: none;
  width: 34%;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.pane-title {
  font-size: 11.5px;
  font-weight: 600;
}
.link {
  margin-left: auto;
  font-size: 10px;
  color: var(--accent);
}
.link + .link {
  margin-left: 8px;
}
.code {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
}
.err-bar {
  flex: none;
  margin: 0;
  padding: 5px 10px;
  border-top: 1px solid var(--border);
  background: var(--danger-soft);
  font-size: 10.5px;
  color: var(--danger);
}
.msg {
  flex: none;
  margin: 0;
  padding: 5px 10px;
  border-top: 1px solid var(--border);
  font-size: 10.5px;
  color: var(--accent);
}
.canvas-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-4);
  overflow: hidden;
}
.canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  cursor: grab;
  overflow: hidden;
}
.canvas-wrap.dragging {
  cursor: grabbing;
}
.graph {
  width: 100%;
  height: 100%;
  display: block;
}
.edge {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: 1.4;
}
.node {
  cursor: pointer;
}
.node rect {
  fill: var(--panel-bg);
  stroke: var(--border-strong);
  stroke-width: 1.2;
}
.node text {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  fill: var(--text);
}
.node .toggle {
  font-size: 12px;
  fill: var(--text-faint);
}
.node:hover rect {
  stroke: var(--accent);
}
/* 类型配色 */
.t-object rect {
  fill: rgba(0, 122, 255, 0.1);
  stroke: rgba(0, 122, 255, 0.45);
}
.t-array rect {
  fill: rgba(88, 86, 214, 0.1);
  stroke: rgba(88, 86, 214, 0.45);
}
.t-string rect {
  fill: rgba(52, 199, 89, 0.1);
  stroke: rgba(52, 199, 89, 0.45);
}
.t-number rect {
  fill: rgba(255, 149, 0, 0.12);
  stroke: rgba(255, 149, 0, 0.45);
}
.t-boolean rect {
  fill: rgba(175, 82, 222, 0.1);
  stroke: rgba(175, 82, 222, 0.45);
}
.t-null rect {
  fill: var(--fill-2);
  stroke: var(--border-strong);
}
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
.tip {
  flex: none;
  margin: 0;
  padding: 5px 10px;
  border-top: 1px solid var(--border);
  font-size: 9.5px;
  color: var(--text-faint);
}
</style>
