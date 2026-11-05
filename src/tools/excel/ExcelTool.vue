<script setup>
import { computed, ref } from 'vue'

const PREVIEW_ROWS = 120

let XLSX = null
async function ensureXlsx() {
  if (!XLSX) {
    const mod = await import('xlsx')
    XLSX = mod.default || mod
  }
  return XLSX
}

const mode = ref('read') // read: 表格→数据 | write: JSON→表格
const loading = ref(false)
const error = ref('')
const notice = ref('')
const dragOver = ref(false)
const fileInputEl = ref(null)

const fileName = ref('')
const workbook = ref(null)
const sheetNames = ref([])
const sheetName = ref('')
const rows = ref([]) // 格式化后的值，用于表格预览与 CSV
const rawRows = ref([]) // 原始值（数字/日期保持类型），用于导出 JSON
const hasHeader = ref(true)
const jsonInput = ref('[\n  { "id": 1, "name": "张三", "role": "admin" },\n  { "id": 2, "name": "李四", "role": "user" }\n]')

const colCount = computed(() => rows.value.reduce((max, r) => Math.max(max, r.length), 0))
const dataRows = computed(() => (hasHeader.value ? rows.value.slice(1) : rows.value))
const previewRows = computed(() => rows.value.slice(0, PREVIEW_ROWS))
const copied = ref('')

/* ---------------- 读取表格 ---------------- */

async function loadFile(file) {
  if (!file) return
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const X = await ensureXlsx()
    const buffer = await file.arrayBuffer()
    const wb = X.read(buffer, { type: 'array', cellDates: true })
    workbook.value = wb
    sheetNames.value = wb.SheetNames
    fileName.value = file.name
    await selectSheet(wb.SheetNames[0])
    notice.value = `已读取 ${file.name}（${wb.SheetNames.length} 个工作表）`
  } catch (e) {
    error.value = `解析失败：${e.message}`
    workbook.value = null
    sheetNames.value = []
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function selectSheet(name) {
  const X = await ensureXlsx()
  sheetName.value = name
  const sheet = workbook.value?.Sheets?.[name]
  if (!sheet) {
    rows.value = []
    return
  }
  rows.value = X.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: '',
  })
  rawRows.value = X.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
    defval: null,
  })
}

function onPick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  loadFile(file)
}

function onDrop(e) {
  dragOver.value = false
  loadFile(e.dataTransfer?.files?.[0])
}

/* ---------------- 导出 ---------------- */

const jsonOutput = computed(() => {
  const source = rawRows.value.length ? rawRows.value : rows.value
  if (!source.length) return ''
  if (!hasHeader.value) return JSON.stringify(source, null, 2)

  const [head, ...body] = source
  const keys = head.map((h, i) => String(h ?? `col${i + 1}`))
  const list = body.map((row) => {
    const obj = {}
    keys.forEach((key, i) => {
      // 原始值里空单元格是 null，导出成 null 更贴近表格语义
      obj[key] = row[i] === undefined ? null : row[i]
    })
    return obj
  })
  return JSON.stringify(list, null, 2)
})

const csvOutput = computed(() => {
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return rows.value.map((row) => row.map(escape).join(',')).join('\n')
})

