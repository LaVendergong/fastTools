<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:currency'

// 以人民币为中间基准：rates[code] = 1 单位该货币值多少人民币
const OFFLINE = {
  CNY: 1,
  USD: 7.2,
  EUR: 7.85,
  GBP: 9.15,
  JPY: 0.048,
  HKD: 0.92,
  KRW: 0.0052,
  AUD: 4.75,
  CAD: 5.25,
  SGD: 5.35,
  CHF: 8.1,
  THB: 0.2,
  MYR: 1.6,
  RUB: 0.078,
  INR: 0.086,
  TWD: 0.22,
  BRL: 1.3,
  AED: 1.96,
}

const NAMES = {
  CNY: '人民币',
  USD: '美元',
  EUR: '欧元',
  GBP: '英镑',
  JPY: '日元',
  HKD: '港币',
  KRW: '韩元',
  AUD: '澳元',
  CAD: '加元',
  SGD: '新加坡元',
  CHF: '瑞士法郎',
  THB: '泰铢',
  MYR: '马来西亚林吉特',
  RUB: '卢布',
  INR: '印度卢比',
  TWD: '新台币',
  BRL: '巴西雷亚尔',
  AED: '阿联酋迪拉姆',
}

const SYMBOLS = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
  KRW: '₩',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  CHF: 'Fr',
  THB: '฿',
  MYR: 'RM',
  RUB: '₽',
  INR: '₹',
  TWD: 'NT$',
  BRL: 'R$',
  AED: 'د.إ',
}

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const rates = ref({ ...OFFLINE, ...(saved.rates || {}) })
const updatedAt = ref(saved.updatedAt || 0)
const source = ref(saved.source || 'offline')
const amount = ref(saved.amount ?? 1)
const base = ref(saved.base ?? 'CNY')
const loading = ref(false)
const message = ref('')
const failed = ref(false)
const copied = ref('')

const codes = Object.keys(NAMES)

const baseRate = computed(() => rates.value[base.value] || 1)

const rows = computed(() =>
  codes.map((code) => {
    const value = (Number(amount.value) || 0) * (baseRate.value / (rates.value[code] || 1))
    return {
      code,
      name: NAMES[code],
      symbol: SYMBOLS[code] || '',
      value,
      text: formatNumber(value),
      unitRate: baseRate.value / (rates.value[code] || 1),
    }
  }),
)

