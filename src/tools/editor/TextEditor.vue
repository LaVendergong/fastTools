<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import hljsCore from 'highlight.js/lib/core'
import hljsJs from 'highlight.js/lib/languages/javascript'
import hljsTs from 'highlight.js/lib/languages/typescript'
import hljsJson from 'highlight.js/lib/languages/json'
import hljsXml from 'highlight.js/lib/languages/xml'
import hljsCss from 'highlight.js/lib/languages/css'
import hljsMarkdown from 'highlight.js/lib/languages/markdown'
import hljsSql from 'highlight.js/lib/languages/sql'
import hljsPython from 'highlight.js/lib/languages/python'
import hljsJava from 'highlight.js/lib/languages/java'
import hljsBash from 'highlight.js/lib/languages/bash'
import hljsYaml from 'highlight.js/lib/languages/yaml'
import hljsGo from 'highlight.js/lib/languages/go'
import hljsRust from 'highlight.js/lib/languages/rust'
import { appBus, pendingFile } from '../../lib/appBus'

const LANGS = [
  { id: 'plaintext', name: '纯文本' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'typescript', name: 'TypeScript' },
  { id: 'json', name: 'JSON' },
  { id: 'xml', name: 'HTML / XML' },
  { id: 'css', name: 'CSS' },
  { id: 'markdown', name: 'Markdown' },
  { id: 'sql', name: 'SQL' },
  { id: 'python', name: 'Python' },
  { id: 'java', name: 'Java' },
  { id: 'bash', name: 'Shell' },
  { id: 'yaml', name: 'YAML' },
  { id: 'go', name: 'Go' },
  { id: 'rust', name: 'Rust' },
]

const EXT_LANG = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  vue: 'xml',
  css: 'css',
  scss: 'css',
  less: 'css',
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
  py: 'python',
  java: 'java',
  sh: 'bash',
  bash: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  go: 'go',
  rs: 'rust',
}

const MAX_HIGHLIGHT = 300 * 1024
const CLOSE_CONFIRM = '当前内容尚未保存，确定放弃修改？'

for (const [name, mod] of Object.entries({
  javascript: hljsJs,
  typescript: hljsTs,
  json: hljsJson,
  xml: hljsXml,
  css: hljsCss,
  markdown: hljsMarkdown,
  sql: hljsSql,
  python: hljsPython,
  java: hljsJava,
  bash: hljsBash,
  yaml: hljsYaml,
  go: hljsGo,
  rust: hljsRust,
})) {
  if (!hljsCore.getLanguage(name)) hljsCore.registerLanguage(name, mod)
}

const text = ref('')
const fileName = ref('未命名.txt')
const fileHandle = ref(null)
const lang = ref('plaintext')
const fontSize = ref(13)
const autoWrap = ref(false)
const dirty = ref(false)
const highlighted = ref('')
const message = ref('')
const findOpen = ref(false)
const replaceMode = ref(false)
const jumpOpen = ref(false)
const findText = ref('')
const replaceText = ref('')
const useRegex = ref(false)
const caseSensitive = ref(false)
const jumpLine = ref('')
const matchCount = ref(0)

const cursor = reactive({ line: 1, col: 1 })
const taEl = ref(null)
const preEl = ref(null)
const gutterEl = ref(null)
const fileInputEl = ref(null)
const findInputEl = ref(null)
const jumpInputEl = ref(null)

const lineCount = computed(() => {
  let n = 1
  const s = text.value
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
  return n
})

const gutterText = computed(() => {
  const n = Math.min(lineCount.value, 50000)
  const arr = new Array(n)
  for (let i = 0; i < n; i++) arr[i] = i + 1
  return arr.join('\n')
})

const eolLabel = computed(() => (text.value.includes('\r\n') ? 'CRLF' : 'LF'))
const charCount = computed(() => text.value.length)
const wordCount = computed(() => {
  const m = text.value.match(/[\w\u4e00-\u9fa5]+/g)
  return m ? m.length : 0
})
const tooLarge = computed(() => text.value.length > MAX_HIGHLIGHT)

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

