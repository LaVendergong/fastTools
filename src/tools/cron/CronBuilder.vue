<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'

const STORAGE_KEY = 'toolbox:cron'

const FIELDS = [
  { key: 'minute', name: '分钟', min: 0, max: 59, unit: '分' },
  { key: 'hour', name: '小时', min: 0, max: 23, unit: '时' },
  { key: 'day', name: '日', min: 1, max: 31, unit: '号' },
  { key: 'month', name: '月', min: 1, max: 12, unit: '月' },
  { key: 'week', name: '星期', min: 0, max: 6, unit: '周' },
]

const WEEK_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const MODES = [
  { id: 'every', name: '每（*）' },
  { id: 'interval', name: '每隔' },
  { id: 'list', name: '指定值' },
  { id: 'range', name: '区间' },
]

const TEMPLATES = [
  { name: '每分钟', expr: '* * * * *' },
  { name: '每 5 分钟', expr: '*/5 * * * *' },
  { name: '每 30 分钟', expr: '*/30 * * * *' },
  { name: '每小时整点', expr: '0 * * * *' },
  { name: '每天 9 点', expr: '0 9 * * *' },
  { name: '工作日 9 点', expr: '0 9 * * 1-5' },
  { name: '每周一 9 点', expr: '0 9 * * 1' },
  { name: '每月 1 号 0 点', expr: '0 0 1 * *' },
  { name: '每天 9 点与 18 点', expr: '0 9,18 * * *' },
]

const saved = readJSON(STORAGE_KEY)

function blankField(key) {
  const meta = FIELDS.find((f) => f.key === key)
  return { mode: 'every', interval: 5, values: String(meta.min), from: meta.min, to: meta.max }
}

const state = reactive({
  minute: { ...blankField('minute'), mode: 'interval', interval: 5 },
  hour: blankField('hour'),
  day: blankField('day'),
  month: blankField('month'),
  week: blankField('week'),
})

if (saved.state) {
  for (const key of Object.keys(state)) {
    if (saved.state[key]) Object.assign(state[key], saved.state[key])
  }
}

const customExpr = ref(saved.customExpr ?? '')
const useCustom = ref(saved.useCustom ?? false)
const copied = ref(false)

/* ---------------- 生成 ---------------- */

function fieldExpr(field) {
  if (field.mode === 'every') return '*'
  if (field.mode === 'interval') {
    const step = Math.max(1, Number(field.interval) || 1)
    return `*/${step}`
  }
  if (field.mode === 'range') {
    const from = Number(field.from)
    const to = Number(field.to)
    return `${from}-${to}`
  }
  return (field.values || '*').replace(/\s+/g, '')
}

const generated = computed(() =>
  [state.minute, state.hour, state.day, state.month, state.week].map(fieldExpr).join(' '),
)

const expression = computed(() => (useCustom.value ? customExpr.value.trim() : generated.value))

/* ---------------- 描述 ---------------- */

function describe() {
  if (useCustom.value) return '自定义表达式'
  const { minute, hour, day, month, week } = {
    minute: fieldExpr(state.minute),
    hour: fieldExpr(state.hour),
    day: fieldExpr(state.day),
    month: fieldExpr(state.month),
    week: fieldExpr(state.week),
  }

  const parts = []
  if (minute === '*') parts.push('每分钟')
  else if (minute.startsWith('*/')) parts.push(`每 ${minute.slice(2)} 分钟`)
  else parts.push(`${minute} 分`)

  if (hour === '*') parts.push('每小时')
  else if (hour.startsWith('*/')) parts.push(`每 ${hour.slice(2)} 小时`)
  else parts.push(`${hour} 时`)

  if (month !== '*') parts.push(`仅 ${month} 月`)
  if (day !== '*' && week !== '*') parts.push(`${day} 号或 ${weekName(week)}`)
  else if (day !== '*') parts.push(`${day} 号`)
  else if (week !== '*') parts.push(weekName(week))

  return parts.join('，')
}

