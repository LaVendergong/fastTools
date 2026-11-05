<script setup>
import { computed, onMounted, ref } from 'vue'
import { requestOpenFile } from '../../lib/appBus'
import {
  ensurePermission,
  formatSize,
  getOpfsRoot,
  loadLocalDirectory,
  pickLocalDirectory,
  supportsLocalDir,
} from '../files/fs'

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue',
  'css', 'scss', 'less', 'html', 'htm', 'xml', 'svg', 'yml', 'yaml', 'toml', 'ini', 'conf',
  'properties', 'env', 'sql', 'java', 'kt', 'gradle', 'py', 'go', 'rs', 'rb', 'php', 'c',
  'h', 'cpp', 'hpp', 'cs', 'sh', 'bat', 'ps1', 'log', 'csv', 'gitignore', 'editorconfig',
])

const MAX_FILE_SIZE = 1.5 * 1024 * 1024
const MAX_FILES = 4000
const MAX_LINES_PER_FILE = 20
const MAX_RESULTS = 300

const backend = ref('opfs')
const rootHandle = ref(null)
const term = ref('')
const searchName = ref(true)
const searchContent = ref(true)
const caseSensitive = ref(false)
const regexMode = ref(false)
const extFilter = ref('')
const running = ref(false)
const scanned = ref(0)
const currentPath = ref('')
const results = ref([])
const error = ref('')
const notice = ref('')
const localSupported = supportsLocalDir()

let stopped = false
let matcher = null

const totalHits = computed(() => results.value.reduce((sum, r) => sum + r.lines.length, 0))

/* ---------------- 位置 ---------------- */

async function init() {
  try {
    rootHandle.value = await getOpfsRoot()
  } catch (e) {
    error.value = e.message
  }
}

async function switchBackend(kind) {
  if (kind === 'local') {
    if (!localSupported) {
      error.value = '当前浏览器不支持访问本地目录（需 Chrome / Edge）'
      return
    }
    try {
      let handle = await loadLocalDirectory()
      if (!handle) {
        handle = await pickLocalDirectory()
        if (!handle) return
      }
      const ok = await ensurePermission(handle)
      if (!ok) {
        error.value = '没有获得该目录的读取权限'
        return
      }
      rootHandle.value = handle
      backend.value = 'local'
      results.value = []
      notice.value = '已切换到本地目录'
    } catch (e) {
      error.value = e.message
    }
    return
  }

  rootHandle.value = await getOpfsRoot()
  backend.value = 'opfs'
  results.value = []
  notice.value = '已切换到本站空间'
}

/* ---------------- 匹配 ---------------- */

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRegExp() {
  const raw = term.value.trim()
  if (!raw) return null
  const source = regexMode.value ? raw : escapeRe(raw)
  try {
    return new RegExp(source, caseSensitive.value ? '' : 'i')
  } catch (e) {
    error.value = `表达式无效：${e.message}`
    return null
  }
}

