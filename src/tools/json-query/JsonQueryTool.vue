<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:json-query'

const SAMPLE = JSON.stringify(
  {
    code: 0,
    message: 'ok',
    data: {
      total: 2,
      list: [
        { id: 1, name: '张三', tags: ['admin', 'dev'], profile: { age: 28, city: '北京' } },
        { id: 2, name: '李四', tags: ['guest'], profile: { age: 31, city: '上海' } },
      ],
    },
  },
  null,
  2,
)

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const source = ref(saved.source ?? SAMPLE)
const path = ref(saved.path ?? 'data.list[*].name')
const copied = ref(false)
const message = ref('')

/* ---------------- 解析 ---------------- */

const parsed = computed(() => {
  const text = source.value.trim()
  if (!text) return { ok: false, error: '', empty: true }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

function parsePath(input) {
  const p = String(input).trim().replace(/^\$/, '')
  const tokens = []
  let i = 0
  while (i < p.length) {
    if (p.startsWith('..', i)) {
      i += 2
      const m = /^[^.[]+/.exec(p.slice(i))
      tokens.push({ type: 'deep', key: m ? m[0] : '' })
      i += m ? m[0].length : 0
    } else if (p[i] === '.') {
      i += 1
      const m = /^[^.[]+/.exec(p.slice(i))
      if (m) {
        tokens.push({ type: 'key', key: m[0] })
        i += m[0].length
      }
    } else if (p[i] === '[') {
      const end = p.indexOf(']', i)
      const inner = p.slice(i + 1, end === -1 ? p.length : end).trim()
      if (inner === '*') tokens.push({ type: 'wildcard' })
      else if (/^-?\d+$/.test(inner)) tokens.push({ type: 'index', index: Number(inner) })
      else if (/^['"].*['"]$/.test(inner)) tokens.push({ type: 'key', key: inner.slice(1, -1) })
      i = end === -1 ? p.length : end + 1
    } else {
      const m = /^[^.[]+/.exec(p.slice(i))
      if (m) {
        tokens.push({ type: 'key', key: m[0] })
        i += m[0].length
      } else i += 1
    }
  }
  return tokens
}

function collectDeep(node, key, out) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectDeep(item, key, out)
    return
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === key) out.push(v)
    collectDeep(v, key, out)
  }
}

function query(data, pathText) {
  const tokens = parsePath(pathText)
  let current = [data]
  for (const t of tokens) {
    const next = []
    for (const node of current) {
      if (t.type === 'key') {
        if (node && typeof node === 'object' && !Array.isArray(node) && t.key in node) {
          next.push(node[t.key])
        }
      } else if (t.type === 'index') {
        if (Array.isArray(node)) {
          const idx = t.index < 0 ? node.length + t.index : t.index
          if (idx >= 0 && idx < node.length) next.push(node[idx])
        }
      } else if (t.type === 'wildcard') {
        if (Array.isArray(node)) next.push(...node)
        else if (node && typeof node === 'object') next.push(...Object.values(node))
      } else if (t.type === 'deep') {
        collectDeep(node, t.key, next)
      }
    }
    current = next
  }
  return current
}

const result = computed(() => {
  if (!parsed.value.ok) return { items: [], error: '' }
  if (!path.value.trim()) return { items: [], error: '' }
  try {
    return { items: query(parsed.value.value, path.value), error: '' }
  } catch (e) {
    return { items: [], error: e.message }
  }
})

function display(value) {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

// 只有「多个标量」才用列表展示；单个值统一用整块展示
const isScalarList = computed(
  () =>
    result.value.items.length > 1 &&
    result.value.items.every((v) => v === null || typeof v !== 'object'),
)

const listText = computed(() => result.value.items.map((v) => display(v)).join('\n'))

/* ---------------- 树视图 ---------------- */

const MAX_ROWS = 600

const treeRows = computed(() => {
  if (!parsed.value.ok) return []
  const rows = []
  const walk = (node, base, depth) => {
    if (depth > 6 || rows.length >= MAX_ROWS) return
    if (Array.isArray(node)) {
      const limit = Math.min(node.length, 60)
      for (let i = 0; i < limit && rows.length < MAX_ROWS; i++) {
        const p = `${base}[${i}]`
        rows.push({ path: p, label: `[${i}]`, value: node[i], depth, kind: 'index' })
        if (node[i] && typeof node[i] === 'object') walk(node[i], p, depth + 1)
      }
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (rows.length >= MAX_ROWS) return
        const p = base ? `${base}.${k}` : k
        rows.push({ path: p, label: k, value: v, depth, kind: 'key' })
        if (v && typeof v === 'object') walk(v, p, depth + 1)
      }
    }
  }
  walk(parsed.value.value, '', 0)
  return rows
})

function summary(value) {
  if (Array.isArray(value)) return `[${value.length}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).length}}`
  if (typeof value === 'string') return `"${value.length > 24 ? `${value.slice(0, 24)}…` : value}"`
  return String(value)
}

function pick(row) {
  path.value = row.path
}

/* ---------------- 操作 ---------------- */

async function copy(text, tag = 'main') {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    message.value = tag === 'list' ? '已复制全部结果' : '已复制'
    setTimeout(() => {
      copied.value = false
      if (message.value.startsWith('已复制')) message.value = ''
    }, 1400)
  } catch {
    /* 忽略 */
  }
}

function formatSource() {
  if (!parsed.value.ok) return
  source.value = JSON.stringify(parsed.value.value, null, 2)
}

function minifySource() {
  if (!parsed.value.ok) return
  source.value = JSON.stringify(parsed.value.value)
}

function loadSample() {
  source.value = SAMPLE
  path.value = 'data.list[*].name'
}

function clearAll() {
  source.value = ''
  path.value = ''
  message.value = ''
}

let saveTimer = null
watch(
  [source, path],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ source: source.value, path: path.value }))
    }, 400)
  },
  { deep: true },
)

