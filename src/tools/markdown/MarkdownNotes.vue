<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { marked } from 'marked'
import hljsCore from 'highlight.js/lib/core'
import hljsMarkdown from 'highlight.js/lib/languages/markdown'
import hljsJs from 'highlight.js/lib/languages/javascript'
import hljsTs from 'highlight.js/lib/languages/typescript'
import hljsJson from 'highlight.js/lib/languages/json'
import hljsXml from 'highlight.js/lib/languages/xml'
import hljsCss from 'highlight.js/lib/languages/css'
import hljsBash from 'highlight.js/lib/languages/bash'
import hljsPython from 'highlight.js/lib/languages/python'
import hljsJava from 'highlight.js/lib/languages/java'
import hljsSql from 'highlight.js/lib/languages/sql'
import hljsGo from 'highlight.js/lib/languages/go'
import hljsYaml from 'highlight.js/lib/languages/yaml'
import {
  formatTime,
  getOpfsRoot,
  listDir,
  readFileText,
  removeEntry,
  renameEntry,
  supportsOpfs,
  writeFile,
} from '../files/fs'
import { escapeHtml } from '../../lib/format'
import { applyTemplate, markdownStats, safeFileName } from './editor.js'

const DIR_NAME = 'notes'
const STORAGE_KEY = 'toolbox:mdnotes'
const MAX_HIGHLIGHT = 200 * 1024

const HL_LANGS = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  xml: 'HTML/XML',
  css: 'CSS',
  bash: 'Shell',
  python: 'Python',
  java: 'Java',
  sql: 'SQL',
  go: 'Go',
  yaml: 'YAML',
  markdown: 'Markdown',
}

for (const [name, mod] of Object.entries({
  markdown: hljsMarkdown,
  javascript: hljsJs,
  typescript: hljsTs,
  json: hljsJson,
  xml: hljsXml,
  css: hljsCss,
  bash: hljsBash,
  python: hljsPython,
  java: hljsJava,
  sql: hljsSql,
  go: hljsGo,
  yaml: hljsYaml,
})) {
  if (!hljsCore.getLanguage(name)) hljsCore.registerLanguage(name, mod)
}

/* escapeHtml 与模板插入逻辑在 lib/format 与 ./editor.js */

/* ---------------- 状态 ---------------- */

const dir = ref(null)
const notes = ref([])
const activeName = ref('')
const content = ref('')
const savedContent = ref('')
const titleInput = ref('')
const keyword = ref('')
const viewMode = ref(localStorage.getItem(`${STORAGE_KEY}:view`) ?? 'split')
const loading = ref(false)
const error = ref('')
const message = ref('')
const highlighted = ref('')

const editorEl = ref(null)
const highlightEl = ref(null)
const previewEl = ref(null)

const dirty = computed(() => content.value !== savedContent.value)
const activeNote = computed(() => notes.value.find((n) => n.name === activeName.value) || null)

const visibleNotes = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const list = kw
    ? notes.value.filter((n) => n.title.toLowerCase().includes(kw))
    : notes.value
  return [...list].sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
})

const stats = computed(() => markdownStats(content.value))

const tooLarge = computed(() => content.value.length > MAX_HIGHLIGHT)

/* ---------------- 高亮 ---------------- */

let hlTimer = null
function computeHighlight() {
  if (tooLarge.value) {
    highlighted.value = escapeHtml(content.value)
    return
  }
  try {
    highlighted.value = hljsCore.highlight(content.value || '', { language: 'markdown' }).value
  } catch {
    highlighted.value = escapeHtml(content.value)
  }
}

function scheduleHighlight() {
  clearTimeout(hlTimer)
  hlTimer = setTimeout(computeHighlight, 120)
}

/* ---------------- Markdown 预览 ---------------- */

const renderer = new marked.Renderer()
renderer.html = (token) => escapeHtml(typeof token === 'string' ? token : token.text)

renderer.code = (token) => {
  const raw = typeof token === 'string' ? token : token.text
  const lang = (typeof token === 'string' ? '' : token.lang || '').trim().split(/\s+/)[0]
  const language = lang && hljsCore.getLanguage(lang) ? lang : ''
  const body = language ? hljsCore.highlight(raw, { language }).value : escapeHtml(raw)
  const label = language ? HL_LANGS[language] || language : 'text'
  return `<pre data-lang="${label}"><code class="hljs">${body}</code></pre>`
}

