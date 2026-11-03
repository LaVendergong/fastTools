<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  api: { type: Function, required: true },
  connType: { type: String, default: 'mysql' },
  schema: { type: String, default: '' },
  table: { type: String, default: '' },
})
const emit = defineEmits(['close', 'created'])

const TYPE_HINTS = {
  mysql: ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DECIMAL(10,2)', 'DATETIME', 'TINYINT(1)', 'JSON'],
  postgres: ['INTEGER', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'NUMERIC(10,2)', 'TIMESTAMP', 'BOOLEAN', 'JSONB'],
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
}

const name = ref('')
const type = ref('VARCHAR(255)')
const notNull = ref(false)
const defaultValue = ref('')
const saving = ref(false)
const error = ref('')

const quote = (n) => (props.connType === 'mysql' ? `\`${n}\`` : `"${n}"`)

const tableRef = computed(() =>
  props.connType === 'sqlite' || !props.schema
    ? quote(props.table)
    : `${quote(props.schema)}.${quote(props.table)}`,
)

const sql = computed(() => {
  if (!name.value.trim()) return ''
  let def = `${quote(name.value.trim())} ${type.value || 'TEXT'}`
  if (notNull.value) def += ' NOT NULL'
  if (defaultValue.value) def += ` DEFAULT ${defaultValue.value}`
  return `ALTER TABLE ${tableRef.value} ADD COLUMN ${def}`
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    name.value = ''
    type.value = props.connType === 'postgres' ? 'VARCHAR(255)' : 'VARCHAR(255)'
    notNull.value = false
    defaultValue.value = ''
    error.value = ''
  },
)

async function submit() {
  if (!sql.value) {
    error.value = '请填写列名'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await props.api('query', { sql: sql.value })
    emit('created')
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
        <span>新增列 · {{ table }}</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div class="content">
        <div class="field">
          <label>列名</label>
          <input v-model="name" spellcheck="false" placeholder="如 remark" />
        </div>
        <div class="field">
          <label>类型</label>
          <input v-model="type" :list="`add-types-${connType}`" spellcheck="false" />
        </div>
        <div class="field">
          <label>默认值</label>
          <input v-model="defaultValue" spellcheck="false" placeholder="如 0 或 '空字符串'" />
        </div>
        <div class="field">
          <label>约束</label>
          <label class="chk"><input v-model="notNull" type="checkbox" />非空（NOT NULL）</label>
        </div>

        <p class="tip">
          SQLite 的 ADD COLUMN 不支持给已有数据添加「非空且无默认值」的列，若报错请填默认值。
        </p>

        <datalist :id="`add-types-${connType}`">
          <option v-for="t in TYPE_HINTS[connType]" :key="t" :value="t" />
        </datalist>

        <p v-if="error" class="err">{{ error }}</p>

        <div class="preview">
          <div class="preview-head">将执行</div>
          <pre>{{ sql || '-- 填写列名后显示 SQL' }}</pre>
        </div>
      </div>

      <footer>
        <button class="tbtn" @click="emit('close')">取消</button>
        <button class="tbtn primary" :disabled="saving || !sql" @click="submit">
          {{ saving ? '提交中…' : '新增列' }}
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
  background: rgba(0, 0, 0, 0.28);
}
.dialog {
  width: 520px;
  max-width: 94vw;
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
header {
  flex: none;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
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
  margin-bottom: 10px;
}
.field label {
  flex: none;
  width: 56px;
  font-size: 12px;
  color: var(--text-dim);
}
.field input:not([type='checkbox']) {
  flex: 1;
  min-width: 0;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.field input:focus {
  border-color: var(--accent);
}
.chk {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  cursor: pointer;
  width: auto !important;
}
.tip {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-dim);
}
.err {
  margin: 8px 0 0;
  font-size: 12px;
  color: #d70015;
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
  background: rgba(0, 0, 0, 0.015);
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
  background: #0071e3;
}
.tbtn:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
