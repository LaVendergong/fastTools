<script setup>
import { computed, ref } from 'vue'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const TYPES = [
  { id: 'rsa-2048', name: 'RSA 2048', desc: '通用强度，兼容性最好', algo: 'RSA' },
  { id: 'rsa-3072', name: 'RSA 3072', desc: '更高强度，稍慢', algo: 'RSA' },
  { id: 'rsa-4096', name: 'RSA 4096', desc: '最高强度，生成较慢（数秒）', algo: 'RSA' },
  { id: 'ec-p256', name: 'ECDSA P-256', desc: '密钥短、速度快，现代首选', algo: 'EC' },
  { id: 'ec-p384', name: 'ECDSA P-384', desc: '国密级别强度', algo: 'EC' },
]

const type = ref('rsa-2048')
const generating = ref(false)
const publicPem = ref('')
const privatePem = ref('')
const error = ref('')
const elapsed = ref(0)

const current = computed(() => TYPES.find((t) => t.id === type.value))

function toPem(buffer, label) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)
  const lines = base64.match(/.{1,64}/g) || []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`
}

async function generate() {
  generating.value = true
  error.value = ''
  const started = performance.now()

  try {
    const spec =
      current.value.algo === 'EC'
        ? {
            name: 'ECDSA',
            namedCurve: type.value === 'ec-p384' ? 'P-384' : 'P-256',
          }
        : {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: Number(type.value.split('-')[1]),
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
          }

    const keyPair = await crypto.subtle.generateKey(spec, true, ['sign', 'verify'])
    const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey)
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

    publicPem.value = toPem(spki, 'PUBLIC KEY')
    privatePem.value = toPem(pkcs8, 'PRIVATE KEY')
    elapsed.value = Math.round(performance.now() - started)
  } catch (e) {
    error.value = `生成失败：${e.message}`
    publicPem.value = ''
    privatePem.value = ''
  } finally {
    generating.value = false
  }
}

function download(content, filename, mime = 'application/x-pem-file') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}


function clearAll() {
  publicPem.value = ''
  privatePem.value = ''
  error.value = ''
  elapsed.value = 0
}
</script>

<template>
  <div class="rsa">
    <div class="toolbar">
      <select v-model="type" class="select">
        <option v-for="t in TYPES" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <span class="desc">{{ current?.desc }}</span>

      <span class="spacer" />
      <span v-if="elapsed" class="elapsed">耗时 {{ elapsed }} ms</span>
      <button class="btn" :disabled="!publicPem" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="generating" @click="generate">
        {{ generating ? '生成中…' : publicPem ? '重新生成' : '生成密钥对' }}
      </button>
    </div>

    <p v-if="error" class="err-bar">{{ error }}</p>

    <div v-if="publicPem" class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">公钥（SPKI / PEM）</span>
          <button class="mini" @click="copy(publicPem, 'pub')">
            {{ copied === 'pub' ? '已复制' : '复制' }}
          </button>
          <button class="mini" @click="download(publicPem, 'public.pem')">下载</button>
        </header>
        <pre class="pem">{{ publicPem }}</pre>
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">私钥（PKCS#8 / PEM）</span>
          <button class="mini" @click="copy(privatePem, 'priv')">
            {{ copied === 'priv' ? '已复制' : '复制' }}
          </button>
          <button class="mini" @click="download(privatePem, 'private.pem')">下载</button>
        </header>
        <pre class="pem">{{ privatePem }}</pre>
      </section>
    </div>

    <div v-else class="empty">
      <p class="big">选择算法后点「生成密钥对」</p>
      <p class="small">
        密钥在浏览器本地通过 WebCrypto 生成，不会上传；RSA 4096 可能需要几秒。
        私钥请妥善保管，一旦泄露等同于身份被冒用。
      </p>
    </div>

    <p class="hint">
      RSA 用于 JWT RS256 验签、SSH、证书签发；ECDSA 密钥更短、性能更好。
      生成的 PEM 可直接用于 <code>ssh-keygen</code> 之外的场景，或导入 Java / Node 的密钥工具。
    </p>
  </div>
</template>

<style scoped>
.rsa {
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
  gap: 9px;
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
.desc {
  font-size: 10.5px;
  color: var(--text-faint);
}
.spacer {
  margin-left: auto;
}
.elapsed {
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
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
.err-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
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
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 600;
}
.mini {
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--accent);
  white-space: nowrap;
}
.mini:hover {
  background: var(--accent-soft);
}
.pem {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  text-align: center;
}
.empty .big {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.empty .small {
  margin: 0;
  max-width: 420px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-faint);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
.hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
</style>
