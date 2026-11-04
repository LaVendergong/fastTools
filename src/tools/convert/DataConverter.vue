<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'

const FORMATS = [
  { id: 'json', name: 'JSON' },
  { id: 'yaml', name: 'YAML' },
  { id: 'xml', name: 'XML' },
  { id: 'csv', name: 'CSV' },
]

const inputFormat = ref('json')
const outputFormat = ref('yaml')
const input = ref('')
const indent = ref(2)
const csvDelimiter = ref(',')
const csvHeader = ref(true)
const xmlRoot = ref('root')
const copied = ref(false)

const SAMPLE = JSON.stringify(
  {
    name: '工具箱',
    version: '1.0.0',
    tools: [
      { id: 'json', name: 'JSON 格式化', offline: true },
      { id: 'jwt', name: 'JWT 解析', offline: true },
    ],
    stats: { total: 23, categories: 7 },
  },
  null,
  2,
)

/* ---------------- 解析：任意格式 → JS 值 ---------------- */

function parseJson(text) {
  return JSON.parse(text)
}

function parseYaml(text) {
  return yamlLoad(text)
}

function nodeToValue(node) {
  const obj = {}
  for (const attr of node.attributes) obj[`@_${attr.name}`] = attr.value

  const children = [...node.children]
  if (!children.length) {
    const text = (node.textContent || '').trim()
    if (!Object.keys(obj).length) return text
    if (text) obj['#text'] = text
    return obj
  }

  const grouped = {}
  for (const child of children) {
    const value = nodeToValue(child)
    const key = child.nodeName
    if (grouped[key] === undefined) grouped[key] = value
    else if (Array.isArray(grouped[key])) grouped[key].push(value)
    else grouped[key] = [grouped[key], value]
  }
  return { ...obj, ...grouped }
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error(`XML 语法错误：${err.textContent.trim().split('\n')[0]}`)
  const root = doc.documentElement
  return { [root.nodeName]: nodeToValue(root) }
}

function parseCsv(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }

  const data = rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
  if (!data.length) throw new Error('CSV 内容为空')
  if (!csvHeader.value) return data

  const head = data[0]
  return data.slice(1).map((r) => Object.fromEntries(head.map((k, i) => [k.trim() || `列${i + 1}`, r[i] ?? ''])))
}

function parseAny(text, format) {
  const src = text.trim()
  if (!src) return { ok: true, empty: true, value: null }

  try {
    let value
    if (format === 'json') value = parseJson(src)
    else if (format === 'yaml') value = parseYaml(src)
    else if (format === 'xml') value = parseXml(src)
    else value = parseCsv(src, csvDelimiter.value)
    return { ok: true, value, empty: false }
  } catch (e) {
    return { ok: false, error: e.message, value: null, empty: false }
  }
}

/* ---------------- 序列化：JS 值 → 任意格式 ---------------- */

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nodeToXml(name, value, depth) {
  const pad = '  '.repeat(depth)

  if (Array.isArray(value)) {
    return value.map((v) => nodeToXml(name, v, depth)).join('\n')
  }
  if (value === null || value === undefined) return `${pad}<${name}/>`
  if (typeof value !== 'object') return `${pad}<${name}>${escapeXml(value)}</${name}>`

  const attrs = []
  const children = []
  let text = ''

  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith('@_')) attrs.push(`${key.slice(2)}="${escapeXml(val)}"`)
    else if (key === '#text') text = String(val)
    else children.push(nodeToXml(key, val, depth + 1))
  }

  const attrText = attrs.length ? ` ${attrs.join(' ')}` : ''
  if (!children.length && !text) return `${pad}<${name}${attrText}/>`
  if (!children.length) return `${pad}<${name}${attrText}>${escapeXml(text)}</${name}>`
  return `${pad}<${name}${attrText}>\n${children.join('\n')}\n${pad}</${name}>`
}

function toXml(value) {
  const root = (xmlRoot.value || 'root').trim() || 'root'
  let body = value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value)
    // 顶层只有单个键且与根名一致时，避免再包一层
    if (keys.length === 1 && keys[0] === root) body = value[root]
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${nodeToXml(root, body, 0)}`
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(text) || text.includes(csvDelimiter.value) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(value) {
  const rows = Array.isArray(value) ? value : [value]
  if (!rows.length) return ''

  const objects = rows.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? row : { value: row }))
  const headers = [...new Set(objects.flatMap((o) => Object.keys(o)))]
  const lines = []

  if (csvHeader.value) lines.push(headers.map(csvCell).join(csvDelimiter.value))
  for (const obj of objects) {
    lines.push(headers.map((h) => csvCell(obj[h])).join(csvDelimiter.value))
  }
  return lines.join('\n')
}

function stringifyAny(value, format) {
  if (value === null || value === undefined) return ''
  if (format === 'json') return JSON.stringify(value, null, Number(indent.value))
  if (format === 'yaml') {
    return yamlDump(value, { indent: Number(indent.value), lineWidth: -1, noRefs: true, sortKeys: false })
  }
  if (format === 'xml') return toXml(value)
  return toCsv(value)
}

/* ---------------- 转换 ---------------- */

const parsed = computed(() => parseAny(input.value, inputFormat.value))

const output = computed(() => {
  if (!parsed.value.ok || parsed.value.empty) return ''
  try {
    return stringifyAny(parsed.value.value, outputFormat.value)
  } catch (e) {
    return `// 转换失败：${e.message}`
  }
})

