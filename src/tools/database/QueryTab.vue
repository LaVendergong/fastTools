<script setup>
import { computed, nextTick, ref } from 'vue'

const props = defineProps({
  api: { type: Function, required: true },
  initialSql: { type: String, default: 'SELECT 1 AS ok;' },
  keywords: { type: Array, default: () => [] },
})

const sql = ref(props.initialSql)
const editorEl = ref(null)
const result = ref(null)
const error = ref('')
const message = ref('')
const loading = ref(false)
const history = ref([])
const showHistory = ref(false)

const hasResult = computed(() => result.value && result.value.columns.length > 0)

function selectionSql() {
  const el = editorEl.value
  if (!el) return ''
  return el.value.slice(el.selectionStart, el.selectionEnd).trim()
}

async function run() {
  const target = selectionSql() || sql.value.trim()
  if (!target || loading.value) return

  loading.value = true
  error.value = ''
  message.value = '执行中…'
  const started = performance.now()

  try {
    const data = await props.api('query', { sql: target })
    result.value = data
    message.value = data.message || `${data.rowCount} 行 · ${data.duration} ms`
    if (!history.value.includes(target)) history.value.unshift(target)
    if (history.value.length > 20) history.value.pop()
  } catch (e) {
    result.value = null
    error.value = e.message
    message.value = '执行失败'
  } finally {
    loading.value = false
  }
}

// ── 自动补全：表名 / 列名 / SQL 关键字 ──
const suggestions = ref([])
const activeIndex = ref(0)
const wordStart = ref(0)

function updateSuggestions() {
  const el = editorEl.value
  if (!el) return
  const pos = el.selectionStart
  const match = /([A-Za-z0-9_]+)$/.exec(el.value.slice(0, pos))
  if (!match || match[1].length < 2) {
    suggestions.value = []
    return
  }
  const word = match[1].toLowerCase()
  wordStart.value = pos - match[1].length
  suggestions.value = props.keywords
    .filter((k) => {
      const lower = String(k).toLowerCase()
      return lower.startsWith(word) && lower !== word
    })
    .slice(0, 8)
  activeIndex.value = 0
}

function applySuggestion(item) {
  const el = editorEl.value
  if (!el || !item) return
  const pos = el.selectionStart
  const next = sql.value.slice(0, wordStart.value) + item + sql.value.slice(pos)
  sql.value = next
  suggestions.value = []
  nextTick(() => {
    const caret = wordStart.value + item.length
    el.focus()
    el.setSelectionRange(caret, caret)
  })
}

function onInput() {
  updateSuggestions()
}

function onKeydown(e) {
  if (suggestions.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length
      return
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      applySuggestion(suggestions.value[activeIndex.value])
      return
    }
    if (e.key === 'Escape') {
      suggestions.value = []
      return
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    run()
  }
  if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
    e.preventDefault()
    updateSuggestions()
  }
}

