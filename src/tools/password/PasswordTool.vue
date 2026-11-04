<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:password'

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/~'
const AMBIGUOUS = '0O1lI|`\'"{}[]()/\\'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const tab = ref('generate')

const config = reactive({
  length: saved.length ?? 16,
  lower: saved.lower ?? true,
  upper: saved.upper ?? true,
  digits: saved.digits ?? true,
  symbols: saved.symbols ?? true,
  noAmbiguous: saved.noAmbiguous ?? false,
  count: saved.count ?? 5,
})

const passwords = ref([])
const copiedIndex = ref(-1)
const checkInput = ref('')
const message = ref('')

/* ---------------- 生成 ---------------- */

// 用拒绝采样避免取模偏差
function randomInt(max) {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0xffffffff / max) * max
  let value
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= limit)
  return value % max
}

function pools() {
  const list = []
  if (config.lower) list.push(filterPool(LOWER))
  if (config.upper) list.push(filterPool(UPPER))
  if (config.digits) list.push(filterPool(DIGITS))
  if (config.symbols) list.push(filterPool(SYMBOLS))
  return list.filter((p) => p.length > 0)
}

function filterPool(pool) {
  return config.noAmbiguous ? [...pool].filter((c) => !AMBIGUOUS.includes(c)).join('') : pool
}

