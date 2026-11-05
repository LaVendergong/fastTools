<script setup>
import { computed, ref, watch } from 'vue'
import { GROUPS, PRESETS } from './templates'
import { formatSize, getOpfsRoot, supportsOpfs, writeFile } from '../files/fs'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const STORAGE_KEY = 'toolbox:gitignore'

const saved = readJSON(STORAGE_KEY)

const allItems = GROUPS.flatMap((g) => g.items)
const itemById = (id) => allItems.find((i) => i.id === id)

const selected = ref(new Set(saved.selected?.length ? saved.selected : PRESETS[0].items))
const custom = ref(saved.custom ?? '')
const useComments = ref(saved.useComments ?? true)
const keyword = ref('')
const message = ref('')
const error = ref('')

/* ---------------- 生成 ---------------- */

const output = computed(() => {
  const seen = new Set()
  const blocks = []

  for (const group of GROUPS) {
    const picked = group.items.filter((item) => selected.value.has(item.id))
    if (!picked.length) continue

    const lines = []
    for (const item of picked) {
      const body = []
      for (const line of item.lines) {
        if (seen.has(line)) continue
        seen.add(line)
        body.push(line)
      }
      if (!body.length) continue
      if (useComments.value) {
        if (lines.length) lines.push('')
        lines.push(`# ${item.name}`)
      }
      lines.push(...body)
    }
    if (lines.length) blocks.push(lines.join('\n'))
  }

  const extra = custom.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (extra.length) {
    const fresh = []
    for (const line of extra) {
      if (seen.has(line)) continue
      seen.add(line)
      fresh.push(line)
    }
    if (fresh.length) {
      blocks.push(`${useComments.value ? '# 自定义' + '\n' : ''}${fresh.join('\n')}`)
    }
  }

  return blocks.join('\n\n') + (blocks.length ? '\n' : '')
})

const stats = computed(() => {
  const lines = output.value.split('\n').filter((l) => l.trim())
  const rules = lines.filter((l) => !l.trim().startsWith('#'))
  return { total: lines.length, rules: rules.length, size: new Blob([output.value]).size }
})

const filteredGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return GROUPS
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => i.name.toLowerCase().includes(kw) || i.lines.some((l) => l.toLowerCase().includes(kw)),
    ),
  })).filter((g) => g.items.length)
})

/* ---------------- 操作 ---------------- */

function toggle(id) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
  message.value = ''
}

function applyPreset(id) {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) return
  selected.value = new Set(preset.items.filter((i) => itemById(i)))
  message.value = `已应用「${preset.name}」`
  setTimeout(() => {
    if (message.value.startsWith('已应用')) message.value = ''
  }, 1800)
}

function selectGroup(group, on) {
  const next = new Set(selected.value)
  for (const item of group.items) {
    if (on) next.add(item.id)
    else next.delete(item.id)
  }
  selected.value = next
}

function isGroupAll(group) {
  return group.items.every((i) => selected.value.has(i.id))
}

function clearAll() {
  selected.value = new Set()
  custom.value = ''
  message.value = '已清空'
  setTimeout(() => (message.value = ''), 1500)
}


function download() {
  if (!output.value) return
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'gitignore.txt'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

// 直接写到「本站空间」根目录的 .gitignore，文件管理器里能看到
async function writeToWorkspace() {
  if (!output.value) return
  if (!supportsOpfs()) {
    error.value = '当前浏览器不支持本站文件空间'
    return
  }
  error.value = ''
  try {
    const root = await getOpfsRoot()
    await writeFile(root, '.gitignore', output.value)
    message.value = '已写入 本站空间/.gitignore'
    setTimeout(() => {
      if (message.value.startsWith('已写入')) message.value = ''
    }, 2600)
  } catch (e) {
    error.value = `写入失败：${e.message}`
  }
}

let saveTimer = null
watch(
  [selected, custom, useComments],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          selected: [...selected.value],
          custom: custom.value,
          useComments: useComments.value,
        }),
      )
    }, 300)
  },
  { deep: true },
)
</script>