function cell(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function exportCsv() {
  if (!hasResult.value) return
  const head = result.value.columns.join(',')
  const body = result.value.rows.map((r) => result.value.columns.map((c) => csvEscape(r[c])).join(','))
  download(`\uFEFF${[head, ...body].join('\n')}`, 'query-result.csv', 'text/csv;charset=utf-8')
}

function exportJson() {
  if (!hasResult.value) return
  download(JSON.stringify(result.value.rows, null, 2), 'query-result.json', 'application/json')
}

const copied = ref(false)

async function copyResult() {
  if (!hasResult.value) return
  try {
    const text = [result.value.columns.join('\t'), ...result.value.rows.map((r) => result.value.columns.map((c) => cell(r[c])).join('\t'))].join('\n')
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 忽略 */
  }
}

function pickHistory(item) {
  sql.value = item
  showHistory.value = false
}
</script>

<template>
  <div class="query-tab">
    <div class="editor-panel">
      <div class="head">
        <span class="title">SQL 控制台</span>
        <span class="hint">Ctrl / ⌘ + Enter 执行，选中时只执行选中部分</span>
        <div class="head-actions">
          <button class="link" @click="showHistory = !showHistory">历史 {{ history.length }}</button>
          <button class="run" :disabled="loading" @click="run">{{ loading ? '执行中…' : '执行' }}</button>
        </div>
        <div v-if="showHistory" class="history">
          <p v-if="!history.length" class="tip">还没有执行记录</p>
          <button v-for="(h, i) in history" :key="i" class="history-item" @click="pickHistory(h)">
            {{ h.replace(/\s+/g, ' ').slice(0, 80) }}
          </button>
        </div>
      </div>
      <div class="editor-wrap">
        <textarea
          ref="editorEl"
          v-model="sql"
          class="sql"
          spellcheck="false"
          placeholder="SELECT * FROM users LIMIT 10;"
          @keydown="onKeydown"
          @input="onInput"
          @click="suggestions = []"
        />
        <div v-if="suggestions.length" class="suggest">
          <button
            v-for="(s, i) in suggestions"
            :key="s"
            class="suggest-item"
            :class="{ on: i === activeIndex }"
            @mousedown.prevent="applySuggestion(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>
    </div>

    <div class="result-panel">
      <div class="head">
        <span class="title">结果</span>
        <span class="mini" :class="{ err: !!error }">{{ message }}</span>
        <div v-if="hasResult" class="head-actions">
          <button class="link" @click="copyResult">{{ copied ? '已复制' : '复制' }}</button>
          <button class="link" @click="exportCsv">CSV</button>
          <button class="link" @click="exportJson">JSON</button>
        </div>
      </div>

      <div v-if="hasResult" class="table-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th class="rn">#</th>
              <th v-for="c in result.columns" :key="c">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in result.rows" :key="i">
              <td class="rn">{{ i + 1 }}</td>
              <td v-for="c in result.columns" :key="c" :class="{ null: row[c] === null }">
                {{ cell(row[c]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="error" class="empty-state">
        <p class="err-text">{{ error }}</p>
      </div>

      <div v-else-if="result" class="empty-state">
        <p>{{ result.message || '执行成功' }}</p>
        <p class="sub">影响 {{ result.rowCount }} 行 · {{ result.duration }} ms</p>
      </div>

      <div v-else class="empty-state">
        <p>还没有执行 SQL</p>
        <p class="sub">写入语句后按 Ctrl + Enter，或选中一段再执行</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.query-tab {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: 200px 1fr;
  gap: 10px;
}
.editor-panel,
.result-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.head {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
}
.title {
  font-size: 12px;
  font-weight: 600;
}
.hint {
  font-size: 10.5px;
  color: var(--text-dim);
}
.head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.link {
  font-size: 11.5px;
  color: var(--accent);
}
.run {
  padding: 2px 10px;
  border-radius: 5px;
  background: var(--accent);
  color: #fff;
  font-size: 11.5px;
}
.run:disabled {
  opacity: 0.5;
  cursor: default;
}
.history {
  position: absolute;
  top: 100%;
  right: 8px;
  z-index: 20;
  width: 380px;
  max-height: 240px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.history-item {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border-radius: 5px;
  text-align: left;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-item:hover {
  background: var(--hover);
}
.editor-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}
.sql {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.7;
}
.suggest {
  position: absolute;
  left: 12px;
  bottom: 8px;
  z-index: 30;
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  max-width: calc(100% - 24px);
  overflow-x: auto;
}
.suggest-item {
  padding: 2px 8px;
  border-radius: 5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.suggest-item.on {
  background: var(--accent);
  color: #fff;
}
.mini {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini.err {
  color: #d70015;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.grid {
  border-collapse: collapse;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.grid th,
.grid td {
  padding: 5px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  border-right: 1px solid rgba(0, 0, 0, 0.04);
  text-align: left;
}
.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fafafa;
  font-weight: 600;
}
.grid tbody tr:hover {
  background: rgba(10, 132, 255, 0.05);
}
.grid .rn {
  color: var(--text-dim);
  text-align: right;
  background: rgba(0, 0, 0, 0.015);
}
.grid td.null {
  color: var(--text-dim);
  font-style: italic;
}
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 20px;
  text-align: center;
}
.empty-state p {
  margin: 0;
  font-size: 13px;
}
.empty-state .sub {
  font-size: 11.5px;
  color: var(--text-dim);
}
.empty-state .err-text {
  color: #d70015;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  max-width: 60ch;
  line-height: 1.6;
}
</style>
