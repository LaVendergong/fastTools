<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:json'
const INDENTS = [
  { label: '2', value: 2 },
  { label: '4', value: 4 },
  { label: 'Tab', value: 'tab' },
]

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const input = ref(
  saved.input ??
    '{\n  "name": "工具箱",\n  "version": "1.0.0",\n  "tools": ["regex", "json", "base64"],\n  "active": true,\n  "count": 3\n}',
)
const indent = ref(saved.indent ?? 2)
const minified = ref(false)

let saveTimer
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ input: input.value, indent: indent.value }))
}

watch([input, indent], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 300)
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  save()
})

const parsed = computed(() => {
  const src = input.value
  if (!src.trim()) return { ok: true, obj: null, error: '' }
  try {
    return { ok: true, obj: JSON.parse(src), error: '' }
  } catch (e) {
    return { ok: false, obj: null, error: e.message }
  }
})

const output = computed(() => {
  if (!parsed.value.ok || parsed.value.obj == null) return ''
  const space = minified.value ? undefined : indent.value === 'tab' ? '\t' : Number(indent.value)
  return JSON.stringify(parsed.value.obj, null, space)
})

const badgeClass = computed(() => {
  if (!input.value.trim()) return 'idle'
  return parsed.value.ok ? 'ok' : 'err'
})

const copied = ref(false)

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="json-tool">
    <div class="toolbar">
      <span class="badge" :class="badgeClass">
        <template v-if="!input.trim()">等待输入</template>
        <template v-else-if="parsed.ok">✓ 有效 JSON</template>
        <template v-else>✕ 解析失败</template>
      </span>

      <span class="stats">
        <template v-if="parsed.ok && parsed.obj != null">
          输入 {{ input.length }} 字符 · 输出 {{ output.length }} 字符
        </template>
        <template v-else-if="!input.trim()">粘贴或输入 JSON 后自动格式化</template>
      </span>

      <div class="right">
        <div class="segmented">
          <button
            v-for="o in INDENTS"
            :key="o.value"
            :class="{ on: !minified && indent === o.value }"
            :disabled="minified"
            @click="indent = o.value"
          >
            {{ o.label }}
          </button>
        </div>
        <div class="segmented">
          <button :class="{ on: !minified }" @click="minified = false">美化</button>
          <button :class="{ on: minified }" @click="minified = true">压缩</button>
        </div>
      </div>
    </div>

    <div class="body">
      <textarea
        v-model="input"
        class="in"
        spellcheck="false"
        placeholder='在这里粘贴 JSON，如 {"a": 1}'
      />

      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">输出</span>
          <button v-if="parsed.ok && parsed.obj != null" class="copy" @click="copyOutput">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <div class="out" :class="{ error: !parsed.ok, placeholder: !input.trim() }">
          <template v-if="!parsed.ok">{{ parsed.error }}</template>
          <template v-else>{{ output || '等待输入…' }}</template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.json-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.badge {
  flex: none;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}
.badge.ok {
  background: rgba(52, 199, 89, 0.12);
  color: #1d7a34;
}
.badge.idle {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-dim);
}
.badge.err {
  background: rgba(255, 59, 48, 0.1);
  color: #d70015;
}
.stats {
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
}
.segmented button {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.segmented button.on {
  background: #fff;
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.segmented button:disabled {
  opacity: 0.4;
  cursor: default;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.in {
  height: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.in:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
  flex: none;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.copy {
  margin-left: auto;
  font-size: 11px;
  color: var(--accent);
}
.out {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre;
  background: rgba(0, 0, 0, 0.015);
}
.out.error {
  color: #d70015;
}
.out.placeholder {
  color: var(--text-dim);
}
</style>
