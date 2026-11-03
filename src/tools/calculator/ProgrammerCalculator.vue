<script setup>
import { computed, ref } from 'vue'

const WIDTHS = [
  { label: 'QWORD', bits: 64 },
  { label: 'DWORD', bits: 32 },
  { label: 'WORD', bits: 16 },
  { label: 'BYTE', bits: 8 },
]

const BASES = [
  { id: 'hex', label: 'HEX', radix: 16 },
  { id: 'dec', label: 'DEC', radix: 10 },
  { id: 'oct', label: 'OCT', radix: 8 },
  { id: 'bin', label: 'BIN', radix: 2 },
]

const bits = ref(64)
const base = ref('dec')
const input = ref('0')
const pending = ref(null)
const op = ref('')
const waiting = ref(false)
const error = ref('')

const mask = computed(() => (1n << BigInt(bits.value)) - 1n)
const radix = computed(() => BASES.find((b) => b.id === base.value).radix)

const currentValue = computed(() => {
  const raw = input.value.replace(/\s/g, '')
  if (!raw) return 0n
  try {
    const prefix = base.value === 'hex' ? '0x' : base.value === 'bin' ? '0b' : base.value === 'oct' ? '0o' : ''
    const value = BigInt(prefix + raw)
    return BigInt.asUintN(bits.value, value)
  } catch {
    return 0n
  }
})

function format(value, radixValue) {
  const unsigned = BigInt.asUintN(bits.value, value)
  let text = unsigned.toString(radixValue).toUpperCase()
  if (radixValue === 2) text = text.padStart(bits.value, '0').replace(/\B(?=(.{4})+$)/g, ' ')
  if (radixValue === 16) text = text.replace(/\B(?=(.{4})+$)/g, ' ')
  return text
}

const displays = computed(() => {
  const value = currentValue.value
  return BASES.map((b) => {
    const text = format(value, b.radix)
    if (b.radix === 2) {
      // 二进制按每行 8 组（32 位）切成对称两行，QWORD 下即 32 + 32
      const groups = text.split(' ')
      const lines = []
      for (let i = 0; i < groups.length; i += 8) lines.push(groups.slice(i, i + 8).join(' '))
      return { ...b, text, lines }
    }
    return { ...b, text, lines: null }
  })
})

function setBase(id) {
  if (base.value === id) return
  const value = currentValue.value
  base.value = id
  const next = BASES.find((b) => b.id === id)
  input.value = format(value, next.radix).replace(/\s/g, '')
}

function pressKey(key) {
  if (error.value) {
    input.value = '0'
    error.value = ''
  }
  const isHexDigit = /^[A-F]$/.test(key)
  if (isHexDigit && base.value !== 'hex') return
  if (base.value === 'bin' && !'01'.includes(key)) return
  if (base.value === 'oct' && !/^[0-7]$/.test(key)) return

  if (waiting.value) {
    input.value = key
    waiting.value = false
    return
  }
  input.value = input.value === '0' ? key : input.value + key
  if (input.value.replace(/\s/g, '').length > 64) input.value = input.value.slice(0, 64)
}

function backspace() {
  if (waiting.value) return
  input.value = input.value.length > 1 ? input.value.slice(0, -1) : '0'
}

function clearEntry() {
  input.value = '0'
  error.value = ''
}

function clearAll() {
  input.value = '0'
  pending.value = null
  op.value = ''
  waiting.value = false
  error.value = ''
}

function compute(a, b, operator) {
  switch (operator) {
    case '+':
      return a + b
    case '−':
      return a - b
    case '×':
      return a * b
    case '÷':
      if (b === 0n) throw new Error('不能除以零')
      return a / b
    case 'AND':
      return a & b
    case 'OR':
      return a | b
    case 'XOR':
      return a ^ b
    case '<<':
      return a << b
    case '>>':
      return a >> b
    case 'MOD':
      return b === 0n ? 0n : a % b
    default:
      return b
  }
}

function setOperator(next) {
  const value = currentValue.value
  if (op.value && !waiting.value && pending.value !== null) {
    try {
      const result = compute(pending.value, value, op.value)
      pending.value = BigInt.asUintN(bits.value, result)
      input.value = format(pending.value, radix.value).replace(/\s/g, '')
    } catch (e) {
      error.value = e.message
      return
    }
  } else {
    pending.value = value
  }
  op.value = next
  waiting.value = true
}

function equals() {
  if (!op.value || pending.value === null) return
  try {
    const result = compute(pending.value, currentValue.value, op.value)
    const masked = BigInt.asUintN(bits.value, result)
    input.value = format(masked, radix.value).replace(/\s/g, '')
    pending.value = null
    op.value = ''
    waiting.value = false
  } catch (e) {
    error.value = e.message
  }
}

function toggleSign() {
  const value = ((~currentValue.value + 1n) & mask.value)
  input.value = format(value, radix.value).replace(/\s/g, '')
  waiting.value = false
}

function bitNot() {
  input.value = format((~currentValue.value) & mask.value, radix.value).replace(/\s/g, '')
  waiting.value = false
}

function changeBits(next) {
  bits.value = next
  input.value = format(currentValue.value, radix.value).replace(/\s/g, '')
}

