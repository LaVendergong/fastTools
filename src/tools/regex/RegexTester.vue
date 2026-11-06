<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { pendingRegex } from '../../lib/appBus'

const LIMIT = 500
const STORAGE_KEY = 'toolbox:regex'
const FLAGS = ['g', 'i', 'm', 's', 'u', 'y']
const FLAG_TITLES = {
  g: 'g 全局：查找所有匹配',
  i: 'i 忽略大小写',
  m: 'm 多行：^ $ 匹配每行首尾',
  s: 's 让 . 匹配换行',
  u: 'u Unicode 模式',
  y: 'y 从 lastIndex 起连续匹配',
}

const templateGroups = [
  {
    name: '网络与联系',
    items: [
      { name: '电子邮箱', source: '[\\w.%+-]+@[\\w.-]+\\.[A-Za-z]{2,}' },
      { name: '手机号', source: '1[3-9]\\d{9}' },
      { name: '座机号码', source: '0\\d{2,3}-\\d{7,8}' },
      { name: 'QQ 号', source: '[1-9]\\d{4,10}' },
      { name: '邮编', source: '[1-9]\\d{5}(?!\\d)' },
      { name: 'URL', source: 'https?://[\\w.-]+(?:/[\\w./?%&=+#-]*)?' },
      { name: '域名', source: '(?:[\\w-]+\\.)+[a-zA-Z]{2,}' },
      {
        name: 'IPv4',
        source: '(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)',
      },
    ],
  },
  {
    name: '数字与文本',
    items: [
      { name: '整数', source: '-?\\d+' },
      { name: '小数', source: '-?\\d+(?:\\.\\d+)?' },
      { name: '千分位金额', source: '\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?' },
      { name: '空白行', source: '^\\s*$', flags: 'gm' },
      { name: '双引号字符串', source: '"(?:[^"\\\\]|\\\\.)*"' },
      { name: '中文字符', source: '[\\u4e00-\\u9fa5]+' },
    ],
  },
  {
    name: '日期与时间',
    items: [
      { name: '日期 YYYY-MM-DD', source: '\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])' },
      { name: '时间 HH:mm:ss', source: '(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?' },
      { name: '身份证号', source: '[1-9]\\d{5}(?:18|19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]' },
    ],
  },
  {
    name: '开发常用',
    items: [
      { name: 'HTML 标签', source: '</?([a-z][a-z0-9]*)\\b[^>]*>', flags: 'gi' },
      { name: '十六进制颜色', source: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b' },
      { name: '图片后缀', source: '\\.(?:png|jpe?g|gif|webp|svg)\\b', flags: 'i' },
      { name: '版本号', source: '\\d+\\.\\d+\\.\\d+' },
      { name: '密码强度', source: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$' },
    ],
  },
]

const saved = readJSON(STORAGE_KEY)

const form = reactive({
  source: saved.source ?? '\\d+',
  flags: saved.flags ?? 'g',
  text:
    saved.text ??
    '订单号 A1024 于 2026-11-02 创建，共 38 件，金额 1299.00 元。\n联系电话 138-0013-8000，邮箱 dev@example.com',
  replacement: saved.replacement ?? '',
})

// 从「正则速查」带过来的规则优先于上次保存的内容
if (pendingRegex.source) {
  form.source = pendingRegex.source
  form.flags = pendingRegex.flags ?? ''
  if (pendingRegex.text) form.text = pendingRegex.text
  pendingRegex.source = ''
  pendingRegex.flags = ''
  pendingRegex.text = ''
  setTimeout(save, 0)
}

let saveTimer
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
}

watch(
  form,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 300)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(timer)
  clearTimeout(debounceTimer)
  worker?.terminate()
  save()
})

// 匹配放到 Web Worker 里跑：灾难性回溯只会让 Worker 超时被终止，主线程不卡
const TIMEOUT_MS = 1200
const result = ref({ error: '', matches: [], truncated: false })

let worker = null
let reqSeq = 0
let timer = null
let debounceTimer = null

function createWorker() {
  const w = new Worker(new URL('./regex.worker.js', import.meta.url), { type: 'module' })
  w.onmessage = (e) => {
    if (e.data.id !== reqSeq) return
    clearTimeout(timer)
    result.value = e.data.ok
      ? { error: '', matches: e.data.matches, truncated: e.data.truncated }
      : { error: e.data.error, matches: [], truncated: false }
  }
  return w
}

function runMatch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const { source, flags, text } = form
    if (!source) {
      result.value = { error: '', matches: [], truncated: false }
      return
    }

    if (!worker) worker = createWorker()
    const id = ++reqSeq
    clearTimeout(timer)
    timer = setTimeout(() => {
      // 超时说明正则卡住了，直接销毁 Worker 换新的
      worker.terminate()
      worker = createWorker()
      result.value = {
        error: `执行超过 ${TIMEOUT_MS / 1000} 秒已中止：表达式可能存在灾难性回溯（如 (a+)+$），或文本过长`,
        matches: [],
        truncated: false,
        timeout: true,
      }
    }, TIMEOUT_MS)

    worker.postMessage({ id, source, flags, text })
  }, 120)
}

