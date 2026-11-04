<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { evaluate } from './expr'

const expr = ref('')
const deg = ref(true)
const result = ref('')
const error = ref('')
const history = ref([])

const preview = computed(() => {
  if (!expr.value.trim()) return ''
  try {
    return String(Number(evaluate(expr.value, { deg: deg.value }).toPrecision(14)))
  } catch {
    return ''
  }
})

const groupedResult = computed(() => {
  const text = result.value
  if (!text || text === '不能除以零') return text
  const negative = text.startsWith('-')
  const body = negative ? text.slice(1) : text
  const [int, dec] = body.split('.')
  if (!/^\d+$/.test(int)) return text
  const withComma = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${dec !== undefined ? `${withComma}.${dec}` : withComma}`
})

function insert(text) {
  error.value = ''
  expr.value += text
}

function backspace() {
  expr.value = expr.value.slice(0, -1)
}

function clearAll() {
  expr.value = ''
  result.value = ''
  error.value = ''
}

function calc() {
  if (!expr.value.trim()) return
  try {
    const value = evaluate(expr.value, { deg: deg.value })
    result.value = String(Number(value.toPrecision(14)))
    error.value = ''
    history.value.unshift({ expr: expr.value, result: result.value })
    if (history.value.length > 12) history.value.pop()
  } catch (e) {
    error.value = e.message
    result.value = ''
  }
}

function reuseResult() {
  if (!result.value) return
  expr.value = result.value
  result.value = ''
}

const KEYS = [
  { label: 'DEG', kind: 'toggle', action: () => (deg.value = !deg.value) },
  { label: '(', kind: 'fn', action: () => insert('(') },
  { label: ')', kind: 'fn', action: () => insert(')') },
  { label: 'C', kind: 'fn', action: clearAll },
  { label: '⌫', kind: 'fn', action: backspace },

  { label: 'sin', kind: 'fn', action: () => insert('sin(') },
  { label: 'cos', kind: 'fn', action: () => insert('cos(') },
  { label: 'tan', kind: 'fn', action: () => insert('tan(') },
  { label: 'ln', kind: 'fn', action: () => insert('ln(') },
  { label: 'log', kind: 'fn', action: () => insert('log(') },

  { label: 'x²', kind: 'fn', action: () => insert('^2') },
  { label: 'xʸ', kind: 'fn', action: () => insert('^') },
  { label: '√x', kind: 'fn', action: () => insert('sqrt(') },
  { label: '1/x', kind: 'fn', action: () => insert('1/(') },
  { label: 'π', kind: 'fn', action: () => insert('π') },

  { label: '7', kind: 'num', action: () => insert('7') },
  { label: '8', kind: 'num', action: () => insert('8') },
  { label: '9', kind: 'num', action: () => insert('9') },
  { label: '÷', kind: 'op', action: () => insert('/') },
  { label: 'n!', kind: 'fn', action: () => insert('!') },

  { label: '4', kind: 'num', action: () => insert('4') },
  { label: '5', kind: 'num', action: () => insert('5') },
  { label: '6', kind: 'num', action: () => insert('6') },
  { label: '×', kind: 'op', action: () => insert('*') },
  { label: 'e', kind: 'fn', action: () => insert('e') },

  { label: '1', kind: 'num', action: () => insert('1') },
  { label: '2', kind: 'num', action: () => insert('2') },
  { label: '3', kind: 'num', action: () => insert('3') },
  { label: '−', kind: 'op', action: () => insert('-') },
  { label: '%', kind: 'fn', action: () => insert('%') },

  { label: '±', kind: 'num', action: () => insert('-') },
  { label: '0', kind: 'num', action: () => insert('0') },
  { label: '.', kind: 'num', action: () => insert('.') },
  { label: '+', kind: 'op', action: () => insert('+') },
  { label: '=', kind: 'eq', action: calc },
]

function onKeydown(e) {
  const key = e.key
  if ((e.ctrlKey || e.metaKey) || e.altKey) return
  if (/^[0-9+\-*/.^()!%]$/.test(key)) {
    insert(key)
    return
  }
  if (key === 'Enter' || key === '=') {
    e.preventDefault()
    calc()
  } else if (key === 'Backspace') {
    e.preventDefault()
    backspace()
  } else if (key === 'Escape') {
    clearAll()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="sci-wrap">
    <div class="sci">
      <div class="screen">
        <div class="expr-line">{{ expr || '输入表达式，例如 sin(30)+2^3' }}</div>
        <div class="result-line">
          <span v-if="error" class="error">{{ error }}</span>
          <template v-else>
            <span v-if="groupedResult" class="result">{{ groupedResult }}</span>
            <span v-else-if="preview" class="preview">= {{ preview }}</span>
            <span v-else class="hint">{{ deg ? '角度制 DEG' : '弧度制 RAD' }}</span>
          </template>
        </div>
      </div>

      <div class="keys">
        <button
          v-for="(k, i) in KEYS"
          :key="i"
          :class="[k.kind, { active: k.label === 'DEG' && deg }]"
          @click="k.action()"
        >
          {{ k.label }}
        </button>
      </div>

      <div v-if="result" class="reuse">
        <button @click="reuseResult">用结果继续计算（{{ result }}）</button>
      </div>
    </div>

    <aside class="history">
      <div class="history-head">历史记录</div>
      <div class="history-list">
        <p v-if="!history.length" class="empty">还没有计算记录</p>
        <button v-for="(h, i) in history" :key="i" class="history-item" @click="expr = h.expr">
          <span class="h-expr">{{ h.expr }}</span>
          <span class="h-result">{{ h.result }}</span>
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.sci-wrap {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 10px;
  justify-content: center;
}
.sci {
  width: 420px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-3);
  box-shadow: var(--shadow-1);
}
.screen {
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-end;
  gap: 6px;
  min-height: 96px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.expr-line {
  width: 100%;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 17px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.result-line {
  width: 100%;
  text-align: right;
  min-height: 20px;
}
.result {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.preview {
  font-size: 15px;
  color: var(--text-dim);
}
.hint {
  font-size: 11.5px;
  color: var(--text-dim);
}
.error {
  font-size: 13px;
  color: var(--danger);
}
.keys {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(7, 1fr);
  gap: 6px;
}
.keys button {
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  transition: background 0.1s ease, transform 0.06s ease;
}
.keys button:active {
  transform: scale(0.97);
}
.num {
  background: var(--panel-bg);
  border: 1px solid rgba(0, 0, 0, 0.07);
}
.num:hover {
  background: var(--surface-3);
}
.fn,
.op {
  background: var(--surface-3);
  border: 1px solid transparent;
  font-size: 13.5px;
}
.fn:hover,
.op:hover {
  background: #e6e6ea;
}
.op {
  font-size: 17px;
}
.eq {
  background: var(--accent);
  color: #fff;
  font-size: 18px;
}
.eq:hover {
  background: var(--accent-strong);
}
.toggle {
  background: #e9f2ff;
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 600;
  border: 1px solid transparent;
}
.toggle.active {
  background: var(--accent);
  color: #fff;
}
.reuse {
  flex: none;
  text-align: right;
}
.reuse button {
  font-size: 11.5px;
  color: var(--accent);
}
.history {
  width: 210px;
  flex: none;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.history-head {
  flex: none;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  font-size: 12px;
  font-weight: 600;
}
.history-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px;
}
.history-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  text-align: right;
}
.history-item:hover {
  background: var(--hover);
}
.h-expr {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.h-result {
  font-size: 13px;
  font-weight: 600;
}
.empty {
  margin: 14px 8px;
  font-size: 11.5px;
  color: var(--text-dim);
  text-align: center;
}
</style>