function highlight(text) {
  const raw = term.value.trim()
  if (!raw) return escapeHtml(text)
  const source = regexMode.value ? raw : escapeRe(raw)
  let re
  try {
    re = new RegExp(source, caseSensitive.value ? 'g' : 'gi')
  } catch {
    return escapeHtml(text)
  }
  let out = ''
  let last = 0
  let m
  let guard = 0
  while ((m = re.exec(text)) !== null && guard < 50) {
    guard += 1
    if (m[0] === '') {
      re.lastIndex += 1
      continue
    }
    out += escapeHtml(text.slice(last, m.index))
    out += `<mark>${escapeHtml(m[0])}</mark>`
    last = m.index + m[0].length
  }
  out += escapeHtml(text.slice(last))
  return out
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

function extOf(name) {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : ''
}

function isSearchableText(name, size) {
  const ext = extOf(name)
  if (ext && !TEXT_EXT.has(ext)) return false
  if (!ext && size > 200 * 1024) return false
  return true
}

/* ---------------- 搜索 ---------------- */

async function walk(dir, prefix) {
  if (stopped || results.value.length >= MAX_RESULTS) return

  const entries = []
  for await (const [name, handle] of dir.entries()) entries.push([name, handle])

  for (const [name, handle] of entries) {
    if (stopped || results.value.length >= MAX_RESULTS || scanned.value >= MAX_FILES) return

    const path = `${prefix}${name}`

    if (handle.kind === 'directory') {
      await walk(handle, `${path}/`)
      continue
    }

    scanned.value += 1
    if (scanned.value % 40 === 0) {
      currentPath.value = path
      // 让出主线程，保持界面响应
      await new Promise((r) => setTimeout(r, 0))
    }

    const filter = extFilter.value.trim().replace(/^\./, '').toLowerCase()
    if (filter && extOf(name) !== filter) continue

    const re = matcher
    if (!re) return

    const nameHit = searchName.value && re.test(name)
    const lines = []

    if (searchContent.value) {
      try {
        const file = await handle.getFile()
        if (file.size <= MAX_FILE_SIZE && isSearchableText(name, file.size)) {
          const text = await file.text()
          if (!text.includes('\u0000')) {
            const rows = text.split('\n')
            for (let i = 0; i < rows.length; i += 1) {
              re.lastIndex = 0
              if (re.test(rows[i])) {
                lines.push({ no: i + 1, text: rows[i].trim().slice(0, 200) })
                if (lines.length >= MAX_LINES_PER_FILE) break
              }
            }
          }
        }
      } catch {
        /* 单个文件读失败不影响整体 */
      }
    }

    if (nameHit || lines.length) {
      results.value.push({
        name,
        path,
        handle,
        size: 0,
        nameHit,
        lines,
      })
    }
  }
}

async function start() {
  error.value = ''
  notice.value = ''
  if (!term.value.trim()) {
    error.value = '请输入要搜索的内容'
    return
  }
  if (!searchName.value && !searchContent.value) {
    error.value = '至少勾选「文件名」或「文件内容」'
    return
  }
  if (!rootHandle.value) {
    error.value = '文件空间还没准备好'
    return
  }

  matcher = buildRegExp()
  if (!matcher) return

  running.value = true
  stopped = false
  results.value = []
  scanned.value = 0
  currentPath.value = ''

  try {
    await walk(rootHandle.value, '')
    if (stopped) notice.value = `已停止，扫描了 ${scanned.value} 个文件`
    else if (results.value.length >= MAX_RESULTS) notice.value = `结果过多，只显示前 ${MAX_RESULTS} 个文件`
    else notice.value = `完成：扫描 ${scanned.value} 个文件，命中 ${results.value.length} 个文件`
  } catch (e) {
    error.value = e.message
  } finally {
    running.value = false
    currentPath.value = ''
  }
}

function stop() {
  stopped = true
}

function clearAll() {
  results.value = []
  scanned.value = 0
  notice.value = ''
  error.value = ''
}

function openResult(item, line = 0) {
  requestOpenFile(item.handle, item.name, line)
}

onMounted(init)
</script>

<template>
  <div class="fs">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ on: backend === 'opfs' }" @click="switchBackend('opfs')">本站空间</button>
        <button
          :class="{ on: backend === 'local' }"
          :disabled="!localSupported"
          :title="localSupported ? '' : '当前浏览器不支持（需 Chrome / Edge）'"
          @click="switchBackend('local')"
        >
          本地目录
        </button>
      </div>

      <input
        v-model="term"
        class="search"
        placeholder="搜索文件名或文件内容，回车开始"
        spellcheck="false"
        @keydown.enter="start"
      />

      <button v-if="!running" class="btn primary" @click="start">搜索</button>
      <button v-else class="btn danger" @click="stop">停止</button>
      <button class="btn" :disabled="running" @click="clearAll">清空</button>
    </div>

    <div class="options">
      <label class="chk"><input v-model="searchName" type="checkbox" /> 文件名</label>
      <label class="chk"><input v-model="searchContent" type="checkbox" /> 文件内容</label>
      <label class="chk"><input v-model="caseSensitive" type="checkbox" /> 区分大小写</label>
      <label class="chk"><input v-model="regexMode" type="checkbox" /> 正则</label>
      <label class="opt">
        扩展名
        <input v-model="extFilter" class="ext-input" placeholder="全部，如 js" spellcheck="false" />
      </label>

      <span class="spacer" />
      <span v-if="running" class="status running">
        扫描中… {{ scanned }} 个文件
        <span v-if="currentPath" class="cur-path">{{ currentPath }}</span>
      </span>
      <span v-else-if="error" class="status err">{{ error }}</span>
      <span v-else-if="notice" class="status ok">{{ notice }}</span>
      <span v-else class="status">{{ scanned ? `扫描 ${scanned} 个文件` : '就绪' }}</span>
    </div>

    <div class="result">
      <div v-if="!results.length" class="empty">
        <p class="big">{{ running ? '搜索中…' : '输入关键词开始搜索' }}</p>
        <p class="small">
          会在「{{ backend === 'opfs' ? '本站空间' : '本地目录' }}」里递归查找文件名与文本内容，
          命中后可点开直接跳到编辑器对应行
        </p>
      </div>

      <template v-else>
        <div class="summary">
          <span>命中 {{ results.length }} 个文件 · {{ totalHits }} 处（扫描 {{ scanned }} 个文件）</span>
        </div>

        <div class="list">
          <article v-for="item in results" :key="item.path" class="file">
            <button class="file-head" :title="`打开 ${item.name}`" @click="openResult(item)">
              <span class="fname" v-html="highlight(item.name)" />
              <span class="fpath">{{ item.path }}</span>
              <span v-if="item.nameHit" class="tag">文件名</span>
            </button>

            <button
              v-for="line in item.lines"
              :key="`${item.path}-${line.no}`"
              class="hit"
              :title="`跳到第 ${line.no} 行`"
              @click="openResult(item, line.no)"
            >
              <span class="no">{{ line.no }}</span>
              <code class="text" v-html="highlight(line.text)" />
            </button>
          </article>
        </div>
      </template>
    </div>

    <p class="hint">
      只扫描常见文本类型（代码、Markdown、JSON、配置等），单个文件上限 {{ formatSize(MAX_FILE_SIZE) }}，
      最多列 300 个文件；遇到大目录可用「停止」中断。
    </p>
  </div>
