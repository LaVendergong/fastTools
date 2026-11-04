<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:worldclock'

const CITIES = [
  { id: 'beijing', name: '北京', tz: 'Asia/Shanghai' },
  { id: 'shanghai', name: '上海', tz: 'Asia/Shanghai' },
  { id: 'hongkong', name: '香港', tz: 'Asia/Hong_Kong' },
  { id: 'taipei', name: '台北', tz: 'Asia/Taipei' },
  { id: 'tokyo', name: '东京', tz: 'Asia/Tokyo' },
  { id: 'seoul', name: '首尔', tz: 'Asia/Seoul' },
  { id: 'singapore', name: '新加坡', tz: 'Asia/Singapore' },
  { id: 'bangkok', name: '曼谷', tz: 'Asia/Bangkok' },
  { id: 'mumbai', name: '孟买', tz: 'Asia/Kolkata' },
  { id: 'dubai', name: '迪拜', tz: 'Asia/Dubai' },
  { id: 'moscow', name: '莫斯科', tz: 'Europe/Moscow' },
  { id: 'berlin', name: '柏林', tz: 'Europe/Berlin' },
  { id: 'paris', name: '巴黎', tz: 'Europe/Paris' },
  { id: 'london', name: '伦敦', tz: 'Europe/London' },
  { id: 'newyork', name: '纽约', tz: 'America/New_York' },
  { id: 'chicago', name: '芝加哥', tz: 'America/Chicago' },
  { id: 'losangeles', name: '洛杉矶', tz: 'America/Los_Angeles' },
  { id: 'toronto', name: '多伦多', tz: 'America/Toronto' },
  { id: 'saopaulo', name: '圣保罗', tz: 'America/Sao_Paulo' },
  { id: 'sydney', name: '悉尼', tz: 'Australia/Sydney' },
  { id: 'auckland', name: '奥克兰', tz: 'Pacific/Auckland' },
]

const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
const localCity = CITIES.find((c) => c.tz === localTz)

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const picked = ref(
  saved.picked?.length ? saved.picked : ['beijing', 'tokyo', 'london', 'newyork', 'losangeles'],
)
const hour12 = ref(saved.hour12 ?? false)
const now = ref(new Date())
const pendingAdd = ref('')

const pickedCities = computed(() =>
  picked.value.map((id) => CITIES.find((c) => c.id === id)).filter(Boolean),
)

const availableCities = computed(() => CITIES.filter((c) => !picked.value.includes(c.id)))

/* ---------------- 时间格式化 ---------------- */

function getOffsetMinutes(timeZone, date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const map = {}
  for (const p of parts) map[p.type] = p.value
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  )
  return Math.round((asUtc - date.getTime()) / 60000)
}

function timeIn(tz, date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: hour12.value,
    hourCycle: hour12.value ? undefined : 'h23',
  }).format(date)
}

function hhmmIn(tz, date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: hour12.value,
    hourCycle: hour12.value ? undefined : 'h23',
  }).format(date)
}

function dateIn(tz, date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date)
}

