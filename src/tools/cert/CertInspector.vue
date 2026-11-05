<script setup>
import { computed, ref, watch } from 'vue'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const SAMPLE_HINT = `-----BEGIN CERTIFICATE-----
MIID...（粘贴 PEM 格式证书）
-----END CERTIFICATE-----`

const input = ref('')
const certs = ref([])
const error = ref('')
const loading = ref(false)
const dragOver = ref(false)
const fileInputEl = ref(null)

let lib = null
async function ensureLib() {
  if (!lib) {
    // @peculiar/x509 内部用 tsyringe 做依赖注入，必须先加载反射 polyfill
    await import('reflect-metadata')
    lib = await import('@peculiar/x509')
  }
  return lib
}

function splitPems(text) {
  const matches = String(text).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
  return matches || []
}

const pad2 = (n) => String(n).padStart(2, '0')

function fmtDate(date) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`
}

function statusOf(notBefore, notAfter) {
  const now = Date.now()
  const start = new Date(notBefore).getTime()
  const end = new Date(notAfter).getTime()
  if (now < start) return { key: 'pending', label: '尚未生效', days: 0 }
  if (now > end) {
    return { key: 'expired', label: `已过期 ${Math.ceil((now - end) / 86400000)} 天`, days: 0 }
  }
  const days = Math.floor((end - now) / 86400000)
  if (days <= 15) return { key: 'warn', label: `仅剩 ${days} 天`, days }
  return { key: 'ok', label: `有效，剩余 ${days} 天`, days }
}

async function parse() {
  error.value = ''
  certs.value = []
  const pems = splitPems(input.value)
  if (!pems.length) {
    if (input.value.trim()) error.value = '没有找到 PEM 证书块（-----BEGIN CERTIFICATE-----）'
    return
  }

  loading.value = true
  try {
    const { X509Certificate } = await ensureLib()

    certs.value = pems.map((pem, index) => {
      try {
        const cert = new X509Certificate(pem)

        let san = []
        try {
          const ext = cert.extensions?.find((e) => e.type === '2.5.29.17')
          san = ext?.names?.items?.map((item) => `${item.type}: ${item.value}`) || []
        } catch {
          san = []
        }

        let keyUsage = []
        try {
          const ext = cert.extensions?.find((e) => e.type === '2.5.29.15')
          if (ext) {
            const flags = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly']
            keyUsage = flags.filter((flag) => (ext.usages || []).includes(flag))
          }
        } catch {
          keyUsage = []
        }

        let isCa = false
        try {
          const ext = cert.extensions?.find((e) => e.type === '2.5.29.19')
          isCa = Boolean(ext?.ca)
        } catch {
          isCa = false
        }

        const algo = cert.publicKey?.algorithm || {}
        const keyDesc = algo.name
          ? `${algo.name}${algo.modulusLength ? ` ${algo.modulusLength} 位` : ''}${
              algo.namedCurve ? ` (${algo.namedCurve})` : ''
            }`
          : '—'

        const signature = cert.signatureAlgorithm?.name
          ? `${cert.signatureAlgorithm.name}${
              cert.signatureAlgorithm.hash?.name ? ` / ${cert.signatureAlgorithm.hash.name}` : ''
            }`
          : '—'

        return {
          index: index + 1,
          subject: cert.subject || '—',
          issuer: cert.issuer || '—',
          serial: cert.serialNumber || '—',
          notBefore: fmtDate(cert.notBefore),
          notAfter: fmtDate(cert.notAfter),
          status: statusOf(cert.notBefore, cert.notAfter),
          signature,
          keyDesc,
          san,
          keyUsage,
          isCa,
          selfSigned: cert.subject === cert.issuer,
          pem,
          error: '',
        }
      } catch (e) {
        return { index: index + 1, error: e.message }
      }
    })
  } catch (e) {
    error.value = `解析失败：${e.message}`
  } finally {
    loading.value = false
  }
}

watch(input, () => {
  clearTimeout(timer)
  timer = setTimeout(parse, 300)
})

let timer = null

/* ---------------- 文件 ---------------- */

async function loadFile(file) {
  if (!file) return
  try {
    const text = await file.text()
    input.value = text
  } catch (e) {
    error.value = e.message
  }
}

function onPick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  loadFile(file)
}

function onDrop(e) {
  dragOver.value = false
  loadFile(e.dataTransfer?.files?.[0])
}

/* ---------------- 复制 ---------------- */


const summaryText = computed(() => {
  const lines = []
  for (const c of certs.value) {
    if (c.error) {
      lines.push(`#${c.index} 解析失败：${c.error}`)
      continue
    }
    lines.push(`#${c.index}`)
    lines.push(`主题: ${c.subject}`)
    lines.push(`颁发者: ${c.issuer}`)
    lines.push(`有效期: ${c.notBefore} → ${c.notAfter}（${c.status.label}）`)
    lines.push(`序列号: ${c.serial}`)
    lines.push(`签名算法: ${c.signature}`)
    lines.push(`公钥: ${c.keyDesc}`)
    if (c.san.length) lines.push(`SAN: ${c.san.join(', ')}`)
    if (c.isCa) lines.push('CA: 是')
    lines.push('')
  }
  return lines.join('\n').trim()
})

const overall = computed(() => {
  if (!certs.value.length) return null
  const expired = certs.value.filter((c) => !c.error && c.status.key === 'expired').length
  const warn = certs.value.filter((c) => !c.error && c.status.key === 'warn').length
  return { total: certs.value.length, expired, warn }
})

function clearAll() {
  input.value = ''
  certs.value = []
  error.value = ''
}
</script>

