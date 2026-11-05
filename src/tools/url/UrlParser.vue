<script setup>
import { computed, ref, watch } from 'vue'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const url = ref('https://user:pass@example.com:8443/api/v1/users?page=1&size=20&q=%E4%B8%AD%E6%96%87#list')
const message = ref('')
const raw = ref('Tom & Jerry <b>"你好"</b> / 100%')
const encoded = ref('')

/* ---------------- 解析 ---------------- */

const parsed = computed(() => {
  const text = url.value.trim()
  if (!text) return { ok: false, error: '' }

  try {
    const u = new URL(text)
    return {
      ok: true,
      protocol: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port || (u.protocol === 'https:' ? '443（默认）' : u.protocol === 'http:' ? '80（默认）' : ''),
      path: u.pathname,
      hash: u.hash ? u.hash.slice(1) : '',
      origin: u.origin,
      username: u.username,
      password: u.password,
      secure: u.protocol === 'https:',
      params: [...u.searchParams.entries()].map(([key, value], i) => ({ id: i, key, value })),
      url: u,
    }
  } catch (e) {
    return { ok: false, error: '不是合法的 URL（需要带协议，如 https://）' }
  }
})

const params = ref([])

watch(
  () => url.value,
  () => {
    params.value = parsed.value.ok
      ? parsed.value.params.map((p, i) => ({ ...p, id: i + Math.random() }))
      : []
  },
  { immediate: true },
)

function rebuild() {
  const base = parsed.value
  if (!base.ok) return
  const u = new URL(url.value.trim())
  u.search = ''
  const search = new URLSearchParams()
  for (const p of params.value) {
    if (p.key === '') continue
    search.append(p.key, p.value)
  }
  const qs = search.toString()
  u.search = qs ? `?${qs}` : ''
  url.value = u.toString()
}

function addParam() {
  params.value.push({ id: Math.random(), key: '', value: '' })
}

function removeParam(id) {
  params.value = params.value.filter((p) => p.id !== id)
  rebuild()
}

/* ---------------- 编解码 ---------------- */

function encodeAll() {
  encoded.value = encodeURIComponent(raw.value)
}

function encodePartial() {
  encoded.value = encodeURI(raw.value)
}

function decodeAll() {
  try {
    encoded.value = decodeURIComponent(raw.value)
  } catch (e) {
    message.value = `解码失败：${e.message}`
  }
}

function swapCodec() {
  const temp = raw.value
  raw.value = encoded.value
  encoded.value = temp
}

/* ---------------- 复制 ---------------- */


const rows = computed(() => {
  const p = parsed.value
  if (!p.ok) return []
  return [
    { label: '协议', value: p.protocol, tag: 'protocol', mono: true },
    { label: '主机名', value: p.host, tag: 'host', mono: true },
    { label: '端口', value: p.port, tag: 'port', mono: true },
    { label: '路径', value: p.path, tag: 'path', mono: true },
    { label: 'Origin', value: p.origin, tag: 'origin', mono: true },
    { label: 'Hash', value: p.hash ? `#${p.hash}` : '（无）', tag: 'hash', mono: true },
    {
      label: '认证信息',
      value: p.username ? `${p.username}${p.password ? `:${p.password}` : ''}` : '（无）',
      tag: 'auth',
      mono: true,
    },
    { label: '是否 HTTPS', value: p.secure ? '是' : '否', tag: 'secure' },
  ]
})

const queryString = computed(() => {
  const p = parsed.value
  if (!p.ok) return ''
  return p.url.search.replace(/^\?/, '')
})
</script>

