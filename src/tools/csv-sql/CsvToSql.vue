<script setup>
import { computed, reactive, ref, watch } from 'vue'

const SAMPLE = `id,name,email,age,city
1,张三,zhangsan@example.com,28,杭州
2,李四,lisi@example.com,31,上海
3,王五,,25,`

const STORAGE_KEY = 'toolbox:csvsql'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const input = ref(saved.input ?? SAMPLE)
const cfg = reactive({
  table: saved.table ?? 'sys_user',
  delimiter: saved.delimiter ?? 'auto',
  header: saved.header ?? true,
  nullAsNull: saved.nullAsNull ?? true,
  batch: saved.batch ?? 0, // 0 = 一条 INSERT
  quote: saved.quote ?? true,
})

const copied = ref('')
const message = ref('')
const error = ref('')
const fileInputEl = ref(null)

/* ---------------- CSV 解析 ---------------- */

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || ''
  const counts = [
    { ch: ',', n: (firstLine.match(/,/g) || []).length },
    { ch: '\t', n: (firstLine.match(/\t/g) || []).length },
    { ch: ';', n: (firstLine.match(/;/g) || []).length },
    { ch: '|', n: (firstLine.match(/\|/g) || []).length },
  ]
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 0 ? counts[0].ch : ','
}

function parseCsv(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }

  row.push(field)
  rows.push(row)

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

const table = computed(() => {
  if (!input.value.trim()) return { ok: false }
  const delimiter =
    cfg.delimiter === 'auto' ? detectDelimiter(input.value) : cfg.delimiter === 'tab' ? '\t' : cfg.delimiter
  const rows = parseCsv(input.value, delimiter)
  if (!rows.length) return { ok: false, error: '没有解析到数据' }

  const width = Math.max(...rows.map((r) => r.length))
  const columns = cfg.header
    ? rows[0].map((c, i) => c.trim() || `col${i + 1}`)
    : Array.from({ length: width }, (_, i) => `col${i + 1}`)

  const body = cfg.header ? rows.slice(1) : rows
  return { ok: true, columns, rows: body, delimiter }
})

/* ---------------- SQL 生成 ---------------- */

function esc(text) {
  return String(text).replace(/'/g, "''")
}

function valueOf(raw) {
  const text = raw ?? ''
  if (text.trim() === '') return cfg.nullAsNull ? 'NULL' : "''"
  // 纯数字（且不带前导 0）按数字输出，其余加引号
  if (/^-?\d+(\.\d+)?$/.test(text.trim()) && !/^0\d/.test(text.trim())) return text.trim()
  return `'${esc(text)}'`
}

const sql = computed(() => {
  const t = table.value
  if (!t.ok) return ''
  if (!t.rows.length) return `-- 只有表头，没有数据行\n`

  const q = (name) => (cfg.quote ? `\`${name}\`` : name)
  const columns = t.columns.map(q).join(', ')
  const tableName = q(cfg.table || 'my_table')
  const batchSize = Number(cfg.batch) || 0

  const values = t.rows.map((row) => {
    const cells = t.columns.map((_, i) => valueOf(row[i]))
    return `(${cells.join(', ')})`
  })

  if (!batchSize || batchSize >= values.length) {
    return `INSERT INTO ${tableName} (${columns}) VALUES\n${values.join(',\n')};\n`
  }

  const statements = []
  for (let i = 0; i < values.length; i += batchSize) {
    const chunk = values.slice(i, i + batchSize)
    statements.push(`INSERT INTO ${tableName} (${columns}) VALUES\n${chunk.join(',\n')};`)
  }
  return `${statements.join('\n\n')}\n`
})

const stats = computed(() => {
  const t = table.value
  const rows = t.ok ? t.rows.length : 0
  const stmts = (sql.value.match(/^INSERT INTO/gm) || []).length
  return { rows, cols: t.ok ? t.columns.length : 0, stmts }
})

/* ---------------- 操作 ---------------- */

async function copy() {
  if (!sql.value) return
  try {
    await navigator.clipboard.writeText(sql.value)
    copied.value = 'sql'
    setTimeout(() => (copied.value = ''), 1200)
  } catch {
    /* 忽略 */
  }
}

function download() {
  if (!sql.value) return
  const blob = new Blob([sql.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${cfg.table || 'data'}.sql`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    input.value = await file.text()
    message.value = `已导入 ${file.name}`
    setTimeout(() => (message.value = ''), 1800)
  } catch (err) {
    error.value = err.message
  }
}

let saveTimer = null
watch(
  [input, cfg],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ input: input.value, ...cfg }),
      )
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="c2s">
    <div class="toolbar">
      <label class="opt">
        表名
        <input v-model="cfg.table" class="tiny wide mono" spellcheck="false" />
      </label>
      <label class="opt">
        分隔符
        <select v-model="cfg.delimiter" class="select">
          <option value="auto">自动识别</option>
          <option value=",">逗号</option>
          <option value="tab">制表符</option>
          <option value=";">分号</option>
          <option value="|">竖线</option>
        </select>
      </label>
      <label class="opt">
        每批
        <select v-model.number="cfg.batch" class="select">
          <option :value="0">单条 INSERT</option>
          <option :value="10">10 行</option>
          <option :value="50">50 行</option>
          <option :value="100">100 行</option>
        </select>
      </label>
      <label class="chk"><input v-model="cfg.header" type="checkbox" /> 首行是表头</label>
      <label class="chk"><input v-model="cfg.nullAsNull" type="checkbox" /> 空值转 NULL</label>
      <label class="chk"><input v-model="cfg.quote" type="checkbox" /> 加反引号</label>

      <span class="spacer" />
      <span class="stat">{{ stats.rows }} 行 × {{ stats.cols }} 列 · {{ stats.stmts }} 条语句</span>
      <button class="btn" @click="fileInputEl?.click()">导入 CSV</button>
      <button class="btn" :disabled="!sql" @click="download">下载 .sql</button>
      <button class="btn primary" :disabled="!sql" @click="copy">
        {{ copied ? '已复制' : '复制 SQL' }}
      </button>
    </div>

    <div class="body">
      <section class="pane">
        <header>
          <span class="pane-title">CSV / 表格数据</span>
          <span class="pane-meta">可直接从 Excel 复制粘贴</span>
        </header>
        <textarea
          v-model="input"
          class="code"
          spellcheck="false"
          placeholder="id,name,age&#10;1,张三,28"
        />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">SQL</span>
          <span class="pane-meta">INSERT 语句</span>
        </header>
        <pre class="code out">{{ sql || '（粘贴数据后自动生成）' }}</pre>
      </section>
    </div>

    <p v-if="message" class="msg">{{ message }}</p>

    <p class="hint">
      纯数字输出为不带引号的字面量，空单元格转 <code>NULL</code>（可关掉输出空字符串）；
      单引号会自动转义为两个单引号。适合给测试库快速灌数据。
    </p>

    <input ref="fileInputEl" type="file" accept=".csv,.txt,text/csv" hidden @change="onFile" />
  </div>
</template>

<style scoped>
.c2s {
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
  gap: 8px;
  flex-wrap: wrap;
}
.opt,
.chk {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
  cursor: pointer;
}
.tiny {
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
}
.tiny.wide {
  width: 130px;
}
.tiny:focus {
  border-color: var(--accent);
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.select {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
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
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1.1fr;
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
.code {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
}
.out {
  white-space: pre;
}
.msg {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--success);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
.hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
</style>
