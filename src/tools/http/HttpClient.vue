<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { formatSize } from '../../lib/format'
import {
  buildRequest,
  buildUrl,
  CONTENT_TYPES,
  proxyEndpoint,
  RAW_TYPES,
} from './build'
import { makeResponse, statusClass as statusOf } from './response'
import { mergeHistory } from './history'

const STORAGE_KEY = 'toolbox:http'
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const BODY_TYPES = [
  { value: 'none', label: '无' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'xml', label: 'XML' },
  { value: 'html', label: 'HTML' },
  { value: 'urlencoded', label: 'x-www-form-urlencoded' },
  { value: 'formdata', label: 'form-data' },
]
/* 请求体类型常量在 ./build.js */

const COMMON_HEADERS = [
  { key: 'Content-Type', value: 'application/json' },
  { key: 'Accept', value: 'application/json' },
  { key: 'Authorization', value: 'Bearer ' },
  { key: 'Cache-Control', value: 'no-cache' },
  { key: 'Cookie', value: '' },
  { key: 'User-Agent', value: '' },
  { key: 'Referer', value: '' },
  { key: 'X-Requested-With', value: 'XMLHttpRequest' },
]

const saved = readJSON(STORAGE_KEY)

const method = ref(saved.method ?? 'GET')
const url = ref(saved.url ?? '')
const headers = ref(saved.headers?.length ? saved.headers : [{ key: '', value: '' }])
const bodyType = ref(saved.bodyType ?? 'none')
const body = ref(saved.body ?? '')
const formRows = ref(
  saved.formRows?.length ? saved.formRows.map((r) => ({ key: r.key, value: r.value, file: null })) : [{ key: '', value: '', file: null }],
)
const canProxy = import.meta.env.DEV
const useProxy = ref(saved.useProxy ?? canProxy)

const authType = ref(saved.authType ?? 'none')
const authToken = ref(saved.authToken ?? '')
const authUser = ref(saved.authUser ?? '')
const authPass = ref(saved.authPass ?? '')
const apiKeyName = ref(saved.apiKeyName ?? 'X-API-Key')
const apiKeyValue = ref(saved.apiKeyValue ?? '')
const apiKeyIn = ref(saved.apiKeyIn ?? 'header')

const params = ref(saved.params?.length ? saved.params : [{ key: '', value: '' }])
const history = ref(saved.history ?? [])
const historyOpen = ref(false)

const reqTab = ref('headers')
const resTab = ref('body')
const loading = ref(false)
const error = ref('')
const response = ref(null) // { status, statusText, ms, size, headers, body }
const copied = ref(false)

// URL 查询参数：Params 面板里的行会拼进实际请求地址
const effectiveUrl = computed(() => buildUrl(url.value, params.value))

const paramCount = computed(() => params.value.filter((p) => p.key.trim()).length)

function pushHistory(entry) {
  history.value = mergeHistory(history.value, entry, 20)
}

function useHistory(item) {
  method.value = item.method
  url.value = item.url
  historyOpen.value = false
}

const hasBody = computed(() => method.value !== 'GET' && method.value !== 'HEAD')
const activeHeaders = computed(() => headers.value.filter((h) => h.key.trim()).length)
const isRaw = computed(() => RAW_TYPES.includes(bodyType.value))
const isForm = computed(() => bodyType.value === 'urlencoded' || bodyType.value === 'formdata')

let saveTimer
function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      method: method.value,
      url: url.value,
      headers: headers.value,
      bodyType: bodyType.value,
      body: body.value,
      formRows: formRows.value.map((r) => ({ key: r.key, value: r.value })),
      useProxy: useProxy.value,
      authType: authType.value,
      authToken: authToken.value,
      authUser: authUser.value,
      authPass: authPass.value,
      apiKeyName: apiKeyName.value,
      apiKeyValue: apiKeyValue.value,
      apiKeyIn: apiKeyIn.value,
      params: params.value,
      history: history.value,
    }),
  )
}