const previewHtml = computed(() => {
  try {
    return marked.parse(content.value || '', { renderer, gfm: true, breaks: true })
  } catch {
    return ''
  }
})

/* ---------------- 滚动同步 ---------------- */

function onEditorScroll() {
  const ta = editorEl.value
  if (!ta) return
  if (highlightEl.value) {
    highlightEl.value.scrollTop = ta.scrollTop
    highlightEl.value.scrollLeft = ta.scrollLeft
  }
  if (viewMode.value === 'split' && previewEl.value) {
    const max = ta.scrollHeight - ta.clientHeight
    if (max > 0) {
      const ratio = ta.scrollTop / max
      previewEl.value.scrollTop = ratio * (previewEl.value.scrollHeight - previewEl.value.clientHeight)
    }
  }
}

/* ---------------- 笔记读写 ---------------- */

async function init() {
  if (!supportsOpfs()) {
    error.value = '当前浏览器不支持本站文件空间，无法保存笔记'
    return
  }
  loading.value = true
  try {
    const root = await getOpfsRoot()
    dir.value = await root.getDirectoryHandle(DIR_NAME, { create: true })
    await refresh()
    const last = localStorage.getItem(STORAGE_KEY)
    if (last && notes.value.some((n) => n.name === last)) await select(last)
    else if (notes.value.length) await select(visibleNotes.value[0].name)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function refresh() {
  if (!dir.value) return
  try {
    const entries = await listDir(dir.value)
    notes.value = entries
      .filter((e) => e.kind === 'file' && e.name.endsWith('.md'))
      .map((e) => ({ name: e.name, title: e.name.replace(/\.md$/, ''), mtime: e.mtime }))
  } catch (e) {
    error.value = e.message
  }
}

async function select(name) {
  if (dirty.value) await save()
  const handle = await dir.value.getFileHandle(name)
  const text = await readFileText(handle)
  activeName.value = name
  titleInput.value = name.replace(/\.md$/, '')
  content.value = text
  savedContent.value = text
  localStorage.setItem(STORAGE_KEY, name)
  computeHighlight()
  await nextTick()
  editorEl.value?.scrollTo({ top: 0 })
  onEditorScroll()
}

let saveTimer = null
async function save() {
  if (!dir.value || !activeName.value) return
  if (content.value === savedContent.value) return
  try {
    await writeFile(dir.value, activeName.value, content.value)
    savedContent.value = content.value
    await refresh()
  } catch (e) {
    error.value = `保存失败：${e.message}`
  }
}

watch(content, () => {
  scheduleHighlight()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 800)
})

watch(viewMode, (mode) => {
  localStorage.setItem(`${STORAGE_KEY}:view`, mode)
  nextTick(() => onEditorScroll())
})

/* ---------------- 新建 / 删除 / 重命名 ---------------- */

/* 文件名清洗在 ./editor.js 的 safeFileName */

async function createNote() {
  if (!dir.value) return
  if (dirty.value) await save()
  const stamp = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/:]/g, '-')
  const base = `笔记 ${stamp}`
  let name = `${safeFileName(base)}.md`
  let i = 1
  while (notes.value.some((n) => n.name === name)) name = `${safeFileName(base)}-${i++}.md`

  await writeFile(dir.value, name, `# ${name.replace(/\.md$/, '')}\n\n`)
  await refresh()
  await select(name)
  message.value = '已新建笔记'
  setTimeout(() => (message.value = ''), 1500)
}

async function removeNote() {
  if (!activeName.value) return
  const target = activeNote.value
  if (!window.confirm(`确定删除「${target?.title || activeName.value}」？删除后无法恢复。`)) return
  try {
    await removeEntry(dir.value, activeName.value)
    activeName.value = ''
    content.value = ''
    savedContent.value = ''
    titleInput.value = ''
    await refresh()
    if (notes.value.length) await select(visibleNotes.value[0].name)
  } catch (e) {
    error.value = e.message
  }
}

