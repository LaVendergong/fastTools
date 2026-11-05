<script setup>
import { computed, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'

const STORAGE_KEY = 'toolbox:uuid'
const COUNTS = [1, 5, 10, 20, 50, 100]

const saved = readJSON(STORAGE_KEY)

const count = ref(saved.count ?? 5)
const upper = ref(saved.upper ?? false)
const noDash = ref(saved.noDash ?? false)
const type = ref(saved.type ?? 'v4')

const TYPES = [
  { id: 'v4', name: 'UUID v4', desc: '完全随机，通用标识', len: 36 },
  { id: 'v7', name: 'UUID v7', desc: '带时间戳，可排序', len: 36 },
  { id: 'ulid', name: 'ULID', desc: '26 字符，按时间可排序', len: 26 },
  { id: 'short', name: '短 ID', desc: '21 字符，类似 nanoid', len: 21 },
]

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const SHORT_ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'

function uuidv4() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// UUID v7：前 48 位是毫秒时间戳，天然按生成顺序排序
function uuidv7() {
  const ts = Date.now().toString(16).padStart(12, '0')
  const rand = crypto.getRandomValues(new Uint8Array(10))
  const hex = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const variant = ((parseInt(hex.slice(3, 4), 16) & 0x3) | 0x8).toString(16)
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${hex.slice(0, 3)}-${variant}${hex.slice(4, 7)}-${hex.slice(7, 19)}`
}

// ULID：48 位毫秒时间戳 + 80 位随机数，同一毫秒内递增，保证批量生成也能排序
let ulidLastMs = 0
let ulidLastRand = null

function random80() {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  let value = 0n
  for (const b of bytes) value = (value << 8n) | BigInt(b)
  return value
}

function ulid() {
  const now = Date.now()
  if (now === ulidLastMs && ulidLastRand !== null) {
    ulidLastRand = (ulidLastRand + 1n) & ((1n << 80n) - 1n)
  } else {
    ulidLastMs = now
    ulidLastRand = random80()
  }

  let ts = now
  let time = ''
  for (let i = 0; i < 10; i += 1) {
    time = CROCKFORD[ts % 32] + time
    ts = Math.floor(ts / 32)
  }

  let rand = ulidLastRand
  let out = ''
  for (let i = 0; i < 16; i += 1) {
    out = CROCKFORD[Number(rand & 31n)] + out
    rand >>= 5n
  }
  return time + out
}

function shortId(size = 21) {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let out = ''
  for (let i = 0; i < size; i += 1) out += SHORT_ALPHABET[bytes[i] & 63]
  return out
}

function makeOne() {
  if (type.value === 'v7') return uuidv7()
  if (type.value === 'ulid') return ulid()
  if (type.value === 'short') return shortId()
  return uuidv4()
}

const raw = ref(Array.from({ length: count.value }, uuidv4))

const list = computed(() =>
  raw.value.map((id) => {
    // ULID / 短 ID 的大写与连字符规则不适用，保持原样
    if (type.value === 'ulid' || type.value === 'short') return id
    let s = upper.value ? id.toUpperCase() : id
    if (noDash.value) s = s.replace(/-/g, '')
    return s
  }),
)

watch([count, upper, noDash, type], () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      count: count.value,
      upper: upper.value,
      noDash: noDash.value,
      type: type.value,
    }),
  )
})

function generate() {
  raw.value = Array.from({ length: count.value }, makeOne)
}

watch(type, () => generate())

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
      <span class="label">类型</span>
      <select v-model="type" class="select">
        <option v-for="t in TYPES" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>

      <span class="label">数量</span>
      <select v-model.number="count" class="select">
        <option v-for="n in COUNTS" :key="n" :value="n">{{ n }}</option>
      </select>

      <button
        v-if="type === 'v4' || type === 'v7'"
        class="toggle"
        :class="{ on: upper }"
        @click="upper = !upper"
      >
        大写
      </button>
      <button
        v-if="type === 'v4' || type === 'v7'"
        class="toggle"
        :class="{ on: noDash }"
        @click="noDash = !noDash"
      >
        无连字符
      </button>
      <span class="type-desc">{{ TYPES.find((t) => t.id === type)?.desc }}</span>

      <div class="right">
        <button class="tbtn" @click="generate">重新生成</button>
        <button class="tbtn primary" @click="copy(list.join('\n'), 'all')">
          {{ copiedKey === 'all' ? '已复制全部' : '复制全部' }}
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">{{ TYPES.find((t) => t.id === type)?.name }}</span>
        <span class="mini">{{ list.length }} 条 · {{ list[0]?.length || 0 }} 字符</span>
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
.type-desc {
  font-size: 10px;
  color: var(--text-faint);
  white-space: nowrap;
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