<template>
  <div class="urlp">
    <div class="toolbar">
      <input
        v-model="url"
        class="url-input mono"
        spellcheck="false"
        placeholder="https://example.com/path?a=1&b=2#hash"
      />
      <button class="btn" :disabled="!parsed.ok" @click="copy(url, 'url')">
        {{ copied === 'url' ? '已复制' : '复制 URL' }}
      </button>
      <button class="btn" :disabled="!parsed.ok" @click="url = ''">清空</button>
    </div>

    <p v-if="parsed.error" class="err-bar">{{ parsed.error }}</p>

    <div v-if="parsed.ok" class="body">
      <section class="info">
        <header>
          <span class="pane-title">组成部分</span>
          <span class="pane-meta">{{ queryString ? '含查询参数' : '无查询参数' }}</span>
        </header>
        <div class="rows">
          <div v-for="row in rows" :key="row.label" class="row">
            <span class="k">{{ row.label }}</span>
            <span class="v" :class="{ mono: row.mono }">{{ row.value }}</span>
            <button
              v-if="row.value && row.value !== '（无）'"
              class="mini"
              @click="copy(String(row.value), row.tag)"
            >
              {{ copied === row.tag ? '已复制' : '复制' }}
            </button>
          </div>
        </div>

        <div class="query-box">
          <div class="q-head">
            <span class="k">查询参数</span>
            <button class="mini" @click="addParam">＋ 添加</button>
          </div>
          <div v-if="!params.length" class="q-empty">没有查询参数</div>
          <div v-for="(p, i) in params" :key="p.id" class="q-row">
            <input v-model="p.key" class="q-input" placeholder="key" spellcheck="false" @input="rebuild" />
            <span class="eq">=</span>
            <input v-model="p.value" class="q-input" placeholder="value" spellcheck="false" @input="rebuild" />
            <button class="mini del" title="删除" @click="removeParam(p.id)">✕</button>
          </div>
        </div>
      </section>

      <aside class="side">
        <div class="card">
          <span class="card-label">查询字符串</span>
          <code class="card-value mono">{{ queryString || '（空）' }}</code>
          <button class="mini" :disabled="!queryString" @click="copy(queryString, 'qs')">
            {{ copied === 'qs' ? '已复制' : '复制' }}
          </button>
        </div>

        <div class="card codec">
          <span class="card-label">编解码</span>
          <textarea v-model="raw" class="codec-input mono" spellcheck="false" placeholder="原文" />
          <div class="codec-actions">
            <button class="mini" @click="encodeAll">encodeURIComponent</button>
            <button class="mini" @click="encodePartial">encodeURI</button>
            <button class="mini" @click="decodeAll">decode</button>
            <button class="mini" @click="swapCodec">⇄ 互换</button>
          </div>
          <textarea
            v-model="encoded"
            class="codec-input mono"
            spellcheck="false"
            placeholder="结果"
          />
          <button class="mini" :disabled="!encoded" @click="copy(encoded, 'enc')">
            {{ copied === 'enc' ? '已复制' : '复制结果' }}
          </button>
        </div>

        <p v-if="message" class="msg">{{ message }}</p>
      </aside>
    </div>

    <p class="hint">
      修改参数后 URL 会实时重建（参数按 UTF-8 百分号编码）。
      编解码区常用区别：<code>encodeURI</code> 保留 <code>/ ? & = #</code> 等结构字符，适合整条 URL；
      <code>encodeURIComponent</code> 会把它们也编码，适合单个参数值。
    </p>
  </div>
</template>

<style scoped>
.urlp {
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
}
.url-input {
  flex: 1;
  min-width: 0;
  padding: 7px 11px;
  border: 1px solid var(--accent);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 12.5px;
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
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
.info {
  flex: 1;
  min-width: 0;
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
.rows {
  flex: none;
  padding: 4px 0;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 4px 12px;
}
.row:hover {
  background: var(--fill-1);
}
.k {
  flex: none;
  width: 76px;
  font-size: 10.5px;
  color: var(--text-faint);
}
.v {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--text);
  word-break: break-all;
}
.mini {
  flex: none;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--accent);
  white-space: nowrap;
}
.mini:hover:not(:disabled) {
  background: var(--accent-soft);
}
.mini:disabled {
  opacity: 0.4;
}
.mini.del {
  color: var(--danger);
}
.mini.del:hover {
  background: var(--danger-soft);
}
.query-box {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px dashed var(--border);
}
.q-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.q-head .mini {
  margin-left: auto;
}
.q-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;
}
.q-input {
  flex: 1;
  min-width: 0;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
}
.q-input:focus {
  border-color: var(--accent);
}
.eq {
  font-size: 11px;
  color: var(--text-faint);
}
.q-empty {
  padding: 10px 0;
  font-size: 10.5px;
  color: var(--text-faint);
}
.side {
  flex: none;
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: 0;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.card.codec {
  flex: 1;
  min-height: 0;
}
.card-label {
  font-size: 10.5px;
  color: var(--text-faint);
}
.card-value {
  font-size: 11px;
  color: var(--text);
  word-break: break-all;
}
.codec-input {
  flex: 1;
  min-height: 60px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  resize: none;
  font-size: 11px;
  line-height: 1.6;
}
.codec-input:focus {
  border-color: var(--accent);
}
.codec-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.codec-actions .mini {
  background: var(--fill-1);
}
.msg {
  margin: 0;
  font-size: 10px;
  color: var(--danger);
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
