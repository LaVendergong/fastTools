<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:calculator'
const DIGITS = 15
const ERROR_TEXT = '不能除以零'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const displayRaw = ref('0')
const expression = ref('')
const accumulator = ref(null)
const pendingOp = ref('')
const waitingForOperand = ref(false)
const justEvaluated = ref(false)
const lastOp = ref('')
const lastOperand = ref(null)

const memory = ref(0)
const memoryActive = ref(false)
const history = ref(saved.history ?? [])
const showHistory = ref(false)
const error = ref('')

watch(
  history,
  () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ history: history.value.slice(0, 20) })),
  { deep: true },
)

const grouped = computed(() => {
  const raw = displayRaw.value
  if (raw === ERROR_TEXT) return raw
  const negative = raw.startsWith('-')
  const body = negative ? raw.slice(1) : raw
  const [int, dec] = body.split('.')
  const withComma = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const text = dec !== undefined ? `${withComma}.${dec}` : withComma
  return negative ? `-${text}` : text
})

const isSmall = computed(() => grouped.value.length > 10 || displayRaw.value === ERROR_TEXT)

function round(n) {
  if (!Number.isFinite(n)) return n
  return Number(n.toPrecision(DIGITS))
}

function formatValue(n) {
  if (!Number.isFinite(n)) return ERROR_TEXT
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e16 || abs < 1e-9)) return String(n.toExponential(9))
  return String(round(n))
}

function setDisplay(n) {
  displayRaw.value = formatValue(n)
  error.value = displayRaw.value === ERROR_TEXT ? ERROR_TEXT : ''
}

function compute(a, b, op) {
  switch (op) {
    case '+':
      return a + b
    case '−':
      return a - b
    case '×':
      return a * b
    case '÷':
      return b === 0 ? NaN : a / b
    default:
      return b
  }
}

function inputDigit(d) {
  if (error.value) clearAll()
  if (waitingForOperand.value || justEvaluated.value) {
    displayRaw.value = d
    waitingForOperand.value = false
    if (justEvaluated.value) expression.value = ''
    justEvaluated.value = false
    return
  }
  if (displayRaw.value.replace('-', '').replace('.', '').length >= DIGITS) return
  displayRaw.value = displayRaw.value === '0' ? d : displayRaw.value + d
}

function inputDot() {
  if (error.value) clearAll()
  if (waitingForOperand.value || justEvaluated.value) {
    displayRaw.value = '0.'
    waitingForOperand.value = false
    justEvaluated.value = false
    return
  }
  if (!displayRaw.value.includes('.')) displayRaw.value += '.'
}

function toggleSign() {
  if (displayRaw.value === '0') return
  displayRaw.value = displayRaw.value.startsWith('-') ? displayRaw.value.slice(1) : `-${displayRaw.value}`
}

function backspace() {
  if (waitingForOperand.value || justEvaluated.value) return
  displayRaw.value = displayRaw.value.length > 1 ? displayRaw.value.slice(0, -1) : '0'
  if (displayRaw.value === '-') displayRaw.value = '0'
}

function clearEntry() {
  displayRaw.value = '0'
  error.value = ''
}

function clearAll() {
  displayRaw.value = '0'
  expression.value = ''
  accumulator.value = null
  pendingOp.value = ''
  waitingForOperand.value = false
  justEvaluated.value = false
  lastOp.value = ''
  lastOperand.value = null
  error.value = ''
}

function setOperator(op) {
  if (error.value) return
  const value = Number(displayRaw.value)

  if (pendingOp.value && !waitingForOperand.value) {
    const result = compute(accumulator.value, value, pendingOp.value)
    setDisplay(result)
    accumulator.value = Number.isFinite(result) ? result : null
    if (!Number.isFinite(result)) return
  } else if (accumulator.value === null) {
    accumulator.value = value
  }

  pendingOp.value = op
  waitingForOperand.value = true
  justEvaluated.value = false
  expression.value = `${displayRaw.value} ${op}`
}

