<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import hljsCore from 'highlight.js/lib/core'
import hljsJson from 'highlight.js/lib/languages/json'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

if (!hljsCore.getLanguage('json')) hljsCore.registerLanguage('json', hljsJson)

const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const SAMPLE_SECRET = 'your-256-bit-secret'

const TIME_CLAIMS = {
  exp: '过期时间',
  iat: '签发时间',
  nbf: '生效时间',
  auth_time: '认证时间',
  updated_at: '更新时间',
}

const token = ref('')
const secret = ref(SAMPLE_SECRET)
const verifyState = ref({ checked: false, ok: false, message: '' })
/* ---------------- 解码 ---------------- */

function b64urlDecode(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function b64urlEncode(bytes) {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function highlightJson(text) {
  try {
    return hljsCore.highlight(text, { language: 'json' }).value
  } catch {
    return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  }
}

const parsed = computed(() => {
  const raw = token.value.trim().replace(/^Bearer\s+/i, '')
  if (!raw) return { ok: false, empty: true, error: '' }

  const parts = raw.split('.')
  if (parts.length < 2) return { ok: false, error: 'JWT 应包含 3 段（用 . 分隔）' }

  try {
    const header = JSON.parse(b64urlDecode(parts[0]))
    const payload = JSON.parse(b64urlDecode(parts[1]))
    const headerText = JSON.stringify(header, null, 2)
    const payloadText = JSON.stringify(payload, null, 2)
    return {
      ok: true,
      header,
      payload,
      headerText,
      payloadText,
      headerHtml: highlightJson(headerText),
      payloadHtml: highlightJson(payloadText),
      signature: parts[2] || '',
      raw,
      signedInput: `${parts[0]}.${parts[1]}`,
    }
  } catch (e) {
    return { ok: false, error: `解析失败：${e.message}` }
  }
})

/* ---------------- 状态判断 ---------------- */

const now = ref(Math.floor(Date.now() / 1000))

const status = computed(() => {
  const p = parsed.value
  if (!p.ok) return null
  const exp = Number(p.payload.exp)
  const nbf = Number(p.payload.nbf)
  if (Number.isFinite(nbf) && nbf > now.value) {
    return { kind: 'warn', text: `未生效（${relative(nbf - now.value)} 后生效）` }
  }
  if (Number.isFinite(exp)) {
    if (exp < now.value) return { kind: 'bad', text: `已过期 ${relative(now.value - exp)}` }
    return { kind: 'ok', text: `有效（${relative(exp - now.value)} 后过期）` }
  }
  return { kind: 'neutral', text: '无 exp 声明，不会自动过期' }
})

const timeClaims = computed(() => {
  const p = parsed.value
  if (!p.ok) return []
  return Object.entries(TIME_CLAIMS)
    .filter(([key]) => p.payload[key] !== undefined)
    .map(([key, label]) => {
      const value = Number(p.payload[key])
      const date = new Date(value * 1000)
      return {
        key,
        label,
        raw: value,
        iso: Number.isFinite(value) ? formatTime(date) : '—',
        relative: Number.isFinite(value) ? relative(value - now.value) : '',
        state: key === 'exp' && value < now.value ? 'bad' : '',
      }
    })
})

const otherClaims = computed(() => {
  const p = parsed.value
  if (!p.ok) return []
  return Object.entries(p.payload).filter(([key]) => TIME_CLAIMS[key] === undefined)
})

function formatTime(date) {
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function relative(deltaSeconds) {
  const abs = Math.abs(deltaSeconds)
  const units = [
    [86400 * 365, '年'],
    [86400 * 30, '个月'],
    [86400, '天'],
    [3600, '小时'],
    [60, '分钟'],
    [1, '秒'],
  ]
  for (const [size, name] of units) {
    if (abs >= size) {
      const value = Math.floor(abs / size)
      return `${value} ${name}${deltaSeconds < 0 ? '前' : ''}`
    }
  }
  return '刚刚'
}

/* ---------------- 验签 ---------------- */

const algOptions = ['HS256', 'HS384', 'HS512']

async function verify() {
  const p = parsed.value
  if (!p.ok) return
  const alg = p.header?.alg
  if (!algOptions.includes(alg)) {
    verifyState.value = {
      checked: true,
      ok: false,
      message: `不支持 ${alg || '未知'} 的本地验签（本工具仅支持 HS256 / HS384 / HS512）`,
    }
    return
  }
  if (!secret.value) {
    verifyState.value = { checked: true, ok: false, message: '请填写密钥' }
    return
  }

  try {
    const hash = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }[alg]
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret.value),
      { name: 'HMAC', hash },
      false,
      ['sign'],
    )
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(p.signedInput))
    const expected = b64urlEncode(new Uint8Array(signature))
    const ok = expected === p.signature
    verifyState.value = {
      checked: true,
      ok,
      message: ok ? '签名验证通过' : '签名不匹配（密钥或算法不对）',
    }
  } catch (e) {
    verifyState.value = { checked: true, ok: false, message: e.message }
  }
}

