<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ConnectionDialog from './ConnectionDialog.vue'
import ObjectTree from './ObjectTree.vue'
import QueryTab from './QueryTab.vue'
import TableTab from './TableTab.vue'
import ErDiagram from './ErDiagram.vue'
import CreateTableDialog from './CreateTableDialog.vue'
import AddColumnDialog from './AddColumnDialog.vue'
import CreateIndexDialog from './CreateIndexDialog.vue'

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY',
  'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS',
  'IN', 'LIKE', 'BETWEEN', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'UNION', 'ALL', 'EXISTS', 'PRIMARY', 'KEY', 'DEFAULT',
  'REFERENCES', 'FOREIGN',
]

const STORAGE_KEY = 'toolbox:db:connections'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const connections = ref(saved.list ?? [])
const activeId = ref(saved.activeId ?? saved.list?.[0]?.id ?? '')
const databases = ref([])
const currentDb = ref('')
const tables = ref([])
const treeLoading = ref(false)
const connecting = ref(false)
const statusMessage = ref('')
const failed = ref(false)
const dialogVisible = ref(false)
const editing = ref(null)
const createTableVisible = ref(false)
const addColumnVisible = ref(false)
const createIndexVisible = ref(false)
const actionTable = ref(null)
const treeRef = ref(null)
const schemaVersion = ref(0)

const tabs = ref([{ key: 'q-init', kind: 'query', title: '查询 1', sql: 'SELECT 1 AS ok;' }])
const activeKey = ref('q-init')
const keywords = ref(SQL_KEYWORDS)
const txEnabled = ref(saved.txEnabled ?? false)
const txGroupSize = ref(saved.txGroupSize ?? 10)
const txCount = ref(0)

const activeConn = computed(() => connections.value.find((c) => c.id === activeId.value) || null)
const activeTab = computed(() => tabs.value.find((t) => t.key === activeKey.value) || null)

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      list: connections.value,
      activeId: activeId.value,
      txEnabled: txEnabled.value,
      txGroupSize: txGroupSize.value,
    }),
  )
}

watch([connections, activeId, txEnabled, txGroupSize], persist, { deep: true })

async function api(action, payload = {}) {
  const conn = activeConn.value
  if (!conn) throw new Error('请先选择连接')
  const body = {
    ...conn,
    ...payload,
    database: payload.database || currentDb.value || conn.database,
  }
  if (txEnabled.value) body.tx = { enabled: true, groupSize: txGroupSize.value }

  const res = await fetch(`/api/db/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({ ok: false, error: '网关无响应，请先在 server 目录执行 npm start' }))
  if (!data.ok) throw new Error(data.error)

  if (data.tx) txCount.value = data.tx.count
  else if (txEnabled.value) txCount.value = 0
  return data
}

async function txCall(action) {
  const conn = activeConn.value
  if (!conn) throw new Error('请先选择连接')
  const res = await fetch(`/api/db/tx/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...conn,
      database: currentDb.value || conn.database,
      tx: { enabled: true, groupSize: txGroupSize.value },
    }),
  })
  const data = await res.json().catch(() => ({ ok: false, error: '网关无响应' }))
  if (!data.ok) throw new Error(data.error)
  txCount.value = data.tx?.count ?? 0
  return data
}

async function rollbackTx() {
  try {
    const data = await txCall('rollback')
    statusMessage.value = data.message
    failed.value = false
    schemaVersion.value += 1
  } catch (e) {
    statusMessage.value = e.message
    failed.value = true
  }
}

async function commitTx() {
  try {
    const data = await txCall('commit')
    statusMessage.value = data.message
    failed.value = false
    schemaVersion.value += 1
  } catch (e) {
    statusMessage.value = e.message
    failed.value = true
  }
}

// 关闭事务模式时提交剩余语句并释放会话
watch(txEnabled, async (on) => {
  if (on) {
    txCount.value = 0
    statusMessage.value = `事务模式已开启：每 ${txGroupSize.value} 条写语句自动提交，可随时回滚本组`
    failed.value = false
    return
  }
  if (!activeConn.value) return
  try {
    await txCall('close')
    statusMessage.value = '事务模式已关闭，剩余语句已提交'
  } catch {
    /* 没有进行中的事务时忽略 */
  }
  txCount.value = 0
})