function equals() {
  if (error.value) return

  if (pendingOp.value) {
    const right = Number(displayRaw.value)
    const left = accumulator.value
    const result = compute(left, right, pendingOp.value)
    const exprText = `${formatValue(left)} ${pendingOp.value} ${displayRaw.value} =`
    setDisplay(result)
    if (Number.isFinite(result)) {
      history.value.unshift({ expr: exprText, result: grouped.value })
      if (history.value.length > 20) history.value.pop()
      lastOp.value = pendingOp.value
      lastOperand.value = right
      accumulator.value = result
    }
    pendingOp.value = ''
    waitingForOperand.value = true
    justEvaluated.value = true
    expression.value = ''
    return
  }

  if (justEvaluated.value && lastOp.value && lastOperand.value !== null) {
    const result = compute(Number(displayRaw.value), lastOperand.value, lastOp.value)
    setDisplay(result)
    if (Number.isFinite(result)) {
      history.value.unshift({
        expr: `${formatValue(Number(displayRaw.value))} ${lastOp.value} ${lastOperand.value} =`,
        result: grouped.value,
      })
    }
  }
}

function percent() {
  if (error.value) return
  const value = Number(displayRaw.value)
  const result = pendingOp.value && accumulator.value !== null ? (accumulator.value * value) / 100 : value / 100
  setDisplay(result)
  waitingForOperand.value = false
}

function unary(kind) {
  if (error.value) return
  const value = Number(displayRaw.value)
  let result
  let label
  if (kind === 'reciprocal') {
    result = value === 0 ? NaN : 1 / value
    label = `1/(${displayRaw.value})`
  } else if (kind === 'square') {
    result = value * value
    label = `sqr(${displayRaw.value})`
  } else {
    result = value < 0 ? NaN : Math.sqrt(value)
    label = `√(${displayRaw.value})`
  }
  setDisplay(result)
  expression.value = label
  waitingForOperand.value = false
  justEvaluated.value = false
}

function memoryStore() {
  memory.value = Number(displayRaw.value)
  memoryActive.value = true
}

function memoryRecall() {
  if (!memoryActive.value) return
  displayRaw.value = formatValue(memory.value)
  waitingForOperand.value = false
}

function memoryClear() {
  memory.value = 0
  memoryActive.value = false
}

function memoryAdd() {
  memory.value += Number(displayRaw.value)
  memoryActive.value = true
}

function memorySub() {
  memory.value -= Number(displayRaw.value)
  memoryActive.value = true
}

function pickHistory(item) {
  setDisplay(Number(String(item.result).replace(/,/g, '')))
  waitingForOperand.value = false
  justEvaluated.value = true
}