<template>
  <div
    class="cert"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <button class="btn primary" @click="fileInputEl?.click()">选择证书文件</button>
      <span class="hint-inline">.pem / .crt / .cer 均可，支持粘贴整条证书链</span>

      <span class="spacer" />
      <span v-if="overall" class="stat">
        {{ overall.total }} 张证书
        <b v-if="overall.expired" class="danger">· {{ overall.expired }} 张已过期</b>
        <b v-else-if="overall.warn" class="warn">· {{ overall.warn }} 张即将过期</b>
      </span>
      <button class="btn" :disabled="!certs.length" @click="copy(summaryText, 'all')">
        {{ copied === 'all' ? '已复制' : '复制报告' }}
      </button>
      <button class="btn" :disabled="!input" @click="clearAll">清空</button>
    </div>

    <p v-if="error" class="err-bar">{{ error }}</p>

    <div class="body">
      <section class="pane">
        <header>
          <span class="pane-title">PEM 内容</span>
          <span class="pane-meta">也可以直接拖文件进来</span>
        </header>
        <textarea
          v-model="input"
          class="code"
          spellcheck="false"
          :placeholder="SAMPLE_HINT"
        />
      </section>

      <section class="result">
        <div v-if="loading" class="empty">解析中…</div>

        <div v-else-if="!certs.length" class="empty">
          <p class="big">粘贴证书或拖文件进来</p>
          <p class="small">
            支持 PEM 格式（<code>-----BEGIN CERTIFICATE-----</code>）；
            多张证书按顺序解析成证书链。全部本地解析，证书不会上传。
          </p>
        </div>

        <div v-else class="cards">
          <article v-for="cert in certs" :key="cert.index" class="card">
            <div v-if="cert.error" class="card-error">
              <span class="badge err">#{{ cert.index }} 解析失败</span>
              <p>{{ cert.error }}</p>
            </div>

            <template v-else>
              <div class="card-head">
                <span class="badge" :class="cert.status.key">{{ cert.status.label }}</span>
                <span v-if="cert.isCa" class="tag">CA 证书</span>
                <span v-if="cert.selfSigned" class="tag">自签名</span>
                <span class="spacer" />
                <button class="mini" @click="copy(cert.pem, `pem-${cert.index}`)">
                  {{ copied === `pem-${cert.index}` ? '已复制' : '复制 PEM' }}
                </button>
              </div>

              <div class="rows">
                <div class="row">
                  <span class="k">主题</span>
                  <span class="v">{{ cert.subject }}</span>
                </div>
                <div class="row">
                  <span class="k">颁发者</span>
                  <span class="v">{{ cert.issuer }}</span>
                </div>
                <div class="row">
                  <span class="k">有效期</span>
                  <span class="v mono">{{ cert.notBefore }} → {{ cert.notAfter }}</span>
                </div>
                <div class="row">
                  <span class="k">序列号</span>
                  <span class="v mono">{{ cert.serial }}</span>
                </div>
                <div class="row">
                  <span class="k">签名算法</span>
                  <span class="v mono">{{ cert.signature }}</span>
                </div>
                <div class="row">
                  <span class="k">公钥</span>
                  <span class="v mono">{{ cert.keyDesc }}</span>
                </div>
                <div v-if="cert.keyUsage.length" class="row">
                  <span class="k">密钥用途</span>
                  <span class="v mono">{{ cert.keyUsage.join(', ') }}</span>
                </div>
                <div v-if="cert.san.length" class="row">
                  <span class="k">SAN</span>
                  <span class="v mono san">
                    <span v-for="name in cert.san" :key="name" class="san-item">{{ name }}</span>
                  </span>
                </div>
              </div>
            </template>
          </article>
        </div>
      </section>
    </div>

    <p class="hint">
      常用于排查 HTTPS 问题：域名不在 SAN 里、证书过期、链不完整（缺中间证书）、自签名不受信任。
      浏览器里也可以直接从站点导出证书再粘进来。
    </p>

    <input ref="fileInputEl" type="file" accept=".pem,.crt,.cer,.txt" hidden @change="onPick" />
  </div>
</template>

<style scoped>
.cert {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.cert.dragging {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
  border-radius: 10px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
.btn.primary:hover {
  background: var(--accent-strong);
}
.hint-inline {
  font-size: 10.5px;
  color: var(--text-faint);
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10.5px;
  color: var(--text-dim);
}
.stat .danger {
  color: var(--danger);
}
.stat .warn {
  color: var(--warn);
}
.err-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.pane {
  flex: none;
  width: 36%;
  min-width: 260px;
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
  font-size: 9.5px;
  color: var(--text-faint);
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
  font-size: 10.5px;
  line-height: 1.7;
}
.result {
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
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
.empty .big {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.empty .small {
  margin: 0;
  max-width: 460px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-faint);
}
.empty code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
.cards {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 9px;
  overflow: hidden;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.badge {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: 600;
}
.badge.ok {
  background: var(--success-soft);
  color: var(--success);
}
.badge.warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.badge.expired,
.badge.err {
  background: var(--danger-soft);
  color: var(--danger);
}
.badge.pending {
  background: var(--fill-2);
  color: var(--text-dim);
}
.tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--fill-2);
  font-size: 9px;
  color: var(--text-faint);
}
.mini {
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--accent);
}
.mini:hover {
  background: var(--accent-soft);
}
.rows {
  padding: 4px 0;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 4px 10px;
}
.row:hover {
  background: var(--fill-1);
}
.k {
  flex: none;
  width: 66px;
  font-size: 10px;
  color: var(--text-faint);
}
.v {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text);
  word-break: break-all;
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
}
.san {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.san-item {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--fill-2);
  font-size: 9.5px;
}
.card-error {
  padding: 10px;
}
.card-error p {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: var(--danger);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
</style>
