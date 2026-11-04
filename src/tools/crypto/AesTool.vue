<script setup>
import { computed, ref, watch } from 'vue'

const PREFIX = 'TBOX1:'
const ITERATIONS = 200000

const direction = ref('encrypt') // encrypt | decrypt
const password = ref('')
const input = ref('')
const output = ref('')
const busy = ref(false)
const error = ref('')
const copied = ref(false)
const showPassword = ref(false)

const canRun = computed(() => input.value.trim() && password.value.length > 0 && !busy.value)

const passwordHint = computed(() => {
  const len = password.value.length
  if (!len) return ''
  if (len < 6) return '口令太短，建议 12 位以上'
  if (len < 12) return '口令偏弱，建议加入大小写、数字与符号'
  return '口令长度足够'
})

/* ---------------- 编码工具 ---------------- */

function toBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function fromBase64(text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

/* ---------------- 加解密 ---------------- */

async function deriveKey(pass, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pass),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encrypt(plain, pass) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(pass, salt)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  )
  const cipherBytes = new Uint8Array(cipher)
  const combined = new Uint8Array(salt.length + iv.length + cipherBytes.length)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(cipherBytes, salt.length + iv.length)
  return PREFIX + toBase64(combined)
}

async function decrypt(payload, pass) {
  const raw = payload.trim().replace(/^TBOX1:/, '')
  if (!raw) throw new Error('密文为空')
  let bytes
  try {
    bytes = fromBase64(raw)
  } catch {
    throw new Error('密文不是合法的 Base64，请检查是否复制完整')
  }
  if (bytes.length < 29) throw new Error('密文长度不足，可能复制不完整')

  const salt = bytes.slice(0, 16)
  const iv = bytes.slice(16, 28)
  const cipher = bytes.slice(28)
  const key = await deriveKey(pass, salt)

  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error('解密失败：口令不正确，或密文已被篡改')
  }
}

async function run() {
  if (!canRun.value) return
  busy.value = true
  error.value = ''
  output.value = ''
  try {
    output.value =
      direction.value === 'encrypt'
        ? await encrypt(input.value, password.value)
        : await decrypt(input.value, password.value)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function swap() {
  if (!output.value) {
    direction.value = direction.value === 'encrypt' ? 'decrypt' : 'encrypt'
    return
  }
  const previous = output.value
  direction.value = direction.value === 'encrypt' ? 'decrypt' : 'encrypt'
  input.value = previous
  output.value = ''
  error.value = ''
}

async function copyOutput() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 忽略 */
  }
}

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}

watch([input, password, direction], () => {
  error.value = ''
  if (output.value) output.value = ''
})
</script>

<template>
  <div class="aes">
    <div class="toolbar">
      <div class="seg">
        <button :class="{ on: direction === 'encrypt' }" @click="direction = 'encrypt'">加密</button>
        <button :class="{ on: direction === 'decrypt' }" @click="direction = 'decrypt'">解密</button>
      </div>

      <div class="pwd-wrap">
        <input
          v-model="password"
          class="pwd-input"
          :type="showPassword ? 'text' : 'password'"
          spellcheck="false"
          :placeholder="direction === 'encrypt' ? '设置一个口令（加密与解密必须一致）' : '输入解密口令'"
        />
        <button class="eye" :title="showPassword ? '隐藏' : '显示'" @click="showPassword = !showPassword">
          {{ showPassword ? '🙈' : '👁' }}
        </button>
      </div>

      <span class="pwd-hint" :class="{ warn: password.length > 0 && password.length < 12 }">
        {{ passwordHint }}
      </span>

      <span class="spacer" />
      <button class="btn" @click="swap">⇄ 切换方向</button>
      <button class="btn" :disabled="!output" @click="copyOutput">
        {{ copied ? '已复制' : '复制结果' }}
      </button>
      <button class="btn" :disabled="!input && !output" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!canRun" @click="run">
        {{ busy ? '处理中…' : direction === 'encrypt' ? '加密' : '解密' }}
      </button>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">{{ direction === 'encrypt' ? '明文' : '密文（Base64）' }}</span>
          <span class="pane-meta">{{ input.length }} 字符</span>
        </header>
        <textarea
          v-model="input"
          class="code"
          spellcheck="false"
          :placeholder="direction === 'encrypt' ? '输入要加密的文本' : '粘贴以 TBOX1: 开头的密文'"
        />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">{{ direction === 'encrypt' ? '密文（Base64）' : '明文' }}</span>
          <span class="pane-meta">{{ output.length }} 字符</span>
        </header>
        <pre class="code output">{{ output || (error ? '' : '（结果会显示在这里）') }}</pre>
        <p v-if="error" class="err-bar">{{ error }}</p>
      </section>
    </div>

    <p class="hint">
      使用 AES-256-GCM 加密，密钥由口令经 PBKDF2-SHA256（{{ ITERATIONS.toLocaleString() }} 次迭代）派生，
      随机 salt 与 IV 一并写入密文。全部在本机完成，不会上传；口令丢失后无法恢复内容。
    </p>
  </div>
</template>

<style scoped>
.aes {
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
  gap: 8px;
  flex-wrap: wrap;
}
.seg {
  flex: none;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  padding: 4px 14px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.pwd-wrap {
  position: relative;
  flex: 0 1 260px;
  min-width: 160px;
  display: flex;
  align-items: center;
}
.pwd-input {
  width: 100%;
  padding: 5px 28px 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.pwd-input:focus {
  border-color: var(--accent);
}
.eye {
  position: absolute;
  right: 6px;
  font-size: 11px;
  opacity: 0.6;
}
.eye:hover {
  opacity: 1;
}
.pwd-hint {
  flex: none;
  font-size: 10px;
  color: var(--success);
  white-space: nowrap;
}
.pwd-hint.warn {
  color: var(--warn);
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.pane {
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
  font-size: 10.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.code {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
}
.output {
  white-space: pre-wrap;
}
.err-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--text-faint);
}
</style>
