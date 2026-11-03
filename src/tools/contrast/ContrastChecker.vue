<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:contrast'
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const bg = ref(saved.bg ?? '#FFFFFF')
const fg = ref(saved.fg ?? '#4F8EF7')

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const channel = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

const ratio = computed(() => {
  const l1 = luminance(fg.value)
  const l2 = luminance(bg.value)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
})

const grades = computed(() => [
  { key: 'aa-normal', label: 'AA 普通文本', need: 4.5, pass: ratio.value >= 4.5 },
  { key: 'aa-large', label: 'AA 大文本', need: 3, pass: ratio.value >= 3 },
  { key: 'aaa-normal', label: 'AAA 普通文本', need: 7, pass: ratio.value >= 7 },
  { key: 'aaa-large', label: 'AAA 大文本', need: 4.5, pass: ratio.value >= 4.5 },
])

let saveTimer
watch(
  [bg, fg],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(
      () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ bg: bg.value, fg: fg.value })),
      300,
    )
  },
)

onBeforeUnmount(() => clearTimeout(saveTimer))

function swap() {
  const tmp = bg.value
  bg.value = fg.value
  fg.value = tmp
}
</script>

<template>
  <div class="contrast-tool">
    <div class="toolbar">
      <div class="field">
        <span class="label">背景色</span>
        <input v-model="bg" type="color" class="color" />
        <code>{{ bg.toUpperCase() }}</code>
      </div>
      <div class="field">
        <span class="label">前景色</span>
        <input v-model="fg" type="color" class="color" />
        <code>{{ fg.toUpperCase() }}</code>
      </div>
      <button class="tbtn" @click="swap">交换</button>
    </div>

    <div class="body">
      <div class="preview" :style="{ background: bg, color: fg }">
        <h2>大文本预览</h2>
        <p>普通文本预览：这段文字用于检查正文在小字号下的可读性。</p>
        <p class="small">小号辅助文字 12px</p>
      </div>

      <div class="side">
        <div class="score-card">
          <span class="score">{{ ratio.toFixed(2) }}</span>
          <span class="unit">: 1</span>
          <p class="score-note">
            {{ ratio >= 7 ? '对比度充足，适合任何文本' : ratio >= 4.5 ? '满足普通文本可读性要求' : ratio >= 3 ? '仅适合大号文本' : '对比度过低，建议调整' }}
          </p>
        </div>

        <div class="grades">
          <div v-for="g in grades" :key="g.key" class="grade" :class="{ pass: g.pass }">
            <span class="name">{{ g.label }}</span>
            <span class="need">≥ {{ g.need }}:1</span>
            <span class="result">{{ g.pass ? '通过' : '未通过' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contrast-tool {
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
  gap: 18px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  font-size: 12px;
  color: var(--text-dim);
}
.color {
  width: 36px;
  height: 26px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
}
code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--text-dim);
}
.tbtn {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.tbtn:hover {
  background: var(--hover);
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 10px;
}
.preview {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: background 0.15s ease, color 0.15s ease;
}
.preview h2 {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
}
.preview p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  max-width: 46ch;
}
.preview .small {
  font-size: 12px;
  opacity: 0.85;
}
.side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.score-card {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.score {
  font-size: 34px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.unit {
  font-size: 14px;
  color: var(--text-dim);
}
.score-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-dim);
}
.grades {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.grade {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  font-size: 12.5px;
}
.grade:last-child {
  border-bottom: none;
}
.name {
  flex: 1;
}
.need {
  font-size: 11px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.result {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: rgba(255, 59, 48, 0.1);
  color: #d70015;
}
.grade.pass .result {
  background: rgba(52, 199, 89, 0.12);
  color: #1d7a34;
}
</style>