onMounted(() => {
  if (!source.value) source.value = SAMPLE
})
</script>

<template>
  <div class="jsonq">
    <div class="toolbar">
      <span class="label">路径</span>
      <input
        v-model="path"
        class="path-input"
        spellcheck="false"
        placeholder="data.list[*].name  支持 .key  [0]  [-1]  [*]  ..key"
      />
      <button class="btn" :disabled="!result.items.length" @click="copy(
        result.items.length > 1 ? listText : display(result.items[0]),
        result.items.length > 1 ? 'list' : 'main',
      )">
        {{ copied ? '已复制' : '复制结果' }}
      </button>
      <span class="spacer" />
      <button class="btn" @click="formatSource">格式化</button>
      <button class="btn" @click="minifySource">压缩</button>
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" @click="clearAll">清空</button>
    </div>

    <div class="body">
      <section class="left">
        <div class="pane">
          <header>
            <span class="pane-title">JSON 源</span>
            <span v-if="!parsed.ok && !parsed.empty" class="pane-err">格式错误</span>
          </header>
          <textarea v-model="source" class="editor" spellcheck="false" placeholder="粘贴 JSON" />
          <p v-if="!parsed.ok && !parsed.empty" class="err-bar">{{ parsed.error }}</p>
        </div>

        <div class="pane tree-pane">
          <header>
            <span class="pane-title">结构</span>
            <span class="pane-hint">点任意节点填入路径</span>
          </header>
          <div class="tree">
            <p v-if="!treeRows.length" class="tip">没有可显示的节点</p>
            <button
              v-for="row in treeRows"
              :key="row.path"
              class="tree-row"
              :class="[row.kind, { on: path === row.path }]"
              :style="{ paddingLeft: 8 + row.depth * 12 + 'px' }"
              :title="row.path"
              @click="pick(row)"
            >
              <span class="t-key">{{ row.label }}</span>
              <span class="t-val">{{ summary(row.value) }}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="pane right">
        <header>
          <span class="pane-title">取值结果</span>
          <span class="pane-meta">
            {{ result.items.length ? `${result.items.length} 项` : '—' }}
          </span>
        </header>

        <div class="result">
          <p v-if="!parsed.ok && !parsed.empty" class="tip">先修正 JSON 格式</p>
          <p v-else-if="!path.trim()" class="tip">输入路径，或点左侧结构树任意节点</p>
          <p v-else-if="!result.items.length" class="tip">该路径没有匹配的值</p>

          <pre v-else-if="!isScalarList" class="result-block">{{
            result.items.length === 1 ? display(result.items[0]) : listText
          }}</pre>

          <div v-else class="result-list">
            <div v-for="(v, i) in result.items" :key="i" class="result-item">
              <span class="ri-index">{{ i + 1 }}</span>
              <code class="ri-value">{{ display(v) }}</code>
            </div>
          </div>
        </div>

        <p v-if="message" class="msg">{{ message }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.jsonq {
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
}
.label {
  flex: none;
  font-size: 11.5px;
  color: var(--text-dim);
}
.path-input {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.spacer {
  margin-left: auto;
}
.btn {
  flex: none;
  padding: 4px 11px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
}
.btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.left {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.left .pane:first-child {
  flex: 1.1;
}
.tree-pane {
  flex: 1;
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
.pane-err {
  font-size: 10.5px;
  color: var(--danger);
}
.pane-hint,
.pane-meta {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-faint);
}
.editor {
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
  line-height: 1.65;
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
.tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 3px 0;
}
.tree-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 3px 8px;
  text-align: left;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text);
}
.tree-row:hover {
  background: var(--fill-1);
}
.tree-row.on {
  background: var(--accent-soft);
}
.t-key {
  flex: none;
  color: #0451a5;
}
.tree-row.index .t-key {
  color: var(--text-faint);
}
.t-val {
  min-width: 0;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.result-block {
  margin: 0;
  padding: 10px 12px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.result-list {
  padding: 6px 0;
}
.result-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 12px;
}
.result-item:hover {
  background: var(--fill-1);
}
.ri-index {
  flex: none;
  width: 22px;
  font-size: 10px;
  color: var(--text-faint);
  text-align: right;
}
.ri-value {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  word-break: break-all;
}
.tip {
  margin: 24px 12px;
  font-size: 11.5px;
  color: var(--text-faint);
}
.msg {
  flex: none;
  margin: 0;
  padding: 4px 10px;
  border-top: 1px solid var(--border);
  font-size: 10.5px;
  color: var(--accent);
}
:global(html.dark) .t-key {
  color: #9cdcfe;
}
</style>
