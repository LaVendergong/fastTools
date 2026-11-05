<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'

const STORAGE_KEY = 'toolbox:text-batch'

/* ---------------- 操作定义 ---------------- */

const GROUPS = [
  {
    name: '大小写',
    ops: [
      { id: 'upper', name: '全部大写' },
      { id: 'lower', name: '全部小写' },
      { id: 'capitalize', name: '每行首字母大写' },
      { id: 'titleCase', name: '每词首字母大写' },
    ],
  },
  {
    name: '行处理',
    ops: [
      { id: 'trim', name: '去行首尾空格' },
      { id: 'removeEmpty', name: '删除空行' },
      { id: 'dedupe', name: '去重行' },
      { id: 'sortAsc', name: '升序排列' },
      { id: 'sortDesc', name: '降序排列' },
      { id: 'reverse', name: '反转行序' },
      { id: 'shuffle', name: '随机打乱' },
      { id: 'joinLines', name: '合并为一行', params: { sep: ' ' } },
      { id: 'addLineNo', name: '加行号', params: { start: 1, sep: '. ' } },
      { id: 'addAffix', name: '加前后缀', params: { prefix: '', suffix: '' } },
    ],
  },
  {
    name: '筛选提取',
    ops: [
      { id: 'filterInclude', name: '只保留包含', params: { value: '', regex: false } },
      { id: 'filterExclude', name: '排除包含', params: { value: '', regex: false } },
      { id: 'extract', name: '正则提取', params: { pattern: '' } },
    ],
  },
  {
    name: '字符',
    ops: [
      { id: 'toFull', name: '半角 → 全角' },
      { id: 'toHalf', name: '全角 → 半角' },
      { id: 'collapseSpace', name: '合并连续空格' },
      { id: 'stripHtml', name: '清除 HTML 标签' },
      { id: 'stripPunct', name: '去掉标点符号' },
    ],
  },
]

const ALL_OPS = GROUPS.flatMap((g) => g.ops)
const defOf = (id) => ALL_OPS.find((o) => o.id === id) || { id, name: id }

const saved = readJSON(STORAGE_KEY)

const input = ref(saved.input ?? '')
const chain = ref(
  (saved.chain || []).map((op) => ({
    uid: op.uid || Math.random().toString(36).slice(2),
    id: op.id,
    params: { ...(defOf(op.id).params || {}), ...(op.params || {}) },
  })),
)

/* ---------------- 文本变换 ---------------- */

const toLines = (text) => text.split('\n')

function toFullWidth(text) {
  return text
    .replace(/[\x21-\x7E]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0))
    .replace(/ /g, '\u3000')
}

function toHalfWidth(text) {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
}