function download(content, filename, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function exportJson() {
  if (!jsonOutput.value) return
  download(jsonOutput.value, `${fileName.value.replace(/\.[^.]+$/, '') || 'data'}.json`, 'application/json')
}

function exportCsv() {
  if (!csvOutput.value) return
  download(csvOutput.value, `${fileName.value.replace(/\.[^.]+$/, '') || 'data'}.csv`, 'text/csv')
}

async function copyJson() {
  if (!jsonOutput.value) return
  try {
    await navigator.clipboard.writeText(jsonOutput.value)
    copied.value = 'json'
    setTimeout(() => (copied.value = ''), 1200)
  } catch {
    /* 忽略 */
  }
}

/* ---------------- JSON → 表格 ---------------- */

const parsedJson = computed(() => {
  if (!jsonInput.value.trim()) return { ok: false, error: '' }
  try {
    const data = JSON.parse(jsonInput.value)
    const arr = Array.isArray(data) ? data : [data]
    if (!arr.length) return { ok: false, error: '' }
    if (typeof arr[0] !== 'object' || arr[0] === null) {
      return { ok: false, error: '需要对象数组，例如 [{ "id": 1, "name": "张三" }]' }
    }
    // 收集所有键，保持首次出现顺序
    const keys = []
    for (const item of arr) {
      for (const key of Object.keys(item)) {
        if (!keys.includes(key)) keys.push(key)
      }
    }
    return { ok: true, rows: arr, keys, error: '' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

async function downloadXlsx() {
  if (!parsedJson.value.ok) return
  try {
    const X = await ensureXlsx()
    const { rows: list, keys } = parsedJson.value
    const sheet = X.utils.json_to_sheet(list, { header: keys })
    const wb = X.utils.book_new()
    X.utils.book_append_sheet(wb, sheet, 'Sheet1')
    const buffer = X.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'data.xlsx'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  } catch (e) {
    error.value = `生成失败：${e.message}`
  }
}

function formatJsonInput() {
  try {
    jsonInput.value = JSON.stringify(JSON.parse(jsonInput.value), null, 2)
  } catch (e) {
    error.value = e.message
  }
}

function clearAll() {
  workbook.value = null
  sheetNames.value = []
  sheetName.value = ''
  rows.value = []
  rawRows.value = []
  fileName.value = ''
  error.value = ''
  notice.value = ''
}
</script>

<template>
  <div
    class="excel"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <div class="seg">
        <button :class="{ on: mode === 'read' }" @click="mode = 'read'">表格 → JSON</button>
        <button :class="{ on: mode === 'write' }" @click="mode = 'write'">JSON → 表格</button>
      </div>

      <template v-if="mode === 'read'">
        <button class="btn primary" @click="fileInputEl?.click()">选择文件</button>
        <span class="hint-inline">支持 .xlsx / .xls / .csv，也可以直接拖进来</span>

        <select v-if="sheetNames.length > 1" v-model="sheetName" class="select" @change="selectSheet(sheetName)">
          <option v-for="name in sheetNames" :key="name" :value="name">{{ name }}</option>
        </select>

        <span class="spacer" />
        <span v-if="rows.length" class="stat">
          {{ dataRows.length }} 行 × {{ colCount }} 列
        </span>
        <button v-if="rows.length" class="btn" @click="exportCsv">导出 CSV</button>
        <button v-if="rows.length" class="btn" @click="copyJson">
          {{ copied ? '已复制' : '复制 JSON' }}
        </button>
        <button v-if="rows.length" class="btn primary" @click="exportJson">导出 JSON</button>
        <button v-if="rows.length" class="btn" @click="clearAll">清空</button>
      </template>

      <template v-else>
        <span class="spacer" />
        <button class="btn" @click="formatJsonInput">格式化</button>
        <button class="btn primary" :disabled="!parsedJson.ok" @click="downloadXlsx">
          下载 .xlsx
        </button>
      </template>
    </div>

    <p v-if="error" class="err-bar">{{ error }}</p>

    <!-- 读取模式 -->
    <div v-if="mode === 'read'" class="body">
      <div v-if="loading" class="empty">解析中…</div>

      <div v-else-if="!rows.length" class="empty">
        <p class="big">拖入 Excel 或 CSV 文件</p>
        <p class="small">
          第一行默认作为字段名，可直接导出 JSON / CSV；多工作表可切换。
          文件只在本机解析，不会上传。
        </p>
      </div>

      <template v-else>
        <div class="table-wrap">
          <table class="grid">
            <thead>
              <tr>
                <th class="idx">#</th>
                <th v-for="(cell, i) in previewRows[0]" :key="i">
                  {{ hasHeader ? cell : `列 ${i + 1}` }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, ri) in previewRows.slice(hasHeader ? 1 : 0)"
                :key="ri"
                :class="{ odd: ri % 2 === 1 }"
              >
                <td class="idx">{{ ri + 1 }}</td>
                <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="rows.length > PREVIEW_ROWS" class="more">
            仅预览前 {{ PREVIEW_ROWS }} 行，导出包含全部 {{ dataRows.length }} 行
          </p>
        </div>

        <aside class="json-pane">
          <header>
            <span class="pane-title">JSON 预览</span>
            <label class="chk">
              <input v-model="hasHeader" type="checkbox" />
              首行为表头
            </label>
          </header>
          <pre class="json">{{ jsonOutput.slice(0, 6000) || '（无数据）' }}</pre>
        </aside>
      </template>
    </div>

    <!-- 写入模式 -->
    <div v-else class="body">
      <section class="input-pane">
        <header>
          <span class="pane-title">JSON 数组</span>
          <span class="pane-meta">第一层数组，元素为对象</span>
        </header>
        <textarea v-model="jsonInput" class="code" spellcheck="false" />
        <p v-if="parsedJson.error" class="err-inline">{{ parsedJson.error }}</p>
      </section>

      <section class="input-pane">
        <header>
          <span class="pane-title">预览</span>
          <span v-if="parsedJson.ok" class="pane-meta">
            {{ parsedJson.rows.length }} 行 × {{ parsedJson.keys.length }} 列
          </span>
        </header>
        <div v-if="parsedJson.ok" class="table-wrap">
          <table class="grid">
            <thead>
              <tr>
                <th class="idx">#</th>
                <th v-for="key in parsedJson.keys" :key="key">{{ key }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in parsedJson.rows.slice(0, PREVIEW_ROWS)" :key="i" :class="{ odd: i % 2 === 1 }">
                <td class="idx">{{ i + 1 }}</td>
                <td v-for="key in parsedJson.keys" :key="key">{{ row[key] ?? '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty small-empty">
          <p class="small">粘贴 JSON 数组后这里会显示表格预览</p>
        </div>
      </section>
    </div>

    <p v-if="notice" class="notice">{{ notice }}</p>

    <input ref="fileInputEl" type="file" accept=".xlsx,.xls,.csv" hidden @change="onPick" />
  </div>
</template>

<style scoped>
.excel {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.excel.dragging {
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
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
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
.btn.primary:hover:not(:disabled) {
  background: var(--accent-strong);
}
.hint-inline {
  font-size: 10.5px;
  color: var(--text-faint);
}
.select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.err-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
.empty .big {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.empty .small {
  margin: 0;
  max-width: 440px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-faint);
}
.small-empty {
  border: none;
}
.table-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: auto;
}
.grid {
  border-collapse: collapse;
  font-size: 11px;
  white-space: nowrap;
}
.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  background: var(--fill-1);
  font-weight: 600;
  color: var(--text-dim);
  text-align: left;
}
.grid td {
  padding: 4px 10px;
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  color: var(--text);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.grid tr.odd td {
  background: var(--fill-1);
}
.idx {
  width: 42px;
  color: var(--text-faint) !important;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.more {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: var(--text-faint);
  position: sticky;
  bottom: 0;
  background: var(--panel-bg);
}
.json-pane,
.input-pane {
  flex: none;
  width: 42%;
  min-width: 260px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.input-pane {
  flex: 1;
  width: auto;
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
.pane-meta {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--text-faint);
}
.chk {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-dim);
  cursor: pointer;
}
.json {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text);
  white-space: pre;
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
.err-inline {
  flex: none;
  margin: 0;
  padding: 5px 10px;
  border-top: 1px solid var(--border);
  background: var(--danger-soft);
  font-size: 10.5px;
  color: var(--danger);
}
.notice {
  flex: none;
  margin: 0;
  font-size: 10px;
  color: var(--success);
}
</style>
