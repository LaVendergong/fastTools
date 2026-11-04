<script setup>
import { computed, ref, watch } from 'vue'
import * as OpenCC from 'opencc-js'

const CONFIGS = [
  { id: 'tw', name: '简体 → 繁体（台湾正体）', from: 'cn', to: 'tw' },
  { id: 'hk', name: '简体 → 繁体（香港繁体）', from: 'cn', to: 'hk' },
  { id: 't', name: '简体 → 繁体（通用）', from: 'cn', to: 't' },
  { id: 'cn', name: '繁体 → 简体', from: 't', to: 'cn' },
  { id: 'tw2t', name: '台湾正体 → 通用繁体', from: 'tw', to: 't' },
]

const STORAGE_KEY = 'toolbox:chinese'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const direction = ref(saved.direction ?? 'tw')
const input = ref(saved.input ?? '')
const copied = ref(false)
const message = ref('')

const SAMPLE = `轻量级前端工具箱，支持简体与繁体互转。
软件开发者可以使用这个工具快速转换文档内容。
数据库连接、正则表达式、时间戳转换都是常用功能。`

const converters = new Map()

function getConverter(id) {
  if (!converters.has(id)) {
    const config = CONFIGS.find((c) => c.id === id) || CONFIGS[0]
    converters.set(id, OpenCC.Converter({ from: config.from, to: config.to }))
  }
  return converters.get(id)
}

const output = computed(() => {
  if (!input.value) return ''
  try {
    return getConverter(direction.value)(input.value)
  } catch (e) {
    message.value = e.message
    return ''
  }
})

const stats = computed(() => {
  const changed = [...input.value].reduce(
    (count, ch, i) => (ch !== output.value[i] ? count + 1 : count),
    0,
  )
  return { changed, total: input.value.length }
})

/* ---------------- 操作 ---------------- */

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

function swap() {
  const next = output.value
  if (!next) return
  input.value = next
  // 反向切换
  const reverse = { tw: 'cn', hk: 'cn', t: 'cn', cn: 't', tw2t: 'tw' }
  direction.value = reverse[direction.value] || 'cn'
}

function loadSample() {
  input.value = SAMPLE
}

function clearAll() {
  input.value = ''
  message.value = ''
}

let saveTimer = null
watch(
  [direction, input],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ direction: direction.value, input: input.value }))
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="cn">
    <div class="toolbar">
      <select v-model="direction" class="select">
        <option v-for="c in CONFIGS" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <span class="spacer" />
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" @click="swap">⇄ 反向转换</button>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!output" @click="copyOutput">
        {{ copied ? '已复制' : '复制结果' }}
      </button>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">原文</span>
          <span class="pane-meta">{{ input.length }} 字</span>
        </header>
        <textarea
          v-model="input"
          class="code"
          spellcheck="false"
          placeholder="粘贴要转换的文本，或点上方「示例」"
        />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">转换结果</span>
          <span class="pane-meta">
            {{ output.length }} 字<template v-if="output"> · {{ stats.changed }} 处不同</template>
          </span>
        </header>
        <pre class="code output">{{ output || '（转换结果会显示在这里）' }}</pre>
      </section>
    </div>

    <p class="hint">
      基于 OpenCC 词库，按词组转换而不是逐字替换，能正确处理「软件 → 軟體」「内存 → 記憶體」这类地域用词差异。
      全部在本地完成，不上传任何内容。
    </p>
  </div>
</template>

<style scoped>
.cn {
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
.select {
  padding: 5px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--accent);
  outline: none;
  font-size: 12px;
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
  padding: 12px 14px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--text-faint);
}
</style>