function weekName(expr) {
  if (expr.startsWith('*')) return '每天'
  const names = expr.split(',').map((v) => {
    if (v.includes('-')) {
      const [a, b] = v.split('-').map(Number)
      return `${WEEK_NAMES[a]}至${WEEK_NAMES[b]}`
    }
    return WEEK_NAMES[Number(v)] || v
  })
  return names.join('、')
}

const description = computed(() => describe())

/* ---------------- 下次执行时间 ---------------- */

function matchField(expr, value, min) {
  if (expr === '*') return true
  for (const part of expr.split(',')) {
    if (!part) continue
    if (part.includes('/')) {
      const [base, stepText] = part.split('/')
      const step = Number(stepText) || 1
      const start = base === '*' ? min : Number(base)
      if (value >= start && (value - start) % step === 0) return true
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number)
      if (value >= a && value <= b) return true
    } else if (Number(part) === value) return true
  }
  return false
}

let cache = { key: '', value: { valid: false, nextRuns: [], error: '' } }

function compute() {
  const expr = expression.value
  if (cache.key === expr) return cache.value

  const parts = expr.split(/\s+/).filter(Boolean)
  const value = { valid: false, nextRuns: [], error: '' }
  if (!parts.length) {
    value.error = '请输入表达式'
    cache = { key: expr, value }
    return value
  }
  if (parts.length !== 5) {
    value.error = `标准 Cron 需要 5 段（分 时 日 月 周），当前 ${parts.length} 段`
    cache = { key: expr, value }
    return value
  }

  const [m, h, dom, mon, dow] = parts
  if (!/^[\d*/,\-\s]+$/.test(expr)) {
    value.error = '包含无法识别的字符'
    cache = { key: expr, value }
    return value
  }

  const runs = []
  const cursor = new Date()
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  const limit = 60 * 24 * 400

  for (let i = 0; i < limit && runs.length < 5; i++) {
    const minuteOk = matchField(m, cursor.getMinutes(), 0)
    const hourOk = matchField(h, cursor.getHours(), 0)
    const domOk = matchField(dom, cursor.getDate(), 1)
    const monOk = matchField(mon, cursor.getMonth() + 1, 1)
    const dowOk = matchField(dow, cursor.getDay(), 0)

    // 标准 cron：日与周都指定时取「或」，否则取「且」
    const dayOk = dom !== '*' && dow !== '*' ? domOk || dowOk : domOk && dowOk

    if (minuteOk && hourOk && dayOk && monOk) {
      runs.push(new Date(cursor))
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }

  if (!runs.length) {
    value.error = '未来 400 天内没有匹配的执行时间'
  } else {
    value.valid = true
    value.nextRuns = runs
  }
  cache = { key: expr, value }
  return value
}

const nextList = computed(() => {
  void expression.value
  return compute().nextRuns
})
const exprError = computed(() => {
  void expression.value
  return compute().error
})

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${WEEK_NAMES[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* ---------------- 操作 ---------------- */

function applyTemplate(template) {
  useCustom.value = false
  const [m, h, dom, mon, dow] = template.expr.split(' ')
  const assign = (key, expr, meta) => {
    if (expr === '*') state[key] = { ...blankField(key), mode: 'every' }
    else if (expr.startsWith('*/'))
      state[key] = { ...blankField(key), mode: 'interval', interval: Number(expr.slice(2)) }
    else if (expr.includes('-'))
      state[key] = {
        ...blankField(key),
        mode: 'range',
        from: Number(expr.split('-')[0]),
        to: Number(expr.split('-')[1]),
      }
    else state[key] = { ...blankField(key), mode: 'list', values: expr }
    void meta
  }
  assign('minute', m)
  assign('hour', h)
  assign('day', dom)
  assign('month', mon)
  assign('week', dow)
}

async function copyExpr() {
  try {
    await navigator.clipboard.writeText(expression.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用 */
  }
}

let saveTimer = null
watch(
  [state, customExpr, useCustom],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state: JSON.parse(JSON.stringify(state)), customExpr: customExpr.value, useCustom: useCustom.value }),
      )
    }, 400)
  },
  { deep: true },
)

