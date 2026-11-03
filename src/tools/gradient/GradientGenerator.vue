<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:gradient'
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const type = ref(saved.type ?? 'linear') // linear | radial | conic
const angle = ref(saved.angle ?? 135)
const stops = ref(
  saved.stops?.length >= 2
    ? saved.stops
    : [
        { color: '#4F8EF7', pos: 0 },
        { color: '#B06EF5', pos: 100 },
      ],
)
const copied = ref(false)

const cssValue = computed(() => {
  const list = [...stops.value]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${s.color} ${s.pos}%`)
    .join(', ')
  if (type.value === 'linear') return `linear-gradient(${angle.value}deg, ${list})`
  if (type.value === 'conic') return `conic-gradient(from ${angle.value}deg, ${list})`
  return `radial-gradient(circle, ${list})`
})

const css = computed(() => `background: ${cssValue.value};`)

let saveTimer
watch(
  [type, angle, stops],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(
      () =>
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ type: type.value, angle: angle.value, stops: stops.value }),
        ),
      300,
    )
  },
  { deep: true },
)

onBeforeUnmount(() => clearTimeout(saveTimer))

function addStop() {
  const last = stops.value[stops.value.length - 1]
  // 新色标插在末尾之前，避免和最后一个色标完全重合
  const pos = (last?.pos ?? 100) >= 100 ? 90 : Math.min(100, (last?.pos ?? 50) + 10)
  stops.value.push({ color: '#FFFFFF', pos })
}

function randomize() {
  const base = Math.floor(Math.random() * 360)
  const count = 2 + Math.floor(Math.random() * 2)
  stops.value = Array.from({ length: count }, (_, i) => ({
    color: hslToHex((base + i * 40) % 360, 72, 58 + i * 6),
    pos: Math.round((i / (count - 1)) * 100),
  }))
  angle.value = Math.floor(Math.random() * 360)
}

function hslToHex(h, s, l) {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = ln - c / 2
  const hex = (n) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r1)}${hex(g1)}${hex(b1)}`.toUpperCase()
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
  <div class="grad-tool">
    <div class="toolbar">
      <div class="segmented">
        <button :class="{ on: type === 'linear' }" @click="type = 'linear'">线性</button>
        <button :class="{ on: type === 'radial' }" @click="type = 'radial'">径向</button>
        <button :class="{ on: type === 'conic' }" @click="type = 'conic'">锥形</button>
      </div>

      <template v-if="type !== 'radial'">
        <span class="label">角度</span>
        <input v-model.number="angle" type="range" min="0" max="360" class="range" />
        <span class="value">{{ angle }}°</span>
      </template>

      <div class="right">
        <button class="tbtn" @click="addStop">＋ 色标</button>
        <button class="tbtn" @click="randomize">随机</button>
      </div>
    </div>

    <div class="preview" :style="{ background: cssValue }" />

    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">色标</span>
        <span class="mini">{{ stops.length }} 个</span>
      </div>
      <div class="stops">
        <div v-for="(s, i) in stops" :key="i" class="stop">
          <input v-model="s.color" type="color" class="color" />
          <input v-model.number="s.pos" type="range" min="0" max="100" class="range" />
          <span class="pos">{{ s.pos }}%</span>
          <button
            class="del"
            :disabled="stops.length <= 2"
            :title="stops.length <= 2 ? '至少保留两个色标' : '删除'"
            @click="stops.splice(i, 1)"
          >
            ✕
          </button>
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
.grad-tool {
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
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  flex: none;
}
.segmented button {
  padding: 3px 11px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.segmented button.on {
  background: #fff;
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.label {
  font-size: 12px;
  color: var(--text-dim);
}
.value {
  flex: none;
  width: 40px;
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.range {
  flex: 1;
  min-width: 60px;
  accent-color: var(--accent);
}
.toolbar .range {
  max-width: 220px;
}
.right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.tbtn {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.tbtn:hover {
  background: var(--hover);
}
.preview {
  flex: 1;
  min-height: 140px;
  border-radius: 10px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: background 0.15s ease;
}
.panel {
  flex: none;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.mini {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
}
.copy {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--accent);
}
.stops {
  padding: 8px 12px;
  max-height: 132px;
  overflow: auto;
}
.stop {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 0;
}
.color {
  flex: none;
  width: 32px;
  height: 24px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
}
.pos {
  flex: none;
  width: 40px;
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.del {
  flex: none;
  width: 22px;
  color: var(--text-dim);
  border-radius: 4px;
}
.del:hover:not(:disabled) {
  background: var(--hover);
  color: #d70015;
}
.del:disabled {
  opacity: 0.3;
  cursor: default;
}
.code {
  padding: 10px 12px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text);
  background: rgba(0, 0, 0, 0.015);
  word-break: break-all;
  white-space: pre-wrap;
}
</style>