async function loadTables() {
  if (!activeConn.value) return
  treeLoading.value = true
  try {
    const data = await api('tables', { database: currentDb.value })
    tables.value = data.tables
  } catch (e) {
    tables.value = []
    statusMessage.value = e.message
    failed.value = true
  } finally {
    treeLoading.value = false
  }
}

async function connect() {
  if (!activeConn.value || connecting.value) return
  connecting.value = true
  failed.value = false
  statusMessage.value = '连接中…'
  try {
    await api('test')
    const data = await api('databases')
    databases.value = data.databases
    currentDb.value = activeConn.value.database || databases.value[0] || ''
    await loadTables()
    statusMessage.value = `已连接 · ${tables.value.length} 个对象`
    buildKeywords()
  } catch (e) {
    failed.value = true
    statusMessage.value = e.message
    tables.value = []
  } finally {
    connecting.value = false
  }
}

async function switchDatabase() {
  tables.value = []
  await loadTables()
  statusMessage.value = `切换数据库 · ${tables.value.length} 个对象`
}

function openNew() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(conn) {
  editing.value = conn
  dialogVisible.value = true
}

function saveConnection(payload) {
  const before = activeId.value
  if (payload.id) {
    const target = connections.value.find((c) => c.id === payload.id)
    if (target) Object.assign(target, payload)
  } else {
    const created = { ...payload, id: Math.random().toString(36).slice(2, 10) }
    connections.value.push(created)
    activeId.value = created.id
  }
  dialogVisible.value = false
  databases.value = []
  tables.value = []
  statusMessage.value = ''
  // activeId 变化时 watch 会触发连接，这里只处理「编辑当前连接」的情况
  if (activeId.value === before) connect()
}

function removeConnection(conn) {
  connections.value = connections.value.filter((c) => c.id !== conn.id)
  if (activeId.value === conn.id) {
    activeId.value = connections.value[0]?.id ?? ''
    tables.value = []
    databases.value = []
    statusMessage.value = ''
  }
}

function addQuery() {
  const index = tabs.value.filter((t) => t.kind === 'query').length + 1
  const key = `q-${Date.now()}`
  tabs.value.push({ key, kind: 'query', title: `查询 ${index}`, sql: '' })
  activeKey.value = key
}

function closeTab(tab) {
  if (tabs.value.length === 1) return
  const index = tabs.value.findIndex((t) => t.key === tab.key)
  tabs.value = tabs.value.filter((t) => t.key !== tab.key)
  if (activeKey.value === tab.key) {
    activeKey.value = tabs.value[Math.max(0, index - 1)].key
  }
}

async function buildKeywords() {
  const names = tables.value.map((t) => t.name)
  keywords.value = [...new Set([...SQL_KEYWORDS, ...names])]
  for (const table of tables.value.slice(0, 15)) {
    try {
      const data = await api('columns', { schema: table.schema, table: table.name })
      keywords.value = [...new Set([...keywords.value, ...data.columns.map((c) => c.name)])]
    } catch {
      /* 忽略单表失败 */
    }
  }
}

async function onTableCreated(name) {
  await loadTables()
  buildKeywords()
  statusMessage.value = `已创建表 ${name}`
}

function onSchemaActionDone(message) {
  statusMessage.value = message
  schemaVersion.value += 1
  if (actionTable.value) treeRef.value?.invalidate(actionTable.value)
}

function quoteName(table) {
  const type = activeConn.value?.type || 'mysql'
  if (type === 'mysql') return `\`${table.schema}\`.\`${table.name}\``
  if (type === 'sqlite') return `"${table.name}"`
  return `"${table.schema}"."${table.name}"`
}

async function onTreeAction({ type, table }) {
  if (type === 'create-table') {
    createTableVisible.value = true
    return
  }
  if (type === 'open' && table) {
    openTable(table)
    return
  }
  if (!table) return

  if (type === 'add-column') {
    actionTable.value = table
    addColumnVisible.value = true
    return
  }
  if (type === 'add-index') {
    actionTable.value = table
    createIndexVisible.value = true
    return
  }
  if (type === 'drop-table') {
    if (!window.confirm(`确定删除表 ${table.name}？此操作不可撤销，表内数据会一并删除。`)) return
    try {
      await api('query', { sql: `DROP TABLE ${quoteName(table)}` })
      tabs.value = tabs.value.filter((t) => !(t.kind === 'table' && t.table?.name === table.name))
      if (!tabs.value.some((t) => t.key === activeKey.value)) {
        activeKey.value = tabs.value[0]?.key || ''
      }
      if (!tabs.value.length) addQuery()
      await loadTables()
      statusMessage.value = `已删除表 ${table.name}`
    } catch (e) {
      failed.value = true
      statusMessage.value = e.message
    }
  }
}