async function commitRename() {
  if (!activeName.value) return
  const oldName = activeName.value
  const nextName = `${safeFileName(titleInput.value)}.md`
  if (nextName === oldName) {
    titleInput.value = oldName.replace(/\.md$/, '')
    return
  }
  if (notes.value.some((n) => n.name === nextName)) {
    error.value = '已存在同名笔记'
    titleInput.value = oldName.replace(/\.md$/, '')
    return
  }
  try {
    if (dirty.value) await save()
    await renameEntry(dir.value, oldName, nextName)
    activeName.value = nextName
    localStorage.setItem(STORAGE_KEY, nextName)
    await refresh()
  } catch (e) {
    error.value = `重命名失败：${e.message}`
    titleInput.value = oldName.replace(/\.md$/, '')
  }
}

/* ---------------- 编辑辅助 ---------------- */

async function insert(template, wrapSelection = true) {
  const ta = editorEl.value
  const start = ta?.selectionStart ?? content.value.length
  const end = ta?.selectionEnd ?? start

  const { text, caret } = applyTemplate(content.value, start, end, template, wrapSelection)
  content.value = text

  await nextTick()
  if (ta) {
    ta.focus()
    ta.setSelectionRange(caret, caret)
  }
  scheduleHighlight()
}

function onEditorKeydown(e) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) {
    if (e.key === 'Tab') {
      e.preventDefault()
      insert('  ', false)
    }
    return
  }
  const key = e.key.toLowerCase()
  if (key === 's') {
    e.preventDefault()
    save()
  } else if (key === 'b') {
    e.preventDefault()
    insert('**$1**')
  } else if (key === 'i') {
    e.preventDefault()
    insert('*$1*')
  }
}

/* ---------------- 导出 ---------------- */

async function copyMarkdown() {
  if (!content.value) return
  try {
    await navigator.clipboard.writeText(content.value)
    message.value = '已复制 Markdown'
    setTimeout(() => (message.value = ''), 1500)
  } catch {
    /* 忽略 */
  }
}

function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function exportMarkdown() {
  if (!content.value) return
  download(`${titleInput.value || '未命名'}.md`, content.value, 'text/markdown')
}

