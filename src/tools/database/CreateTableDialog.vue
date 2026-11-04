<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  api: { type: Function, required: true },
  connType: { type: String, default: 'mysql' },
  database: { type: String, default: '' },
})
const emit = defineEmits(['close', 'created'])

const TYPE_HINTS = {
  mysql: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DECIMAL(10,2)', 'DATETIME', 'TINYINT(1)', 'JSON'],
  postgres: ['INTEGER', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'NUMERIC(10,2)', 'TIMESTAMP', 'BOOLEAN', 'JSONB'],
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
}

const tableName = ref('')
const columns = ref([{ name: 'id', type: 'INTEGER', primary: true, notNull: true, autoIncrement: true, defaultValue: '' }])
const error = ref('')
const saving = ref(false)

const quote = (name) => (props.connType === 'mysql' ? `\`${name}\`` : `"${name}"`)

const tableRef = computed(() =>
  props.connType === 'sqlite' || !props.database
    ? quote(tableName.value || 'table_name')
    : `${quote(props.database)}.${quote(tableName.value || 'table_name')}`,
)

function columnSql(c) {
  const auto = c.autoIncrement
  let type = c.type || 'TEXT'
  if (auto) {
    type = props.connType === 'postgres' ? 'BIGSERIAL' : props.connType === 'sqlite' ? 'INTEGER' : 'INT'
  }

  let sql = `${quote(c.name)} ${type}`

  if (props.connType === 'sqlite' && auto) return `${sql} PRIMARY KEY AUTOINCREMENT`
  if (auto) sql += ' NOT NULL AUTO_INCREMENT'
  else if (c.notNull || c.primary) sql += ' NOT NULL'
  if (c.defaultValue) sql += ` DEFAULT ${c.defaultValue}`
  return sql
}

const sql = computed(() => {
  const valid = columns.value.filter((c) => c.name.trim())
  if (!tableName.value.trim() || !valid.length) return ''

  const parts = valid.map(columnSql)
  const pks = valid
    .filter((c) => c.primary && !(c.autoIncrement && props.connType === 'sqlite'))
    .map((c) => quote(c.name))
  if (pks.length) parts.push(`PRIMARY KEY (${pks.join(', ')})`)

  const suffix = props.connType === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : ''
  return `CREATE TABLE ${tableRef.value} (\n  ${parts.join(',\n  ')}\n)${suffix}`
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    tableName.value = ''
    columns.value = [
      { name: 'id', type: 'INTEGER', primary: true, notNull: true, autoIncrement: true, defaultValue: '' },
    ]
    error.value = ''
  },
)

function addColumn() {
  columns.value.push({
    name: '',
    type: TYPE_HINTS[props.connType]?.[2] || 'TEXT',
    primary: false,
    notNull: false,
    autoIncrement: false,
    defaultValue: '',
  })
}

async function submit() {
  if (!sql.value) {
    error.value = '请填写表名和至少一个列'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await props.api('query', { sql: sql.value })
    emit('created', tableName.value.trim())
    emit('close')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="visible" class="mask" @click.self="emit('close')">
    <div class="dialog">
      <header>
        <span>新建表</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div class="content">
        <div class="field">
          <label>表名</label>
          <input v-model="tableName" placeholder="如 sys_notice" spellcheck="false" />
        </div>

        <div class="cols-head">
          <span>列定义</span>
          <button class="link" @click="addColumn">＋ 添加列</button>
        </div>

        <div v-for="(c, i) in columns" :key="i" class="col-row">
          <input v-model="c.name" class="c-name" placeholder="列名" spellcheck="false" />
          <input
            v-model="c.type"
            class="c-type"
            :list="`types-${connType}`"
            placeholder="类型"
            spellcheck="false"
          />
          <label class="chk" title="主键"><input v-model="c.primary" type="checkbox" />PK</label>
          <label class="chk" title="非空"><input v-model="c.notNull" type="checkbox" />非空</label>
          <label class="chk" title="自增"><input v-model="c.autoIncrement" type="checkbox" />自增</label>
          <input v-model="c.defaultValue" class="c-default" placeholder="默认值" spellcheck="false" />
          <button class="del" :disabled="columns.length <= 1" @click="columns.splice(i, 1)">✕</button>
        </div>

        <datalist :id="`types-${connType}`">
          <option v-for="t in TYPE_HINTS[connType]" :key="t" :value="t" />
        </datalist>

        <p v-if="error" class="err">{{ error }}</p>

        <div class="preview">
          <div class="preview-head">将执行</div>
          <pre>{{ sql || '-- 填写表名与列后显示 SQL' }}</pre>
        </div>
      </div>

      <footer>
        <button class="tbtn" @click="emit('close')">取消</button>
        <button class="tbtn primary" :disabled="saving || !sql" @click="submit">
          {{ saving ? '创建中…' : '创建表' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fill-3);
}
.dialog {
  width: 760px;
  max-width: 94vw;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--panel-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
header {
  flex: none;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  font-size: 13px;
  font-weight: 600;
}
.close {
  margin-left: auto;
  color: var(--text-dim);
}
.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}
.field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.field label {
  flex: none;
  width: 56px;
  font-size: 12px;
  color: var(--text-dim);
}
.field input {
  flex: 1;
  min-width: 0;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  font-size: 12.5px;
}
.field input:focus {
  border-color: var(--accent);
}
.cols-head {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.link {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--accent);
}
.col-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.col-row input {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.col-row input:focus {
  border-color: var(--accent);
}
.c-name {
  width: 130px;
}
.c-type {
  width: 140px;
}
.c-default {
  flex: 1;
  min-width: 70px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.del {
  flex: none;
  width: 22px;
  color: var(--text-dim);
}
.del:hover:not(:disabled) {
  color: var(--danger);
}
.del:disabled {
  opacity: 0.3;
  cursor: default;
}
.err {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--danger);
}
.preview {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.preview-head {
  padding: 5px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  font-size: 11px;
  color: var(--text-dim);
}
.preview pre {
  margin: 0;
  padding: 10px 12px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
}
footer {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.tbtn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.tbtn.primary:hover:not(:disabled) {
  background: var(--accent-strong);
}
.tbtn:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