watch([token, secret], () => {
  verifyState.value = { checked: false, ok: false, message: '' }
})

/* ---------------- 复制 ---------------- */


function loadSample() {
  token.value = SAMPLE
  secret.value = SAMPLE_SECRET
}

function clearAll() {
  token.value = ''
  secret.value = ''
  verifyState.value = { checked: false, ok: false, message: '' }
}

onMounted(() => {
  const saved = localStorage.getItem('toolbox:jwt')
  if (saved) {
    try {
      const data = JSON.parse(saved)
      token.value = data.token || ''
      secret.value = data.secret || ''
    } catch {
      /* 忽略 */
    }
  } else {
    token.value = SAMPLE
  }
})

watch([token, secret], () => {
  localStorage.setItem('toolbox:jwt', JSON.stringify({ token: token.value, secret: secret.value }))
})

// 每秒刷新相对时间
const timer = setInterval(() => {
  now.value = Math.floor(Date.now() / 1000)
}, 1000)

onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="jwt">
    <div class="input-bar">
      <textarea
        v-model="token"
        class="token"
        spellcheck="false"
        placeholder="粘贴 JWT（可带 Bearer 前缀），会自动解析"
      />
      <div class="input-side">
        <span v-if="parsed.ok" class="badge" :class="status?.kind">{{ status?.text }}</span>
        <span v-else-if="parsed.error" class="badge bad">{{ parsed.error }}</span>
        <span v-else class="badge neutral">等待输入</span>
        <div class="side-actions">
          <button class="btn" @click="loadSample">示例</button>
          <button class="btn" @click="clearAll">清空</button>
        </div>
      </div>
    </div>

    <div v-if="parsed.ok" class="panels">
      <section class="panel">
        <header>
          <span class="panel-title">Header</span>
          <button class="mini" @click="copy(parsed.headerText, 'header')">
            {{ copied === 'header' ? '已复制' : '复制' }}
          </button>
        </header>
        <pre class="code"><code v-html="parsed.headerHtml" /></pre>
      </section>

      <section class="panel">
        <header>
          <span class="panel-title">Payload</span>
          <button class="mini" @click="copy(parsed.payloadText, 'payload')">
            {{ copied === 'payload' ? '已复制' : '复制' }}
          </button>
        </header>
        <pre class="code"><code v-html="parsed.payloadHtml" /></pre>
      </section>

      <section class="panel">
        <header>
          <span class="panel-title">Signature</span>
          <button class="mini" @click="copy(parsed.signature, 'sig')">
            {{ copied === 'sig' ? '已复制' : '复制' }}
          </button>
        </header>
        <div class="sig">
          <p class="alg">算法：{{ parsed.header?.alg || '—' }} / {{ parsed.header?.typ || '—' }}</p>
          <code class="sig-text">{{ parsed.signature || '（无签名，可能是 JWT 前两段）' }}</code>
        </div>
      </section>
    </div>

    <div v-if="parsed.ok" class="bottom">
      <section class="claims">
        <p class="section-title">声明解读</p>
        <div class="claim-grid">
          <div v-for="c in timeClaims" :key="c.key" class="claim time" :class="c.state">
            <span class="k">{{ c.key }} · {{ c.label }}</span>
            <span class="v">{{ c.iso }}</span>
            <span class="r">{{ c.relative }}</span>
          </div>
          <div v-for="[k, v] in otherClaims" :key="k" class="claim">
            <span class="k">{{ k }}</span>
            <span class="v">{{ typeof v === 'object' ? JSON.stringify(v) : String(v) }}</span>
          </div>
          <p v-if="!timeClaims.length && !otherClaims.length" class="empty">payload 为空</p>
        </div>
      </section>

      <section class="verify">
        <p class="section-title">签名验证（HMAC）</p>
        <div class="verify-row">
          <input v-model="secret" class="secret" placeholder="填写密钥 / secret" spellcheck="false" />
          <button class="btn primary" @click="verify">验证</button>
        </div>
        <p v-if="verifyState.checked" class="verify-msg" :class="{ ok: verifyState.ok, bad: !verifyState.ok }">
          {{ verifyState.message }}
        </p>
        <p class="hint">仅 HS256 / HS384 / HS512 可在本地验签，RS / ES 系列需公钥，暂不支持。</p>
      </section>
    </div>

    <div v-else-if="!parsed.empty" class="empty-state">
      <p>{{ parsed.error }}</p>
    </div>
  </div>
