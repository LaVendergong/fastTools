<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:timestamp'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const pad = (n, len = 2) => String(n).padStart(len, '0')

function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const unit = ref(saved.unit ?? 'auto') // auto | s | ms
const tsInput = ref(saved.tsInput ?? String(Math.floor(Date.now() / 1000)))
const dateInput = ref(saved.dateInput ?? toLocalInput(new Date()))
const now = ref(Date.now())
const copiedKey = ref('')

let timer
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000)
})

let saveTimer
function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ unit: unit.value, tsInput: tsInput.value, dateInput: dateInput.value }),
  )
}

watch([unit, tsInput, dateInput], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 300)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  clearTimeout(saveTimer)
  save()
})

function formatLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function relative(ms) {
  const diff = ms - now.value
  const abs = Math.abs(diff)
  const suffix = diff >= 0 ? '后' : '前'
  const steps = [
    [31536000000, '年'],
    [2592000000, '个月'],
    [86400000, '天'],
    [3600000, '小时'],
    [60000, '分钟'],
    [1000, '秒'],
  ]
  if (abs < 1000) return '刚刚'
  for (const [size, label] of steps) {
    if (abs >= size) return `${Math.floor(abs / size)} ${label}${suffix}`
  }
  return ''
}

const converted = computed(() => {
  const raw = tsInput.value.trim()
  if (!raw) return { error: '', rows: [] }
  if (!/^-?\d+$/.test(raw)) return { error: '请输入纯数字时间戳', rows: [] }

  const n = Number(raw)
  let ms
  let unitLabel
  if (unit.value === 'auto') {
    if (raw.replace('-', '').length >= 13) {
      ms = n
      unitLabel = '按毫秒解析'
    } else {
      ms = n * 1000
      unitLabel = '按秒解析'
    }
  } else if (unit.value === 's') {
    ms = n * 1000
    unitLabel = '按秒解析'
  } else {
    ms = n
    unitLabel = '按毫秒解析'
  }

  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return { error: '时间戳超出可表示范围', rows: [] }

  return {
    error: '',
    unitLabel,
    rows: [
      { key: '本地时间', value: formatLocal(d) },
      { key: 'UTC 时间', value: d.toUTCString() },
      { key: 'ISO 8601', value: d.toISOString() },
      { key: '相对现在', value: relative(ms) },
      { key: '周几', value: `周${'日一二三四五六'[d.getDay()]}` },
    ],
  }
})

const dateResult = computed(() => {
  if (!dateInput.value) return null
  const d = new Date(dateInput.value)
  if (Number.isNaN(d.getTime())) return null
  const ms = d.getTime()
  return {
    sec: String(Math.floor(ms / 1000)),
    ms: String(ms),
    local: formatLocal(d),
    utc: d.toISOString(),
  }
})

function useNow() {
  dateInput.value = toLocalInput(new Date())
  tsInput.value = String(Math.floor(Date.now() / 1000))
  unit.value = 'auto'
}

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
  <div class="ts-tool">
    <div class="toolbar">
      <span class="label">当前时间戳</span>
      <code class="now">{{ Math.floor(now / 1000) }}</code>
      <button class="tbtn" @click="copy(String(Math.floor(now / 1000)), 'now')">
        {{ copiedKey === 'now' ? '已复制' : '复制' }}
      </button>
      <span class="ms">毫秒 {{ now }}</span>

      <div class="right">
        <div class="segmented">
          <button :class="{ on: unit === 'auto' }" @click="unit = 'auto'">自动</button>
          <button :class="{ on: unit === 's' }" @click="unit = 's'">秒</button>
          <button :class="{ on: unit === 'ms' }" @click="unit = 'ms'">毫秒</button>
        </div>
        <button class="tbtn" @click="useNow">当前时间</button>
      </div>
    </div>

    <div class="body">
      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">时间戳 → 日期</span>
          <span v-if="converted.unitLabel" class="mini">{{ converted.unitLabel }}</span>
        </div>
        <div class="pane">
          <input
            v-model="tsInput"
            class="input mono"
            placeholder="如 1730000000 或 1730000000000"
            spellcheck="false"
          />
          <p v-if="converted.error" class="err">{{ converted.error }}</p>
          <dl v-else class="rows">
            <div v-for="r in converted.rows" :key="r.key" class="row">
              <dt>{{ r.key }}</dt>
              <dd class="mono">
                {{ r.value }}
                <button class="mini-btn" @click="copy(r.value, r.key)">复制</button>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">日期 → 时间戳</span>
        </div>
        <div class="pane">
          <input v-model="dateInput" type="datetime-local" step="1" class="input" />
          <dl v-if="dateResult" class="rows">
            <div class="row">
              <dt>秒级</dt>
              <dd class="mono">
                {{ dateResult.sec }}
                <button class="mini-btn" @click="copy(dateResult.sec, 'sec')">
                  {{ copiedKey === 'sec' ? '已复制' : '复制' }}
                </button>
              </dd>
            </div>
            <div class="row">
              <dt>毫秒级</dt>
              <dd class="mono">
                {{ dateResult.ms }}
                <button class="mini-btn" @click="copy(dateResult.ms, 'ms')">
                  {{ copiedKey === 'ms' ? '已复制' : '复制' }}
                </button>
              </dd>
            </div>
            <div class="row">
              <dt>本地时间</dt>
              <dd class="mono">{{ dateResult.local }}</dd>
            </div>
            <div class="row">
              <dt>ISO 8601</dt>
              <dd class="mono">{{ dateResult.utc }}</dd>
            </div>
          </dl>
          <p v-else class="err">请选择一个有效的日期时间</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ts-tool {
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
.now {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ms {
  font-size: 11.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--fill-1);
}
.segmented button {
  padding: 3px 11px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.segmented button.on {
  background: var(--panel-bg);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
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
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  flex: none;
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
.pane {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
}
.input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  outline: none;
  font-size: 13px;
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.rows {
  margin: 12px 0 0;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.row:last-child {
  border-bottom: none;
}
dt {
  flex: none;
  width: 72px;
  font-size: 12px;
  color: var(--text-dim);
}
dd {
  flex: 1;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  word-break: break-all;
}
.mini-btn {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  color: var(--accent);
}
.err {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
