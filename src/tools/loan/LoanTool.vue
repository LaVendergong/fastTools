<script setup>
import { computed, reactive, ref } from 'vue'

const tab = ref('mortgage')

/* ---------------- 房贷 ---------------- */

const mortgage = reactive({
  amount: 1000000,
  rate: 3.6,
  years: 30,
  method: 'equal-payment', // equal-payment | equal-principal
})

const money = (value) =>
  Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const mortgageResult = computed(() => {
  const principal = Math.max(0, Number(mortgage.amount) || 0)
  const monthlyRate = (Number(mortgage.rate) || 0) / 100 / 12
  const months = Math.max(1, Math.round((Number(mortgage.years) || 0) * 12))

  if (!principal) return null

  const rows = []

  if (mortgage.method === 'equal-payment') {
    const payment =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
          (Math.pow(1 + monthlyRate, months) - 1)

    let remaining = principal
    let totalInterest = 0
    for (let i = 1; i <= months; i++) {
      const interest = remaining * monthlyRate
      const principalPart = payment - interest
      remaining = Math.max(0, remaining - principalPart)
      totalInterest += interest
      rows.push({
        index: i,
        payment,
        principalPart,
        interest,
        remaining,
      })
    }
    return {
      first: payment,
      last: rows[rows.length - 1]?.payment ?? 0,
      totalInterest,
      total: principal + totalInterest,
      months,
      rows,
    }
  }

  // 等额本金
  const principalPart = principal / months
  let remaining = principal
  let totalInterest = 0
  for (let i = 1; i <= months; i++) {
    const interest = remaining * monthlyRate
    const payment = principalPart + interest
    remaining = Math.max(0, remaining - principalPart)
    totalInterest += interest
    rows.push({ index: i, payment, principalPart, interest, remaining })
  }
  return {
    first: rows[0]?.payment ?? 0,
    last: rows[rows.length - 1]?.payment ?? 0,
    totalInterest,
    total: principal + totalInterest,
    months,
    rows,
  }
})

const showAllRows = ref(false)
const visibleRows = computed(() => {
  const rows = mortgageResult.value?.rows || []
  return showAllRows.value ? rows : rows.slice(0, 12)
})

/* ---------------- 个税 ---------------- */

const tax = reactive({
  income: 20000,
  insurance: 3200, // 五险一金
  special: 2000, // 专项附加扣除
  threshold: 5000,
})

const TAX_TABLE = [
  { limit: 3000, rate: 0.03, deduct: 0 },
  { limit: 12000, rate: 0.1, deduct: 210 },
  { limit: 25000, rate: 0.2, deduct: 1410 },
  { limit: 35000, rate: 0.25, deduct: 2660 },
  { limit: 55000, rate: 0.3, deduct: 4410 },
  { limit: 80000, rate: 0.35, deduct: 7160 },
  { limit: Infinity, rate: 0.45, deduct: 15160 },
]

const taxResult = computed(() => {
  const income = Math.max(0, Number(tax.income) || 0)
  const insurance = Math.max(0, Number(tax.insurance) || 0)
  const special = Math.max(0, Number(tax.special) || 0)
  const threshold = Math.max(0, Number(tax.threshold) || 0)

  const taxable = Math.max(0, income - insurance - special - threshold)
  const bracket = TAX_TABLE.find((b) => taxable <= b.limit) || TAX_TABLE[TAX_TABLE.length - 1]
  const taxAmount = Math.max(0, taxable * bracket.rate - bracket.deduct)
  const net = income - insurance - taxAmount

  return {
    taxable,
    rate: bracket.rate * 100,
    deduct: bracket.deduct,
    taxAmount,
    net,
    actualRate: income ? (taxAmount / income) * 100 : 0,
  }
})

/* ---------------- 格式化 ---------------- */

const formatWan = (value) => `${(Number(value) / 10000).toFixed(2)} 万`
</script>