function computeHighlight() {
  if (lang.value === 'plaintext' || tooLarge.value) {
    highlighted.value = escapeHtml(text.value)
    return
  }
  try {
    highlighted.value = hljsCore.highlight(text.value, { language: lang.value }).value
  } catch {
    highlighted.value = escapeHtml(text.value)
  }
}

let skipDirty = false
let hlTimer = null

watch([text, lang], () => {
  if (!skipDirty) dirty.value = true
  clearTimeout(hlTimer)
  hlTimer = setTimeout(() => {
    computeHighlight()
    syncScroll()
  }, 140)
})

function syncScroll() {
  const ta = taEl.value
  if (!ta) return
  if (preEl.value) {
    preEl.value.scrollTop = ta.scrollTop
    preEl.value.scrollLeft = ta.scrollLeft
  }
  if (gutterEl.value) gutterEl.value.scrollTop = ta.scrollTop
}

function updateCursor() {
  const ta = taEl.value
  if (!ta) return
  const pos = ta.selectionStart
  const before = text.value.slice(0, pos)
  const lastBreak = before.lastIndexOf('\n')
  cursor.line = before.split('\n').length
  cursor.col = pos - lastBreak
}

function detectLang(name) {
  const ext = (name.split('.').pop() || '').toLowerCase()
  return EXT_LANG[ext] || 'plaintext'
}

// 选中并滚动到指定行（搜索结果跳转用）
function selectLine(line) {
  const ta = taEl.value
  if (!ta || !line) return
  const lines = text.value.split('\n')
  const target = Math.min(Math.max(1, line), lines.length)
  let start = 0
  for (let i = 0; i < target - 1; i += 1) start += lines[i].length + 1
  const end = start + lines[target - 1].length
  ta.focus()
  ta.setSelectionRange(start, end)
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20
  ta.scrollTop = Math.max(0, (target - 6) * lh)
  syncScroll()
  updateCursor()
}

function loadText(content, name, handle, line = 0) {
  skipDirty = true
  text.value = content
  fileName.value = name
  fileHandle.value = handle || null
  lang.value = detectLang(name)
  message.value = ''
  nextTick(() => {
    computeHighlight()
    syncScroll()
    dirty.value = false
    skipDirty = false
    taEl.value?.focus()
    updateCursor()
    if (line) {
      selectLine(line)
      message.value = `已定位到第 ${line} 行`
    }
  })
}

/* ---------------- 打开 / 保存 ---------------- */

async function openFile() {
  if (dirty.value && !window.confirm(CLOSE_CONFIRM)) return

  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: '文本文件',
            accept: { 'text/plain': ['.txt', '.md', '.json', '.log', '.csv', '.yml', '.yaml', '.xml', '.html', '.css', '.js', '.ts', '.sql', '.ini', '.conf'] },
          },
        ],
      })
      const file = await handle.getFile()
      loadText(await file.text(), file.name, handle)
      return
    } catch (e) {
      if (e.name === 'AbortError') return
      message.value = e.message
    }
  }
  fileInputEl.value?.click()
}

async function onPickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  loadText(await file.text(), file.name, null)
}

async function save() {
  if (fileHandle.value?.createWritable) {
    try {
      const writable = await fileHandle.value.createWritable()
      await writable.write(text.value)
      await writable.close()
      dirty.value = false
      message.value = '已保存到原文件'
      return
    } catch (e) {
      message.value = e.message
      return
    }
  }
  await saveAs()
}

async function saveAs() {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: fileName.value })
      fileHandle.value = handle
      fileName.value = handle.name || fileName.value
      lang.value = detectLang(fileName.value)
      await save()
      return
    } catch (e) {
      if (e.name === 'AbortError') return
      message.value = e.message
    }
  }
  download()
}

