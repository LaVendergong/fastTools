<script setup>
import { computed, ref } from 'vue'

const tab = ref('diff') // diff | add
const today = () => new Date().toISOString().slice(0, 10)

const start = ref(today())
const end = ref(today())
const base = ref(today())
const amount = ref(30)
const unit = ref('day')
const direction = ref('add')

const pad = (n) => String(n).padStart(2, '0')
const formatDate = (d) => `${d.getFullYear()}${'年'}${d.getMonth() + 1}${'月'}${d.getDate()}${'日'}`
const weekName = (d) => `周${'日一二三四五六'[d.getDay()]}`

const diff = computed(() => {
  if (!start.value || !end.value) return null
  const a = new Date(`${start.value}T00:00:00`)
  const b = new Date(`${end.value}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null

  const msPerDay = 86400000
  const days = Math.round((b - a) / msPerDay)
  const abs = Math.abs(days)

  // 年月日差
  let years = b.getFullYear() - a.getFullYear()
  let months = b.getMonth() - a.getMonth()
  let dayPart = b.getDate() - a.getDate()
  if (dayPart < 0) {
    months -= 1
    const prevMonth = new Date(b.getFullYear(), b.getMonth(), 0).getDate()
    dayPart += prevMonth
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  return {
    days,
    abs,
    weeks: Math.floor(abs / 7),
    restDays: abs % 7,
    years,
    months,
    dayPart,
    fromWeek: weekName(a),
    toWeek: weekName(b),
  }
})

const added = computed(() => {
  if (!base.value) return null
  const d = new Date(`${base.value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const n = Number(amount.value) || 0
  const sign = direction.value === 'add' ? 1 : -1

  if (unit.value === 'day') d.setDate(d.getDate() + sign * n)
  else if (unit.value === 'week') d.setDate(d.getDate() + sign * n * 7)
  else if (unit.value === 'month') d.setMonth(d.getMonth() + sign * n)
  else d.setFullYear(d.getFullYear() + sign * n)

  return {
    text: formatDate(d),
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    week: weekName(d),
  }
})
</script>

<template>
  <div class="date-tool">
    <div class="tabs">
      <button :class="{ on: tab === 'diff' }" @click="tab = 'diff'">日期差</button>
      <button :class="{ on: tab === 'add' }" @click="tab = 'add'">日期加减</button>
    </div>

    <div v-if="tab === 'diff'" class="pane">
      <div class="row">
        <label>开始日期</label>
        <input v-model="start" type="date" />
        <span class="week">{{ diff?.fromWeek || '' }}</span>
      </div>
      <div class="row">
        <label>结束日期</label>
        <input v-model="end" type="date" />
        <span class="week">{{ diff?.toWeek || '' }}</span>
      </div>

      <div v-if="diff" class="results">
        <div class="big">
          <span class="num">{{ diff.abs }}</span>
          <span class="unit">天</span>
          <span class="direction">{{ diff.days < 0 ? '（结束早于开始）' : '' }}</span>
        </div>
        <div class="grid">
          <div class="cell">
            <span class="k">周</span>
            <span class="v">{{ diff.weeks }} 周 {{ diff.restDays }} 天</span>
          </div>
          <div class="cell">
            <span class="k">年月日</span>
            <span class="v">{{ diff.years }} 年 {{ diff.months }} 月 {{ diff.dayPart }} 天</span>
          </div>
          <div class="cell">
            <span class="k">总小时</span>
            <span class="v">{{ (diff.abs * 24).toLocaleString() }}</span>
          </div>
          <div class="cell">
            <span class="k">总分钟</span>
            <span class="v">{{ (diff.abs * 1440).toLocaleString() }}</span>
          </div>
        </div>
      </div>
      <p v-else class="hint">选择两个日期后自动计算</p>
    </div>

    <div v-else class="pane">
      <div class="row">
        <label>起始日期</label>
        <input v-model="base" type="date" />
      </div>
      <div class="row">
        <label>操作</label>
        <select v-model="direction" class="select">
          <option value="add">加</option>
          <option value="sub">减</option>
        </select>
        <input v-model.number="amount" class="amount" type="number" min="0" />
        <select v-model="unit" class="select">
          <option value="day">天</option>
          <option value="week">周</option>
          <option value="month">月</option>
          <option value="year">年</option>
        </select>
      </div>

      <div v-if="added" class="results">
        <div class="big">
          <span class="num small">{{ added.text }}</span>
          <span class="unit">{{ added.week }}</span>
        </div>
        <div class="grid">
          <div class="cell">
            <span class="k">ISO</span>
            <span class="v">{{ added.iso }}</span>
          </div>
        </div>
      </div>
      <p v-else class="hint">填写起始日期与数量后自动计算</p>
    </div>
  </div>
</template>

<style scoped>
.date-tool {
  width: 460px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-3);
  box-shadow: var(--shadow-1);
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--fill-1);
}
.tabs button {
  flex: 1;
  padding: 4px 0;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.tabs button.on {
  background: var(--panel-bg);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row label {
  flex: none;
  width: 62px;
  font-size: 12px;
  color: var(--text-dim);
}
.row input[type='date'],
.row input[type='number'],
.select {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  outline: none;
  font-size: 12.5px;
}
.row input[type='date'] {
  flex: 1;
  min-width: 0;
}
.amount {
  width: 82px;
}
.select {
  flex: none;
}
.week {
  flex: none;
  width: 40px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.results {
  margin-top: 4px;
  padding: 12px;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.big {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 10px;
}
.num {
  font-size: 34px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}
.num.small {
  font-size: 22px;
}
.unit {
  font-size: 13px;
  color: var(--text-dim);
}
.direction {
  font-size: 11px;
  color: var(--text-dim);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 10px;
  border-radius: 6px;
  background: var(--fill-1);
}
.k {
  font-size: 10.5px;
  color: var(--text-dim);
}
.v {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.hint {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: var(--text-dim);
}
</style>