onMounted(() => {
  if (!saved.state && !saved.customExpr) {
    // 默认：每天 9 点
    applyTemplate({ expr: '0 9 * * *' })
  }
})
</script>

<template>
  <div class="cron">
    <div class="expr-bar">
      <code class="expr">{{ expression || '—' }}</code>
      <button class="btn" @click="copyExpr">{{ copied ? '已复制' : '复制' }}</button>
      <span class="desc">{{ description }}</span>
    </div>

    <div class="body">
      <section class="fields">
        <div v-for="field in FIELDS" :key="field.key" class="field">
          <span class="fname">{{ field.name }}</span>
          <select v-model="state[field.key].mode" class="select">
            <option v-for="m in MODES" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>

          <template v-if="state[field.key].mode === 'interval'">
            <span class="mid">每</span>
            <input v-model.number="state[field.key].interval" class="num" type="number" :min="1" :max="field.max" />
            <span class="mid">{{ field.unit }}</span>
          </template>

          <template v-else-if="state[field.key].mode === 'list'">
            <input
              v-model="state[field.key].values"
              class="vals"
              spellcheck="false"
              :placeholder="field.key === 'week' ? '1,3,5（0=周日）' : `如 ${field.min},${field.min + 15}`"
            />
          </template>

          <template v-else-if="state[field.key].mode === 'range'">
            <input v-model.number="state[field.key].from" class="num" type="number" :min="field.min" :max="field.max" />
            <span class="mid">至</span>
            <input v-model.number="state[field.key].to" class="num" type="number" :min="field.min" :max="field.max" />
          </template>

          <span class="preview">{{ fieldExpr(state[field.key]) }}</span>
        </div>

        <div class="custom">
          <label class="checkbox">
            <input v-model="useCustom" type="checkbox" />
            直接手写表达式
          </label>
          <input
            v-if="useCustom"
            v-model="customExpr"
            class="custom-input"
            spellcheck="false"
            placeholder="*/10 9-18 * * 1-5"
          />
        </div>
      </section>

      <section class="next">
        <p class="next-title">接下来 5 次执行</p>
        <p v-if="exprError" class="next-err">{{ exprError }}</p>
        <ol v-else class="next-list">
          <li v-for="(run, i) in nextList" :key="i">{{ formatDate(run) }}</li>
        </ol>
      </section>
    </div>

    <div class="templates">
      <span class="tpl-title">常用模板</span>
      <button v-for="t in TEMPLATES" :key="t.expr" class="tpl" :title="t.expr" @click="applyTemplate(t)">
        {{ t.name }}
      </button>
    </div>

    <p class="hint">
      格式：<code>分 时 日 月 周</code>，支持 <code>*</code> 任意、<code>*/n</code> 间隔、<code>a-b</code> 区间、<code>a,b</code> 列表；星期 0 = 周日。
    </p>
  </div>
</template>

<style scoped>
.cron {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.expr-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-1);
}
.expr {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--accent);
  word-break: break-all;
}
.btn {
  flex: none;
  padding: 4px 11px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
}
.btn:hover {
  background: var(--fill-1);
}
.desc {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-dim);
  text-align: right;
}

.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 268px;
  gap: 10px;
}
.fields {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fname {
  flex: none;
  width: 36px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.select {
  flex: none;
  width: 92px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.num {
  width: 62px;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.vals {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.num:focus,
.vals:focus,
.select:focus {
  border-color: var(--accent);
}
.mid {
  font-size: 11px;
  color: var(--text-dim);
}
.preview {
  margin-left: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-faint);
}
.custom {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
}
.custom-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.next {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: auto;
}
.next-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.next-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.next-list li {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text);
}
.next-err {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--danger);
}

.templates {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.tpl-title {
  font-size: 10.5px;
  color: var(--text-faint);
}
.tpl {
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel-bg);
  font-size: 10.5px;
  color: var(--text-dim);
}
.tpl:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.hint {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-faint);
}
.hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
</style>