// 5 列布局（对齐 Windows 程序员计算器）：字母区 / 数字区 / 位运算区
const KEYS = [
  { label: 'A', kind: 'fn', act: ['hex', 'A'] },
  { label: '<<', kind: 'op', act: ['op', '<<'] },
  { label: '>>', kind: 'op', act: ['op', '>>'] },
  { label: 'CE', kind: 'fn', act: ['ce'] },
  { label: 'C', kind: 'fn', act: ['clear'] },

  { label: 'B', kind: 'fn', act: ['hex', 'B'] },
  { label: '7', kind: 'num', act: ['hex', '7'] },
  { label: '8', kind: 'num', act: ['hex', '8'] },
  { label: '9', kind: 'num', act: ['hex', '9'] },
  { label: '⌫', kind: 'fn', act: ['back'] },

  { label: 'C', kind: 'fn', act: ['hex', 'C'], title: '十六进制 C（12）' },
  { label: '4', kind: 'num', act: ['hex', '4'] },
  { label: '5', kind: 'num', act: ['hex', '5'] },
  { label: '6', kind: 'num', act: ['hex', '6'] },
  { label: '÷', kind: 'op', act: ['op', '÷'] },

  { label: 'D', kind: 'fn', act: ['hex', 'D'] },
  { label: '1', kind: 'num', act: ['hex', '1'] },
  { label: '2', kind: 'num', act: ['hex', '2'] },
  { label: '3', kind: 'num', act: ['hex', '3'] },
  { label: '×', kind: 'op', act: ['op', '×'] },

  { label: 'E', kind: 'fn', act: ['hex', 'E'] },
  { label: '±', kind: 'num', act: ['sign'] },
  { label: '0', kind: 'num', act: ['hex', '0'] },
  { label: 'MOD', kind: 'op', act: ['op', 'MOD'] },
  { label: '−', kind: 'op', act: ['op', '−'] },

  { label: 'F', kind: 'fn', act: ['hex', 'F'] },
  { label: 'AND', kind: 'op', act: ['op', 'AND'] },
  { label: 'OR', kind: 'op', act: ['op', 'OR'] },
  { label: 'XOR', kind: 'op', act: ['op', 'XOR'] },
  { label: 'NOT', kind: 'op', act: ['not'] },

  { label: '+', kind: 'op', act: ['op', '+'], span: 2 },
  { label: '=', kind: 'eq', act: ['eq'], span: 3 },
]

function onKey(key) {
  const [type, value] = key.act
  if (type === 'hex') pressKey(value)
  else if (type === 'op') setOperator(value)
  else if (type === 'ce') clearEntry()
  else if (type === 'clear') clearAll()
  else if (type === 'back') backspace()
  else if (type === 'sign') toggleSign()
  else if (type === 'not') bitNot()
  else if (type === 'eq') equals()
}

</script>

<template>
  <div class="prog">
    <div class="topbar">
      <div class="segmented">
        <button
          v-for="w in WIDTHS"
          :key="w.bits"
          :class="{ on: bits === w.bits }"
          @click="changeBits(w.bits)"
        >
          {{ w.label }}
        </button>
      </div>
    </div>

    <div class="display">
      <button
        v-for="d in displays"
        :key="d.id"
        class="base-row"
        :class="{ on: base === d.id, bin: d.id === 'bin' }"
        :title="d.text"
        @click="setBase(d.id)"
      >
        <span class="base-label">{{ d.label }}</span>
        <span v-if="!d.lines" class="base-value">{{ d.text }}</span>
        <span v-else class="base-value bin-lines">
          <span v-for="(line, i) in d.lines" :key="i" class="bin-line">{{ line }}</span>
        </span>
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="keys">
      <button
        v-for="(k, i) in KEYS"
        :key="i"
        :class="[k.kind, { hex: k.act[0] === 'hex' && /^[A-F]$/.test(k.label) }]"
        :style="k.span ? { gridColumn: `span ${k.span}` } : null"
        @click="onKey(k)"
      >
        {{ k.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.prog {
  width: 460px;
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
  display: flex;
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
  font-size: 11.5px;
  color: var(--text-dim);
}
.segmented button.on {
  background: #fff;
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.display {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.base-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 3px 6px;
  border-radius: 5px;
  text-align: right;
}
.base-row:hover {
  background: var(--hover);
}
.base-row.on {
  background: rgba(10, 132, 255, 0.1);
}
.base-label {
  flex: none;
  width: 34px;
  font-size: 11px;
  color: var(--text-dim);
  text-align: left;
}
.base-value {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}
/* 二进制：每行固定 8 组（32 位），上下两行对称 */
.base-row.bin {
  align-items: flex-start;
}
.base-row.bin .base-label {
  padding-top: 3px;
}
.base-value.bin-lines {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  font-size: 11px;
  letter-spacing: 0.02em;
  overflow: visible;
}
.bin-line {
  white-space: nowrap;
  line-height: 1.4;
}
.base-row.on .base-value {
  color: var(--accent);
}
.error {
  margin: 0;
  font-size: 12px;
  color: #d70015;
  text-align: right;
}
.keys {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: minmax(0, 1fr);
  gap: 6px;
}
.hex {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.07);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 600;
  color: #b25000;
}
.hex:hover {
  background: #fdf6ef;
}
.keys button {
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.1s ease, transform 0.06s ease;
}
.keys button:active {
  transform: scale(0.97);
}
.num {
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.07);
  font-size: 15px;
}
.num:hover {
  background: #f2f2f5;
}
.fn,
.op {
  background: #f0f0f3;
  border: 1px solid transparent;
  font-size: 12px;
}
.fn:hover,
.op:hover {
  background: #e6e6ea;
}
.eq {
  background: var(--accent);
  color: #fff;
  font-size: 16px;
}
.eq:hover {
  background: #0071e3;
}
</style>
