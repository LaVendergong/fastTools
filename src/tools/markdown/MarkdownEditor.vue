<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { marked } from 'marked'

const STORAGE_KEY = 'toolbox:markdown'
const VIEWS = [
  { label: '编辑', value: 'edit' },
  { label: '分屏', value: 'split' },
  { label: '预览', value: 'preview' },
]

const SAMPLE = [
  '# 欢迎使用 Markdown 编辑器',
  '',
  '左侧编辑，右侧实时预览，内容会自动保存。',
  '',
  '## 支持的语法',
  '',
  '- **粗体**、*斜体*、~~删除线~~、`行内代码`',
  '- [链接](https://example.com) 与有序列表',
  '- 任务列表：',
  '  - [x] 实时预览',
  '  - [ ] 复制 HTML',
  '',
  '| 功能 | 状态 |',
  '| --- | --- |',
  '| 表格 | ✅ |',
  '| 代码块 | ✅ |',
  '',
  '> 引用块也可以有。',
  '',
  '```js',
  "const greet = (name) => `你好，${name}`",
  '```',
].join('\n')

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const text = ref(saved.text ?? SAMPLE)
const view = ref(saved.view ?? 'split')
const copied = ref(false)

let saveTimer
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ text: text.value, view: view.value }))
}

watch([text, view], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 300)
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  save()
  document.removeEventListener('click', onDocClick)
})

const editorEl = ref(null)
const insertOpen = ref(false)
const insertEl = ref(null)

const snippets = [
  { label: '代码块', before: '```js\n', after: '\n```', placeholder: '// 代码', block: true },
  { label: '行内代码', before: '`', after: '`', placeholder: 'code' },
  {
    label: '表格',
    before: '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |',
    after: '',
    block: true,
  },
  { label: '链接', before: '[', after: '](https://)', placeholder: '链接文字' },
  { label: '图片', before: '![', after: '](https://)', placeholder: '图片描述' },
  { label: '任务列表', before: '- [ ] ', after: '', placeholder: '任务' },
  { label: '引用', before: '> ', after: '', placeholder: '引用内容' },
  { label: '标题', before: '## ', after: '', placeholder: '标题' },
  { label: '分割线', before: '---', after: '', block: true },
]

// 在当前光标处插入结构；有选中内容时包裹选中内容
function applySnippet(s) {
  const el = editorEl.value
  if (!el) return

  const v = text.value
  const start = el.selectionStart
  const end = el.selectionEnd
  let pre = s.before
  let post = s.after

  if (s.block) {
    if (start > 0 && v[start - 1] !== '\n') pre = '\n' + pre
    if (end < v.length && v[end] !== '\n') post = post + '\n'
  }

  const picked = v.slice(start, end) || s.placeholder || ''
  text.value = v.slice(0, start) + pre + picked + post + v.slice(end)

  const from = start + pre.length
  nextTick(() => {
    el.focus()
    el.setSelectionRange(from, from + picked.length)
  })
  insertOpen.value = false
}