function download() {
  const blob = new Blob([text.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.value || 'untitled.txt'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
  dirty.value = false
  message.value = '已下载'
}

function newFile() {
  if (dirty.value && !window.confirm(CLOSE_CONFIRM)) return
  loadText('', '未命名.txt', null)
  lang.value = 'plaintext'
}

function onDrop(e) {
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  if (dirty.value && !window.confirm(CLOSE_CONFIRM)) return
  file.text().then((content) => loadText(content, file.name, null))
}

/* ---------------- 查找替换 ---------------- */

function findMatches() {
  const needle = findText.value
  if (!needle) return []
  if (useRegex.value) {
    try {
      const re = new RegExp(needle, caseSensitive.value ? 'g' : 'gi')
      const out = []
      let m
      while ((m = re.exec(text.value)) !== null) {
        out.push({ start: m.index, end: m.index + m[0].length })
        if (m[0] === '') re.lastIndex++
        if (out.length > 3000) break
      }
      return out
    } catch {
      return []
    }
  }
  const hay = caseSensitive.value ? text.value : text.value.toLowerCase()
  const target = caseSensitive.value ? needle : needle.toLowerCase()
  const out = []
  let idx = hay.indexOf(target)
  while (idx !== -1) {
    out.push({ start: idx, end: idx + needle.length })
    idx = hay.indexOf(target, idx + Math.max(1, needle.length))
    if (out.length > 3000) break
  }
  return out
}

watch([findText, useRegex, caseSensitive, text], () => {
  matchCount.value = findMatches().length
})

function selectRange(start, end) {
  const ta = taEl.value
  if (!ta) return
  ta.focus()
  ta.setSelectionRange(start, end)
  const lineIndex = text.value.slice(0, start).split('\n').length - 1
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 21
  ta.scrollTop = Math.max(0, (lineIndex - 3) * lineHeight)
  syncScroll()
  updateCursor()
}

function findNext(backward = false) {
  const matches = findMatches()
  if (!matches.length) return
  const ta = taEl.value
  const pos = ta.selectionEnd
  const target = backward
    ? [...matches].reverse().find((m) => m.start < pos) || matches[matches.length - 1]
    : matches.find((m) => m.start >= pos) || matches[0]
  selectRange(target.start, target.end)
}

function replaceOne() {
  const ta = taEl.value
  if (!ta || !findText.value) return
  const selected = text.value.slice(ta.selectionStart, ta.selectionEnd)
  if (selected && findMatches().some((m) => m.start === ta.selectionStart)) {
    text.value = text.value.slice(0, ta.selectionStart) + replaceText.value + text.value.slice(ta.selectionEnd)
    selectRange(ta.selectionStart + replaceText.value.length, ta.selectionStart + replaceText.value.length)
  }
  findNext()
}

function replaceAll() {
  if (!findText.value) return
  if (useRegex.value) {
    try {
      const re = new RegExp(findText.value, caseSensitive.value ? 'g' : 'gi')
      const before = text.value
      text.value = before.replace(re, replaceText.value)
      message.value = text.value === before ? '没有匹配项' : '已全部替换'
      return
    } catch (e) {
      message.value = e.message
      return
    }
  }
  const matches = findMatches()
  if (!matches.length) return
  let out = ''
  let last = 0
  for (const m of matches) {
    out += text.value.slice(last, m.start) + replaceText.value
    last = m.end
  }
  out += text.value.slice(last)
  text.value = out
  message.value = `已替换 ${matches.length} 处`
}

function goToLine() {
  const target = Math.max(1, Math.min(Number(jumpLine.value) || 1, lineCount.value))
  const lines = text.value.split('\n')
  let pos = 0
  for (let i = 0; i < target - 1; i++) pos += lines[i].length + 1
  selectRange(pos, pos + (lines[target - 1]?.length || 0))
  jumpOpen.value = false
}

function toggleFind(mode = false) {
  findOpen.value = true
  replaceMode.value = mode
  nextTick(() => findInputEl.value?.focus())
}

/* ---------------- 编辑辅助 ---------------- */

function onKeydown(e) {
  const mod = e.ctrlKey || e.metaKey

  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = e.target
    const start = ta.selectionStart
    const end = ta.selectionEnd
    if (start !== end && text.value.slice(start, end).includes('\n')) {
      // 多行缩进
      const beforeLines = text.value.slice(0, start)
      const block = text.value.slice(start, end)
      const indented = block.replace(/^/gm, '  ')
      text.value = beforeLines + indented + text.value.slice(end)
      nextTick(() => selectRange(start, end + (indented.length - block.length)))
      return
    }
    text.value = `${text.value.slice(0, start)}  ${text.value.slice(end)}`
    nextTick(() => {
      taEl.value.setSelectionRange(start + 2, start + 2)
      updateCursor()
    })
    return
  }

  if (!mod) return

  const key = e.key.toLowerCase()
  if (key === 's') {
    e.preventDefault()
    save()
  } else if (key === 'f') {
    e.preventDefault()
    toggleFind(false)
  } else if (key === 'h') {
    e.preventDefault()
    toggleFind(true)
  } else if (key === 'g') {
    e.preventDefault()
    jumpOpen.value = true
    nextTick(() => jumpInputEl.value?.focus())
  } else if (key === 'o') {
    e.preventDefault()
    openFile()
  }
}

function onFindKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    findNext(e.shiftKey)
  } else if (e.key === 'Escape') {
    findOpen.value = false
    taEl.value?.focus()
  }
}

