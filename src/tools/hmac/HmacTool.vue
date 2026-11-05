<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const ALGOS = [
  { id: 'SHA-1', name: 'HMAC-SHA1', jwt: 'HS1' },
  { id: 'SHA-256', name: 'HMAC-SHA256', jwt: 'HS256' },
  { id: 'SHA-384', name: 'HMAC-SHA384', jwt: 'HS384' },
  { id: 'SHA-512', name: 'HMAC-SHA512', jwt: 'HS512' },
]

const STORAGE_KEY = 'toolbox:hmac'

const saved = readJSON(STORAGE_KEY)

const message = ref(saved.message ?? '')
const secret = ref(saved.secret ?? '')
const secretFormat = ref(saved.secretFormat ?? 'text') // text | hex
const algo = ref(saved.algo ?? 'SHA-256')
const outputFormat = ref(saved.outputFormat ?? 'hex')
const result = ref('')
const error = ref('')
const showSecret = ref(false)

function hexToBytes(hex) {
  const clean = hex.replace(/[\s:]/g, '')
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error('十六进制密钥格式不正确（应为偶数位 0-9a-f）')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64(bytes, urlSafe) {
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  const b64 = btoa(bin)
  return urlSafe ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64
}

async function compute() {
  error.value = ''
  result.value = ''

  if (!secret.value) return

  try {
    const keyBytes =
      secretFormat.value === 'hex'
        ? hexToBytes(secret.value)
        : new TextEncoder().encode(secret.value)

    if (!keyBytes.length) return

    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: algo.value },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message.value))
    const bytes = new Uint8Array(sig)

    if (outputFormat.value === 'hex') result.value = toHex(bytes)
    else if (outputFormat.value === 'base64') result.value = toBase64(bytes, false)
    else result.value = toBase64(bytes, true)
  } catch (e) {
    error.value = e.message
  }
}

let timer = null
watch([message, secret, secretFormat, algo, outputFormat], () => {
  clearTimeout(timer)
  timer = setTimeout(compute, 120)
})


function clearAll() {
  message.value = ''
  secret.value = ''
  result.value = ''
  error.value = ''
}

function loadSample() {
  message.value = 'timestamp=1730000000&amount=100&orderId=20261104001'
  secret.value = 'my_secret_key_2026'
  secretFormat.value = 'text'
  algo.value = 'SHA-256'
  outputFormat.value = 'hex'
}

const jwtHint = computed(() => ALGOS.find((a) => a.id === algo.value)?.jwt || '')

// 模板里不能直接 new TextEncoder()，放到脚本里算
const byteLength = computed(() => new TextEncoder().encode(message.value).length)

let saveTimer = null
watch(
  [message, secret, secretFormat, algo, outputFormat],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          message: message.value,
          secret: secret.value,
          secretFormat: secretFormat.value,
          algo: algo.value,
          outputFormat: outputFormat.value,
        }),
      )
    }, 400)
  },
  { deep: true },
)

onMounted(compute)
</script>

<template>
  <div class="hmac">
    <div class="toolbar">
      <select v-model="algo" class="select">
        <option v-for="a in ALGOS" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <span class="jwt-tag" :title="`对应 JWT 的 ${jwtHint} 算法`">{{ jwtHint }}</span>

      <span class="divider" />

      <label class="chk">
        <input v-model="showSecret" type="checkbox" />
        显示密钥
      </label>
      <select v-model="secretFormat" class="select small">
        <option value="text">密钥：文本</option>
        <option value="hex">密钥：Hex</option>
      </select>
      <select v-model="outputFormat" class="select small">
        <option value="hex">输出：Hex</option>
        <option value="base64">输出：Base64</option>
        <option value="base64url">输出：Base64URL</option>
      </select>

      <span class="spacer" />
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!result" @click="copy">
        {{ copied ? '已复制' : '复制签名' }}
      </button>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">待签内容</span>
          <span class="pane-meta">{{ byteLength }} 字节</span>
        </header>
        <textarea
          v-model="message"
          class="code"
          spellcheck="false"
          placeholder="要签名的字符串，例如 timestamp=1730000000&amount=100&#10;（可以是空字符串）"
        />
      </section>

      <aside class="side">
        <div class="field">
          <label>密钥（Secret）</label>
          <input
            v-model="secret"
            class="input mono"
            :type="showSecret ? 'text' : 'password'"
            spellcheck="false"
            :placeholder="secretFormat === 'hex' ? '十六进制，如 6d795f6b6579' : '随便一串字符'"
          />
        </div>

        <div class="result-box">
          <div class="result-head">
            <span>签名结果</span>
            <span v-if="result" class="len">{{ result.length }} 字符</span>
          </div>
          <p v-if="error" class="err">{{ error }}</p>
          <code v-else class="result mono">{{ result || '（填写密钥后自动计算）' }}</code>
          <button v-if="result" class="copy-inline" @click="copy">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>

        <p class="note">
          用 WebCrypto 的 HMAC 计算，全程本地。签名常用于开放平台鉴权：
          把参数按字典序拼接后用密钥签名，服务端用同样方式校验。
        </p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.hmac {
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
.select {
  padding: 5px 9px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--accent);
  outline: none;
  font-size: 11.5px;
}
.select.small {
  border-color: var(--border);
  color: var(--text);
  font-size: 11px;
}
.jwt-tag {
  padding: 0 6px;
  border-radius: 4px;
  background: var(--warn-soft);
  color: var(--warn);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  line-height: 16px;
}
.divider {
  width: 1px;
  height: 16px;
  background: var(--border);
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
.panes {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.pane-title {
  font-size: 11.5px;
  font-weight: 600;
}
.pane-meta {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.code {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.75;
}
.side {
  flex: none;
  width: 320px;
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
.input:focus {
  border-color: var(--accent);
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.result-box {
  position: relative;
  padding: 9px 10px;
  border-radius: 8px;
  background: var(--code-bg);
}
.result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 10px;
  color: var(--text-faint);
}
.result-head .len {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.result {
  display: block;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text);
  word-break: break-all;
}
.err {
  margin: 0;
  font-size: 11px;
  color: var(--danger);
}
.copy-inline {
  position: absolute;
  top: 6px;
  right: 8px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--panel-bg);
  font-size: 9.5px;
  color: var(--accent);
}
.note {
  margin: 0;
  font-size: 10px;
  line-height: 1.7;
  color: var(--text-faint);
}
</style>