const outputError = computed(() => (output.value.startsWith('// 转换失败') ? output.value.slice(3) : ''))

const stats = computed(() => ({
  inLines: input.value ? input.value.split('\n').length : 0,
  inChars: input.value.length,
  outLines: output.value ? output.value.split('\n').length : 0,
  outChars: output.value.length,
}))

function swap() {
  const converted = output.value
  if (!converted || outputError.value) return
  const from = inputFormat.value
  input.value = converted
  inputFormat.value = outputFormat.value
  outputFormat.value = from
}

async function copyOutput() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用 */
  }
}

function downloadOutput() {
  if (!output.value) return
  const ext = { json: 'json', yaml: 'yaml', xml: 'xml', csv: 'csv' }[outputFormat.value]
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `converted.${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function loadSample() {
  inputFormat.value = 'json'
  outputFormat.value = 'yaml'
  input.value = SAMPLE
}

function clearAll() {
  input.value = ''
}

let saveTimer = null
watch(
  [input, inputFormat, outputFormat, indent, csvDelimiter, csvHeader, xmlRoot],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        'toolbox:convert',
        JSON.stringify({
          input: input.value,
          inputFormat: inputFormat.value,
          outputFormat: outputFormat.value,
          indent: indent.value,
          csvDelimiter: csvDelimiter.value,
          csvHeader: csvHeader.value,
          xmlRoot: xmlRoot.value,
        }),
      )
    }, 400)
  },
)

onMounted(() => {
  const saved = localStorage.getItem('toolbox:convert')
  if (!saved) {
    loadSample()
    return
  }
  try {
    const data = JSON.parse(saved)
    input.value = data.input ?? ''
    inputFormat.value = data.inputFormat ?? 'json'
    outputFormat.value = data.outputFormat ?? 'yaml'
    indent.value = data.indent ?? 2
    csvDelimiter.value = data.csvDelimiter ?? ','
    csvHeader.value = data.csvHeader ?? true
    xmlRoot.value = data.xmlRoot ?? 'root'
  } catch {
    loadSample()
  }
})
</script>

<template>
  <div class="convert">
    <div class="toolbar">
      <div class="flow">
        <select v-model="inputFormat" class="select">
          <option v-for="f in FORMATS" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <span class="arrow">→</span>
        <select v-model="outputFormat" class="select">
          <option v-for="f in FORMATS" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </div>

      <button class="btn" @click="swap">⇄ 交换</button>
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!output" @click="copyOutput">
        {{ copied ? '已复制' : '复制结果' }}
      </button>
      <button class="btn" :disabled="!output" @click="downloadOutput">下载</button>
    </div>

    <div class="options">
      <label class="opt">
        缩进
        <select v-model.number="indent" class="mini-select">
          <option :value="2">2 空格</option>
          <option :value="4">4 空格</option>
          <option :value="8">8 空格</option>
        </select>
      </label>
      <label class="opt">
        CSV 分隔符
        <select v-model="csvDelimiter" class="mini-select">
          <option value=",">逗号 ,</option>
          <option value=";">分号 ;</option>
          <option :value="'\t'">制表符</option>
        </select>
      </label>
      <label class="opt checkbox">
        <input v-model="csvHeader" type="checkbox" />
        CSV 首行作表头
      </label>
      <label class="opt">
        XML 根节点
        <input v-model="xmlRoot" class="mini-input" spellcheck="false" />
      </label>
      <span class="stats">
        {{ stats.inChars }} → {{ stats.outChars }} 字符 · {{ stats.outLines }} 行
      </span>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">输入 · {{ FORMATS.find((f) => f.id === inputFormat)?.name }}</span>
          <span v-if="!parsed.ok" class="pane-err">解析错误</span>
        </header>
        <textarea v-model="input" class="code-input" spellcheck="false" placeholder="在这里粘贴内容，或点上方「示例」" />
        <p v-if="!parsed.ok" class="err-line">{{ parsed.error }}</p>
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">输出 · {{ FORMATS.find((f) => f.id === outputFormat)?.name }}</span>
          <span class="pane-meta">{{ output ? `${stats.outLines} 行` : '等待输入' }}</span>
        </header>
        <pre class="code-output" :class="{ error: outputError }">{{ output || '（转换结果会显示在这里）' }}</pre>
      </section>
    </div>

    <p class="hint">
      支持任意两种格式互转：JSON ⇄ YAML ⇄ XML ⇄ CSV。XML 用 <code>@_属性</code> 表示属性、<code>#text</code> 表示文本节点；CSV 仅适合表格型数据（对象数组）。
    </p>
  </div>
</template>

<style scoped>
.convert {
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
}
.flow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 6px;
}
.select {
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 12px;
}
.arrow {
  font-size: 13px;
  color: var(--text-dim);
}
.btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
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
.options {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--fill-1);
  flex-wrap: wrap;
}
.opt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.opt.checkbox {
  cursor: pointer;
}
.mini-select {
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  font-size: 11px;
  outline: none;
}
.mini-input {
  width: 78px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
}
.stats {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.panes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
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
.pane header {
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
.pane-err {
  font-size: 10.5px;
  color: var(--danger);
}
.pane-meta {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-faint);
}
.code-input {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
}
.code-output {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre;
}
.code-output.error {
  color: var(--danger);
}
.err-line {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
  word-break: break-word;
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-faint);
}
.hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
  font-size: 10px;
}
</style>