<template>
  <div class="gi">
    <div class="toolbar">
      <select class="select" @change="applyPreset($event.target.value); $event.target.value = ''">
        <option value="">套用预设…</option>
        <option v-for="p in PRESETS" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <input v-model="keyword" class="search" placeholder="搜索模板或规则" spellcheck="false" />
      <span class="spacer" />
      <span class="stat">已选 {{ selected.size }} 项 · {{ stats.rules }} 条规则 · {{ formatSize(stats.size) }}</span>
      <button class="btn" :disabled="!output" @click="writeToWorkspace">写入本站空间</button>
      <button class="btn" :disabled="!output" @click="download">下载</button>
      <button class="btn primary" :disabled="!output" @click="copy">
        {{ copied ? '已复制' : '复制内容' }}
      </button>
    </div>

    <div class="body">
      <section class="picker">
        <div class="picker-scroll">
          <div v-for="group in filteredGroups" :key="group.id" class="group">
            <div class="group-head">
              <span class="group-name">{{ group.name }}</span>
              <button class="link" @click="selectGroup(group, !isGroupAll(group))">
                {{ isGroupAll(group) ? '取消全选' : '全选' }}
              </button>
            </div>
            <div class="chips">
              <button
                v-for="item in group.items"
                :key="item.id"
                class="chip"
                :class="{ on: selected.has(item.id) }"
                :title="`${item.lines.length} 条规则`"
                @click="toggle(item.id)"
              >
                <span class="tick">{{ selected.has(item.id) ? '✓' : '+' }}</span>
                {{ item.name }}
              </button>
            </div>
          </div>
          <p v-if="!filteredGroups.length" class="empty">没有匹配的模板</p>
        </div>

        <div class="custom">
          <label class="custom-label">额外规则（每行一条）</label>
          <textarea
            v-model="custom"
            class="custom-input"
            spellcheck="false"
            placeholder="例如：&#10;*.local&#10;.history/"
          />
        </div>
      </section>

      <section class="preview">
        <header>
          <span class="pane-title">.gitignore</span>
          <label class="chk">
            <input v-model="useComments" type="checkbox" />
            带分组注释
          </label>
          <button class="link" @click="clearAll">清空</button>
        </header>
        <pre class="out">{{ output || '（左侧勾选模板后自动生成）' }}</pre>
        <p v-if="message" class="msg">{{ message }}</p>
        <p v-if="error" class="err">{{ error }}</p>
      </section>
    </div>

    <p class="hint">
      模板参考 github/gitignore 官方仓库整理，相同规则会自动去重。
      「写入本站空间」会把结果存成 OPFS 根目录的 <code>.gitignore</code>，可在文件管理器里下载。
    </p>
  </div>
</template>

<style scoped>
.gi {
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
  gap: 7px;
  flex-wrap: wrap;
}
.select,
.search {
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.select {
  border-color: var(--accent);
  color: var(--accent);
}
.search {
  flex: 0 1 200px;
  min-width: 120px;
}
.search:focus {
  border-color: var(--accent);
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.btn {
  padding: 4px 11px;
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
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.picker {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.picker-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}
.group-name {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-faint);
  letter-spacing: 0.04em;
}
.link {
  margin-left: auto;
  font-size: 9.5px;
  color: var(--accent);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel-bg);
  font-size: 11px;
  color: var(--text-dim);
}
.chip:hover {
  border-color: var(--accent);
  color: var(--text);
}
.chip.on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}
.tick {
  font-size: 9px;
  opacity: 0.8;
}
.custom {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.custom-label {
  font-size: 10px;
  color: var(--text-faint);
}
.custom-input {
  height: 66px;
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.6;
}
.custom-input:focus {
  border-color: var(--accent);
}
.preview {
  flex: none;
  width: 44%;
  min-width: 280px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.preview header {
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
.chk {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-dim);
  cursor: pointer;
}
.out {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.65;
  white-space: pre;
  color: var(--text);
}
.msg {
  flex: none;
  margin: 0;
  padding: 4px 10px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: var(--accent);
}
.err {
  flex: none;
  margin: 0;
  padding: 4px 10px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: var(--danger);
}
.empty {
  margin: 20px 0;
  text-align: center;
  font-size: 11px;
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
