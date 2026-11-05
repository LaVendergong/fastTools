<script setup>
import { computed, ref } from 'vue'
import { APIS, CATEGORIES } from './apis'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const keyword = ref('')
const cat = ref('all')
const onlyFree = ref(false)
const testing = ref('')
const tryResult = ref(null)
const list = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return APIS.filter((api) => {
    if (cat.value !== 'all' && api.cat !== cat.value) return false
    if (onlyFree.value && api.auth !== 'none') return false
    if (!kw) return true
    return (
      api.name.toLowerCase().includes(kw) ||
      api.desc.toLowerCase().includes(kw) ||
      api.url.toLowerCase().includes(kw)
    )
  })
})

const counts = computed(() => {
  const map = { all: APIS.length }
  for (const api of APIS) map[api.cat] = (map[api.cat] || 0) + 1
  return map
})

function authText(auth) {
  if (auth === 'none') return '免鉴权'
  if (auth === 'key') return '需 Key'
  return 'OAuth'
}

function corsText(cors) {
  if (cors === true) return '可跨域'
  if (cors === false) return '需服务端'
  return '跨域未知'
}

function fullUrl(api) {
  if (!api.sample) return api.url
  return `${api.url}${api.sample.startsWith('/') ? '' : '/'}${api.sample}`
}

/* ---------------- 试调用 ---------------- */

async function tryApi(api) {
  if (testing.value === api.name) {
    testing.value = ''
    tryResult.value = null
    return
  }

  testing.value = api.name
  tryResult.value = { loading: true }

  const url = fullUrl(api)
  const started = performance.now()

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    const text = await res.text()
    let body = text
    try {
      body = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      /* 非 JSON 原样显示 */
    }
    tryResult.value = {
      ok: res.ok,
      status: res.status,
      ms: Math.round(performance.now() - started),
      body: body.slice(0, 6000),
      total: body.length,
    }
  } catch (e) {
    tryResult.value = {
      ok: false,
      blocked: true,
      url,
      error: e.message,
    }
  }
}


function copyList() {
  const data = list.value.map((a) => ({
    name: a.name,
    category: a.cat,
    url: a.url,
    docs: a.docs,
    auth: a.auth,
    cors: a.cors,
    sample: a.sample,
    desc: a.desc,
  }))
  copy(JSON.stringify(data, null, 2), 'list')
}