</template>

<style scoped>
.jwt {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 输入区 */
.input-bar {
  flex: none;
  display: flex;
  gap: 10px;
}
.token {
  flex: 1;
  min-width: 0;
  height: 66px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.6;
  word-break: break-all;
}
.token:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.input-side {
  flex: none;
  width: 178px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
}
.badge {
  padding: 4px 9px;
  border-radius: 7px;
  font-size: 11px;
  text-align: center;
  line-height: 1.4;
}
.badge.ok {
  background: var(--success-soft);
  color: var(--success);
}
.badge.bad {
  background: var(--danger-soft);
  color: var(--danger);
}
.badge.warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.badge.neutral {
  background: var(--fill-2);
  color: var(--text-dim);
}
.side-actions {
  display: flex;
  gap: 6px;
}
.side-actions .btn {
  flex: 1;
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
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover {
  background: var(--accent-strong);
}

/* 三栏 */
.panels {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1.35fr 1fr;
  gap: 10px;
}
.panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.panel header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.panel-title {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.mini {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--accent);
}
.code {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.sig {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  overflow: auto;
}
.alg {
  margin: 0 0 8px;
  font-size: 11px;
  color: var(--text-dim);
}
.sig-text {
  display: block;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.7;
  word-break: break-all;
  color: var(--text);
}

/* 底部 */
.bottom {
  flex: none;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 10px;
  max-height: 190px;
}
.claims,
.verify {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.section-title {
  flex: none;
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.claim-grid {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  overflow: auto;
  align-content: flex-start;
}
.claim {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 9px;
  border-radius: 6px;
  background: var(--fill-1);
  font-size: 11px;
  max-width: 100%;
}
.claim .k {
  color: var(--text-dim);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
}
.claim .v {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.claim .r {
  font-size: 10px;
  color: var(--text-faint);
}
.claim.time {
  background: var(--accent-soft);
}
.claim.time.bad {
  background: var(--danger-soft);
}
.claim.time.bad .v {
  color: var(--danger);
}
.empty {
  margin: 6px 0;
  font-size: 11px;
  color: var(--text-faint);
}
.verify-row {
  display: flex;
  gap: 6px;
}
.secret {
  flex: 1;
  min-width: 0;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.secret:focus {
  border-color: var(--accent);
}
.verify-msg {
  margin: 8px 0 0;
  font-size: 11.5px;
}
.verify-msg.ok {
  color: var(--success);
}
.verify-msg.bad {
  color: var(--danger);
}
.hint {
  margin: 8px 0 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-state p {
  font-size: 12px;
  color: var(--danger);
}

/* JSON 高亮 */
.code :deep(.hljs-attr) {
  color: #0451a5;
}
.code :deep(.hljs-string) {
  color: #a31515;
}
.code :deep(.hljs-number),
.code :deep(.hljs-literal) {
  color: #098658;
}
:global(html.dark) .code :deep(.hljs-attr) {
  color: #9cdcfe;
}
:global(html.dark) .code :deep(.hljs-string) {
  color: #ce9178;
}
:global(html.dark) .code :deep(.hljs-number),
:global(html.dark) .code :deep(.hljs-literal) {
  color: #b5cea8;
}
</style>