<template>
  <div class="loan">
    <div class="tabs">
      <button :class="{ on: tab === 'mortgage' }" @click="tab = 'mortgage'">房贷计算</button>
      <button :class="{ on: tab === 'tax' }" @click="tab = 'tax'">个税计算</button>
      <span class="spacer" />
      <span class="hint">结果仅供参考，实际以银行 / 税务机构为准</span>
    </div>

    <!-- 房贷 -->
    <template v-if="tab === 'mortgage'">
      <div class="form">
        <label class="field">
          <span>贷款总额</span>
          <div class="input-wrap">
            <input v-model.number="mortgage.amount" class="input" type="number" min="0" step="10000" />
            <span class="unit">元</span>
          </div>
          <span class="sub">{{ formatWan(mortgage.amount) }}</span>
        </label>

        <label class="field">
          <span>年利率</span>
          <div class="input-wrap">
            <input v-model.number="mortgage.rate" class="input" type="number" min="0" step="0.05" />
            <span class="unit">%</span>
          </div>
          <span class="sub">月利率 {{ ((mortgage.rate || 0) / 12).toFixed(4) }}%</span>
        </label>

        <label class="field">
          <span>贷款年限</span>
          <div class="input-wrap">
            <input v-model.number="mortgage.years" class="input" type="number" min="1" max="40" step="1" />
            <span class="unit">年</span>
          </div>
          <span class="sub">{{ mortgage.years * 12 }} 期</span>
        </label>

        <label class="field">
          <span>还款方式</span>
          <select v-model="mortgage.method" class="input select">
            <option value="equal-payment">等额本息（每月相同）</option>
            <option value="equal-principal">等额本金（逐月递减）</option>
          </select>
        </label>
      </div>

      <template v-if="mortgageResult">
        <div class="cards">
          <div class="card accent">
            <span class="card-label">每月还款</span>
            <span class="card-value">{{ money(mortgageResult.first) }}</span>
            <span class="card-sub">
              {{ mortgage.method === 'equal-payment' ? '每月固定' : `首月，末月 ${money(mortgageResult.last)}` }}
            </span>
          </div>
          <div class="card">
            <span class="card-label">支付利息</span>
            <span class="card-value">{{ money(mortgageResult.totalInterest) }}</span>
            <span class="card-sub">占总还款 {{ ((mortgageResult.totalInterest / mortgageResult.total) * 100).toFixed(1) }}%</span>
          </div>
          <div class="card">
            <span class="card-label">还款总额</span>
            <span class="card-value">{{ money(mortgageResult.total) }}</span>
            <span class="card-sub">本金 + 利息</span>
          </div>
          <div class="card">
            <span class="card-label">贷款期数</span>
            <span class="card-value">{{ mortgageResult.months }}</span>
            <span class="card-sub">期（月）</span>
          </div>
        </div>

        <div class="table-wrap">
          <div class="table-head">
            <span class="th">期数</span>
            <span class="th">月供</span>
            <span class="th">本金</span>
            <span class="th">利息</span>
            <span class="th">剩余本金</span>
          </div>
          <div class="table-body">
            <div v-for="row in visibleRows" :key="row.index" class="tr">
              <span class="td num">{{ row.index }}</span>
              <span class="td">{{ money(row.payment) }}</span>
              <span class="td">{{ money(row.principalPart) }}</span>
              <span class="td">{{ money(row.interest) }}</span>
              <span class="td">{{ money(row.remaining) }}</span>
            </div>
          </div>
          <button
            v-if="mortgageResult.rows.length > 12"
            class="more"
            @click="showAllRows = !showAllRows"
          >
            {{ showAllRows ? '收起' : `展开全部 ${mortgageResult.rows.length} 期` }}
          </button>
        </div>
      </template>

      <p v-else class="empty">请输入贷款总额</p>
    </template>

    <!-- 个税 -->
    <template v-else>
      <div class="form">
        <label class="field">
          <span>税前月收入</span>
          <div class="input-wrap">
            <input v-model.number="tax.income" class="input" type="number" min="0" step="500" />
            <span class="unit">元</span>
          </div>
        </label>
        <label class="field">
          <span>五险一金</span>
          <div class="input-wrap">
            <input v-model.number="tax.insurance" class="input" type="number" min="0" step="100" />
            <span class="unit">元</span>
          </div>
          <span class="sub">按实际个人缴纳部分填写</span>
        </label>
        <label class="field">
          <span>专项附加扣除</span>
          <div class="input-wrap">
            <input v-model.number="tax.special" class="input" type="number" min="0" step="500" />
            <span class="unit">元</span>
          </div>
          <span class="sub">子女教育、房贷、赡养老人等合计</span>
        </label>
        <label class="field">
          <span>起征点</span>
          <div class="input-wrap">
            <input v-model.number="tax.threshold" class="input" type="number" min="0" step="500" />
            <span class="unit">元</span>
          </div>
        </label>
      </div>

      <div class="cards">
        <div class="card accent">
          <span class="card-label">应缴个税</span>
          <span class="card-value">{{ money(taxResult.taxAmount) }}</span>
          <span class="card-sub">税率 {{ taxResult.rate }}%，速算扣除 {{ taxResult.deduct }}</span>
        </div>
        <div class="card">
          <span class="card-label">税后收入</span>
          <span class="card-value">{{ money(taxResult.net) }}</span>
          <span class="card-sub">到手（已扣五险一金与个税）</span>
        </div>
        <div class="card">
          <span class="card-label">应纳税所得额</span>
          <span class="card-value">{{ money(taxResult.taxable) }}</span>
          <span class="card-sub">收入 − 五险一金 − 专项附加 − 起征点</span>
        </div>
        <div class="card">
          <span class="card-label">实际税负</span>
          <span class="card-value">{{ taxResult.actualRate.toFixed(2) }}%</span>
          <span class="card-sub">个税 / 税前收入</span>
        </div>
      </div>

      <div class="table-wrap">
        <div class="table-head tax">
          <span class="th">级数</span>
          <span class="th">应纳税所得额</span>
          <span class="th">税率</span>
          <span class="th">速算扣除数</span>
        </div>
        <div class="table-body">
          <div
            v-for="(b, i) in TAX_TABLE"
            :key="i"
            class="tr tax"
            :class="{ on: taxResult.taxable > 0 && taxResult.taxable <= b.limit && (i === 0 || taxResult.taxable > TAX_TABLE[i - 1].limit) }"
          >
            <span class="td num">{{ i + 1 }}</span>
            <span class="td">
              {{ i === 0 ? '不超过 3,000' : b.limit === Infinity ? '超过 80,000' : `超过 ${TAX_TABLE[i - 1].limit.toLocaleString()} 至 ${b.limit.toLocaleString()}` }}
            </span>
            <span class="td">{{ b.rate * 100 }}%</span>
            <span class="td">{{ b.deduct || '0' }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.loan {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}
.tabs {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tabs button {
  padding: 5px 14px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel-bg);
  font-size: 12px;
  color: var(--text-dim);
}
.tabs button.on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}
.spacer {
  margin-left: auto;
}
.hint {
  font-size: 10px;
  color: var(--text-faint);
}
.form {
  flex: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(212px, 1fr));
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field > span {
  font-size: 10.5px;
  color: var(--text-faint);
}
.input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
.input:focus {
  border-color: var(--accent);
}
.select {
  background: var(--panel-bg);
}
.unit {
  flex: none;
  font-size: 11px;
  color: var(--text-faint);
}
.sub {
  font-size: 9.5px;
  color: var(--text-faint);
}
.cards {
  flex: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.card.accent {
  border-color: transparent;
  background: linear-gradient(150deg, var(--accent-soft), transparent 70%);
}
.card-label {
  font-size: 10.5px;
  color: var(--text-dim);
}
.card-value {
  font-size: 19px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.card.accent .card-value {
  color: var(--accent);
}
.card-sub {
  font-size: 9.5px;
  color: var(--text-faint);
}
.table-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.table-head,
.tr {
  display: grid;
  grid-template-columns: 56px 1.15fr 1.15fr 1.15fr 1.3fr;
  gap: 8px;
  padding: 6px 12px;
  align-items: center;
}
.table-head.tax,
.tr.tax {
  grid-template-columns: 56px 1.8fr 0.8fr 1fr;
}
.table-head {
  flex: none;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.th {
  font-size: 10px;
  color: var(--text-faint);
}
.table-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.tr {
  border-bottom: 1px solid var(--border);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.tr:last-child {
  border-bottom: none;
}
.tr.on {
  background: var(--accent-soft);
}
.td {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.td.num {
  color: var(--text-faint);
}
.more {
  flex: none;
  padding: 7px;
  border-top: 1px solid var(--border);
  background: var(--fill-1);
  font-size: 11px;
  color: var(--accent);
}
.empty {
  margin: 30px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
</style>
