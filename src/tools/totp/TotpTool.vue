<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STORAGE_KEY = 'toolbox:totp'

const saved = readJSON(STORAGE_KEY)

const secret = ref(saved.secret ?? '')
const digits = ref(saved.digits ?? 6)
const period = ref(saved.period ?? 30)
const algo = ref(saved.algo ?? 'SHA-1')
const label = ref(saved.label ?? '')

const now = ref(Date.now())
const code = ref('')
const nextCode = ref('')
const error = ref('')
const copied = ref('')
const showSecret = ref(false)

const remaining = computed(() => {
  const secs = Math.floor(now.value / 1000)
  return period.value - (secs % period.value)
})

const progress = computed(() => (remaining.value / period.value) * 100)

function base32Decode(input) {
  const clean = String(input)
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/=+$/, '')
  if (!clean) throw new Error('请填写密钥')
  if (!/^[A-Z2-7]+$/.test(clean)) throw new Error('密钥不是合法的 Base32（只能含 A-Z 和 2-7）')

  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  if (!out.length) throw new Error('密钥太短')
  return new Uint8Array(out)
}

async function totpAt(counterValue) {
  const keyBytes = base32Decode(secret.value)
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: algo.value },
    false,
    ['sign'],
  )

  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setUint32(0, Math.floor(counterValue / 2 ** 32))
  view.setUint32(4, counterValue >>> 0)

  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf))
  const offset = sig[sig.length - 1] & 0x0f
  const binary =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff)

  const mod = 10 ** digits.value
  return String(binary % mod).padStart(digits.value, '0')
}

let busy = false
async function refresh() {
  if (busy) return
  if (!secret.value.trim()) {
    code.value = ''
    nextCode.value = ''
    error.value = ''
    return
  }
  busy = true
  try {
    const counter = Math.floor(now.value / 1000 / period.value)
    code.value = await totpAt(counter)
    nextCode.value = await totpAt(counter + 1)
    error.value = ''
  } catch (e) {
    error.value = e.message
    code.value = ''
    nextCode.value = ''
  } finally {
    busy = false
  }
}

const formatted = computed(() => {
  if (!code.value) return '••••••'
  const half = Math.ceil(code.value.length / 2)
  return `${code.value.slice(0, half)} ${code.value.slice(half)}`
})

/* ---------------- otpauth:// 解析 ---------------- */

function parseUri() {
  const text = secret.value.trim()
  if (!text.startsWith('otpauth://')) return
  try {
    const url = new URL(text)
    const secretParam = url.searchParams.get('secret')
    if (secretParam) secret.value = secretParam
    const d = url.searchParams.get('digits')
    if (d === '8' || d === '6') digits.value = Number(d)
    const p = url.searchParams.get('period')
    if (p) period.value = Number(p) === 60 ? 60 : 30
    const alg = (url.searchParams.get('algorithm') || '').toUpperCase()
    if (['SHA1', 'SHA256', 'SHA512'].includes(alg)) {
      algo.value = alg === 'SHA1' ? 'SHA-1' : alg === 'SHA256' ? 'SHA-256' : 'SHA-512'
    }
    const issuer = url.searchParams.get('issuer')
    let account = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    // 账号路径里常带 "GitHub:user" 前缀，和 issuer 重复，去掉
    if (issuer && account.startsWith(`${issuer}:`)) account = account.slice(issuer.length + 1)
    label.value = issuer ? `${issuer}${account ? ` · ${account}` : ''}` : account
  } catch {
    error.value = 'otpauth 链接解析失败'
  }
}

/* ---------------- 操作 ---------------- */

async function copyCode() {
  if (!code.value) return
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = 'code'
    setTimeout(() => (copied.value = ''), 1200)
  } catch {
    /* 忽略 */
  }
}

function clearAll() {
  secret.value = ''
  label.value = ''
  code.value = ''
  nextCode.value = ''
  error.value = ''
}