function exportHtml() {
  if (!content.value) return
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${escapeHtml(titleInput.value || '未命名')}</title>
<style>
body{max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.8 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1d1d1f}
pre{background:#f5f5f7;padding:14px 16px;border-radius:8px;overflow:auto}
code{font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}
:not(pre)>code{background:#f0f0f2;padding:2px 5px;border-radius:4px}
blockquote{margin:16px 0;padding:4px 16px;border-left:4px solid #d0d0d5;color:#666}
table{border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 12px}
img{max-width:100%}a{color:#007aff}
</style></head><body>${previewHtml.value}</body></html>`
  download(`${titleInput.value || '未命名'}.html`, html, 'text/html')
}

onMounted(init)

onBeforeUnmount(() => {
  clearTimeout(hlTimer)
  clearTimeout(saveTimer)
  if (dirty.value) save()
})
</script>

<template>
  <div class="mdn">
    <div class="toolbar">
      <button class="btn primary" :disabled="!dir" @click="createNote">＋ 新建</button>
      <input
        v-model="titleInput"
        class="title-input"
        placeholder="笔记标题（回车重命名）"
        spellcheck="false"
        :disabled="!activeName"
        @keydown.enter="commitRename"
        @blur="commitRename"
      />
      <button class="btn" :disabled="!activeName" @click="removeNote">删除</button>

      <span class="spacer" />

      <div class="seg">
        <button :class="{ on: viewMode === 'edit' }" @click="viewMode = 'edit'">编辑</button>
        <button :class="{ on: viewMode === 'split' }" @click="viewMode = 'split'">分栏</button>
        <button :class="{ on: viewMode === 'preview' }" @click="viewMode = 'preview'">预览</button>
      </div>

      <button class="btn" :disabled="!activeName" @click="save">
        {{ dirty ? '保存' : '已保存' }}
      </button>
      <button class="btn" :disabled="!content" @click="copyMarkdown">复制</button>
      <button class="btn" :disabled="!content" @click="exportMarkdown">导出 .md</button>
      <button class="btn" :disabled="!content" @click="exportHtml">导出 HTML</button>
    </div>

    <div class="body">
      <aside class="side">
        <input v-model="keyword" class="search" placeholder="搜索笔记" />
        <div class="list">
          <p v-if="loading" class="tip">读取中…</p>
          <p v-else-if="!visibleNotes.length" class="tip">
            {{ keyword ? '没有匹配的笔记' : '还没有笔记，点「新建」开始' }}
          </p>
          <button
            v-for="n in visibleNotes"
            :key="n.name"
            class="note-row"
            :class="{ on: n.name === activeName }"
            @click="select(n.name)"
          >
            <span class="note-title">{{ n.title }}</span>
            <span class="note-meta">{{ formatTime(n.mtime) }}</span>
          </button>
        </div>
        <p class="side-foot">{{ notes.length }} 篇 · 存于本站空间 notes/</p>
      </aside>

      <section v-if="activeName" class="main">
        <div v-if="viewMode !== 'preview'" class="md-bar">
          <button class="mini bold" title="加粗 (Ctrl+B)" @click="insert('**$1**')">B</button>
          <button class="mini italic" title="斜体 (Ctrl+I)" @click="insert('*$1*')">I</button>
          <button class="mini" title="标题" @click="insert('## $1')">H</button>
          <button class="mini" title="无序列表" @click="insert('- $1')">≡</button>
          <button class="mini" title="有序列表" @click="insert('1. $1')">1.</button>
          <button class="mini" title="引用" @click="insert('> $1')">❝</button>
          <button class="mini" title="行内代码" @click="insert('`$1`')">&lt;&gt;</button>
          <button class="mini" title="代码块" @click="insert('```\n$1\n```')">{{ '{ }' }}</button>
          <button class="mini" title="链接" @click="insert('[$1](https://)')">🔗</button>
          <button class="mini" title="表格" @click="insert('| 列1 | 列2 |\n| --- | --- |\n| $1 |  |')">▦</button>
          <button class="mini" title="分割线" @click="insert('\n---\n', false)">—</button>
          <span class="md-meta">
            {{ stats.words }} 词 · {{ stats.chars }} 字符 · {{ stats.lines }} 行
            <template v-if="tooLarge"> · 已关闭高亮</template>
          </span>
        </div>

        <div class="panes" :class="viewMode">
          <div v-if="viewMode !== 'preview'" class="editor-pane">
            <pre ref="highlightEl" class="hl"><code v-html="highlighted" /></pre>
            <textarea
              ref="editorEl"
              v-model="content"
              class="editor"
              spellcheck="false"
              placeholder="开始写 Markdown…"
              @scroll="onEditorScroll"
              @keydown="onEditorKeydown"
            />
          </div>

          <div v-if="viewMode !== 'edit'" ref="previewEl" class="preview markdown-body" v-html="previewHtml" />
        </div>
      </section>

      <section v-else class="empty-state">
        <p class="big">选择左侧笔记，或新建一篇</p>
        <p class="small">
          笔记以 .md 存于「本站空间 / notes」，可以用文件管理器查看、导出，也能用文本编辑器直接编辑
        </p>
      </section>
    </div>

    <p v-if="message" class="msg">{{ message }}</p>
    <p v-if="error" class="err">{{ error }}</p>
  </div>
</template>

<style scoped>
.mdn {
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
  gap: 6px;
  flex-wrap: wrap;
}
.btn {
  padding: 4px 11px;
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
.title-input {
  flex: 0 1 200px;
  min-width: 110px;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.title-input:focus {
  border-color: var(--accent);
}
.spacer {
  margin-left: auto;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--fill-1);
}
.seg button {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

/* 左侧列表 */
.side {
  flex: none;
  width: 190px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.search {
  flex: none;
  margin: 8px;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.search:focus {
  border-color: var(--accent);
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 6px 6px;
}
.note-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  text-align: left;
  color: var(--text);
}
.note-row:hover {
  background: var(--fill-1);
}
.note-row.on {
  background: var(--accent-soft);
}
.note-title {
  font-size: 11.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.note-row.on .note-title {
  color: var(--accent);
}
.note-meta {
  font-size: 9.5px;
  color: var(--text-faint);
}
.side-foot {
  flex: none;
  margin: 0;
  padding: 6px 8px;
  border-top: 1px solid var(--border);
  font-size: 9.5px;
  color: var(--text-faint);
}
.tip {
  margin: 20px 8px;
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
}

/* 主编辑区 */
.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.md-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
  flex-wrap: wrap;
}
.mini {
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-dim);
}
.mini:hover {
  background: var(--fill-2);
  color: var(--text);
}
.mini.bold {
  font-weight: 700;
}
.mini.italic {
  font-style: italic;
}
.md-meta {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.panes {
  flex: 1;
  min-height: 0;
  display: flex;
}
.editor-pane {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.panes.split .editor-pane {
  border-right: 1px solid var(--border);
}
.hl,
.editor {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 12px 14px;
  border: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
.hl {
  overflow: hidden;
  pointer-events: none;
  color: var(--text);
}
.editor {
  resize: none;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: var(--text);
}
.editor::selection {
  background: var(--accent-soft);
}
.preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 12px 18px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.85;
}
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.empty-state .big {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.empty-state .small {
  margin: 0;
  max-width: 400px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-faint);
}
.msg {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--accent);
}
.err {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--danger);
}

/* Markdown 渲染 */
.preview :deep(h1) {
  font-size: 22px;
  margin: 14px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.preview :deep(h2) {
  font-size: 18px;
  margin: 14px 0 8px;
}
.preview :deep(h3) {
  font-size: 15px;
  margin: 12px 0 6px;
}
.preview :deep(p) {
  margin: 9px 0;
}
.preview :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--code-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.preview :deep(pre) {
  position: relative;
  margin: 10px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #1e1e22;
  color: #f2f2f7;
  overflow: auto;
}
.preview :deep(pre)::before {
  content: attr(data-lang);
  position: absolute;
  top: 6px;
  right: 10px;
  font-size: 10px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
}
.preview :deep(pre code) {
  padding: 0;
  background: none;
  color: inherit;
}
.preview :deep(ul),
.preview :deep(ol) {
  padding-left: 22px;
}
.preview :deep(blockquote) {
  margin: 10px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--border-strong);
  color: var(--text-dim);
}
.preview :deep(a) {
  color: var(--accent);
}
.preview :deep(table) {
  border-collapse: collapse;
  margin: 10px 0;
}
.preview :deep(th),
.preview :deep(td) {
  padding: 5px 12px;
  border: 1px solid var(--border);
}
.preview :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
.preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 16px 0;
}

/* 代码块高亮配色 */
.preview :deep(.hljs-keyword),
.preview :deep(.hljs-selector-tag),
.preview :deep(.hljs-literal),
.preview :deep(.hljs-tag) {
  color: #ff7ab2;
}
.preview :deep(.hljs-string),
.preview :deep(.hljs-attr) {
  color: #a8e07a;
}
.preview :deep(.hljs-number),
.preview :deep(.hljs-built_in) {
  color: #ffb86c;
}
.preview :deep(.hljs-title),
.preview :deep(.hljs-function) {
  color: #82aaff;
}
.preview :deep(.hljs-comment) {
  color: #7f8c98;
  font-style: italic;
}

/* 编辑器内的 markdown 高亮（浅色） */
.hl :deep(.hljs-section),
.hl :deep(.hljs-title) {
  color: #005cc5;
  font-weight: 600;
}
.hl :deep(.hljs-strong) {
  color: #b31d28;
}
.hl :deep(.hljs-bullet) {
  color: #6f42c1;
}
.hl :deep(.hljs-emphasis) {
  color: #6a737d;
  font-style: italic;
}
.hl :deep(.hljs-code),
.hl :deep(.hljs-link) {
  color: #032f62;
}
.hl :deep(.hljs-quote) {
  color: #6a737d;
  font-style: italic;
}
:global(html.dark) .hl :deep(.hljs-section),
:global(html.dark) .hl :deep(.hljs-title) {
  color: #82aaff;
}
:global(html.dark) .hl :deep(.hljs-strong) {
  color: #ff7ab2;
}
:global(html.dark) .hl :deep(.hljs-bullet) {
  color: #c792ea;
}
:global(html.dark) .hl :deep(.hljs-code),
:global(html.dark) .hl :deep(.hljs-link) {
  color: #a8e07a;
}
</style>
