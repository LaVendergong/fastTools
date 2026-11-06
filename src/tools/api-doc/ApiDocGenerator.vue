<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
import { buildMarkdown } from './fields.js'

const STORAGE_KEY = 'toolbox:apidoc'
const saved = readJSON(STORAGE_KEY)

const SAMPLE = JSON.stringify(
  {
    code: 0,
    message: 'ok',
    data: {
      total: 2,
      list: [
        {
          userId: 1,
          userName: 'zhangsan',
          balance: 120.5,
          status: '0',
          createTime: '2026-11-06 10:30:00',
        },
        {
          userId: 2,
          userName: 'lisi',
          balance: 0,
          status: '1',
          createTime: '2026-11-05 09:00:00',
        },
      ],
    },
  },
  null,
  2,
)

const form = reactive({
  name: saved.name ?? '用户列表',
  method: saved.method ?? 'GET',
  url: saved.url ?? '/system/user/list',
  description: saved.description ?? '分页查询用户列表，支持按用户名与状态筛选。',
  params: saved.params ?? '{\n  "pageNum": 1,\n  "pageSize": 10,\n  "userName": "zhang"\n}',
  response: saved.response ?? SAMPLE,
  withSample: saved.withSample ?? true,
})

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const { copied, copy } = useCopy()

const markdown = computed(() =>
  buildMarkdown({
    name: form.name,
    method: form.method,
    url: form.url,
    description: form.description,
    params: form.params,
    response: form.response,
    withSample: form.withSample,
  }),
)

const stats = computed(() => {
  const lines = markdown.value.split('\n').length
  // 字段行的第一格形如 `| &nbsp;&nbsp;`data.total``，缩进会让 ` 前多出占位符
  const fields = (markdown.value.match(/^\| (?:&nbsp;)*`/gm) || []).length
  return { lines, fields }
})

function fillSample() {
  form.response = SAMPLE
}

function download() {
  const blob = new Blob([markdown.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(form.name || 'api').replace(/[\\/:*?"<>|]/g, '')}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

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
  <div class="apidoc">
    <div class="toolbar">
      <input v-model="form.name" class="name-input" placeholder="接口名称" spellcheck="false" />
      <select v-model="form.method" class="select">
        <option v-for="m in METHODS" :key="m" :value="m">{{ m }}</option>
      </select>
      <input v-model="form.url" class="url-input mono" placeholder="/api/路径" spellcheck="false" />

      <span class="spacer" />
      <label class="chk">
        <input v-model="form.withSample" type="checkbox" />
        含示例列
      </label>
      <span class="stat">{{ stats.fields }} 个字段 · {{ stats.lines }} 行</span>
      <button class="btn" @click="download">下载 .md</button>
      <button class="btn primary" @click="copy(markdown, 'out')">
        {{ copied ? '已复制' : '复制文档' }}
      </button>
    </div>

    <div class="body">
      <section class="col">
        <label class="field">
          接口说明
          <input v-model="form.description" class="input" spellcheck="false" />
        </label>

        <div class="pane">
          <header>
            <span class="pane-title">请求参数 JSON</span>
            <span class="pane-meta">可留空</span>
          </header>
          <textarea v-model="form.params" class="code" spellcheck="false" placeholder='{"pageNum": 1}' />
        </div>

        <div class="pane">
          <header>
            <span class="pane-title">响应 JSON</span>
            <button class="mini" @click="fillSample">填入示例</button>
          </header>
          <textarea v-model="form.response" class="code" spellcheck="false" placeholder="粘贴接口返回的 JSON" />
        </div>
      </section>

      <section class="pane result">
        <header>
          <span class="pane-title">Markdown 预览</span>
          <span class="pane-meta">api.md</span>
        </header>
        <pre class="code out">{{ markdown }}</pre>
      </section>
    </div>

    <p class="hint">
      嵌套字段用 <code>.</code> 连接，数组用 <code>[]</code> 表示（如 <code>data.list[].userName</code>）；
      数组元素的字段取并集，任一条里出现过就会列出。字段过多时只展开前 6 层。
    </p>
  </div>
</template>

<style scoped>
.apidoc {
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
.name-input,
.url-input,
.input {
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.name-input {
  width: 170px;
}
.url-input {
  width: 240px;
}
.name-input:focus,
.url-input:focus,
.input:focus {
  border-color: var(--accent);
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.select {
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10.5px;
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
.btn:hover {
  background: var(--fill-1);
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover {
  background: var(--accent-strong);
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 10px;
}
.col {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10px;
  color: var(--text-faint);
}
.pane {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.result {
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
.pane-meta {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--text-faint);
}
.mini {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--accent);
}
.mini:hover {
  background: var(--accent-soft);
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
  font-size: 11px;
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
}
.out {
  white-space: pre-wrap;
  word-break: break-word;
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
