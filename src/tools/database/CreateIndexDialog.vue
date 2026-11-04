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

const indexName = ref('')
const unique = ref(false)
const columns = ref([])
const selected = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const quote = (name) => (props.connType === 'mysql' ? `\`${name}\`` : `"${name}"`)

const tableRef = computed(() =>
  props.connType === 'sqlite' || !props.schema
    ? quote(props.table)
    : `${quote(props.schema)}.${quote(props.table)}`,
)

const sql = computed(() => {
  const cols = selected.value.map(quote)
  if (!indexName.value.trim() || !cols.length) return ''
  return `CREATE ${unique.value ? 'UNIQUE ' : ''}INDEX ${quote(indexName.value.trim())} ON ${tableRef.value} (${cols.join(', ')})`
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    unique.value = false
    selected.value = []
    columns.value = []
    error.value = ''
    indexName.value = `idx_${props.table}_`
    loading.value = true
    try {
      const data = await props.api('columns', { schema: props.schema, table: props.table })
      columns.value = data.columns
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  },
)

watch(selected, (cols) => {
  const suffix = cols.join('_')
  const prefix = `idx_${props.table}_`
  if (!indexName.value.startsWith(prefix) || indexName.value === prefix) {
    indexName.value = cols.length ? `${prefix}${suffix}` : prefix
  }
})

async function submit() {
  if (!sql.value) {
    error.value = '请填写索引名并至少勾选一列'
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
        <span>新建索引 · {{ table }}</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div class="content">
        <div class="field">
          <label>索引名</label>
          <input v-model="indexName" spellcheck="false" placeholder="idx_table_column" />
        </div>
        <div class="field">
          <label>类型</label>
          <label class="chk"><input v-model="unique" type="checkbox" />唯一索引（UNIQUE）</label>
        </div>

        <div class="cols-head">选择列（可多选，顺序即联合索引顺序）</div>
        <p v-if="loading" class="tip">读取列…</p>
        <div v-else class="cols">
          <label v-for="c in columns" :key="c.name" class="col-item">
            <input v-model="selected" type="checkbox" :value="c.name" />
            <span class="col-name">{{ c.name }}</span>
            <span class="col-type">{{ c.type }}</span>
          </label>
          <p v-if="!columns.length" class="tip">没有列</p>
        </div>

        <p v-if="error" class="err">{{ error }}</p>

        <div class="preview">
          <div class="preview-head">将执行</div>
          <pre>{{ sql || '-- 填写索引名并勾选列后显示 SQL' }}</pre>
        </div>
      </div>

      <footer>
        <button class="tbtn" @click="emit('close')">取消</button>
        <button class="tbtn primary" :disabled="saving || !sql" @click="submit">
          {{ saving ? '创建中…' : '创建索引' }}
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
  width: 560px;
  max-width: 94vw;
  max-height: 84vh;
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
  width: auto !important;
  font-size: 12px;
  cursor: pointer;
}
.cols-head {
  margin: 6px 0 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.cols {
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
}
.col-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 2px;
  font-size: 12px;
  cursor: pointer;
}
.col-name {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.col-type {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-dim);
}
.tip {
  margin: 8px 0;
  font-size: 11.5px;
  color: var(--text-dim);
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
