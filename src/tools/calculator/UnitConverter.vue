<script setup>
import { computed, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'

const props = defineProps({
  category: { type: String, default: 'length' },
})

const CATEGORIES = {
  length: {
    title: '长度',
    note: '常用长度单位互换',
    units: [
      { id: 'mm', name: '毫米 mm', factor: 0.001 },
      { id: 'cm', name: '厘米 cm', factor: 0.01 },
      { id: 'm', name: '米 m', factor: 1 },
      { id: 'km', name: '千米 km', factor: 1000 },
      { id: 'in', name: '英寸 in', factor: 0.0254 },
      { id: 'ft', name: '英尺 ft', factor: 0.3048 },
      { id: 'yd', name: '码 yd', factor: 0.9144 },
      { id: 'mi', name: '英里 mi', factor: 1609.344 },
      { id: 'nmi', name: '海里 nmi', factor: 1852 },
    ],
  },
  volume: {
    title: '体积',
    note: '常用体积/容积单位互换',
    units: [
      { id: 'ml', name: '毫升 ml', factor: 0.001 },
      { id: 'l', name: '升 L', factor: 1 },
      { id: 'cm3', name: '立方厘米 cm³', factor: 0.001 },
      { id: 'm3', name: '立方米 m³', factor: 1000 },
      { id: 'gal', name: '加仑 gal (US)', factor: 3.785411784 },
      { id: 'qt', name: '夸脱 qt (US)', factor: 0.946352946 },
      { id: 'pt', name: '品脱 pt (US)', factor: 0.473176473 },
      { id: 'cup', name: '杯 cup (US)', factor: 0.2365882365 },
      { id: 'floz', name: '液量盎司 fl oz', factor: 0.0295735296 },
      { id: 'ft3', name: '立方英尺 ft³', factor: 28.316846592 },
    ],
  },
  weight: {
    title: '重量',
    note: '常用质量单位互换（基准：千克）',
    units: [
      { id: 'mg', name: '毫克 mg', factor: 0.000001 },
      { id: 'g', name: '克 g', factor: 0.001 },
      { id: 'kg', name: '千克 kg', factor: 1, default: true },
      { id: 't', name: '吨 t', factor: 1000 },
      { id: 'jin', name: '斤', factor: 0.5 },
      { id: 'liang', name: '两', factor: 0.05 },
      { id: 'oz', name: '盎司 oz', factor: 0.028349523125 },
      { id: 'lb', name: '磅 lb', factor: 0.45359237 },
      { id: 'ct', name: '克拉 ct', factor: 0.0002 },
    ],
  },
  area: {
    title: '面积',
    note: '常用面积单位互换（基准：平方米）',
    units: [
      { id: 'mm2', name: '平方毫米 mm²', factor: 0.000001 },
      { id: 'cm2', name: '平方厘米 cm²', factor: 0.0001 },
      { id: 'm2', name: '平方米 m²', factor: 1, default: true },
      { id: 'km2', name: '平方千米 km²', factor: 1000000 },
      { id: 'ha', name: '公顷 ha', factor: 10000 },
      { id: 'mu', name: '亩', factor: 666.6666666667 },
      { id: 'in2', name: '平方英寸 in²', factor: 0.00064516 },
      { id: 'ft2', name: '平方英尺 ft²', factor: 0.09290304 },
      { id: 'acre', name: '英亩 acre', factor: 4046.8564224 },
    ],
  },
  temperature: {
    title: '温度',
    note: '摄氏 / 华氏 / 开尔文（非线性换算）',
    units: [
      { id: 'c', name: '摄氏度 °C', default: true, toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
      {
        id: 'f',
        name: '华氏度 °F',
        toBase: (v) => ((v - 32) * 5) / 9 + 273.15,
        fromBase: (v) => ((v - 273.15) * 9) / 5 + 32,
      },
      { id: 'k', name: '开尔文 K', toBase: (v) => v, fromBase: (v) => v },
    ],
  },
  speed: {
    title: '速度',
    note: '常用速度单位互换（基准：米/秒）',
    units: [
      { id: 'ms', name: '米/秒 m/s', factor: 1, default: true },
      { id: 'kmh', name: '千米/时 km/h', factor: 0.2777777778 },
      { id: 'mph', name: '英里/时 mph', factor: 0.44704 },
      { id: 'knot', name: '节 kn', factor: 0.5144444444 },
      { id: 'fts', name: '英尺/秒 ft/s', factor: 0.3048 },
      { id: 'mach', name: '马赫 Ma', factor: 340.29 },
    ],
  },
  data: {
    title: '存储',
    note: '数据容量互换（按 1024 进制，与系统显示一致）',
    units: [
      { id: 'bit', name: '比特 bit', factor: 0.125 },
      { id: 'b', name: '字节 B', factor: 1, default: true },
      { id: 'kb', name: '千字节 KB', factor: 1024 },
      { id: 'mb', name: '兆字节 MB', factor: 1048576 },
      { id: 'gb', name: '吉字节 GB', factor: 1073741824 },
      { id: 'tb', name: '太字节 TB', factor: 1099511627776 },
    ],
  },
}

const saved = readJSON('toolbox:converter')

const config = computed(() => CATEGORIES[props.category] || CATEGORIES.length)
const units = computed(() => config.value.units)

const defaultFrom =
  units.value.find((u) => u.default)?.id ?? units.value[2]?.id ?? units.value[0].id
const fromId = ref(saved[props.category]?.from ?? defaultFrom)
const toId = ref(saved[props.category]?.to ?? units.value[0].id)
const amount = ref(saved[props.category]?.amount ?? 1)

const fromUnit = computed(() => units.value.find((u) => u.id === fromId.value) || units.value[0])
const toUnit = computed(() => units.value.find((u) => u.id === toId.value) || units.value[0])

// 温度这类非线性单位用 toBase/fromBase，其余用 factor
function toBase(value, unit) {
  return typeof unit.toBase === 'function' ? unit.toBase(value) : value * unit.factor
}

function fromBase(value, unit) {
  return typeof unit.fromBase === 'function' ? unit.fromBase(value) : value / unit.factor
}

const result = computed(() => {
  const value = Number(amount.value)
  if (!Number.isFinite(value)) return ''
  const converted = fromBase(toBase(value, fromUnit.value), toUnit.value)
  if (!Number.isFinite(converted)) return ''
  return Number(converted.toPrecision(10)).toLocaleString('zh-CN', { maximumFractionDigits: 10 })
})

const rate = computed(() => {
  const converted = fromBase(toBase(1, fromUnit.value), toUnit.value)
  return Number(converted.toPrecision(8))
})

watch(
  [fromId, toId, amount, () => props.category],
  () => {
    const all = JSON.parse(localStorage.getItem('toolbox:converter') || '{}')
    all[props.category] = { from: fromId.value, to: toId.value, amount: amount.value }
    localStorage.setItem('toolbox:converter', JSON.stringify(all))
  },
  { deep: true },
)

watch(
  () => props.category,
  () => {
    const preset = saved[props.category]
    const fallback =
      units.value.find((u) => u.default)?.id ?? units.value[2]?.id ?? units.value[0].id
    fromId.value = preset?.from ?? fallback
    toId.value = preset?.to ?? units.value[0].id
    amount.value = preset?.amount ?? 1
  },
)

function swap() {
  const tmp = fromId.value
  fromId.value = toId.value
  toId.value = tmp
}
</script>

<template>
  <div class="converter">
    <div class="head">
      <span class="title">{{ config.title }}</span>
      <span class="note">{{ config.note }}</span>
    </div>

    <div class="field">
      <input v-model="amount" class="input" type="number" step="any" />
      <select v-model="fromId" class="select">
        <option v-for="u in units" :key="u.id" :value="u.id">{{ u.name }}</option>
      </select>
    </div>

    <button class="swap" @click="swap">⇅ 交换</button>

    <div class="field result-field">
      <input :value="result" class="input result" readonly />
      <select v-model="toId" class="select">
        <option v-for="u in units" :key="u.id" :value="u.id">{{ u.name }}</option>
      </select>
    </div>

    <p class="rate">
      1 {{ fromUnit.name }} = {{ rate }} {{ toUnit.name }}
    </p>
  </div>
</template>

<style scoped>
.converter {
  width: 420px;
  flex: none;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-3);
  box-shadow: var(--shadow-1);
}
.head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  font-size: 15px;
  font-weight: 600;
}
.note {
  font-size: 11px;
  color: var(--text-dim);
}
.field {
  display: flex;
  gap: 8px;
}
.input {
  flex: 1;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  outline: none;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.result {
  color: var(--accent);
  font-weight: 600;
}
.select {
  flex: none;
  width: 156px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  font-size: 12px;
  outline: none;
}
.swap {
  align-self: center;
  padding: 4px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text-dim);
}
.swap:hover {
  background: var(--hover);
  color: var(--text);
}
.rate {
  margin: 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--fill-1);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-dim);
  text-align: center;
}
</style>
