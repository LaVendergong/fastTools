<script setup>
import { computed, ref, watch } from 'vue'

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
}

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem('toolbox:converter')) || {}
  } catch {
    return {}
  }
})()

const config = computed(() => CATEGORIES[props.category] || CATEGORIES.length)
const units = computed(() => config.value.units)

const fromId = ref(saved[props.category]?.from ?? units.value[2]?.id ?? units.value[0].id)
const toId = ref(saved[props.category]?.to ?? units.value[0].id)
const amount = ref(saved[props.category]?.amount ?? 1)

const fromUnit = computed(() => units.value.find((u) => u.id === fromId.value) || units.value[0])
const toUnit = computed(() => units.value.find((u) => u.id === toId.value) || units.value[0])

const result = computed(() => {
  const value = Number(amount.value)
  if (!Number.isFinite(value)) return ''
  const base = value * fromUnit.value.factor
  const converted = base / toUnit.value.factor
  if (!Number.isFinite(converted)) return ''
  return Number(converted.toPrecision(10)).toLocaleString('zh-CN', { maximumFractionDigits: 10 })
})

const rate = computed(() => {
  const base = fromUnit.value.factor
  const converted = base / toUnit.value.factor
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
    fromId.value = preset?.from ?? units.value[2]?.id ?? units.value[0].id
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
  background: #f9f9fb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
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
  background: #fff;
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
  background: #fff;
  font-size: 12px;
  outline: none;
}
.swap {
  align-self: center;
  padding: 4px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #fff;
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
  background: rgba(0, 0, 0, 0.03);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-dim);
  text-align: center;
}
</style>