const updatedLabel = computed(() => {
  if (!updatedAt.value) return '未更新（使用内置示例汇率）'
  const d = new Date(updatedAt.value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

function formatNumber(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs >= 1000) return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
  if (abs >= 1) return String(Number(n.toFixed(4)))
  return String(Number(n.toPrecision(4)))
}

function pick(code) {
  base.value = code
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`接口返回 ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function refreshRates() {
  if (loading.value) return
  loading.value = true
  message.value = '正在获取最新汇率…'
  failed.value = false

  try {
    const data = await fetchJson('https://open.er-api.com/v6/latest/CNY')
    if (!data?.rates) throw new Error('汇率数据格式异常')

    const next = {}
    for (const code of codes) {
      const perCny = data.rates[code]
      next[code] = code === 'CNY' ? 1 : perCny ? 1 / perCny : rates.value[code]
    }

    rates.value = next
    updatedAt.value = Date.now()
    source.value = 'live'
    message.value = '汇率已更新'
  } catch (e) {
    failed.value = true
    const reason =
      e.name === 'AbortError'
        ? '请求超时（8 秒），可能无法访问境外汇率接口'
        : e.message
    message.value = `获取失败：${reason}。当前仍在使用${source.value === 'live' ? '上次获取' : '内置示例'}汇率`
  } finally {
    loading.value = false
  }
}

async function copyValue(row) {
  try {
    await navigator.clipboard.writeText(row.text)
    copied.value = row.code
    setTimeout(() => {
      if (copied.value === row.code) copied.value = ''
    }, 1200)
  } catch {
    /* 剪贴板不可用 */
  }
}

watch(
  [amount, base, rates, updatedAt, source],
  () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        amount: amount.value,
        base: base.value,
        rates: rates.value,
        updatedAt: updatedAt.value,
        source: source.value,
      }),
    )
  },
  { deep: true },
)

onMounted(() => {
  // 超过 12 小时的旧汇率自动尝试刷新一次
  if (source.value === 'live' && Date.now() - updatedAt.value > 12 * 3600 * 1000) {
    refreshRates()
  }
})
</script>

<template>
  <div class="currency">
    <div class="head">
      <div class="title-row">
        <span class="title">货币汇率</span>
        <span class="badge" :class="{ live: source === 'live' }">
          {{ source === 'live' ? '在线汇率' : '内置示例汇率' }}
        </span>
      </div>
      <span class="updated">最后更新：{{ updatedLabel }}</span>
    </div>

    <div class="toolbar">
      <input v-model="amount" class="amount" type="number" step="any" />
      <select v-model="base" class="select">
        <option v-for="code in codes" :key="code" :value="code">
          {{ NAMES[code] }} {{ code }}
        </option>
      </select>
      <button class="refresh" :disabled="loading" @click="refreshRates">
        {{ loading ? '更新中…' : '更新汇率' }}
      </button>
    </div>

    <p v-if="message" class="message" :class="{ err: failed }">{{ message }}</p>

    <div class="table-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th>货币</th>
            <th class="num">金额</th>
            <th class="rate">1 {{ base }} =</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.code"
            :class="{ on: row.code === base }"
            @click="pick(row.code)"
          >
            <td class="name">
              <span class="symbol">{{ row.symbol }}</span>
              <span>{{ row.name }}</span>
              <span class="code">{{ row.code }}</span>
            </td>
            <td class="num" @click.stop="copyValue(row)">
              <span class="value">{{ row.text }}</span>
              <span v-if="copied === row.code" class="copied">已复制</span>
            </td>
            <td class="rate">{{ formatNumber(row.unitRate) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="tip">
      点击任意货币行可切换为基准货币；点击金额可复制。内置汇率为固定示例值，点「更新汇率」从 open.er-api.com 获取实时数据。
    </p>
  </div>
</template>

<style scoped>
.currency {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.head {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  font-size: 15px;
  font-weight: 600;
}
.badge {
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  font-size: 10.5px;
  color: var(--text-dim);
}
.badge.live {
  background: rgba(52, 199, 89, 0.14);
  color: #1d7a34;
}
.updated {
  font-size: 11px;
  color: var(--text-dim);
}
.toolbar {
  flex: none;
  display: flex;
  gap: 8px;
}
.amount {
  flex: 1;
  min-width: 0;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: none;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}
.amount:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.select {
  flex: none;
  width: 180px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-size: 12.5px;
  outline: none;
}
.refresh {
  flex: none;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
}
.refresh:hover:not(:disabled) {
  background: var(--hover);
}
.refresh:disabled {
  opacity: 0.5;
  cursor: default;
}
.message {
  flex: none;
  margin: 0;
  font-size: 11.5px;
  color: #1d7a34;
}
.message.err {
  color: #d70015;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
}
.grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.grid th,
.grid td {
  padding: 7px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  text-align: left;
}
.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fafafa;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.grid tbody tr {
  cursor: pointer;
}
.grid tbody tr:hover {
  background: rgba(10, 132, 255, 0.05);
}
.grid tbody tr.on {
  background: rgba(10, 132, 255, 0.1);
}
.name {
  display: flex;
  align-items: center;
  gap: 7px;
}
.symbol {
  flex: none;
  width: 26px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: var(--text-dim);
  text-align: center;
}
.code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-dim);
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.value {
  font-size: 14px;
  font-weight: 600;
}
.copied {
  margin-left: 8px;
  font-size: 10.5px;
  color: #1d7a34;
}
.rate {
  text-align: right;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tip {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-dim);
}
</style>