watch(
  [method, url, headers, bodyType, body, formRows, useProxy, authType, authToken, authUser, authPass, apiKeyName, apiKeyValue, apiKeyIn, params, history],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 300)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  save()
})

function addHeader() {
  headers.value.push({ key: '', value: '' })
}

function addCommonHeader(h) {
  const empty = headers.value.find((x) => !x.key.trim())
  if (empty) {
    empty.key = h.key
    empty.value = h.value
  } else {
    headers.value.push({ ...h })
  }
}

/* base64 / formatSize 已抽到 ./build.js 与 lib/format.js */

async function send() {
  const target = effectiveUrl.value
  if (!target) return

  loading.value = true
  error.value = ''
  response.value = null
  const started = performance.now()

  // 组装请求与解析响应都交给纯函数模块，这里只负责状态编排
  const { url: finalUrl, init } = buildRequest({
    url: target,
    method: method.value,
    headers: headers.value,
    auth: {
      type: authType.value,
      token: authToken.value,
      user: authUser.value,
      pass: authPass.value,
      keyName: apiKeyName.value,
      keyValue: apiKeyValue.value,
      keyIn: apiKeyIn.value,
    },
    hasBody: hasBody.value,
    bodyType: bodyType.value,
    body: body.value,
    formRows: formRows.value,
  })

  try {
    const endpoint = proxyEndpoint(finalUrl, { canProxy, useProxy: useProxy.value })
    const res = await fetch(endpoint, init)
    const text = await res.text()

    const list = []
    res.headers.forEach((value, key) => list.push({ key, value }))

    response.value = makeResponse({
      status: res.status,
      statusText: res.statusText,
      ms: Math.round(performance.now() - started),
      text,
      headers: list,
    })

    pushHistory({
      method: method.value,
      url: finalUrl,
      status: res.status,
      ms: response.value.ms,
      time: Date.now(),
    })
  } catch (e) {
    error.value = e.message
    pushHistory({
      method: method.value,
      url: finalUrl || target,
      status: 0,
      ms: Math.round(performance.now() - started),
      time: Date.now(),
    })
  } finally {
    loading.value = false
  }
}

const statusClass = computed(() => statusOf(response.value?.status))