function openDocs(api) {
  window.open(api.docs, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="cat">
    <div class="toolbar">
      <input
        v-model="keyword"
        class="search"
        placeholder="搜索接口名称、说明或域名"
        spellcheck="false"
      />
      <label class="chk">
        <input v-model="onlyFree" type="checkbox" />
        只看免鉴权
      </label>
      <span class="count">{{ list.length }} / {{ APIS.length }}</span>
      <button class="btn" :disabled="!list.length" @click="copyList">
        {{ copied === 'list' ? '已复制' : '复制清单' }}
      </button>
    </div>

    <div class="tabs">
      <button
        v-for="item in CATEGORIES"
        :key="item.id"
        :class="{ on: cat === item.id }"
        @click="cat = item.id"
      >
        {{ item.name }}<span class="num">{{ counts[item.id] || 0 }}</span>
      </button>
    </div>

    <div class="scroll">
      <p v-if="!list.length" class="tip">没有匹配的接口</p>

      <div v-for="api in list" :key="api.name" class="row" :class="{ open: testing === api.name }">
        <div class="row-head">
          <div class="title-line">
            <span class="name">{{ api.name }}</span>
            <span class="badge" :class="api.auth">{{ authText(api.auth) }}</span>
            <span class="badge" :class="{ warn: api.cors === false }">{{ corsText(api.cors) }}</span>
          </div>
          <p class="desc">{{ api.desc }}</p>
          <div class="url-line">
            <code class="url" :title="fullUrl(api)">{{ api.url }}</code>
            <button class="mini" @click="copy(api.url, api.name)">复制域名</button>
            <button class="mini" @click="copy(fullUrl(api), `${api.name}-full`)">
              复制示例地址
            </button>
          </div>
        </div>

        <div class="row-actions">
          <button class="mini ghost" @click="openDocs(api)">文档</button>
          <button
            class="mini primary"
            :class="{ on: testing === api.name }"
            @click="tryApi(api)"
          >
            {{ testing === api.name ? '收起' : '试调用' }}
          </button>
          <span v-if="copied === api.name" class="copied">已复制</span>
          <span v-else-if="copied === `${api.name}-full`" class="copied">已复制</span>
        </div>

        <div v-if="testing === api.name" class="try">
          <p class="try-url">{{ fullUrl(api) }}</p>

          <template v-if="tryResult?.loading">
            <p class="try-tip">请求中…</p>
          </template>

          <template v-else-if="tryResult?.blocked">
            <p class="try-err">
              请求被拦截：{{ tryResult.error }}
            </p>
            <p class="try-tip">
              常见原因：该接口不支持浏览器跨域（CORS）、需要 Key，或网络不可达。
              可以换用「HTTP 请求」工具，或把请求放到自己的服务端转发。
            </p>
          </template>

          <template v-else-if="tryResult">
            <div class="try-meta">
              <span class="status" :class="{ bad: !tryResult.ok }">
                {{ tryResult.status || 'ERR' }}
              </span>
              <span>{{ tryResult.ms }} ms</span>
              <span>{{ tryResult.total }} 字节</span>
              <button class="mini" @click="copy(tryResult.body, 'body')">
                {{ copied === 'body' ? '已复制' : '复制响应' }}
              </button>
            </div>
            <pre class="try-body">{{ tryResult.body || '（空响应）' }}</pre>
          </template>
        </div>
      </div>
    </div>

    <p class="hint">
      所有接口均为公开的免费 / 开源服务，调用频率与商用限制以各自文档为准。
      「试调用」由浏览器直连，受 CORS 限制；标记「需服务端」的接口请走代理或后端转发。
    </p>
  </div>
</template>

<style scoped>
.cat {
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
  gap: 10px;
}
.search {
  flex: 1;
  min-width: 0;
  padding: 6px 11px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 12px;
}
.search:focus {
  border-color: var(--accent);
}
.chk {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  cursor: pointer;
}
.count {
  flex: none;
  font-size: 10.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.btn {
  flex: none;
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
.tabs {
  flex: none;
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.tabs button {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--fill-1);
  font-size: 11px;
  color: var(--text-dim);
}
.tabs button.on {
  background: var(--accent);
  color: #fff;
}
.tabs .num {
  margin-left: 4px;
  font-size: 9.5px;
  opacity: 0.75;
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
  flex-wrap: wrap;
}
.row.open {
  border-color: var(--accent);
}
.row-head {
  flex: 1;
  min-width: 0;
}
.title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.name {
  font-size: 12.5px;
  font-weight: 600;
}
.badge {
  padding: 0 6px;
  border-radius: 999px;
  font-size: 9.5px;
  line-height: 16px;
  background: var(--success-soft);
  color: var(--success);
}
.badge.key,
.badge.oauth {
  background: var(--warn-soft);
  color: var(--warn);
}
.badge.warn {
  background: var(--danger-soft);
  color: var(--danger);
}
.desc {
  margin: 3px 0 4px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-dim);
}
.url-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.url {
  min-width: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--code-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.mini {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 10px;
  color: var(--text-dim);
  background: var(--panel-bg);
  white-space: nowrap;
}
.mini:hover {
  background: var(--fill-1);
  color: var(--text);
}
.mini.ghost {
  border-color: transparent;
  background: transparent;
  color: var(--accent);
}
.mini.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.mini.primary.on {
  background: var(--fill-2);
  color: var(--text);
}
.row-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
}
.copied {
  font-size: 9.5px;
  color: var(--accent);
}
.try {
  flex: 1 0 100%;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}
.try-url {
  margin: 0 0 6px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  color: var(--text-faint);
  word-break: break-all;
}
.try-tip {
  margin: 4px 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-faint);
}
.try-err {
  margin: 0 0 4px;
  font-size: 11px;
  color: var(--danger);
}
.try-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 10px;
  color: var(--text-dim);
}
.try-meta .status {
  padding: 0 6px;
  border-radius: 4px;
  background: var(--success-soft);
  color: var(--success);
  font-weight: 600;
}
.try-meta .status.bad {
  background: var(--danger-soft);
  color: var(--danger);
}
.try-body {
  max-height: 220px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--code-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text);
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.tip {
  margin: 30px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
</style>
