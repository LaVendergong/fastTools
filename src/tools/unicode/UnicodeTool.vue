<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:unicode'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const mode = ref(saved.mode ?? 'encode') // encode: 中文 -> Unicode；decode: Unicode -> 中文
const nonAsciiOnly = ref(saved.nonAsciiOnly ?? true)
const input = ref(saved.input ?? '你好，世界 Hello 2026')
const copied = ref(false)

let saveTimer
function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      mode: mode.value,
      nonAsciiOnly: nonAsciiOnly.value,
      input: input.value,
    }),
  )
}

watch([mode, nonAsciiOnly, input], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 300)
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  save()
})

function toEscaped(text, onlyNonAscii) {
  let out = ''
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (onlyNonAscii && cp < 128) {
      out += ch
    } else if (cp > 0xffff) {
      out += `\\u{${cp.toString(16).toUpperCase()}}`
    } else {
      out += `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`
    }
  }
  return out
}

function fromEscaped(text) {
  return text.replace(
    /\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|&#x([0-9a-fA-F]+);|&#(\d+);|U\+([0-9a-fA-F]{4,6})/g,
    (match, brace, plain, hex, dec, uplus) => {
      const cp = brace
        ? parseInt(brace, 16)
        : plain
          ? parseInt(plain, 16)
          : hex
            ? parseInt(hex, 16)
            : dec
              ? Number(dec)
              : parseInt(uplus, 16)
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return match
      return String.fromCodePoint(cp)
    },
  )
}

const result = computed(() => {
  const raw = input.value
  if (!raw) return { text: '', note: '' }
  if (mode.value === 'encode') {
    return { text: toEscaped(raw, nonAsciiOnly.value), note: '' }
  }

  // 连续解码：处理「转义后的转义」这类多层嵌套，最多 5 层
  let current = raw
  let rounds = 0
  for (let i = 0; i < 5; i++) {
    const next = fromEscaped(current)
    if (next === current) break
    current = next
    rounds++
  }

  return {
    text: current,
    note:
      rounds > 1
        ? `已连续解码 ${rounds} 层`
        : current === raw
          ? '没有找到可识别的 Unicode 转义，内容保持不变'
          : '',
  }
})

async function copyOutput() {
  if (!result.value.text) return
  try {
    await navigator.clipboard.writeText(result.value.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="uni-tool">
    <div class="toolbar">
      <div class="segmented">
        <button :class="{ on: mode === 'encode' }" @click="mode = 'encode'">中文 → Unicode</button>
        <button :class="{ on: mode === 'decode' }" @click="mode = 'decode'">Unicode → 中文</button>
      </div>

      <button
        v-if="mode === 'encode'"
        class="toggle"
        :class="{ on: nonAsciiOnly }"
        title="开启后英文、数字、标点等 ASCII 字符保持原样"
        @click="nonAsciiOnly = !nonAsciiOnly"
      >
        仅转义非 ASCII
      </button>

      <span class="stats">{{ input.length }} → {{ result.text.length }} 字符</span>

      <div class="right">
        <button class="tbtn" :disabled="!result.text" @click="copyOutput">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
    </div>

    <div class="body">
      <textarea
        v-model="input"
        class="in"
        spellcheck="false"
        :placeholder="
          mode === 'encode' ? '输入中文或任意文本，如：你好' : '粘贴转义序列，如：\\u4F60\\u597D'
        "
      />

      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">{{ mode === 'encode' ? 'Unicode 结果' : '中文结果' }}</span>
          <span v-if="result.note" class="note">{{ result.note }}</span>
        </div>
        <div class="out" :class="{ placeholder: !result.text }">
          {{ result.text || '等待输入…' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uni-tool {
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
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  flex: none;
}
.segmented button {
  padding: 3px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.segmented button.on {
  background: #fff;
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.toggle {
  flex: none;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-dim);
}
.toggle.on {
  border-color: transparent;
  background: rgba(0, 122, 255, 0.12);
  color: var(--accent);
  font-weight: 500;
}
.stats {
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.right {
  margin-left: auto;
}
.tbtn {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn:disabled {
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
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
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
.note {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.out {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  background: rgba(0, 0, 0, 0.015);
}
.out.placeholder {
  color: var(--text-dim);
}
</style>