</template>

<style scoped>
.fs {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.seg button:disabled {
  opacity: 0.45;
  cursor: default;
}
.search {
  flex: 1;
  min-width: 0;
  padding: 6px 11px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 12px;
}
.search:focus {
  border-color: var(--accent);
}
.btn {
  padding: 5px 13px;
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
.btn.danger {
  border-color: transparent;
  background: var(--danger-soft);
  color: var(--danger);
}
.options {
  flex: none;
  display: flex;
  align-items: center;
  gap: 11px;
  flex-wrap: wrap;
  font-size: 10.5px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
}
.opt {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-dim);
}
.ext-input {
  width: 76px;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
}
.ext-input:focus {
  border-color: var(--accent);
}
.spacer {
  margin-left: auto;
}
.status {
  font-size: 10.5px;
  color: var(--text-faint);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status.ok {
  color: var(--success);
}
.status.err {
  color: var(--danger);
}
.status.running {
  color: var(--accent);
}
.cur-path {
  margin-left: 6px;
  color: var(--text-faint);
}
.result {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  text-align: center;
}
.empty .big {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.empty .small {
  margin: 0;
  max-width: 420px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-faint);
}
.summary {
  flex: none;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
  font-size: 10.5px;
  color: var(--text-dim);
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.file {
  border-bottom: 1px solid var(--border);
}
.file:last-child {
  border-bottom: none;
}
.file-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  text-align: left;
}
.file-head:hover {
  background: var(--fill-1);
}
.fname {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.fpath {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag {
  flex: none;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 9px;
  line-height: 15px;
}
.hit {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 3px 12px 3px 22px;
  text-align: left;
}
.hit:hover {
  background: var(--accent-soft);
}
.no {
  flex: none;
  width: 34px;
  text-align: right;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.text {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
}
.text :deep(mark) {
  padding: 0 1px;
  border-radius: 2px;
  background: rgba(255, 204, 0, 0.45);
  color: var(--text);
}
.fname :deep(mark) {
  padding: 0 1px;
  border-radius: 2px;
  background: rgba(255, 204, 0, 0.45);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
</style>