function onKeydown(e) {
  const key = e.key
  if (/^[0-9]$/.test(key)) return inputDigit(key)
  const map = {
    '.': inputDot,
    '+': () => setOperator('+'),
    '-': () => setOperator('−'),
    '*': () => setOperator('×'),
    '/': () => setOperator('÷'),
    '=': equals,
    Enter: equals,
    Escape: clearAll,
    Backspace: backspace,
    Delete: clearEntry,
    '%': percent,
  }
  if (key === 'c' || key === 'C') return clearAll()
  const fn = map[key]
  if (fn) {
    e.preventDefault()
    fn()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="calc-wrap">
    <div class="calc">
      <div class="topbar">
        <span class="mode">标准</span>
        <button class="hist-btn" :class="{ on: showHistory }" @click="showHistory = !showHistory">
          历史
        </button>
      </div>

      <div class="screen">
        <div class="expr">{{ expression || '&nbsp;' }}</div>
        <div class="value" :class="{ small: isSmall }">{{ grouped }}</div>
      </div>

      <div class="memory">
        <button :disabled="!memoryActive" @click="memoryClear">MC</button>
        <button :disabled="!memoryActive" @click="memoryRecall">MR</button>
        <button @click="memoryAdd">M+</button>
        <button @click="memorySub">M−</button>
        <button @click="memoryStore">MS</button>
      </div>

      <div class="keys">
        <button class="fn" @click="percent">%</button>
        <button class="fn" @click="clearEntry">CE</button>
        <button class="fn" @click="clearAll">C</button>
        <button class="fn" @click="backspace">⌫</button>

        <button class="fn" @click="unary('reciprocal')">¹⁄ₓ</button>
        <button class="fn" @click="unary('square')">x²</button>
        <button class="fn" @click="unary('sqrt')">√x</button>
        <button class="op" @click="setOperator('÷')">÷</button>

        <button class="num" @click="inputDigit('7')">7</button>
        <button class="num" @click="inputDigit('8')">8</button>
        <button class="num" @click="inputDigit('9')">9</button>
        <button class="op" @click="setOperator('×')">×</button>

        <button class="num" @click="inputDigit('4')">4</button>
        <button class="num" @click="inputDigit('5')">5</button>
        <button class="num" @click="inputDigit('6')">6</button>
        <button class="op" @click="setOperator('−')">−</button>

        <button class="num" @click="inputDigit('1')">1</button>
        <button class="num" @click="inputDigit('2')">2</button>
        <button class="num" @click="inputDigit('3')">3</button>
        <button class="op" @click="setOperator('+')">+</button>

        <button class="num" @click="toggleSign">±</button>
        <button class="num" @click="inputDigit('0')">0</button>
        <button class="num" @click="inputDot">.</button>
        <button class="eq" @click="equals">=</button>
      </div>
    </div>

    <aside v-if="showHistory" class="history">
      <div class="history-head">历史记录</div>
      <div class="history-list">
        <p v-if="!history.length" class="empty">还没有计算记录</p>
        <button v-for="(h, i) in history" :key="i" class="history-item" @click="pickHistory(h)">
          <span class="h-expr">{{ h.expr }}</span>
          <span class="h-result">{{ h.result }}</span>
        </button>
      </div>
      <button v-if="history.length" class="clear-history" @click="history = []">清空历史</button>
    </aside>
  </div>
</template>

<style scoped>
.calc-wrap {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
}
.calc {
  width: 340px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #f9f9fb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.topbar {
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 2px;
}
.mode {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}
.hist-btn {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.hist-btn:hover,
.hist-btn.on {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text);
}
.screen {
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-end;
  gap: 4px;
  min-height: 92px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.expr {
  min-height: 16px;
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.value {
  font-size: 34px;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.value.small {
  font-size: 24px;
}
.memory {
  flex: none;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.memory button {
  padding: 5px 0;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--text-dim);
  background: transparent;
  font-weight: 500;
}
.memory button:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text);
}
.memory button:disabled {
  opacity: 0.35;
  cursor: default;
}
.keys {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(6, 1fr);
  gap: 6px;
}
.keys button {
  border-radius: 8px;
  font-size: 17px;
  font-weight: 500;
  transition: background 0.1s ease, transform 0.06s ease;
}
.keys button:active {
  transform: scale(0.97);
}
.num {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.07);
  color: var(--text);
}
.num:hover {
  background: #f2f2f5;
}
.fn {
  background: #f0f0f3;
  border: 1px solid transparent;
  color: var(--text);
  font-size: 15px;
}
.fn:hover {
  background: #e6e6ea;
}
.op {
  background: #f0f0f3;
  border: 1px solid transparent;
  color: var(--text);
}
.op:hover {
  background: #e6e6ea;
}
.eq {
  background: var(--accent);
  color: #fff;
}
.eq:hover {
  background: #0071e3;
}
.history {
  width: 240px;
  flex: none;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.history-head {
  flex: none;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
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
  font-size: 11px;
  color: var(--text-dim);
}
.h-result {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.empty {
  margin: 14px 8px;
  font-size: 11.5px;
  color: var(--text-dim);
  text-align: center;
}
.clear-history {
  flex: none;
  padding: 7px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 11.5px;
  color: var(--accent);
}
</style>
