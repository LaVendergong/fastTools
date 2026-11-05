<script setup>
import { computed, ref } from 'vue'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const NAMED = {
  '&': 'amp',
  '<': 'lt',
  '>': 'gt',
  '"': 'quot',
  "'": 'apos',
  '\u00a0': 'nbsp',
  '©': 'copy',
  '®': 'reg',
  '™': 'trade',
  '€': 'euro',
  '£': 'pound',
  '¥': 'yen',
  '¢': 'cent',
  '§': 'sect',
  '¶': 'para',
  '°': 'deg',
  '±': 'plusmn',
  '×': 'times',
  '÷': 'divide',
  '·': 'middot',
  '•': 'bull',
  '…': 'hellip',
  '—': 'mdash',
  '–': 'ndash',
  '“': 'ldquo',
  '”': 'rdquo',
  '‘': 'lsquo',
  '’': 'rsquo',
  '«': 'laquo',
  '»': 'raquo',
  '←': 'larr',
  '→': 'rarr',
  '↑': 'uarr',
  '↓': 'darr',
  '↔': 'harr',
  '∞': 'infin',
  '≠': 'ne',
  '≤': 'le',
  '≥': 'ge',
  '∑': 'sum',
  '∏': 'prod',
  '√': 'radic',
  '∫': 'int',
  '≈': 'asymp',
  '≡': 'equiv',
  'α': 'alpha',
  'β': 'beta',
  'γ': 'gamma',
  'π': 'pi',
  'Ω': 'Omega',
  '‰': 'permil',
  '†': 'dagger',
  '‡': 'Dagger',
  '♠': 'spades',
  '♥': 'hearts',
  '♦': 'diams',
  '♣': 'clubs',
}

const ENTITY_LIST = Object.entries(NAMED).map(([char, name]) => ({
  char,
  name,
  code: char.codePointAt(0),
}))

const mode = ref('encode')
const input = ref('')
const entityStyle = ref('named') // named | dec | hex
const encodeNonAscii = ref(false)
const message = ref('')

/* ---------------- 编码 / 解码 ---------------- */

function encode(text) {
  const out = []
  for (const ch of text) {
    const code = ch.codePointAt(0)
    const mustEncode = ch === '&' || ch === '<' || ch === '>' || ch === '"' || ch === "'"
    const nonAscii = code > 0x7f

    if (!mustEncode && !(encodeNonAscii.value && nonAscii)) {
      out.push(ch)
      continue
    }

    if (entityStyle.value === 'named' && NAMED[ch]) {
      out.push(`&${NAMED[ch]};`)
    } else if (entityStyle.value === 'hex') {
      out.push(`&#x${code.toString(16).toUpperCase()};`)
    } else if (entityStyle.value === 'named') {
      // 没有命名实体的字符退回十进制，保证可用
      out.push(`&#${code};`)
    } else {
      out.push(`&#${code};`)
    }
  }
  return out.join('')
}

function decode(text) {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

const output = computed(() => {
  if (!input.value) return ''
  try {
    return mode.value === 'encode' ? encode(input.value) : decode(input.value)
  } catch (e) {
    message.value = e.message
    return ''
  }
})

/* ---------------- 操作 ---------------- */


function insertEntity(item) {
  input.value += mode.value === 'encode' ? item.char : `&${item.name};`
  message.value = `已插入 &${item.name};`
  setTimeout(() => {
    if (message.value.startsWith('已插入')) message.value = ''
  }, 1500)
}

function swap() {
  if (output.value) {
    input.value = output.value
    mode.value = mode.value === 'encode' ? 'decode' : 'encode'
  } else {
    mode.value = mode.value === 'encode' ? 'decode' : 'encode'
  }
}

function clearAll() {
  input.value = ''
  message.value = ''
}

const SAMPLE = 'Tom & Jerry 的 "HTML" <div> 标签 © 2026'
</script>

<template>
  <div class="entity">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ on: mode === 'encode' }" @click="mode = 'encode'">编码</button>
        <button :class="{ on: mode === 'decode' }" @click="mode = 'decode'">解码</button>
      </div>

      <template v-if="mode === 'encode'">
        <select v-model="entityStyle" class="select">
          <option value="named">命名实体（&amp;copy;）</option>
          <option value="dec">十进制（&amp;#169;）</option>
          <option value="hex">十六进制（&amp;#xA9;）</option>
        </select>
        <label class="chk">
          <input v-model="encodeNonAscii" type="checkbox" />
          同时编码中文等非 ASCII 字符
        </label>
      </template>

      <span class="spacer" />
      <button class="btn" @click="input = SAMPLE">示例</button>
      <button class="btn" @click="swap">⇄ 结果作为输入</button>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!output" @click="copy(output, 'out')">
        {{ copied === 'out' ? '已复制' : '复制结果' }}
      </button>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">{{ mode === 'encode' ? '原始文本' : '含实体的文本' }}</span>
          <span class="pane-meta">{{ input.length }} 字符</span>
        </header>
        <textarea
          v-model="input"
          class="code"
          spellcheck="false"
          :placeholder="mode === 'encode' ? '输入要编码的文本，如 <div>Tom & Jerry</div>' : '输入含实体的文本，如 &lt;div&gt;'"
        />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">{{ mode === 'encode' ? '编码结果' : '解码结果' }}</span>
          <span class="pane-meta">{{ output.length }} 字符</span>
        </header>
        <pre class="code output">{{ output || '（结果会显示在这里）' }}</pre>
      </section>
    </div>

    <div class="entities">
      <div class="ent-head">
        <span class="ent-title">常用实体</span>
        <span class="ent-hint">点击插入</span>
        <span v-if="message" class="ent-msg">{{ message }}</span>
      </div>
      <div class="ent-list">
        <button
          v-for="item in ENTITY_LIST"
          :key="item.name"
          class="ent"
          :title="`&${item.name};  =  ${item.char}  (${item.code})`"
          @click="insertEntity(item)"
        >
          <span class="ent-char">{{ item.char }}</span>
          <span class="ent-name">&amp;{{ item.name }};</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.entity {
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
  gap: 8px;
  flex-wrap: wrap;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  padding: 4px 14px;
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
.select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
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
  font-size: 12px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
}
.entities {
  flex: none;
  max-height: 132px;
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.ent-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ent-title {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-dim);
}
.ent-hint {
  font-size: 9.5px;
  color: var(--text-faint);
}
.ent-msg {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--accent);
}
.ent-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-content: flex-start;
}
.ent {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--fill-1);
  font-size: 10.5px;
  color: var(--text-dim);
}
.ent:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.ent-char {
  font-size: 12px;
  color: var(--text);
}
.ent-name {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
}
</style>