function zoom(delta) {
  fontSize.value = Math.min(28, Math.max(9, fontSize.value + delta))
}

/* ---------------- 生命周期 ---------------- */

const WELCOME = '欢迎使用文本编辑器\n\n• Ctrl / ⌘ + S 保存，Ctrl + O 打开文件\n• Ctrl / ⌘ + F 查找，Ctrl + H 替换，Ctrl + G 跳转行\n• Tab 缩进（支持多行），拖拽文件到窗口即可打开\n'
let loadedFromRequest = false
let offOpenFile = null

function openHandle(handle, name, line = 0) {
  handle
    .getFile()
    .then((file) => file.text())
    .then((content) => loadText(content, name, handle, line))
    .catch((e) => {
      message.value = `打开失败：${e.message}`
    })
}

// 外部请求打开文件（文件管理器双击、搜索结果、系统「用本应用打开」）
function onOpenFileRequest({ handle, name, line = 0 }) {
  loadedFromRequest = true
  pendingFile.handle = null
  pendingFile.name = ''
  pendingFile.line = 0

  // 已绑定磁盘文件的先自动保存，避免每次都弹确认打断；未命名的才询问
  if (dirty.value) {
    if (fileHandle.value?.createWritable) {
      save()
    } else if (!window.confirm(CLOSE_CONFIRM)) {
      loadedFromRequest = false
      return
    }
  }
  openHandle(handle, name, line)
}

onMounted(() => {
  computeHighlight()
  offOpenFile = appBus.on('open-file', onOpenFileRequest)
  // 粘性事件会在本帧补发；稍后再决定是否载入欢迎文本
  setTimeout(() => {
    if (!loadedFromRequest) loadText(WELCOME, '未命名.txt', null)
  }, 60)
})

onBeforeUnmount(() => {
  clearTimeout(hlTimer)
  offOpenFile?.()
})
</script>