async function copyResponse() {
  if (!response.value) return
  try {
    await navigator.clipboard.writeText(response.value.body)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="http-tool">
    <div class="bar">
      <select v-model="method" class="method">
        <option v-for="m in METHODS" :key="m">{{ m }}</option>
      </select>
      <input
        v-model="url"
        class="url"
        placeholder="http://localhost:8080/api/users"
        spellcheck="false"
        @keyup.enter="send"
      />
      <button
        class="toggle"
        :class="{ on: useProxy && canProxy }"
        :disabled="!canProxy"
        :title="
          canProxy
            ? '开启后由开发服务器转发，可直连本地后端（无跨域限制）'
            : '生产构建下没有开发服务器，代理不可用'
        "
        @click="useProxy = !useProxy"
      >
        代理
      </button>
      <div class="hist">
        <button class="toggle" :class="{ on: historyOpen }" @click="historyOpen = !historyOpen">
          历史 {{ history.length || '' }}
        </button>
        <div v-if="historyOpen" class="hist-menu">
          <p v-if="!history.length" class="hist-empty">还没有请求记录</p>
          <button v-for="(h, i) in history" :key="i" class="hist-item" @click="useHistory(h)">
            <span
              class="hm"
              :class="h.status === 0 ? 'bad' : h.status >= 400 ? 'warn' : 'ok'"
            >{{ h.method }}</span>
            <span class="hu">{{ h.url }}</span>
            <span class="hs">{{ h.status || '失败' }}</span>
          </button>
          <button v-if="history.length" class="hist-clear" @click="history = []; historyOpen = false">
            清空历史
          </button>
        </div>
      </div>
      <button class="send" :disabled="loading || !effectiveUrl" @click="send">
        {{ loading ? '发送中…' : '发送' }}
      </button>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div class="tabs">
          <button :class="{ on: reqTab === 'params' }" @click="reqTab = 'params'">
            Params {{ paramCount || '' }}
          </button>
          <button :class="{ on: reqTab === 'auth' }" @click="reqTab = 'auth'">
            Authorization
          </button>
          <button :class="{ on: reqTab === 'headers' }" @click="reqTab = 'headers'">
            请求头 {{ activeHeaders || '' }}
          </button>
          <button :class="{ on: reqTab === 'body' }" @click="reqTab = 'body'">请求体</button>
        </div>

        <button v-if="reqTab === 'headers'" class="link head-action" @click="addHeader">
          ＋ 添加
        </button>
      </div>

      <!-- URL 查询参数 -->
      <div v-if="reqTab === 'params'" class="kv-list">
        <div v-for="(p, i) in params" :key="i" class="kv">
          <input v-model="p.key" placeholder="参数名" spellcheck="false" />
          <input v-model="p.value" placeholder="值" spellcheck="false" />
          <button class="del" title="删除" @click="params.splice(i, 1)">✕</button>
        </div>
        <button class="link add-row" @click="params.push({ key: '', value: '' })">＋ 添加参数</button>
        <p v-if="paramCount" class="url-preview">{{ effectiveUrl }}</p>
      </div>

      <!-- Authorization -->
      <div v-if="reqTab === 'auth'" class="auth">
        <div class="auth-row">
          <span class="label">类型</span>
          <select v-model="authType" class="select">
            <option value="none">No Auth</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
            <option value="apikey">API Key</option>
          </select>
        </div>

        <template v-if="authType === 'bearer'">
          <input v-model="authToken" class="wide" placeholder="Token" spellcheck="false" />
          <p class="tip">发送时自动添加 Authorization: Bearer &lt;token&gt;</p>
        </template>

        <template v-else-if="authType === 'basic'">
          <div class="auth-row">
            <input v-model="authUser" placeholder="用户名" spellcheck="false" />
            <input v-model="authPass" placeholder="密码" type="password" spellcheck="false" />
          </div>
          <p class="tip">发送时自动 base64 编码为 Authorization: Basic …</p>
        </template>

        <template v-else-if="authType === 'apikey'">
          <div class="auth-row">
            <input v-model="apiKeyName" placeholder="Key 名称，如 X-API-Key" spellcheck="false" />
            <input v-model="apiKeyValue" placeholder="值" spellcheck="false" />
            <select v-model="apiKeyIn" class="select">
              <option value="header">加到 Header</option>
              <option value="query">加到 Query</option>
            </select>
          </div>
        </template>

        <p v-else class="tip">该请求不携带认证信息</p>
      </div>

      <!-- Headers -->
      <div v-else-if="reqTab === 'headers'" class="kv-list">
        <div class="chips">
          <span class="chips-label">常用</span>
          <button v-for="h in COMMON_HEADERS" :key="h.key" class="chip" @click="addCommonHeader(h)">
            {{ h.key }}
          </button>
        </div>
        <div v-for="(h, i) in headers" :key="i" class="kv">
          <input v-model="h.key" placeholder="Header 名" spellcheck="false" />
          <input v-model="h.value" placeholder="值" spellcheck="false" />
          <button class="del" title="删除" @click="headers.splice(i, 1)">✕</button>
        </div>
        <p v-if="!headers.length" class="tip">还没有请求头，点上方常用头或右上角「添加」</p>
      </div>

      <!-- Body -->
      <div v-else class="body-area">
        <div class="body-head">
          <select v-model="bodyType" class="select">
            <option v-for="t in BODY_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
          <span v-if="isRaw" class="tip">自动带 Content-Type: {{ CONTENT_TYPES[bodyType] }}</span>
        </div>

        <p v-if="!hasBody && bodyType !== 'none'" class="tip body-warn">
          {{ method }} 请求不会发送请求体，改用 POST / PUT 等方法才生效
        </p>

        <textarea
          v-if="isRaw"
          v-model="body"
          class="body-input"
          spellcheck="false"
          :placeholder="bodyType === 'json' ? '{\n  &quot;name&quot;: &quot;test&quot;\n}' : '请求体内容'"
        />

        <div v-else-if="isForm" class="kv-list">
          <div v-for="(r, i) in formRows" :key="i" class="kv">
            <input v-model="r.key" placeholder="Key" spellcheck="false" />
            <input
              v-model="r.value"
              placeholder="Value"
              spellcheck="false"
              :disabled="!!r.file"
            />
            <label v-if="bodyType === 'formdata'" class="file-btn">
              {{ r.file ? r.file.name.slice(0, 10) : '文件' }}
              <input
                type="file"
                class="hidden"
                @change="(e) => (r.file = e.target.files?.[0] || null)"
              />
            </label>
            <button class="del" :title="r.file ? '移除文件' : '删除'" @click="r.file ? (r.file = null) : formRows.splice(i, 1)">
              ✕
            </button>
          </div>
          <button class="link add-row" @click="formRows.push({ key: '', value: '', file: null })">
            ＋ 添加字段
          </button>
        </div>

        <p v-else class="tip">该请求没有请求体</p>
      </div>
    </div>

    <div class="panel grow">
      <div class="panel-head">
        <div class="tabs">
          <button :class="{ on: resTab === 'body' }" @click="resTab = 'body'">响应体</button>
          <button :class="{ on: resTab === 'headers' }" @click="resTab = 'headers'">
            响应头 {{ response ? response.headers.length : '' }}
          </button>
        </div>
        <span v-if="response" class="meta">
          <span class="status" :class="statusClass">{{ response.status }} {{ response.statusText }}</span>
          · {{ response.ms }} ms · {{ formatSize(response.size) }}
        </span>
        <button v-if="response && resTab === 'body'" class="copy" @click="copyResponse">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>

      <div v-if="error" class="out error">
        <p class="err-title">请求失败</p>
        <p>{{ error }}</p>
        <p class="err-hint">
          <template v-if="canProxy && useProxy">
            已开启代理仍失败，通常是后端没启动、地址或端口写错。
          </template>
          <template v-else-if="canProxy">
            浏览器直连受同源策略限制（CORS）。调用本地后端请打开上方的「代理」开关。
          </template>
          <template v-else>
            浏览器直连受同源策略限制（CORS），目标接口需返回
            <code>Access-Control-Allow-Origin</code>。
          </template>
        </p>
      </div>
      <div v-else-if="!response" class="out placeholder">
        {{ loading ? '请求发送中…' : '填写地址后点击「发送」' }}
      </div>
      <div v-else-if="resTab === 'headers'" class="out headers">
        <p v-for="h in response.headers" :key="h.key">
          <span class="hk">{{ h.key }}</span>: {{ h.value }}
        </p>
      </div>
      <div v-else class="out">{{ response.body || '（空响应体）' }}</div>
    </div>
  </div>
</template>

<style scoped>
.http-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
}
.method {
  flex: none;
  width: 92px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  font-weight: 600;
  outline: none;
}
.url {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
}
.url:focus,
.method:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.toggle {
  flex: none;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.toggle:hover:not(:disabled) {
  background: var(--hover);
}
.toggle.on {
  border-color: transparent;
  background: rgba(0, 122, 255, 0.12);
  color: var(--accent);
  font-weight: 500;
}
.toggle:disabled {
  opacity: 0.4;
  cursor: default;
}
.send {
  flex: none;
  padding: 6px 18px;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}
.send:hover:not(:disabled) {
  background: var(--accent-strong);
}
.send:disabled {
  opacity: 0.45;
  cursor: default;
}
.panel {
  min-height: 140px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
  max-height: 48%;
}
.panel.grow {
  flex: 1;
  max-height: none;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  flex: none;
}
.tabs {
  display: flex;
  gap: 2px;
}
.tabs button {
  padding: 2px 9px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.tabs button.on {
  background: var(--panel-bg);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.head-action {
  margin-left: auto;
}
.link {
  font-size: 11.5px;
  color: var(--accent);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.08);
}
.chips-label {
  font-size: 11.5px;
  color: var(--text-dim);
}
.chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--fill-1);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
}
.chip:hover {
  background: rgba(0, 122, 255, 0.12);
  color: var(--accent);
}
.meta {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.status {
  font-weight: 600;
}
.status.ok {
  color: var(--success);
}
.status.info {
  color: #0a6dd6;
}
.status.warn {
  color: var(--warn);
}
.status.bad {
  color: var(--danger);
}
.copy {
  font-size: 11.5px;
  color: var(--accent);
}
.kv-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
}
.kv {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}
.kv input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.kv input:focus {
  border-color: var(--accent);
}
.kv input:disabled {
  background: var(--fill-1);
  color: var(--text-dim);
}
.del {
  flex: none;
  width: 24px;
  color: var(--text-dim);
  border-radius: 5px;
}
.del:hover {
  background: var(--hover);
  color: var(--danger);
}
.file-btn {
  flex: none;
  max-width: 90px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.file-btn:hover {
  background: var(--hover);
}
.hidden {
  display: none;
}
.add-row {
  margin-top: 2px;
}
.tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-dim);
}
.auth {
  padding: 10px 12px;
  overflow: auto;
}
.auth-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
.auth-row input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.auth-row input:focus {
  border-color: var(--accent);
}
.auth-row .label {
  flex: none;
  font-size: 12px;
  color: var(--text-dim);
}
.wide {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
.wide:focus {
  border-color: var(--accent);
}
.select {
  flex: none;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  outline: none;
  font-size: 12px;
}
.body-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.body-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 0;
  flex: none;
}
.body-head .tip {
  margin: 0;
}
.body-warn {
  margin: 6px 0 0;
  padding: 0 12px;
}
.body-input {
  flex: 1;
  min-height: 90px;
  padding: 10px 12px;
  border: none;
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
}
.out {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--fill-1);
}
.out.placeholder {
  color: var(--text-dim);
}
.out.error {
  color: var(--danger);
}
.err-title {
  margin: 0 0 4px;
  font-weight: 600;
}
.err-hint {
  margin: 8px 0 0;
  color: var(--text-dim);
}
.err-hint code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--fill-2);
}
.out.headers p {
  margin: 0 0 2px;
}
.hk {
  color: var(--text-dim);
}
.hist {
  position: relative;
  flex: none;
}
.hist-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  width: 380px;
  max-height: 320px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-2);
}
.hist-empty {
  margin: 10px;
  font-size: 11.5px;
  color: var(--text-dim);
  text-align: center;
}
.hist-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border-radius: 5px;
  text-align: left;
}
.hist-item:hover {
  background: var(--hover);
}
.hm {
  flex: none;
  padding: 0 5px;
  border-radius: 3px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
}
.hm.ok {
  background: var(--success-soft);
  color: var(--success);
}
.hm.warn {
  background: var(--warn-soft);
  color: var(--warn);
}
.hm.bad {
  background: var(--danger-soft);
  color: var(--danger);
}
.hu {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hs {
  flex: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}
.hist-clear {
  width: 100%;
  margin-top: 4px;
  padding: 5px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--accent);
}
.add-row {
  margin-top: 6px;
}
.url-preview {
  margin: 8px 0 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--code-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-dim);
  word-break: break-all;
}
</style>