let timer = null
onMounted(() => {
  refresh()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => clearInterval(timer))

watch([now, secret, digits, period, algo], refresh)

let stillTimer = null
watch([secret, digits, period, algo, label], () => {
  parseUri()
  clearTimeout(stillTimer)
  stillTimer = setTimeout(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        secret: secret.value,
        digits: digits.value,
        period: period.value,
        algo: algo.value,
        label: label.value,
      }),
    )
  }, 400)
})
</script>

<template>
  <div class="totp">
    <div class="toolbar">
      <span class="label">算法</span>
      <select v-model="algo" class="select">
        <option value="SHA-1">SHA-1</option>
        <option value="SHA-256">SHA-256</option>
        <option value="SHA-512">SHA-512</option>
      </select>
      <select v-model.number="digits" class="select">
        <option :value="6">6 位</option>
        <option :value="8">8 位</option>
      </select>
      <select v-model.number="period" class="select">
        <option :value="30">30 秒</option>
        <option :value="60">60 秒</option>
      </select>
      <label class="chk">
        <input v-model="showSecret" type="checkbox" />
        显示密钥
      </label>
      <span class="spacer" />
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!code" @click="copyCode">
        {{ copied ? '已复制' : '复制验证码' }}
      </button>
    </div>

    <div class="body">
      <section class="code-card">
        <p v-if="label" class="label-line">{{ label }}</p>
        <p v-if="error" class="err">{{ error }}</p>

        <template v-else>
          <div class="code" :class="{ small: code.length > 6 }" @click="copyCode">
            {{ formatted }}
          </div>
          <div class="bar">
            <i :style="{ width: progress + '%' }" :class="{ warn: remaining <= 5 }" />
          </div>
          <p class="count">{{ remaining }} 秒后刷新</p>
          <p class="next">下一个：{{ nextCode || '—' }}</p>
        </template>
      </section>

      <aside class="side">
        <div class="field">
          <label>密钥（Base32）</label>
          <input
            v-model="secret"
            class="input mono"
            :type="showSecret ? 'text' : 'password'"
            :spellcheck="false"
            placeholder="如 JBSWY3DPEHPK3PXP，也可粘贴 otpauth:// 链接"
          />
          <p class="tip">
            {{ showSecret ? '密钥明文显示中' : '密钥已隐藏，勾选上方「显示密钥」查看' }}
          </p>
        </div>

        <div class="field">
          <label>备注（可选）</label>
          <input v-model="label" class="input" placeholder="如 GitHub: gongzhenxu" spellcheck="false" />
        </div>

        <p class="note">
          与服务端 / Authenticator App 走同一套标准（RFC 6238），
          截图或复制密钥后本地计算，不会上传。密钥保存在本机 localStorage。
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.totp {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.label {
  font-size: 11px;
  color: var(--text-dim);
}
.select {
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.chk {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
}
.spacer {
  margin-left: auto;
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
.btn.primary:hover:not(:disabled) {
  background: var(--accent-strong);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.code-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.label-line {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-dim);
}
.code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 54px;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  cursor: pointer;
  user-select: all;
  line-height: 1.1;
}
.code.small {
  font-size: 42px;
}
.bar {
  width: min(320px, 80%);
  height: 5px;
  border-radius: 99px;
  background: var(--fill-2);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--accent);
  transition: width 0.9s linear;
}
.bar i.warn {
  background: var(--danger);
}
.count {
  margin: 0;
  font-size: 11px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.next {
  margin: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.06em;
}
.err {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
  text-align: center;
}
.side {
  flex: none;
  width: 300px;
  display: flex;
  flex-direction: column;
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
.field label {
  font-size: 10.5px;
  color: var(--text-faint);
}
.input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 12px;
}
textarea.input {
  height: 76px;
  resize: none;
  line-height: 1.6;
}
.input:focus {
  border-color: var(--accent);
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  word-break: break-all;
}
.tip {
  margin: 0;
  font-size: 9.5px;
  color: var(--text-faint);
}
.note {
  margin: auto 0 0;
  font-size: 10px;
  line-height: 1.7;
  color: var(--text-faint);
}
</style>