<template>
  <div class="editor-tool" :style="{ '--fs': fontSize + 'px' }" @drop.prevent="onDrop" @dragover.prevent>
    <div class="toolbar">
      <button class="btn" @click="newFile">新建</button>
      <button class="btn" @click="openFile">打开</button>
      <button class="btn" @click="save">保存</button>
      <button class="btn" @click="saveAs">另存为</button>

      <span class="file-name" :title="fileName">
        {{ fileName }}<span v-if="dirty" class="dot">•</span>
      </span>

      <select v-model="lang" class="select" title="语法高亮">
        <option v-for="l in LANGS" :key="l.id" :value="l.id">{{ l.name }}</option>
      </select>

      <button class="btn" :class="{ on: findOpen }" title="查找替换 (Ctrl+F)" @click="toggleFind(false)">
        查找
      </button>
      <button class="btn" title="跳转行 (Ctrl+G)" @click="jumpOpen = !jumpOpen">跳行</button>
      <button class="btn" :class="{ on: autoWrap }" title="自动换行" @click="autoWrap = !autoWrap">换行</button>
      <button class="icon-btn" title="减小字号" @click="zoom(-1)">A－</button>
      <button class="icon-btn" title="增大字号" @click="zoom(1)">A＋</button>
    </div>

    <div v-if="findOpen" class="findbar">
      <input
        ref="findInputEl"
        v-model="findText"
        class="find-input"
        placeholder="查找内容"
        spellcheck="false"
        @keydown="onFindKeydown"
      />
      <input
        v-if="replaceMode"
        v-model="replaceText"
        class="find-input"
        placeholder="替换为"
        spellcheck="false"
        @keydown="onFindKeydown"
      />
      <label class="opt"><input v-model="caseSensitive" type="checkbox" />区分大小写</label>
      <label class="opt"><input v-model="useRegex" type="checkbox" />正则</label>
      <span class="match-info">{{ findText ? `${matchCount} 处` : '' }}</span>
      <button class="btn" @click="findNext(true)">上一个</button>
      <button class="btn" @click="findNext(false)">下一个</button>
      <template v-if="replaceMode">
        <button class="btn" @click="replaceOne">替换</button>
        <button class="btn" @click="replaceAll">全部替换</button>
      </template>
      <button v-else class="btn" @click="replaceMode = true">显示替换</button>
      <button class="icon-btn" @click="findOpen = false">✕</button>
    </div>

    <div v-if="jumpOpen" class="findbar">
      <span class="jump-label">跳转到行</span>
      <input
        ref="jumpInputEl"
        v-model="jumpLine"
        class="find-input small"
        type="number"
        min="1"
        :max="lineCount"
        @keydown.enter="goToLine"
      />
      <button class="btn" @click="goToLine">跳转</button>
      <span class="match-info">共 {{ lineCount }} 行</span>
      <button class="icon-btn" @click="jumpOpen = false">✕</button>
    </div>

    <div class="body">
      <div ref="gutterEl" class="gutter">{{ gutterText }}</div>
      <div class="code-area">
        <pre ref="preEl" class="code-layer" :class="{ wrap: autoWrap }"><code v-html="highlighted" /></pre>
        <textarea
          ref="taEl"
          v-model="text"
          class="textarea"
          spellcheck="false"
          :wrap="autoWrap ? 'soft' : 'off'"
          autocomplete="off"
          autocapitalize="off"
          @scroll="syncScroll"
          @keydown="onKeydown"
          @keyup="updateCursor"
          @click="updateCursor"
          @select="updateCursor"
        />
      </div>
    </div>

    <div class="status">
      <span>行 {{ cursor.line }}，列 {{ cursor.col }}</span>
      <span>{{ lineCount }} 行</span>
      <span>{{ charCount }} 字符</span>
      <span>{{ wordCount }} 词</span>
      <span>UTF-8</span>
      <span>{{ eolLabel }}</span>
      <span v-if="tooLarge" class="warn">文件较大，已关闭高亮</span>
      <span v-if="message" class="msg">{{ message }}</span>
    </div>

    <input ref="fileInputEl" type="file" accept="text/*,.txt,.md,.json,.log,.csv,.yml,.yaml,.xml,.html,.css,.js,.ts,.sql,.ini,.conf" hidden @change="onPickFile" />
  </div>
</template>

<style scoped>
.editor-tool {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  --code-line: calc(var(--fs) * 1.62);
}

/* 工具栏 */
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.btn {
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
  white-space: nowrap;
}
.btn:hover {
  background: var(--fill-1);
}
.btn.on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent);
}
.icon-btn {
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
}
.icon-btn:hover {
  background: var(--fill-1);
  color: var(--text);
}
.file-name {
  flex: 1;
  min-width: 0;
  padding: 0 6px;
  font-size: 11.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  margin-left: 4px;
  color: var(--accent);
}
.select {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  font-size: 11.5px;
  outline: none;
}