function onDocClick(e) {
  if (insertOpen.value && !insertEl.value?.contains(e.target)) insertOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

// 不渲染原始 HTML 标签，避免粘贴内容里的脚本被执行
const renderer = new marked.Renderer()
renderer.html = (token) => escapeHtml(typeof token === 'string' ? token : token.text)

const html = computed(() => marked.parse(text.value, { renderer, gfm: true, breaks: true }))

const stats = computed(() => ({
  chars: text.value.length,
  lines: text.value ? text.value.split('\n').length : 0,
}))

async function copyHtml() {
  try {
    await navigator.clipboard.writeText(html.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="md-tool">
    <div class="toolbar">
      <span class="stats">{{ stats.chars }} 字符 · {{ stats.lines }} 行</span>
      <div class="right">
        <div ref="insertEl" class="insert">
          <button class="tbtn" :disabled="view === 'preview'" @click="insertOpen = !insertOpen">
            插入 ▾
          </button>
          <div v-if="insertOpen" class="insert-menu">
            <button v-for="s in snippets" :key="s.label" @click="applySnippet(s)">
              {{ s.label }}
            </button>
          </div>
        </div>
        <div class="segmented">
          <button
            v-for="v in VIEWS"
            :key="v.value"
            :class="{ on: view === v.value }"
            @click="view = v.value"
          >
            {{ v.label }}
          </button>
        </div>
        <button class="copy" @click="copyHtml">{{ copied ? '已复制 HTML' : '复制 HTML' }}</button>
      </div>
    </div>

    <div class="body" :class="view">
      <textarea
        v-if="view !== 'preview'"
        ref="editorEl"
        v-model="text"
        class="editor"
        spellcheck="false"
        placeholder="在这里写 Markdown…"
      />

      <div v-if="view !== 'edit'" class="panel">
        <div class="panel-head">
          <span class="panel-title">预览</span>
        </div>
        <div class="markdown-body" v-html="html" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.stats {
  font-size: 12px;
  color: var(--text-dim);
}
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
}
.segmented button {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.segmented button.on {
  background: #fff;
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.copy {
  font-size: 12px;
  color: var(--accent);
}
.insert {
  position: relative;
}
.tbtn {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn:disabled {
  opacity: 0.4;
  cursor: default;
}
.insert-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 10;
  width: 132px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.insert-menu button {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border-radius: 5px;
  text-align: left;
  font-size: 12.5px;
}
.insert-menu button:hover {
  background: var(--hover);
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 10px;
}
.body.split {
  grid-template-columns: 1fr 1fr;
}
.body.edit,
.body.preview {
  grid-template-columns: 1fr;
}
.editor {
  height: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.editor:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
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
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
  flex: none;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}

/* ── Markdown 渲染样式 ── */
.markdown-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px;
  font-size: 13.5px;
  line-height: 1.75;
  word-wrap: break-word;
}
.markdown-body :deep(> :first-child) {
  margin-top: 0;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 18px 0 8px;
  font-weight: 600;
  line-height: 1.35;
}
.markdown-body :deep(h1) {
  font-size: 22px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.markdown-body :deep(h2) {
  font-size: 18px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border);
}
.markdown-body :deep(h3) {
  font-size: 15.5px;
}
.markdown-body :deep(h4) {
  font-size: 14px;
}
.markdown-body :deep(p) {
  margin: 8px 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 8px 0;
  padding-left: 22px;
}
.markdown-body :deep(li) {
  margin: 3px 0;
}
.markdown-body :deep(li > input[type='checkbox']) {
  margin-right: 5px;
}
.markdown-body :deep(blockquote) {
  margin: 10px 0;
  padding: 6px 12px;
  border-left: 3px solid #d0d0d5;
  border-radius: 0 6px 6px 0;
  color: var(--text-dim);
  background: rgba(0, 0, 0, 0.03);
}
.markdown-body :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.06);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
}
.markdown-body :deep(pre) {
  margin: 10px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #1e1e22;
  color: #f2f2f7;
  overflow: auto;
}
.markdown-body :deep(pre code) {
  padding: 0;
  background: none;
  color: inherit;
}
.markdown-body :deep(a) {
  color: var(--accent);
  text-decoration: none;
}
.markdown-body :deep(a:hover) {
  text-decoration: underline;
}
.markdown-body :deep(table) {
  margin: 10px 0;
  border-collapse: collapse;
  font-size: 13px;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 5px 10px;
  border: 1px solid var(--border);
  text-align: left;
}
.markdown-body :deep(th) {
  background: rgba(0, 0, 0, 0.03);
  font-weight: 600;
}
.markdown-body :deep(hr) {
  margin: 16px 0;
  border: none;
  border-top: 1px solid var(--border);
}
.markdown-body :deep(img) {
  max-width: 100%;
}
</style>