function offsetLabel(tz) {
  const diff = getOffsetMinutes(tz) - getOffsetMinutes(localTz)
  if (diff === 0) return '本地'
  const sign = diff > 0 ? '+' : '-'
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}h`
}

function isNight(tz) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now.value),
  )
  return hour < 6 || hour >= 19
}

/* ---------------- 换算 ---------------- */

const converterTz = ref(saved.converterTz ?? 'beijing')
const converterInput = ref('')
const useConverter = ref(false)

function localInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const batchTime = computed(() => {
  if (!useConverter.value || !converterInput.value) return null
  const city = CITIES.find((c) => c.id === converterTz.value)
  if (!city) return null
  const [datePart, timePart] = converterInput.value.split('T')
  if (!datePart || !timePart) return null
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offset = getOffsetMinutes(city.tz, new Date(guess))
  return new Date(guess - offset * 60000)
})

/* ---------------- 操作 ---------------- */

function addCity() {
  const id = pendingAdd.value
  if (!id || picked.value.includes(id)) return
  picked.value = [...picked.value, id]
  pendingAdd.value = ''
}

function removeCity(id) {
  picked.value = picked.value.filter((c) => c !== id)
}

function toggleConverter() {
  useConverter.value = !useConverter.value
  if (useConverter.value && !converterInput.value) {
    converterInput.value = localInputValue(new Date())
  }
}

function fillNow() {
  converterInput.value = localInputValue(new Date())
}

let timer = null
onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => clearInterval(timer))

let saveTimer = null
watch(
  [picked, hour12, converterTz],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ picked: picked.value, hour12: hour12.value, converterTz: converterTz.value }),
      )
    }, 300)
  },
  { deep: true },
)
</script>

<template>
  <div class="clock">
    <div class="head">
      <div class="local">
        <span class="local-name">{{ localCity ? localCity.name : '本地' }}现在</span>
        <span class="local-time">{{ timeIn(localTz, now) }}</span>
        <span class="local-date">{{ dateIn(localTz, now) }}</span>
      </div>
      <div class="head-actions">
        <label class="chk">
          <input v-model="hour12" type="checkbox" />
          12 小时制
        </label>
        <select v-model="pendingAdd" class="select" @change="addCity">
          <option value="">＋ 添加城市</option>
          <option v-for="c in availableCities" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button class="btn" :class="{ on: useConverter }" @click="toggleConverter">时区换算</button>
      </div>
    </div>

    <div class="body">
      <div class="list">
        <div v-for="c in pickedCities" :key="c.id" class="row" :class="{ night: isNight(c.tz) }">
          <span class="city">
            <span class="moon">{{ isNight(c.tz) ? '🌙' : '☀️' }}</span>
            {{ c.name }}
          </span>
          <span class="time">{{ timeIn(c.tz, batchTime || now) }}</span>
          <span class="date">{{ dateIn(c.tz, batchTime || now) }}</span>
          <span class="diff">{{ offsetLabel(c.tz) }}</span>
          <button class="remove" title="移除" @click="removeCity(c.id)">✕</button>
        </div>
        <p v-if="!pickedCities.length" class="empty">还没有添加城市，从右上角选择</p>
      </div>

      <aside v-if="useConverter" class="converter">
        <p class="conv-title">时区换算</p>
        <div class="conv-field">
          <label>参考城市</label>
          <select v-model="converterTz" class="select wide">
            <option v-for="c in CITIES" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="conv-field">
          <label>时间</label>
          <input v-model="converterInput" class="dt" type="datetime-local" />
        </div>
        <button class="btn small" @click="fillNow">用当前时间</button>
        <p class="conv-note">
          上面列表显示的是这个时刻在各地的时间；关闭换算后恢复实时时钟。
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.clock {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-1);
}
.local {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.local-name {
  font-size: 11.5px;
  color: var(--text-dim);
}
.local-time {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.local-date {
  font-size: 11.5px;
  color: var(--text-faint);
}
.head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
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
.select.wide {
  flex: 1;
  min-width: 0;
}
.btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
  white-space: nowrap;
}
.btn:hover {
  background: var(--fill-1);
}
.btn.on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent);
}
.btn.small {
  align-self: flex-start;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.list {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.row.night {
  border-color: rgba(90, 100, 140, 0.35);
  background: linear-gradient(90deg, rgba(60, 70, 120, 0.08), transparent);
}
.city {
  flex: none;
  width: 96px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 500;
}
.moon {
  font-size: 11px;
}
.time {
  flex: none;
  width: 96px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.date {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-dim);
}
.diff {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--fill-2);
  font-size: 10.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.remove {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-size: 9px;
  color: var(--text-faint);
  opacity: 0;
}
.row:hover .remove {
  opacity: 1;
}
.remove:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.converter {
  flex: none;
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.conv-title {
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
}
.conv-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.conv-field label {
  font-size: 10.5px;
  color: var(--text-faint);
}
.dt {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.conv-note {
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
.empty {
  margin: 30px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
</style>
