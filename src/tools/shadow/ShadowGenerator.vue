<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:shadow'
const PRESETS = [
  { name: '柔和', x: 0, y: 4, blur: 12, spread: 0, opacity: 12, inset: false },
  { name: '浮起', x: 0, y: 10, blur: 30, spread: -6, opacity: 18, inset: false },
  { name: '锐利', x: 0, y: 2, blur: 4, spread: 0, opacity: 24, inset: false },
  { name: '内凹', x: 0, y: 2, blur: 8, spread: 0, opacity: 14, inset: true },
]

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const x = ref(saved.x ?? 0)
const y = ref(saved.y ?? 10)
const blur = ref(saved.blur ?? 30)
const spread = ref(saved.spread ?? -6)
const color = ref(saved.color ?? '#000000')
const opacity = ref(saved.opacity ?? 18)
const inset = ref(saved.inset ?? false)
const copied = ref(false)

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

const shadowColor = computed(() => {
  const { r, g, b } = hexToRgb(color.value)
  return `rgba(${r}, ${g}, ${b}, ${(opacity.value / 100).toFixed(2)})`
})

const shadowValue = computed(
  () =>
    `${inset.value ? 'inset ' : ''}${x.value}px ${y.value}px ${blur.value}px ${spread.value}px ${shadowColor.value}`,
)

const css = computed(() => `box-shadow: ${shadowValue.value};`)

let saveTimer
watch(
  [x, y, blur, spread, color, opacity, inset],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(
      () =>
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            x: x.value,
            y: y.value,
            blur: blur.value,
            spread: spread.value,
            color: color.value,
            opacity: opacity.value,
            inset: inset.value,
          }),
        ),
      300,
    )
  },
)

onBeforeUnmount(() => clearTimeout(saveTimer))

function applyPreset(p) {
  x.value = p.x
  y.value = p.y
  blur.value = p.blur
  spread.value = p.spread
  opacity.value = p.opacity
  inset.value = p.inset
}

async function copy() {
  try {
    await navigator.clipboard.writeText(css.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="shadow-tool">
    <div class="toolbar">
      <div class="presets">
        <span class="label">预设</span>
        <button v-for="p in PRESETS" :key="p.name" class="tbtn" @click="applyPreset(p)">
          {{ p.name }}
        </button>
      </div>
      <div class="right">
        <button class="toggle" :class="{ on: inset }" @click="inset = !inset">内阴影</button>
      </div>
    </div>

    <div class="body">
      <div class="preview">
        <div class="box" :style="{ boxShadow: shadowValue }" />
      </div>

      <div class="controls">
        <div class="ctrl">
          <label>水平偏移 X</label>
          <input v-model.number="x" type="range" min="-50" max="50" />
          <span class="val">{{ x }}px</span>
        </div>
        <div class="ctrl">
          <label>垂直偏移 Y</label>
          <input v-model.number="y" type="range" min="-50" max="50" />
          <span class="val">{{ y }}px</span>
        </div>
        <div class="ctrl">
          <label>模糊半径</label>
          <input v-model.number="blur" type="range" min="0" max="100" />
          <span class="val">{{ blur }}px</span>
        </div>
        <div class="ctrl">
          <label>扩展半径</label>
          <input v-model.number="spread" type="range" min="-50" max="50" />
          <span class="val">{{ spread }}px</span>
        </div>
        <div class="ctrl">
          <label>阴影颜色</label>
          <input v-model="color" type="color" class="color" />
          <span class="val">{{ color.toUpperCase() }}</span>
        </div>
        <div class="ctrl">
          <label>不透明度</label>
          <input v-model.number="opacity" type="range" min="0" max="100" />
          <span class="val">{{ opacity }}%</span>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">CSS</span>
        <button class="copy" @click="copy">{{ copied ? '已复制' : '复制' }}</button>
      </div>
      <code class="code">{{ css }}</code>
    </div>
  </div>
</template>

<style scoped>
.shadow-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.presets {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  font-size: 12px;
  color: var(--text-dim);
}
.tbtn {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.tbtn:hover {
  background: var(--hover);
}
.right {
  margin-left: auto;
}
.toggle {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.toggle.on {
  border-color: transparent;
  background: rgba(0, 122, 255, 0.12);
  color: var(--accent);
  font-weight: 500;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 10px;
}
.preview {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #f5f5f7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.box {
  width: 160px;
  height: 160px;
  border-radius: 16px;
  background: #fff;
}
.controls {
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.ctrl label {
  flex: none;
  width: 72px;
  font-size: 12px;
  color: var(--text-dim);
}
.ctrl input[type='range'] {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.color {
  flex: 1;
  height: 26px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
}
.val {
  flex: none;
  width: 62px;
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.panel {
  flex: none;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.panel-head {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.copy {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--accent);
}
.code {
  display: block;
  padding: 10px 12px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  background: rgba(0, 0, 0, 0.015);
  word-break: break-all;
}
</style>