watch(() => [form.source, form.flags, form.text], runMatch, { immediate: true })

const badgeClass = computed(() =>
  result.value.error ? 'err' : result.value.matches.length ? 'ok' : 'idle',
)

const segments = computed(() => {
  const text = form.text
  const out = []
  let last = 0
  result.value.matches.forEach((m, i) => {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false })
    out.push({ text: m.value, hit: true, empty: !m.value, matchIndex: i })
    last = m.index + m.value.length
  })
  if (last < text.length) out.push({ text: text.slice(last), hit: false })
  return out
})

const replaced = computed(() => {
  if (!form.source) return form.text
  try {
    const re = new RegExp(form.source, form.flags)
    return form.text.replace(re, form.replacement)
  } catch {
    return form.text
  }
})

const mode = ref('highlight')
const copied = ref(false)

watch(
  () => form.replacement,
  (v) => {
    if (!v) mode.value = 'highlight'
  },
)

async function copyReplaced() {
  try {
    await navigator.clipboard.writeText(replaced.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}

const activeIndex = ref(-1)
const previewEl = ref(null)

function locate(i) {
  activeIndex.value = activeIndex.value === i ? -1 : i
  if (activeIndex.value < 0) return
  previewEl.value
    ?.querySelector(`[data-match="${i}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

watch(
  () => [form.source, form.flags, form.text],
  () => (activeIndex.value = -1),
)

const templatesOpen = ref(false)
const templatesEl = ref(null)

function applyTemplate(t) {
  form.source = t.source
  form.flags = t.flags ?? 'g'
  templatesOpen.value = false
}

const copiedTpl = ref('')

async function copyTemplate(t) {
  try {
    await navigator.clipboard.writeText(t.source)
    copiedTpl.value = t.name
    setTimeout(() => {
      if (copiedTpl.value === t.name) copiedTpl.value = ''
    }, 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}

function toggleFlag(f) {
  const next = form.flags.includes(f) ? form.flags.replace(f, '') : form.flags + f
  form.flags = FLAGS.filter((x) => next.includes(x)).join('')
}

function onDocClick(e) {
  if (templatesOpen.value && !templatesEl.value?.contains(e.target)) templatesOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="regex-tool">
    <div class="header">
      <div class="row">
        <span class="slash">/</span>
        <input
          v-model="form.source"
          class="src"
          placeholder="输入正则表达式，如 \d+"
          spellcheck="false"
        />
        <span class="slash">/</span>
        <span class="badge" :class="badgeClass" :title="result.error">
          <template v-if="result.error">{{ result.timeout ? '执行超时' : '正则无效' }}</template>
          <template v-else-if="result.matches.length">
            匹配 {{ result.matches.length }} 处{{ result.truncated ? `（前 ${LIMIT} 处）` : '' }}
          </template>
          <template v-else>暂无匹配</template>
        </span>
      </div>

      <div class="row">
        <span class="label">替换为</span>
        <input
          v-model="form.replacement"
          class="replacement"
          placeholder="支持 $1、$&amp;、$&lt;name&gt;，留空只看匹配"
          spellcheck="false"
        />
        <i class="vline" />
        <div class="flags">
          <button
            v-for="f in FLAGS"
            :key="f"
            :class="{ on: form.flags.includes(f) }"
            :title="FLAG_TITLES[f]"
            @click="toggleFlag(f)"
          >
            {{ f }}
          </button>
        </div>
        <div ref="templatesEl" class="templates">
          <button class="tpl-btn" @click="templatesOpen = !templatesOpen">模板 ▾</button>
          <div v-if="templatesOpen" class="tpl-menu">
            <template v-for="g in templateGroups" :key="g.name">
              <p class="tpl-group">{{ g.name }}</p>
              <button
                v-for="t in g.items"
                :key="t.name"
                :title="'左键：填入输入框\n右键：复制正则'"
                @click="applyTemplate(t)"
                @contextmenu.prevent="copyTemplate(t)"
              >
                <span class="tpl-name">{{ t.name }}</span>
                <code>{{ t.source }}</code>
                <span v-if="copiedTpl === t.name" class="copy-ok">已复制</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div class="body">
      <textarea
        v-model="form.text"
        class="text"
        spellcheck="false"
        placeholder="在这里粘贴要测试的文本"
      />

      <div class="side">
        <div class="panel">
          <div class="panel-head">
            <div class="tabs">
              <button :class="{ on: mode === 'highlight' }" @click="mode = 'highlight'">高亮</button>
              <button
                :class="{ on: mode === 'replace' }"
                :disabled="!form.replacement"
                @click="mode = 'replace'"
              >
                替换结果
              </button>
            </div>
            <button v-if="mode === 'replace'" class="copy" @click="copyReplaced">
              {{ copied ? '已复制' : '复制' }}
            </button>
          </div>
          <div ref="previewEl" class="preview">
            <template v-if="mode === 'highlight'">
              <span
                v-for="(s, i) in segments"
                :key="i"
                :data-match="s.hit ? s.matchIndex : null"
                :class="{ hit: s.hit, empty: s.empty, current: s.hit && s.matchIndex === activeIndex }"
                >{{ s.text }}</span
              >
            </template>
            <template v-else>{{ replaced }}</template>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <span class="panel-title">匹配结果</span>
            <span v-if="result.matches.length" class="mini">{{ result.matches.length }} 项</span>
          </div>
          <div class="list">
            <p v-if="!result.matches.length" class="empty">还没有匹配结果</p>
            <div
              v-for="(m, i) in result.matches"
              :key="i"
              class="item"
              :class="{ active: i === activeIndex }"
              @click="locate(i)"
            >
              <div class="head">
                <span class="idx">#{{ i + 1 }}</span>
                <span class="pos">@{{ m.index }}</span>
                <code>{{ m.value }}</code>
              </div>
              <div v-if="m.groups.length || m.named" class="groups">
                <p v-for="(g, gi) in m.groups" :key="gi">
                  ${{ gi + 1 }} = {{ g === undefined ? '未参与匹配' : g || '（空）' }}
                </p>
                <p v-for="(g, name) in m.named || {}" :key="'n' + name">
                  $&lt;{{ name }}&gt; = {{ g === undefined ? '未参与匹配' : g || '（空）' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.regex-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

/* ── 输入卡片 ── */
.header {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.slash {
  color: var(--text-dim);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 14px;
}
.src,
.replacement {
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
}
.src {
  flex: 1;
  min-width: 0;
}
.replacement {
  flex: 1;
  min-width: 0;
}
.src:focus,
.replacement:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.label {
  flex: none;
  font-size: 12px;
  color: var(--text-dim);
}
.vline {
  width: 1px;
  height: 18px;
  background: var(--border);
}
.badge {
  margin-left: auto;
  flex: none;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}
.badge.ok {
  background: rgba(52, 199, 89, 0.12);
  color: var(--success);
}
.badge.idle {
  background: var(--fill-1);
  color: var(--text-dim);
}
.badge.err {
  background: rgba(255, 59, 48, 0.1);
  color: var(--danger);
}
.flags {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--fill-1);
  flex: none;
}
.flags button {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
}
.flags button.on {
  background: var(--accent);
  color: #fff;
}
.templates {
  position: relative;
  flex: none;
}
.tpl-btn {
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  white-space: nowrap;
}
.tpl-btn:hover {
  background: var(--hover);
}
.tpl-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 10;
  width: 380px;
  max-height: 340px;
  overflow: auto;
  padding: 4px 4px 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-2);
}
.tpl-group {
  margin: 8px 8px 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.tpl-group:first-child {
  margin-top: 2px;
}
.tpl-menu button {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 5px 7px;
  border-radius: 5px;
  text-align: left;
}
.tpl-menu button:hover {
  background: var(--hover);
}
.tpl-name {
  flex: none;
  width: 118px;
  font-weight: 500;
}
.tpl-menu code {
  flex: 1;
  min-width: 0;
  color: var(--text-dim);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-ok {
  flex: none;
  font-size: 11px;
  color: var(--success);
}

/* ── 主体两栏 ── */
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.text {
  height: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  outline: none;
  resize: none;
  line-height: 1.6;
  box-shadow: var(--shadow-1);
}
.text:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.side {
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 10px;
}
.panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
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
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.mini {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
}
.tabs {
  display: flex;
  gap: 2px;
}
.tabs button {
  padding: 2px 9px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.tabs button.on {
  background: var(--panel-bg);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.tabs button:disabled {
  opacity: 0.4;
  cursor: default;
}
.copy {
  margin-left: auto;
  font-size: 11px;
  color: var(--accent);
}
.preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.7;
  background: var(--fill-1);
}
.hit {
  border-radius: 3px;
  background: #ffd60a;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.hit.current {
  background: var(--accent);
  color: #fff;
}
.empty {
  display: inline-block;
  min-width: 2px;
  background: #ffd60a;
}
.hit.current.empty {
  background: var(--accent);
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 10px;
}
.list .empty {
  margin: 12px 0;
  text-align: center;
  color: var(--text-dim);
}
.item {
  padding: 5px 6px;
  margin: 0 -6px;
  border-radius: 5px;
  cursor: pointer;
}
.item:hover {
  background: var(--hover);
}
.item.active {
  background: var(--accent-soft);
}
.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.idx {
  color: var(--text-dim);
  font-size: 11px;
}
.pos {
  flex: none;
  color: var(--text-dim);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.groups {
  margin-top: 3px;
  padding-left: 34px;
  font-size: 11px;
  color: var(--text-dim);
}
.groups p {
  margin: 1px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