function openEr() {
  const key = 'er-main'
  if (!tabs.value.some((t) => t.key === key)) {
    tabs.value.push({ key, kind: 'er', title: 'ER 图' })
  }
  activeKey.value = key
}

function openTable(table) {
  const key = `t-${table.schema}.${table.name}`
  if (!tabs.value.some((t) => t.key === key)) {
    tabs.value.push({ key, kind: 'table', title: table.name, table })
  }
  activeKey.value = key
}

watch(activeId, () => {
  databases.value = []
  currentDb.value = ''
  tables.value = []
  statusMessage.value = ''
  failed.value = false
  if (activeConn.value) connect()
})

onMounted(() => {
  if (activeConn.value) connect()
})
</script>

<template>
  <div class="db-tool">
    <div class="bar">
      <select v-model="activeId" class="select conn-select">
        <option v-if="!connections.length" value="">未保存连接</option>
        <option v-for="c in connections" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <button class="tbtn" @click="openNew">＋ 连接</button>
      <button class="tbtn" :disabled="!activeConn || connecting" @click="connect">
        {{ connecting ? '连接中…' : '连接' }}
      </button>

      <select
        v-if="databases.length > 1"
        v-model="currentDb"
        class="select db-select"
        title="切换数据库"
        @change="switchDatabase"
      >
        <option v-for="d in databases" :key="d" :value="d">{{ d }}</option>
      </select>

      <div class="tx" :class="{ on: txEnabled }">
        <label class="tx-label" title="每条 SQL 计入当前组，满一组自动提交">
          <input v-model="txEnabled" type="checkbox" />
          事务
        </label>
        <template v-if="txEnabled">
          <input
            v-model.number="txGroupSize"
            class="tx-size"
            type="number"
            min="1"
            max="200"
            title="每组语句数"
          />
          <span class="tx-count" title="当前组已执行 / 每组条数">{{ txCount }}/{{ txGroupSize }}</span>
          <button class="link" title="回滚本组未提交的语句" @click="rollbackTx">回滚</button>
          <button class="link" title="立即提交本组" @click="commitTx">提交</button>
        </template>
      </div>

      <span class="status" :class="{ err: failed }">{{ statusMessage }}</span>

      <button class="tbtn" @click="addQuery">＋ 查询</button>
      <button class="tbtn" @click="openEr">ER 图</button>
    </div>

    <div class="body">
      <div class="side">
        <div class="panel conns">
          <div class="panel-head">
            <span class="panel-title">连接</span>
            <span class="mini">{{ connections.length }}</span>
          </div>
          <div class="conn-list">
            <div
              v-for="c in connections"
              :key="c.id"
              class="conn"
              :class="{ active: c.id === activeId }"
              @click="activeId = c.id"
            >
              <span class="type">{{ c.type === 'postgres' ? 'PG' : c.type === 'sqlite' ? 'SQ' : 'MY' }}</span>
              <span class="conn-name">{{ c.name }}</span>
              <button class="icon-btn" title="编辑" @click.stop="openEdit(c)">✎</button>
              <button class="icon-btn" title="删除" @click.stop="removeConnection(c)">✕</button>
            </div>
            <p v-if="!connections.length" class="tip">还没有连接，点上方「＋ 连接」新建</p>
          </div>
        </div>

        <div class="panel tree-panel">
          <div class="panel-head">
            <span class="panel-title">对象</span>
            <span class="mini">{{ tables.length }}</span>
            <button class="link" :disabled="!activeConn" @click="createTableVisible = true">
              ＋ 表
            </button>
          </div>
          <ObjectTree
            ref="treeRef"
            :tables="tables"
            :loading="treeLoading"
            :api="api"
            :active-table="activeTab?.table || null"
            @open="openTable"
            @action="onTreeAction"
          />
        </div>
      </div>

      <div class="content">
        <div class="tabbar">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="tab"
            :class="{ on: t.key === activeKey }"
            @click="activeKey = t.key"
          >
            <span class="tab-icon">{{ t.kind === 'table' ? '▤' : '⌘' }}</span>
            <span class="tab-title">{{ t.title }}</span>
            <span class="x" @click.stop="closeTab(t)">✕</span>
          </button>
        </div>

        <div class="tab-content">
          <div v-for="t in tabs" v-show="t.key === activeKey" :key="t.key" class="slot">
            <QueryTab
              v-if="t.kind === 'query'"
              :api="api"
              :initial-sql="t.sql"
              :keywords="keywords"
            />
            <ErDiagram v-else-if="t.kind === 'er'" :api="api" />
            <TableTab
              v-else
              :api="api"
              :table="t.table"
              :conn-type="activeConn?.type || 'mysql'"
              :schema-version="schemaVersion"
            />
          </div>
        </div>
      </div>
    </div>

    <ConnectionDialog
      :visible="dialogVisible"
      :connection="editing"
      @close="dialogVisible = false"
      @save="saveConnection"
    />

    <CreateTableDialog
      :visible="createTableVisible"
      :api="api"
      :conn-type="activeConn?.type || 'mysql'"
      :database="currentDb"
      @close="createTableVisible = false"
      @created="onTableCreated"
    />

    <AddColumnDialog
      :visible="addColumnVisible"
      :api="api"
      :conn-type="activeConn?.type || 'mysql'"
      :schema="actionTable?.schema || ''"
      :table="actionTable?.name || ''"
      @close="addColumnVisible = false"
      @created="onSchemaActionDone('列已新增')"
    />

    <CreateIndexDialog
      :visible="createIndexVisible"
      :api="api"
      :conn-type="activeConn?.type || 'mysql'"
      :schema="actionTable?.schema || ''"
      :table="actionTable?.name || ''"
      @close="createIndexVisible = false"
      @created="onSchemaActionDone('索引已创建')"
    />
  </div>
