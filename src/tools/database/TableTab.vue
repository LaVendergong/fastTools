<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps({
  api: { type: Function, required: true },
  table: { type: Object, required: true },
  connType: { type: String, default: 'mysql' },
  schemaVersion: { type: Number, default: 0 },
})

const tab = ref('data') // data | structure
const rows = ref([])
const columns = ref([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const page = ref(0)
const pageSize = ref(50)
const sortCol = ref('')
const sortDir = ref('asc')
const filter = ref('')

const detail = ref({ columns: [], indexes: [], ddl: '' })
const detailLoading = ref(false)
const metaColumns = ref([])

const editing = ref(null) // { rowIndex, col, value }
const adding = ref(false)
const newRow = ref({})
const opMessage = ref('')
const saving = ref(false)

const quote = (name) => (props.connType === 'mysql' ? `\`${name}\`` : `"${name}"`)

const fullName = computed(() => {
  const { schema, name } = props.table
  if (props.connType === 'sqlite') return quote(name)
  return schema ? `${quote(schema)}.${quote(name)}` : quote(name)
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const primaryKeys = computed(() => metaColumns.value.filter((c) => c.primary).map((c) => c.name))
const editable = computed(() => tab.value === 'data')

function buildSql() {
  let sql = `SELECT * FROM ${fullName.value}`
  if (filter.value.trim()) sql += ` WHERE ${filter.value.trim()}`
  if (sortCol.value) sql += ` ORDER BY ${quote(sortCol.value)} ${sortDir.value.toUpperCase()}`
  sql += ` LIMIT ${pageSize.value} OFFSET ${page.value * pageSize.value}`
  return sql
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await props.api('query', { sql: buildSql() })
    rows.value = data.rows
    columns.value = data.columns
  } catch (e) {
    error.value = e.message
    rows.value = []
    columns.value = []
  } finally {
    loading.value = false
  }
}

async function loadCount() {
  try {
    const data = await props.api('count', {
      schema: props.table.schema,
      table: props.table.name,
      filter: filter.value.trim(),
    })
    total.value = data.total
  } catch {
    total.value = 0
  }
}

async function loadMetaColumns() {
  if (metaColumns.value.length) return
  try {
    const data = await props.api('columns', { schema: props.table.schema, table: props.table.name })
    metaColumns.value = data.columns
  } catch {
    metaColumns.value = []
  }
}

async function loadDetail() {
  detailLoading.value = true
  try {
    const [cols, idx, ddl] = await Promise.all([
      props.api('columns', { schema: props.table.schema, table: props.table.name }),
      props.api('indexes', { schema: props.table.schema, table: props.table.name }),
      props.api('ddl', { schema: props.table.schema, table: props.table.name }),
    ])
    detail.value = { columns: cols.columns, indexes: idx.indexes, ddl: ddl.ddl }
  } catch (e) {
    detail.value = { columns: [], indexes: [], ddl: `读取失败：${e.message}` }
  } finally {
    detailLoading.value = false
  }
}

function refresh() {
  load()
  loadCount()
  loadMetaColumns()
  if (tab.value === 'structure') loadDetail()
}

function onSchemaChanged(message) {
  opMessage.value = message
  detail.value = { columns: [], indexes: [], ddl: '' }
  metaColumns.value = []
  loadMetaColumns()
  loadDetail()
  load()
}

async function dropColumn(column) {
  if (!window.confirm(`确定删除列 ${column.name}？此操作不可撤销，该列数据会丢失。`)) return
  error.value = ''
  try {
    await props.api('query', {
      sql: `ALTER TABLE ${fullName.value} DROP COLUMN ${quote(column.name)}`,
    })
    onSchemaChanged(`已删除列 ${column.name}`)
  } catch (e) {
    error.value = e.message
  }
}

async function dropIndex(index) {
  if (index.name === 'PRIMARY' || index.name.endsWith('_pkey')) {
    window.alert('主键索引不能直接删除')
    return
  }
  if (!window.confirm(`确定删除索引 ${index.name}？`)) return
  error.value = ''
  try {
    const sql =
      props.connType === 'mysql'
        ? `DROP INDEX ${quote(index.name)} ON ${fullName.value}`
        : `DROP INDEX ${quote(index.name)}`
    await props.api('query', { sql })
    onSchemaChanged(`已删除索引 ${index.name}`)
  } catch (e) {
    error.value = e.message
  }
}

watch(
  () => props.schemaVersion,
  () => onSchemaChanged(opMessage.value),
)

function sortBy(col) {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortCol.value = col
    sortDir.value = 'asc'
  }
  page.value = 0
  load()
}

function applyFilter() {
  page.value = 0
  load()
  loadCount()
}

function goPage(next) {
  const target = Math.min(Math.max(next, 0), totalPages.value - 1)
  if (target === page.value) return
  page.value = target
  load()
}

function cell(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function sqlValue(value) {
  if (value === null || value === undefined || value === '') return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

function whereClause(row) {
  const keys = primaryKeys.value.length ? primaryKeys.value : columns.value
  return keys
    .map((key) => {
      const value = row[key]
      return value === null || value === undefined
        ? `${quote(key)} IS NULL`
        : `${quote(key)} = ${sqlValue(value)}`
    })
    .join(' AND ')
}

function startEdit(rowIndex, col) {
  if (saving.value) return
  editing.value = { rowIndex, col, value: rows.value[rowIndex][col] ?? '' }
}

async function commitEdit() {
  const current = editing.value
  if (!current) return
  const { rowIndex, col, value } = current
  const row = rows.value[rowIndex]
  const oldValue = row[col]
  const nextValue = value === '' ? null : value
  const unchanged =
    String(oldValue ?? '') === String(nextValue ?? '') || (oldValue === null && nextValue === null)

  if (unchanged) {
    editing.value = null
    return
  }

  saving.value = true
  error.value = ''
  try {
    await props.api('query', {
      sql: `UPDATE ${fullName.value} SET ${quote(col)} = ${sqlValue(nextValue)} WHERE ${whereClause(row)}`,
    })
    row[col] = nextValue
    opMessage.value = `已更新 ${col}`
    loadCount()
  } catch (e) {
    error.value = e.message
    await load()
  } finally {
    saving.value = false
    editing.value = null
  }
}

function startAdd() {
  adding.value = true
  newRow.value = {}
  opMessage.value = ''
}

async function saveNewRow() {
  const entries = Object.entries(newRow.value).filter(([, v]) => v !== '' && v !== undefined)
  if (!entries.length) {
    adding.value = false
    return
  }

  saving.value = true
  error.value = ''
  try {
    const cols = entries.map(([k]) => quote(k)).join(', ')
    const vals = entries.map(([, v]) => sqlValue(v)).join(', ')
    await props.api('query', {
      sql: `INSERT INTO ${fullName.value} (${cols}) VALUES (${vals})`,
    })
    opMessage.value = '已新增 1 行'
    adding.value = false
    newRow.value = {}
    refresh()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function removeRow(row) {
  const hint = primaryKeys.value.length
    ? ''
    : '\n\n注意：该表没有主键，将用所有列匹配，可能影响多行。'
  if (!window.confirm(`确定删除这一行吗？${hint}`)) return

  saving.value = true
  error.value = ''
  try {
    await props.api('query', {
      sql: `DELETE FROM ${fullName.value} WHERE ${whereClause(row)}`,
    })
    opMessage.value = '已删除 1 行'
    refresh()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
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
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function exportCsv() {
  if (!rows.value.length) return
  const head = columns.value.join(',')
  const body = rows.value.map((r) => columns.value.map((c) => csvEscape(r[c])).join(','))
  download(`\uFEFF${[head, ...body].join('\n')}`, `${props.table.name}.csv`, 'text/csv;charset=utf-8')
}

function exportJson() {
  if (!rows.value.length) return
  download(JSON.stringify(rows.value, null, 2), `${props.table.name}.json`, 'application/json')
}

onMounted(() => {
  load()
  loadCount()
  loadMetaColumns()
})

watch(tab, (value) => {
  if (value === 'structure' && !detail.value.columns.length && !detailLoading.value) loadDetail()
})

watch(
  () => pageSize.value,
  () => {
    page.value = 0
    load()
  },
)
</script>

<template>
  <div class="table-tab">
    <div class="tabs-bar">
      <button :class="{ on: tab === 'data' }" @click="tab = 'data'">数据</button>
      <button :class="{ on: tab === 'structure' }" @click="tab = 'structure'">结构</button>
      <span class="name">{{ table.schema ? `${table.schema}.` : '' }}{{ table.name }}</span>
      <span v-if="tab === 'data'" class="mini">
        {{ total }} 行 · 第 {{ totalPages ? page + 1 : 0 }}/{{ totalPages }} 页
      </span>
      <span v-if="opMessage" class="op">{{ opMessage }}</span>
      <div class="actions">
        <button class="link" @click="refresh">刷新</button>
        <template v-if="tab === 'data'">
          <button class="link" @click="exportCsv">CSV</button>
          <button class="link" @click="exportJson">JSON</button>
        </template>
      </div>
    </div>

    <template v-if="tab === 'data'">
      <div class="filter-bar">
        <input
          v-model="filter"
          class="filter"
          placeholder="WHERE 条件，如 age > 18 AND city = '大连'"
          spellcheck="false"
          @keyup.enter="applyFilter"
        />
        <button class="tbtn" @click="applyFilter">应用</button>
        <select v-model.number="pageSize" class="select">
          <option v-for="n in [20, 50, 100, 200]" :key="n" :value="n">{{ n }} 行/页</option>
        </select>
        <button class="tbtn" :disabled="saving" @click="startAdd">＋ 新增行</button>
        <div class="pager">
          <button class="tbtn" :disabled="page === 0" @click="goPage(page - 1)">上一页</button>
          <button class="tbtn" :disabled="page >= totalPages - 1" @click="goPage(page + 1)">
            下一页
          </button>
        </div>
      </div>

      <div class="grid-wrap">
        <table v-if="columns.length" class="grid">
          <thead>
            <tr>
              <th class="rn">#</th>
              <th
                v-for="c in columns"
                :key="c"
                class="sortable"
                :class="{ sorted: sortCol === c, pk: primaryKeys.includes(c) }"
                @click="sortBy(c)"
              >
                {{ c }}
                <span v-if="sortCol === c" class="arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="op-col" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="i">
              <td class="rn">{{ page * pageSize + i + 1 }}</td>
              <td
                v-for="c in columns"
                :key="c"
                :title="cell(row[c])"
                :class="{ null: row[c] === null, editing: editing && editing.rowIndex === i && editing.col === c }"
                @dblclick="startEdit(i, c)"
              >
                <input
                  v-if="editing && editing.rowIndex === i && editing.col === c"
                  v-model="editing.value"
                  class="cell-input"
                  spellcheck="false"
                  @keyup.enter="commitEdit"
                  @keyup.esc="editing = null"
                  @blur="commitEdit"
                />
                <span v-else class="cell">{{ cell(row[c]) }}</span>
              </td>
              <td class="op-col">
                <button class="row-del" title="删除该行" @click="removeRow(row)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-else class="empty">
          <p v-if="error" class="err-text">{{ error }}</p>
          <p v-else>{{ loading ? '加载中…' : '没有数据' }}</p>
        </div>
      </div>

      <div v-if="adding" class="add-row">
        <div class="add-head">
          <span>新增行</span>
          <span class="add-tip">留空的列使用默认值</span>
        </div>
        <div class="add-fields">
          <label v-for="c in columns" :key="c" class="add-field">
            <span>{{ c }}</span>
            <input v-model="newRow[c]" spellcheck="false" placeholder="（空）" />
          </label>
        </div>
        <div class="add-actions">
          <button class="tbtn" @click="adding = false">取消</button>
          <button class="tbtn primary" :disabled="saving" @click="saveNewRow">插入</button>
        </div>
      </div>

      <p v-if="error && columns.length" class="error-bar">{{ error }}</p>
      <p v-else-if="editable" class="hint-bar">
        双击单元格可编辑（回车保存 / Esc 取消）{{ primaryKeys.length ? '' : ' · 该表无主键，修改按全列匹配' }}
      </p>
    </template>

    <div v-else class="structure">
      <p v-if="opMessage" class="structure-hint">
        {{ opMessage }} · 新增列 / 索引请在左侧对象树右键表名
      </p>

      <p v-if="detailLoading" class="tip">读取结构…</p>
      <template v-else>
        <section>
          <h4>列</h4>
          <table class="meta-grid">
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>可空</th>
                <th>主键</th>
                <th>默认值</th>
                <th class="act">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in detail.columns" :key="c.name">
                <td>{{ c.name }}</td>
                <td>{{ c.type }}</td>
                <td>{{ c.nullable ? 'YES' : 'NO' }}</td>
                <td>{{ c.primary ? 'PK' : '' }}</td>
                <td>{{ c.defaultValue ?? '' }}</td>
                <td class="act">
                  <button class="mini-link danger" @click="dropColumn(c)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h4>索引</h4>
          <p v-if="!detail.indexes.length" class="tip">没有索引</p>
          <table v-else class="meta-grid">
            <thead>
              <tr>
                <th>名称</th>
                <th>唯一</th>
                <th>列</th>
                <th class="act">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in detail.indexes" :key="i.name">
                <td>{{ i.name }}</td>
                <td>{{ i.unique ? 'UNIQUE' : '' }}</td>
                <td>{{ Array.isArray(i.columns) ? i.columns.join(', ') : i.columns }}</td>
                <td class="act">
                  <button class="mini-link danger" @click="dropIndex(i)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h4>DDL</h4>
          <pre class="ddl">{{ detail.ddl || '（无）' }}</pre>
        </section>
      </template>
    </div>

  </div>
</template>

<style scoped>
.table-tab {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.tabs-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
}
.tabs-bar > button {
  padding: 2px 10px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.tabs-bar > button.on {
  background: var(--panel-bg);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.name {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini {
  font-size: 11px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.op {
  font-size: 11px;
  color: var(--success);
}
.actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}
.link {
  font-size: 11.5px;
  color: var(--accent);
}
.filter-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.filter {
  flex: 1;
  min-width: 0;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.filter:focus {
  border-color: var(--accent);
}
.select {
  flex: none;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
}
.pager {
  display: flex;
  gap: 6px;
}
.tbtn {
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 11.5px;
  white-space: nowrap;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn:disabled {
  opacity: 0.4;
  cursor: default;
}
.tbtn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.add-row {
  flex: none;
  padding: 8px 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 122, 255, 0.04);
}
.add-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 600;
}
.add-tip {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--text-dim);
}
.add-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0 8px;
}
.add-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10.5px;
  color: var(--text-dim);
}
.add-field input {
  width: 130px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.add-field input:focus {
  border-color: var(--accent);
}
.add-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.structure-hint {
  margin: 0 0 10px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(10, 132, 255, 0.06);
  font-size: 11.5px;
  color: var(--text-dim);
}
.mini-link {
  font-size: 11px;
  color: var(--accent);
}
.mini-link.danger {
  color: var(--danger);
}
th.act,
td.act {
  width: 58px;
  text-align: center;
}
.grid-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
.grid {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: nowrap;
}
.cell {
  display: inline-block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
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
  background: var(--surface-4);
  font-weight: 600;
}
.grid th.pk {
  color: var(--warn);
}
.grid th.sortable {
  cursor: pointer;
  user-select: none;
}
.grid th.sortable:hover {
  background: #f0f0f2;
}
.grid th.sorted {
  color: var(--accent);
}
.arrow {
  font-size: 8px;
}
.grid tbody tr:hover {
  background: rgba(10, 132, 255, 0.05);
}
.grid .rn {
  color: var(--text-dim);
  text-align: right;
  background: var(--fill-1);
}
.grid td.null {
  color: var(--text-dim);
  font-style: italic;
}

.grid th.op-col,
.grid td.op-col {
  position: sticky;
  right: 0;
  z-index: 2;
  background: var(--panel-bg);
  box-shadow: -6px 0 8px rgba(0, 0, 0, 0.04);
}
.grid th.op-col {
  z-index: 3;
  background: var(--surface-4);
}
.grid td.editing {
  padding: 2px 4px;
  background: var(--panel-bg);
}
.cell-input {
  width: 100%;
  min-width: 80px;
  padding: 3px 6px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.op-col {
  width: 30px;
  text-align: center;
}
.row-del {
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.55;
}
.grid tbody tr:hover .row-del {
  opacity: 1;
}
.row-del:hover {
  color: var(--danger);
}
.empty {
  padding: 40px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-dim);
}
.err-text {
  color: var(--danger);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.error-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  background: rgba(255, 59, 48, 0.06);
  color: var(--danger);
  font-size: 11.5px;
}
.hint-bar {
  flex: none;
  margin: 0;
  padding: 5px 10px;
  font-size: 10.5px;
  color: var(--text-dim);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}
.structure {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
}
.structure-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.structure section {
  margin-bottom: 16px;
}
h4 {
  margin: 0 0 6px;
  font-size: 12px;
}
.meta-grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.meta-grid th,
.meta-grid td {
  padding: 4px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  text-align: left;
}
.meta-grid th {
  background: var(--fill-1);
  font-weight: 600;
}
.ddl {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--fill-1);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}
.tip {
  margin: 6px 0;
  font-size: 11.5px;
  color: var(--text-dim);
}
</style>
