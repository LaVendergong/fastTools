<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
import { maskText, RULES } from './rules.js'

const STORAGE_KEY = 'toolbox:mask'
const saved = readJSON(STORAGE_KEY)

const SAMPLE = `用户：张三
手机：13812345678
身份证：330102199003071234
邮箱：zhangsan@example.com
银行卡：6222021234567890123
登录 IP：192.168.1.100，备用 10.0.0.8
座机：0571-88886666`

const input = ref(saved.input ?? SAMPLE)
const enabled = ref(saved.enabled ?? RULES.map((r) => r.id))
const maskChar = ref(saved.maskChar ?? '*')
const custom = ref(saved.custom ?? [{ pattern: '', keepStart: 0, keepEnd: 4 }])
const indentJson = ref(saved.indentJson ?? false)
const { copied, copy } = useCopy()

const CHARS = [
  { id: '*', name: '星号 *' },
  { id: '●', name: '圆点 ●' },
  { id: '×', name: '叉号 ×' },
]

const result = computed(() => {
  let source = input.value
  if (indentJson.value) {
    try {
      source = JSON.stringify(JSON.parse(input.value), null, 2)
    } catch {
      source = input.value
    }
  }
  return maskText(source, {
    types: enabled.value,
    char: maskChar.value,
    custom: custom.value,
  })
})

const output = computed(() => result.value.text)
const total = computed(() => Object.values(result.value.counts).reduce((s, n) => s + n, 0))

const hitSummary = computed(() =>
  RULES.filter((r) => result.value.counts[r.id]).map((r) => `${r.name} ${result.value.counts[r.id]}`),
)

function toggleRule(id) {
  enabled.value = enabled.value.includes(id)
    ? enabled.value.filter((x) => x !== id)
    : [...enabled.value, id]
}

function addCustom() {
  custom.value = [...custom.value, { pattern: '', keepStart: 0, keepEnd: 4 }]
}

function removeCustom(index) {
  custom.value = custom.value.filter((_, i) => i !== index)
}

function clearAll() {
  input.value = ''
}

function download() {
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'masked.txt'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

let saveTimer = null
watch(
  [input, enabled, maskChar, custom, indentJson],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          input: input.value,
          enabled: enabled.value,
          maskChar: maskChar.value,
          custom: custom.value,
          indentJson: indentJson.value,
        }),
      )
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="mask">
    <div class="toolbar">
      <label class="chk">
        <input v-model="indentJson" type="checkbox" />
        按 JSON 格式化
      </label>
      <label class="opt">
        掩码字符
        <select v-model="maskChar" class="select">
          <option v-for="c in CHARS" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>

      <span class="spacer" />
      <span class="stat">
        共打码 <b>{{ total }}</b> 处
        <template v-if="hitSummary.length">（{{ hitSummary.join('、') }}）</template>
      </span>
      <button class="btn" :disabled="!output" @click="download">下载 .txt</button>
      <button class="btn primary" :disabled="!output" @click="copy(output, 'out')">
        {{ copied ? '已复制' : '复制结果' }}
      </button>
    </div>

    <div class="rules">
      <button
        v-for="rule in RULES"
        :key="rule.id"
        class="chip"
        :class="{ on: enabled.includes(rule.id) }"
        :title="rule.sample"
        @click="toggleRule(rule.id)"
      >
        {{ rule.name }}
        <b v-if="result.counts[rule.id]">{{ result.counts[rule.id] }}</b>
      </button>

      <span class="divider" />

      <div v-for="(item, i) in custom" :key="i" class="custom-row">
        <input v-model="item.pattern" class="tiny mono" placeholder="自定义正则，如 ORD-\d{8}" spellcheck="false" />
        <span class="k">留前</span>
        <input v-model.number="item.keepStart" class="num" type="number" min="0" />
        <span class="k">后</span>
        <input v-model.number="item.keepEnd" class="num" type="number" min="0" />
        <button class="mini" @click="removeCustom(i)">✕</button>
      </div>
      <button class="mini add" @click="addCustom">＋ 自定义规则</button>
    </div>

    <div class="body">
      <section class="pane">
        <header>
          <span class="pane-title">原始内容</span>
          <span class="pane-meta">粘贴日志 / JSON / CSV 均可</span>
          <button class="mini" @click="clearAll">清空</button>
        </header>
        <textarea v-model="input" class="code" spellcheck="false" placeholder="把需要脱敏的文本粘进来" />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">脱敏结果</span>
          <span class="pane-meta">{{ output.length }} 字符</span>
        </header>
        <pre class="code out">{{ output || '（结果会显示在这里）' }}</pre>
      </section>
    </div>

    <p v-if="result.invalid.length" class="warn-bar">
      以下自定义正则无效，已跳过：{{ result.invalid.join('、') }}
    </p>

    <p class="hint">
      规则按「身份证 → 银行卡 → 手机号 → 座机 → 邮箱 → IP」顺序执行，先长后短避免误判；
      打码后含掩码字符的内容不会再被后续规则命中。全部在本地完成，内容不会上传。
    </p>
  </div>
</template>

<style scoped>
.mask {
  height: 100%;
  min-height: 0;
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
.chk,
.opt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
  cursor: pointer;
}
.select {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.stat b {
  color: var(--accent);
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
.rules {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  font-size: 10.5px;
  color: var(--text-dim);
}
.chip.on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.chip b {
  font-size: 9.5px;
  opacity: 0.8;
}
.divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 2px;
}
.custom-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tiny {
  width: 190px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
}
.tiny:focus {
  border-color: var(--accent);
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.num {
  width: 42px;
  padding: 3px 5px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
  text-align: center;
}
.k {
  font-size: 9.5px;
  color: var(--text-faint);
}
.mini {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--accent);
}
.mini:hover {
  background: var(--accent-soft);
}
.mini.add {
  color: var(--text-dim);
}
.body {
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
  font-size: 9.5px;
  color: var(--text-faint);
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
.warn-bar {
  flex: none;
  margin: 0;
  padding: 5px 9px;
  border-radius: 7px;
  background: var(--danger-soft);
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
