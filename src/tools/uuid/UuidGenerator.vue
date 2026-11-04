<script setup>
import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:uuid'
const COUNTS = [1, 5, 10, 20, 50, 100]

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const count = ref(saved.count ?? 5)
const upper = ref(saved.upper ?? false)
const noDash = ref(saved.noDash ?? false)

function uuidv4() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const raw = ref(Array.from({ length: count.value }, uuidv4))

const list = computed(() =>
  raw.value.map((id) => {
    let s = upper.value ? id.toUpperCase() : id
    if (noDash.value) s = s.replace(/-/g, '')
    return s
  }),
)

watch([count, upper, noDash], () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ count: count.value, upper: upper.value, noDash: noDash.value }),
  )
})

function generate() {
  raw.value = Array.from({ length: count.value }, uuidv4)
}

const copiedKey = ref('')

async function copy(value, key) {
  try {
    await navigator.clipboard.writeText(value)
    copiedKey.value = key
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
    }, 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="uuid-tool">
    <div class="toolbar">
      <span class="label">数量</span>
      <select v-model.number="count" class="select">
        <option v-for="n in COUNTS" :key="n" :value="n">{{ n }}</option>
      </select>

      <button class="toggle" :class="{ on: upper }" @click="upper = !upper">大写</button>
      <button class="toggle" :class="{ on: noDash }" @click="noDash = !noDash">无连字符</button>

      <div class="right">
        <button class="tbtn" @click="generate">重新生成</button>
        <button class="tbtn primary" @click="copy(list.join('\n'), 'all')">
          {{ copiedKey === 'all' ? '已复制全部' : '复制全部' }}
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">UUID v4</span>
        <span class="mini">{{ list.length }} 条 · {{ noDash ? 32 : 36 }} 字符</span>
      </div>
      <div class="list">
        <div v-for="(id, i) in list" :key="i" class="row" @click="copy(id, i)">
          <span class="idx">{{ i + 1 }}</span>
          <code>{{ id }}</code>
          <span class="copied" :class="{ show: copiedKey === i }">已复制</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uuid-tool {
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
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
}
.label {
  font-size: 12px;
  color: var(--text-dim);
}
.select {
  flex: none;
  width: 72px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 12px;
  outline: none;
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
.right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.tbtn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.tbtn:hover {
  background: var(--hover);
}
.tbtn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.tbtn.primary:hover {
  background: var(--accent-strong);
}
.panel {
  flex: 1;
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
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
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
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.row:hover {
  background: var(--hover);
}
.idx {
  flex: none;
  width: 26px;
  font-size: 11px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
code {
  flex: 1;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copied {
  flex: none;
  font-size: 11px;
  color: var(--success);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.copied.show {
  opacity: 1;
}
</style>