/* 查找栏 */
.findbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
  flex-wrap: wrap;
}
.find-input {
  width: 168px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.find-input.small {
  width: 72px;
}
.find-input:focus {
  border-color: var(--accent);
}
.opt {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.match-info {
  font-size: 10.5px;
  color: var(--text-faint);
  min-width: 34px;
}
.jump-label {
  font-size: 11px;
  color: var(--text-dim);
}

/* 编辑区 */
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  background: var(--panel-bg);
}
.gutter {
  flex: none;
  width: 48px;
  padding: 8px 6px 8px 0;
  border-right: 1px solid var(--border);
  background: var(--fill-1);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: var(--fs);
  line-height: var(--code-line);
  color: var(--text-faint);
  text-align: right;
  white-space: pre;
  overflow: hidden;
  user-select: none;
}
.code-area {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.code-layer,
.textarea {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 8px 12px;
  border: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: var(--fs);
  line-height: var(--code-line);
  tab-size: 4;
  white-space: pre;
  overflow: auto;
}
.code-layer {
  overflow: hidden;
  pointer-events: none;
  color: var(--text);
}
.code-layer.wrap {
  white-space: pre-wrap;
  word-break: break-word;
}
.textarea {
  resize: none;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: var(--text);
}
.textarea::selection {
  background: var(--accent-soft);
  color: transparent;
}

/* 状态栏 */
.status {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 10px;
  border-top: 1px solid var(--border);
  background: var(--fill-1);
  font-size: 10.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.status .warn {
  color: var(--warn);
}
.status .msg {
  margin-left: auto;
  color: var(--accent);
}

/* 语法高亮配色（浅色） */
.code-layer :deep(.hljs-keyword),
.code-layer :deep(.hljs-selector-tag),
.code-layer :deep(.hljs-literal),
.code-layer :deep(.hljs-tag) {
  color: #d73a49;
}
.code-layer :deep(.hljs-string),
.code-layer :deep(.hljs-attr),
.code-layer :deep(.hljs-template-variable) {
  color: #032f62;
}
.code-layer :deep(.hljs-number),
.code-layer :deep(.hljs-built_in),
.code-layer :deep(.hljs-symbol) {
  color: #005cc5;
}
.code-layer :deep(.hljs-title),
.code-layer :deep(.hljs-function),
.code-layer :deep(.hljs-section) {
  color: #6f42c1;
}
.code-layer :deep(.hljs-comment),
.code-layer :deep(.hljs-quote) {
  color: #6a737d;
  font-style: italic;
}
.code-layer :deep(.hljs-variable),
.code-layer :deep(.hljs-type),
.code-layer :deep(.hljs-params) {
  color: #b31d28;
}

/* 深色下的高亮配色 */
:global(html.dark) .code-layer :deep(.hljs-keyword),
:global(html.dark) .code-layer :deep(.hljs-selector-tag),
:global(html.dark) .code-layer :deep(.hljs-literal),
:global(html.dark) .code-layer :deep(.hljs-tag) {
  color: #ff7ab2;
}
:global(html.dark) .code-layer :deep(.hljs-string),
:global(html.dark) .code-layer :deep(.hljs-attr),
:global(html.dark) .code-layer :deep(.hljs-template-variable) {
  color: #a8e07a;
}
:global(html.dark) .code-layer :deep(.hljs-number),
:global(html.dark) .code-layer :deep(.hljs-built_in),
:global(html.dark) .code-layer :deep(.hljs-symbol) {
  color: #ffb86c;
}
:global(html.dark) .code-layer :deep(.hljs-title),
:global(html.dark) .code-layer :deep(.hljs-function),
:global(html.dark) .code-layer :deep(.hljs-section) {
  color: #82aaff;
}
:global(html.dark) .code-layer :deep(.hljs-comment),
:global(html.dark) .code-layer :deep(.hljs-quote) {
  color: #7f8c98;
}
:global(html.dark) .code-layer :deep(.hljs-variable),
:global(html.dark) .code-layer :deep(.hljs-type),
:global(html.dark) .code-layer :deep(.hljs-params) {
  color: #c792ea;
}
</style>