// 打乱用固定种子，保证同样的输入得到同样结果（否则每次输入都乱跳）
function seededShuffle(lines, seed) {
  let s = seed || 1
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const arr = [...lines]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function buildMatcher(value, regex) {
  if (!value) return () => true
  if (regex) {
    try {
      const re = new RegExp(value)
      return (line) => re.test(line)
    } catch {
      return () => false
    }
  }
  return (line) => line.includes(value)
}

function applyOp(op, text) {
  const p = op.params || {}
  switch (op.id) {
    case 'upper':
      return text.toUpperCase()
    case 'lower':
      return text.toLowerCase()
    case 'capitalize':
      return toLines(text)
        .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
        .join('\n')
    case 'titleCase':
      return toLines(text)
        .map((l) => l.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()))
        .join('\n')
    case 'trim':
      return toLines(text)
        .map((l) => l.trim())
        .join('\n')
    case 'removeEmpty':
      return toLines(text)
        .filter((l) => l.trim() !== '')
        .join('\n')
    case 'dedupe': {
      const seen = new Set()
      return toLines(text)
        .filter((l) => {
          if (seen.has(l)) return false
          seen.add(l)
          return true
        })
        .join('\n')
    }
    case 'sortAsc':
      return [...toLines(text)].sort((a, b) => a.localeCompare(b, 'zh-CN')).join('\n')
    case 'sortDesc':
      return [...toLines(text)].sort((a, b) => b.localeCompare(a, 'zh-CN')).join('\n')
    case 'reverse':
      return [...toLines(text)].reverse().join('\n')
    case 'shuffle': {
      const seed = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), text.length)
      return seededShuffle(toLines(text), seed).join('\n')
    }
    case 'joinLines':
      return toLines(text)
        .filter((l) => l.trim() !== '')
        .join(p.sep ?? ' ')
    case 'addLineNo': {
      const start = Number(p.start) || 1
      return toLines(text)
        .map((l, i) => `${start + i}${p.sep ?? '. '}${l}`)
        .join('\n')
    }
    case 'addAffix':
      return toLines(text)
        .map((l) => `${p.prefix || ''}${l}${p.suffix || ''}`)
        .join('\n')
    case 'filterInclude': {
      const match = buildMatcher(p.value, p.regex)
      return toLines(text)
        .filter((l) => match(l))
        .join('\n')
    }
    case 'filterExclude': {
      const match = buildMatcher(p.value, p.regex)
      return toLines(text)
        .filter((l) => !match(l))
        .join('\n')
    }
    case 'extract': {
      if (!p.pattern) return text
      try {
        const re = new RegExp(p.pattern, 'g')
        const out = []
        let m
        while ((m = re.exec(text)) !== null) {
          out.push(m[1] ?? m[0])
          if (m[0] === '') re.lastIndex++
          if (out.length > 20000) break
        }
        return out.join('\n')
      } catch {
        return text
      }
    }
    case 'toFull':
      return toFullWidth(text)
    case 'toHalf':
      return toHalfWidth(text)
    case 'collapseSpace':
      return text.replace(/[ \t]+/g, ' ')
    case 'stripHtml':
      return text.replace(/<[^>]*>/g, '')
    case 'stripPunct':
      return text.replace(/[!-/:-@[-`{-~\u3001\u3002\uFF0C\uFF01\uFF1F\uFF1B\uFF1A\u300A\u300B\u300C\u300D\uFF08\uFF09]/g, '')
    default:
      return text
  }
}

const output = computed(() => {
  let text = input.value
  for (const op of chain.value) text = applyOp(op, text)
  return text
})

/* ---------------- 统计 ---------------- */

const stats = computed(() => {
  const inLines = input.value ? input.value.split('\n').length : 0
  const outLines = output.value ? output.value.split('\n').length : 0
  const outChars = output.value.length
  const unique = new Set(output.value ? output.value.split('\n') : []).size
  return { inLines, outLines, outChars, unique }
})

/* ---------------- 操作链管理 ---------------- */

const pending = ref('')
const copied = ref(false)
const message = ref('')

function addOp() {
  const id = pending.value
  if (!id) return
  const def = defOf(id)
  chain.value.push({
    uid: Math.random().toString(36).slice(2),
    id,
    params: JSON.parse(JSON.stringify(def.params || {})),
  })
  pending.value = ''
}

function removeOp(index) {
  chain.value.splice(index, 1)
}

function moveOp(index, delta) {
  const target = index + delta
  if (target < 0 || target >= chain.value.length) return
  const list = [...chain.value]
  ;[list[index], list[target]] = [list[target], list[index]]
  chain.value = list
}

function clearChain() {
  chain.value = []
}

/* ---------------- 输入输出 ---------------- */

const SAMPLE = `苹果
香蕉
苹果
  橙子  
香蕉
西瓜`

function loadSample() {
  input.value = SAMPLE
  chain.value = []
}

function clearAll() {
  input.value = ''
  chain.value = []
  message.value = ''
}

function outputToInput() {
  input.value = output.value
  chain.value = []
  message.value = '已把结果作为新输入'
  setTimeout(() => {
    if (message.value.startsWith('已把')) message.value = ''
  }, 1800)
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
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'output.txt'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

/* ---------------- 持久化 ---------------- */

let saveTimer = null
watch(
  [input, chain],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ input: input.value, chain: chain.value }),
      )
    }, 400)
  },
  { deep: true },
)

onMounted(() => {
  if (!input.value) loadSample()
})
</script>

<template>
  <div class="batch">
    <div class="toolbar">
      <span class="label">操作链</span>
      <select v-model="pending" class="add-select" @change="addOp">
        <option value="">＋ 添加操作…</option>
        <optgroup v-for="g in GROUPS" :key="g.name" :label="g.name">
          <option v-for="op in g.ops" :key="op.id" :value="op.id">{{ op.name }}</option>
        </optgroup>
      </select>
      <button class="btn" :disabled="!chain.length" @click="clearChain">清空操作</button>
      <span class="spacer" />
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" @click="clearAll">清空全部</button>
      <button class="btn" :disabled="!output" @click="outputToInput">结果作为输入</button>
      <button class="btn" :disabled="!output" @click="downloadOutput">下载</button>
      <button class="btn primary" :disabled="!output" @click="copyOutput">
        {{ copied ? '已复制' : '复制结果' }}
      </button>
    </div>

    <div v-if="chain.length" class="chain">
      <div v-for="(op, i) in chain" :key="op.uid" class="op-card">
        <div class="op-head">
          <span class="op-index">{{ i + 1 }}</span>
          <span class="op-name">{{ defOf(op.id).name }}</span>
          <button class="mini" :disabled="i === 0" title="上移" @click="moveOp(i, -1)">↑</button>
          <button class="mini" :disabled="i === chain.length - 1" title="下移" @click="moveOp(i, 1)">↓</button>
          <button class="mini del" title="删除" @click="removeOp(i)">✕</button>
        </div>

        <div v-if="op.id === 'addLineNo'" class="op-body">
          <span class="p">起始</span>
          <input v-model.number="op.params.start" class="num" type="number" />
          <span class="p">分隔</span>
          <input v-model="op.params.sep" class="sep" maxlength="3" />
        </div>

        <div v-else-if="op.id === 'addAffix'" class="op-body">
          <input v-model="op.params.prefix" class="txt" placeholder="前缀" spellcheck="false" />
          <input v-model="op.params.suffix" class="txt" placeholder="后缀" spellcheck="false" />
        </div>

        <div v-else-if="op.id === 'joinLines'" class="op-body">
          <span class="p">分隔符</span>
          <input v-model="op.params.sep" class="sep" spellcheck="false" />
        </div>

        <div v-else-if="op.id === 'filterInclude' || op.id === 'filterExclude'" class="op-body">
          <input v-model="op.params.value" class="txt" placeholder="关键词" spellcheck="false" />
          <label class="chk"><input v-model="op.params.regex" type="checkbox" />正则</label>
        </div>

        <div v-else-if="op.id === 'extract'" class="op-body">
          <input
            v-model="op.params.pattern"
            class="txt wide"
            placeholder="正则，取捕获组 1，如 \\d+"
            spellcheck="false"
          />
        </div>
      </div>
    </div>

    <p v-else class="chain-empty">还没有操作 —— 从上方「添加操作」开始，按顺序执行</p>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">输入</span>
          <span class="pane-meta">{{ stats.inLines }} 行</span>
        </header>
        <textarea v-model="input" class="code" spellcheck="false" placeholder="粘贴要处理的文本" />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">输出</span>
          <span class="pane-meta">
            {{ stats.outLines }} 行 · {{ stats.outChars }} 字符
            <template v-if="stats.outLines !== stats.unique"> · 去重后 {{ stats.unique }}</template>
          </span>
        </header>
        <pre class="code output">{{ output || '（处理后结果显示在这里）' }}</pre>
      </section>
    </div>

    <p v-if="message" class="msg">{{ message }}</p>
  </div>
</template>

<style scoped>
.batch {
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
.label {
  font-size: 11.5px;
  color: var(--text-dim);
}
.add-select {
  padding: 4px 8px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--accent);
  outline: none;
  font-size: 11.5px;
}
.spacer {
  margin-left: auto;
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

.chain {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--fill-1);
  overflow-x: auto;
}
.op-card {
  flex: none;
  min-width: 128px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-1);
}
.op-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.op-index {
  flex: none;
  width: 15px;
  height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent-soft);
  font-size: 9.5px;
  color: var(--accent);
  font-weight: 600;
}
.op-name {
  flex: 1;
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
}
.mini {
  flex: none;
  width: 15px;
  height: 15px;
  border-radius: 3px;
  font-size: 9px;
  color: var(--text-faint);
}
.mini:hover:not(:disabled) {
  background: var(--fill-2);
  color: var(--text);
}
.mini:disabled {
  opacity: 0.3;
  cursor: default;
}
.mini.del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.op-body {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
}
.p {
  font-size: 10px;
  color: var(--text-faint);
  white-space: nowrap;
}
.num,
.sep,
.txt {
  width: 46px;
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
}
.sep {
  width: 34px;
  text-align: center;
}
.txt {
  width: 72px;
}
.txt.wide {
  width: 150px;
}
.num:focus,
.sep:focus,
.txt:focus {
  border-color: var(--accent);
}
.chk {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--text-dim);
  white-space: nowrap;
  cursor: pointer;
}
.chain-empty {
  flex: none;
  margin: 0;
  padding: 10px;
  border: 1px dashed var(--border);
  border-radius: 9px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
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
.pane-meta {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
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
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
}
.output {
  white-space: pre;
  word-break: normal;
}
.msg {
  flex: none;
  margin: 0;
  font-size: 11px;
  color: var(--accent);
}
</style>