</template>

<style scoped>
.db-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.select {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  outline: none;
}
.conn-select {
  flex: none;
  width: 150px;
}
.db-select {
  flex: none;
  max-width: 150px;
}
.tbtn {
  flex: none;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn:disabled {
  opacity: 0.45;
  cursor: default;
}
.tx {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.tx.on {
  background: rgba(255, 149, 0, 0.1);
}
.tx-label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.tx.on .tx-label {
  color: #b25000;
  font-weight: 500;
}
.tx-size {
  width: 44px;
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
  text-align: center;
}
.tx-count {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: #b25000;
  font-variant-numeric: tabular-nums;
}
.tx .link {
  margin-left: 0;
}
.status {
  font-size: 11.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status.err {
  color: #d70015;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 230px 1fr;
  gap: 10px;
}
.side {
  min-height: 0;
  display: grid;
  grid-template-rows: 160px 1fr;
  gap: 10px;
}
.panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.panel-head {
  flex: none;
  display: flex;
  align-items: center;
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
.link {
  margin-left: 8px;
  font-size: 11.5px;
  color: var(--accent);
}
.link:disabled {
  opacity: 0.4;
  cursor: default;
}
.conn-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 6px;
}
.conn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 5px;
  cursor: pointer;
}
.conn:hover {
  background: var(--hover);
}
.conn.active {
  background: rgba(10, 132, 255, 0.1);
}
.type {
  flex: none;
  width: 22px;
  padding: 1px 0;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 9px;
  text-align: center;
  color: var(--text-dim);
}
.conn-name {
  flex: 1;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.icon-btn {
  flex: none;
  width: 18px;
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0;
}
.conn:hover .icon-btn {
  opacity: 1;
}
.icon-btn:hover {
  color: var(--accent);
}
.tip {
  margin: 10px 6px;
  font-size: 11.5px;
  color: var(--text-dim);
  line-height: 1.6;
}
.tree-panel {
  min-height: 0;
}
.content {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tabbar {
  flex: none;
  display: flex;
  gap: 4px;
  overflow-x: auto;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  color: var(--text-dim);
  white-space: nowrap;
}
.tab.on {
  background: #fff;
  color: var(--text);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.06);
}
.tab-icon {
  font-size: 10px;
}
.x {
  font-size: 9px;
  opacity: 0.6;
}
.x:hover {
  opacity: 1;
  color: #d70015;
}
.tab-content {
  flex: 1;
  min-height: 0;
  position: relative;
}
.slot {
  height: 100%;
  min-height: 0;
  min-width: 0;
}
</style>
