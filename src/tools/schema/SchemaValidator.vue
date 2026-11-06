<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
import { sampleFromSchema, validate } from './validate.js'

const STORAGE_KEY = 'toolbox:schema-validate'
const saved = readJSON(STORAGE_KEY)

const DEFAULT_SCHEMA = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["code", "data"],
  "properties": {
    "code": { "type": "integer", "minimum": 0 },
    "message": { "type": "string", "maxLength": 50 },
    "data": {
      "type": "object",
      "required": ["list"],
      "properties": {
        "total": { "type": "integer", "minimum": 0 },
        "list": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "name"],
            "properties": {
              "id": { "type": "integer" },
              "name": { "type": "string", "minLength": 1 },
              "role": { "enum": ["admin", "user"] }
            },
            "additionalProperties": false
          }
        }
      }
    }
  }
}`

const DEFAULT_DATA = `{
  "code": 0,
  "message": "ok",
  "data": {
    "total": 1,
    "list": [
      { "id": 1, "name": "张三", "role": "admin" }
    ]
  }
}`

const form = reactive({
  schema: saved.schema ?? DEFAULT_SCHEMA,
  data: saved.data ?? DEFAULT_DATA,
})

const parsed = computed(() => {
  try {
    return { schema: JSON.parse(form.schema), error: '' }
  } catch (e) {
    return { schema: null, error: `Schema JSON 解析失败：${e.message}` }
  }
})

const dataParsed = computed(() => {
  try {
    return { data: JSON.parse(form.data), error: '' }
  } catch (e) {
    return { data: null, error: `数据 JSON 解析失败：${e.message}` }
  }
})

const result = computed(() => {
  if (parsed.value.error) return { valid: false, errors: [], fatal: parsed.value.error }
  if (dataParsed.value.error) return { valid: false, errors: [], fatal: dataParsed.value.error }

  const res = validate(parsed.value.schema, dataParsed.value.data)
  return { ...res, fatal: '' }
})

const { copied, copy } = useCopy()

function fillSample() {
  if (!parsed.value.schema) return
  const sample = sampleFromSchema(parsed.value.schema)
  form.data = JSON.stringify(sample, null, 2)
}

function formatBoth() {
  try {
    form.schema = JSON.stringify(JSON.parse(form.schema), null, 2)
  } catch {
    /* 保持原样 */
  }
  try {
    form.data = JSON.stringify(JSON.parse(form.data), null, 2)
  } catch {
    /* 保持原样 */
  }
}

function copyErrors() {
  const lines = result.value.errors.map((e) => `${e.path}  ${e.message}`)
  copy(lines.join('\n'), 'errors')
}

const stats = computed(() => ({
  errors: result.value.errors.length,
  shown: Math.min(result.value.errors.length, 50),
}))

let saveTimer = null
watch(
  form,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...form }))
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="schema">
    <div class="toolbar">
      <span class="spacer" />
      <span v-if="result.fatal" class="stat bad">{{ result.fatal }}</span>
      <span v-else-if="result.valid" class="stat ok">✓ 校验通过</span>
      <span v-else class="stat bad">{{ stats.errors }} 处不符合</span>

      <button class="btn" @click="fillSample">按 Schema 生成示例</button>
      <button class="btn" @click="formatBoth">格式化</button>
      <button class="btn" :disabled="!result.errors.length" @click="copyErrors">
        {{ copied === 'errors' ? '已复制' : '复制错误' }}
      </button>
    </div>

    <div class="body">
      <section class="pane">
        <header>
          <span class="pane-title">JSON Schema</span>
          <span class="pane-meta">draft-07 / 2020-12 常用关键字</span>
        </header>
        <textarea v-model="form.schema" class="code" spellcheck="false" />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">待校验数据</span>
          <span class="pane-meta">JSON</span>
        </header>
        <textarea v-model="form.data" class="code" spellcheck="false" />
      </section>

      <section class="pane result">
        <header>
          <span class="pane-title">校验结果</span>
          <span class="pane-meta">最多显示 50 条</span>
        </header>

        <div v-if="result.fatal" class="fatal">{{ result.fatal }}</div>

        <div v-else-if="result.valid" class="passed">
          <span class="tick">✓</span>
          <p>数据完全符合 Schema</p>
        </div>

        <div v-else class="errors">
          <div v-for="(item, i) in result.errors.slice(0, 50)" :key="i" class="error-row">
            <code class="path">{{ item.path }}</code>
            <span class="msg">{{ item.message }}</span>
          </div>
        </div>
      </section>
    </div>

    <p class="hint">
      支持 type / required / properties / items / enum / const / minimum / maximum /
      minLength / maxLength / pattern / minItems / maxItems / uniqueItems / additionalProperties /
      anyOf / oneOf / allOf / not。路径用 <code>$.data.list[0].id</code> 形式，能直接定位到出错字段。
    </p>
  </div>
</template>

<style scoped>
.schema {
  height: 100%;
  min-height: 0;
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
.chk {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
  cursor: pointer;
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 11px;
  font-weight: 500;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stat.ok {
  color: var(--success);
}
.stat.bad {
  color: var(--danger);
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
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
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
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
}
.fatal {
  padding: 12px;
  font-size: 11px;
  color: var(--danger);
}
.passed {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.tick {
  font-size: 26px;
  color: var(--success);
}
.passed p {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-dim);
}
.errors {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.error-row {
  padding: 6px 8px;
  border-radius: 7px;
  background: var(--danger-soft);
}
.path {
  display: block;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  color: var(--danger);
  word-break: break-all;
}
.msg {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-dim);
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