function generateOne() {
  const sets = pools()
  if (!sets.length) return ''
  const all = sets.join('')
  const length = Math.max(config.length, sets.length)
  const chars = []

  // 先保证每个启用的字符集至少出现一次
  for (const set of sets) chars.push(set[randomInt(set.length)])

  while (chars.length < length) chars.push(all[randomInt(all.length)])

  // 打乱
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

function regenerate() {
  const count = Math.min(50, Math.max(1, Number(config.count) || 1))
  if (!pools().length) {
    message.value = '至少选择一种字符类型'
    passwords.value = []
    return
  }
  message.value = ''
  passwords.value = Array.from({ length: count }, () => generateOne())
}

/* ---------------- 强度评估 ---------------- */

function analyze(password) {
  if (!password) return null

  let poolSize = 0
  if (/[a-z]/.test(password)) poolSize += 26
  if (/[A-Z]/.test(password)) poolSize += 26
  if (/[0-9]/.test(password)) poolSize += 10
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 30

  const entropy = password.length * Math.log2(Math.max(poolSize, 2))
  const guesses = Math.pow(2, entropy)
  // 假设每秒 100 亿次尝试
  const seconds = guesses / 2 / 1e10
  const crackTime = humanTime(seconds)

  let level = 'weak'
  if (entropy >= 80) level = 'excellent'
  else if (entropy >= 60) level = 'strong'
  else if (entropy >= 40) level = 'medium'

  // 常见问题
  const issues = []
  if (password.length < 8) issues.push('长度不足 8 位')
  if (poolSize === 10) issues.push('只有数字，容易被字典攻击')
  else if (poolSize === 26) issues.push('只有单一大小写的字母')
  else if (poolSize === 52) issues.push('缺少数字或符号')
  if (/(.)\1{2,}/.test(password)) issues.push('存在 3 个以上连续重复字符')
  if (/^(?:012|123|234|345|456|567|678|789|890|abc|qwe|asd|zxc)/i.test(password)) {
    issues.push('包含键盘或数字序列')
  }
  if (/^(password|admin|root|qwerty|123456|iloveyou|letmein|welcome|abc123)/i.test(password)) {
    issues.push('是常见弱密码')
  }
  const unique = new Set(password).size
  if (password.length >= 8 && unique / password.length < 0.5) issues.push('字符重复率过高')

  return {
    entropy,
    level,
    levelText: { weak: '弱', medium: '中', strong: '强', excellent: '极强' }[level],
    crackTime,
    poolSize,
    issues,
    percent: Math.max(4, Math.min(100, (entropy / 100) * 100)),
  }
}

function humanTime(seconds) {
  if (!Number.isFinite(seconds)) return '几乎不可能'
  if (seconds < 1) return '瞬间'
  const units = [
    [60, '秒'],
    [60, '分钟'],
    [24, '小时'],
    [365, '天'],
    [1000, '年'],
  ]
  let value = seconds
  let label = '秒'
  for (const [size, name] of units) {
    if (value < size) {
      label = name
      break
    }
    value /= size
    label = name
  }
  if (value > 1e6) return '数百万年以上'
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${label}`
}

const generatedAnalysis = computed(() => (passwords.value.length ? analyze(passwords.value[0]) : null))
const checked = computed(() => analyze(checkInput.value))

/* ---------------- 交互 ---------------- */

async function copy(text, index) {
  try {
    await navigator.clipboard.writeText(text)
    copiedIndex.value = index
    setTimeout(() => {
      if (copiedIndex.value === index) copiedIndex.value = -1
    }, 1200)
  } catch {
    /* 忽略 */
  }
}

async function copyAll() {
  if (!passwords.value.length) return
  try {
    await navigator.clipboard.writeText(passwords.value.join('\n'))
    message.value = `已复制 ${passwords.value.length} 条`
    setTimeout(() => {
      if (message.value.startsWith('已复制')) message.value = ''
    }, 1600)
  } catch {
    /* 忽略 */
  }
}

let saveTimer = null
watch(
  config,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config }))
    }, 300)
  },
  { deep: true },
)

onMounted(() => {
  regenerate()
})
</script>

<template>
  <div class="pwd">
    <div class="tabs">
      <button :class="{ on: tab === 'generate' }" @click="tab = 'generate'">生成密码</button>
      <button :class="{ on: tab === 'check' }" @click="tab = 'check'">检测强度</button>
      <span class="spacer" />
      <span class="hint">全部在本地生成，不会上传</span>
    </div>

    <!-- 生成 -->
    <template v-if="tab === 'generate'">
      <div class="opts">
        <div class="opt-row">
          <label class="opt-label">长度</label>
          <input v-model.number="config.length" class="slider" type="range" min="4" max="64" />
          <span class="len-num">{{ config.length }}</span>
        </div>

        <div class="opt-row wrap">
          <label class="chk"><input v-model="config.lower" type="checkbox" />小写 a-z</label>
          <label class="chk"><input v-model="config.upper" type="checkbox" />大写 A-Z</label>
          <label class="chk"><input v-model="config.digits" type="checkbox" />数字 0-9</label>
          <label class="chk"><input v-model="config.symbols" type="checkbox" />符号 !@#$</label>
          <label class="chk"><input v-model="config.noAmbiguous" type="checkbox" />排除易混淆 0O1lI</label>
        </div>

        <div class="opt-row">
          <label class="opt-label">数量</label>
          <select v-model.number="config.count" class="select">
            <option v-for="n in [1, 5, 10, 20, 50]" :key="n" :value="n">{{ n }} 条</option>
          </select>
          <button class="btn primary" @click="regenerate">重新生成</button>
          <button class="btn" :disabled="!passwords.length" @click="copyAll">复制全部</button>
          <span v-if="message" class="msg">{{ message }}</span>
        </div>
      </div>

      <div class="list">
        <button
          v-for="(pwd, i) in passwords"
          :key="i"
          class="pwd-row"
          :title="'点击复制'"
          @click="copy(pwd, i)"
        >
          <span class="pwd-index">{{ i + 1 }}</span>
          <code class="pwd-text">{{ pwd }}</code>
          <span class="pwd-copy">{{ copiedIndex === i ? '已复制' : '复制' }}</span>
        </button>
        <p v-if="!passwords.length" class="empty">还没有生成密码</p>
      </div>

      <div v-if="generatedAnalysis" class="strength">
        <div class="bar">
          <i :style="{ width: generatedAnalysis.percent + '%' }" :class="generatedAnalysis.level" />
        </div>
        <div class="strength-meta">
          <span class="level" :class="generatedAnalysis.level">{{ generatedAnalysis.levelText }}</span>
          <span>约 {{ Math.round(generatedAnalysis.entropy) }} 位熵</span>
          <span>字符集 {{ generatedAnalysis.poolSize }}</span>
          <span>暴力破解约需 {{ generatedAnalysis.crackTime }}</span>
        </div>
      </div>
    </template>

    <!-- 检测 -->
    <template v-else>
      <div class="check-area">
        <input
          v-model="checkInput"
          class="check-input"
          spellcheck="false"
          placeholder="输入要检测的密码（只在本地计算，不会发送到任何地方）"
        />
        <p class="check-tip">建议用「生成密码」页生成后再粘贴进来对照，或直接检查你正在用的密码强度</p>
      </div>

      <div v-if="checked" class="strength big">
        <div class="bar">
          <i :style="{ width: checked.percent + '%' }" :class="checked.level" />
        </div>
        <div class="strength-meta">
          <span class="level" :class="checked.level">{{ checked.levelText }}</span>
          <span>{{ checkInput.length }} 位</span>
          <span>约 {{ Math.round(checked.entropy) }} 位熵</span>
          <span>暴力破解约需 {{ checked.crackTime }}</span>
        </div>

        <div class="issues">
          <p v-if="!checked.issues.length" class="no-issue">没有发现明显问题</p>
          <ul v-else>
            <li v-for="issue in checked.issues" :key="issue">{{ issue }}</li>
          </ul>
        </div>
      </div>
      <p v-else class="empty">输入密码后显示强度评估</p>
    </template>
  </div>
</template>

<style scoped>
.pwd {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  font-size: 10.5px;
  color: var(--text-faint);
}
.opts {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.opt-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.opt-row.wrap {
  flex-wrap: wrap;
  gap: 14px;
}
.opt-label {
  flex: none;
  width: 32px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.slider {
  flex: 1;
  height: 4px;
  appearance: none;
  border-radius: 99px;
  background: var(--fill-2);
  outline: none;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.len-num {
  flex: none;
  width: 26px;
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
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
.btn {
  padding: 5px 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
}
.btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover {
  background: var(--accent-strong);
}
.msg {
  font-size: 11px;
  color: var(--accent);
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pwd-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  text-align: left;
  color: var(--text);
}
.pwd-row:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.pwd-index {
  flex: none;
  width: 18px;
  font-size: 10.5px;
  color: var(--text-faint);
  text-align: right;
}
.pwd-text {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 15px;
  letter-spacing: 0.02em;
  word-break: break-all;
}
.pwd-copy {
  flex: none;
  font-size: 10.5px;
  color: var(--accent);
}
.strength {
  flex: none;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.bar {
  height: 6px;
  border-radius: 99px;
  background: var(--fill-2);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  transition: width 0.25s ease;
}
.bar i.weak {
  background: var(--danger);
}
.bar i.medium {
  background: var(--warn);
}
.bar i.strong {
  background: #34c759;
}
.bar i.excellent {
  background: #00c7be;
}
.strength-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-dim);
}
.level {
  padding: 1px 8px;
  border-radius: 999px;
  font-weight: 600;
}
.level.weak {
  background: var(--danger-soft);
  color: var(--danger);
}
.level.medium {
  background: var(--warn-soft);
  color: var(--warn);
}
.level.strong {
  background: var(--success-soft);
  color: var(--success);
}
.level.excellent {
  background: rgba(0, 199, 190, 0.16);
  color: #00827c;
}
.check-area {
  flex: none;
}
.check-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 14px;
}
.check-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.check-tip {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: var(--text-faint);
}
.strength.big {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.issues {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.issues ul {
  margin: 0;
  padding-left: 18px;
}
.issues li {
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--warn);
}
.no-issue {
  margin: 0;
  font-size: 11.5px;
  color: var(--success);
}
.empty {
  margin: 30px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
</style>
