<script setup>
import { computed, ref, watch } from 'vue'
import { PLATFORMS, STACKS, commandOf } from './stacks'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const STORAGE_KEY = 'toolbox:devsetup'

const saved = readJSON(STORAGE_KEY)

const platform = ref(saved.platform ?? 'win')
const stack = ref('all')
const keyword = ref('')
const installed = ref(new Set(saved.installed ?? []))
const showScript = ref(false)
const onlyMissing = ref(true)
const message = ref('')

const allTools = STACKS.flatMap((s) => s.tools.map((t) => ({ ...t, stackId: s.id, stackName: s.name })))

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return STACKS.filter((s) => stack.value === 'all' || s.id === stack.value)
    .map((s) => ({
      ...s,
      tools: s.tools.filter(
        (t) =>
          !kw ||
          t.name.toLowerCase().includes(kw) ||
          t.desc.toLowerCase().includes(kw) ||
          (t.note || '').toLowerCase().includes(kw),
      ),
    }))
    .filter((s) => s.tools.length)
})

const visibleTools = computed(() => filtered.value.flatMap((s) => s.tools))

const progress = computed(() => {
  const total = allTools.length
  const done = allTools.filter((t) => installed.value.has(t.id)).length
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
})

const platformName = computed(() => PLATFORMS.find((p) => p.id === platform.value)?.name || '')

/* ---------------- 安装脚本 ---------------- */

const script = computed(() => {
  const source = visibleTools.value.length ? visibleTools.value : allTools
  const target = onlyMissing.value ? source.filter((t) => !installed.value.has(t.id)) : source
  const cmds = [...new Set(target.map((t) => commandOf(t, platform.value)).filter(Boolean))]

  if (!cmds.length) {
    return `# 当前范围内该平台没有可直接执行的包管理命令\n# 请通过各工具的「官网」按钮下载安装`
  }

  const header =
    platform.value === 'win'
      ? '# Windows / PowerShell（需已安装 winget：微软商店搜「应用安装程序」）'
      : platform.value === 'mac'
        ? '# macOS（需已安装 Homebrew：https://brew.sh）'
        : '# Debian / Ubuntu（需要 sudo 权限）'

  return [header, '', ...cmds].join('\n')
})

const scriptLineCount = computed(
  () => script.value.split('\n').filter((l) => l && !l.startsWith('#')).length,
)

/* ---------------- 操作 ---------------- */

function toggleInstalled(id) {
  const next = new Set(installed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  installed.value = next
}

function resetProgress() {
  installed.value = new Set()
  message.value = '已清空安装记录'
  setTimeout(() => {
    if (message.value.startsWith('已清空')) message.value = ''
  }, 1600)
}


function openSite(tool) {
  window.open(tool.site, '_blank', 'noopener,noreferrer')
}

let saveTimer = null
watch(
  [platform, installed],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ platform: platform.value, installed: [...installed.value] }),
      )
    }, 300)
  },
  { deep: true },
)
</script>

<template>
  <div class="setup">
    <div class="toolbar">
      <div class="seg">
        <button
          v-for="p in PLATFORMS"
          :key="p.id"
          :class="{ on: platform === p.id }"
          @click="platform = p.id"
        >
          {{ p.name }}
        </button>
      </div>

      <span class="pm-tag">{{ PLATFORMS.find((p) => p.id === platform)?.pm }}</span>

      <input v-model="keyword" class="search" placeholder="搜索工具，如 jdk / docker / node" spellcheck="false" />

      <span class="spacer" />

      <span class="progress">
        已装 {{ progress.done }}/{{ progress.total }}
        <i class="bar"><b :style="{ width: progress.percent + '%' }" /></i>
      </span>

      <button class="btn" :disabled="!progress.done" @click="resetProgress">清空记录</button>
      <button class="btn primary" @click="showScript = true">生成安装脚本</button>
    </div>

    <div class="tabs">
      <button :class="{ on: stack === 'all' }" @click="stack = 'all'">全部</button>
      <button v-for="s in STACKS" :key="s.id" :class="{ on: stack === s.id }" @click="stack = s.id">
        {{ s.name }}<span class="num">{{ s.tools.length }}</span>
      </button>
    </div>

    <div class="scroll">
      <p v-if="message" class="msg">{{ message }}</p>
      <p v-if="!filtered.length" class="empty">没有匹配的工具</p>

      <section v-for="group in filtered" :key="group.id" class="group">
        <div class="group-head">
          <span class="group-name">{{ group.name }}</span>
          <span class="group-tip">{{ group.tip }}</span>
        </div>

        <div class="grid">
          <article
            v-for="tool in group.tools"
            :key="tool.id"
            class="card"
            :class="{ done: installed.has(tool.id) }"
          >
            <div class="card-head">
              <button
                class="check"
                :class="{ on: installed.has(tool.id) }"
                :title="installed.has(tool.id) ? '标记为未安装' : '标记为已安装'"
                @click="toggleInstalled(tool.id)"
              >
                {{ installed.has(tool.id) ? '✓' : '' }}
              </button>
              <span class="name">{{ tool.name }}</span>
              <button class="site" title="打开官网下载页" @click="openSite(tool)">官网 ↗</button>
            </div>

            <p class="desc">{{ tool.desc }}</p>

            <p v-if="tool.note" class="note">{{ tool.note }}</p>

            <div v-if="commandOf(tool, platform)" class="cmd">
              <code>{{ commandOf(tool, platform) }}</code>
              <button class="mini" @click="copy(commandOf(tool, platform), tool.id)">
                {{ copied === tool.id ? '已复制' : '复制' }}
              </button>
            </div>
            <p v-else-if="platform !== 'win'" class="no-cmd">
              {{ platformName }} 请从官网下载安装
            </p>
            <p v-else class="no-cmd">请从官网下载安装</p>
          </article>
        </div>
      </section>
    </div>

    <!-- 安装脚本弹层 -->
    <div v-if="showScript" class="modal" @click.self="showScript = false">
      <div class="dialog">
        <div class="dialog-head">
          <span class="dialog-title">一键安装脚本 · {{ platformName }}</span>
          <label class="chk">
            <input v-model="onlyMissing" type="checkbox" />
            只包含未安装的
          </label>
          <button class="close" @click="showScript = false">✕</button>
        </div>

        <p class="dialog-tip">
          复制后粘贴到终端执行。{{ platform === 'win' ? '需要 PowerShell + winget；' : '' }}
          共 {{ scriptLineCount }} 条命令，装完可回来打勾标记进度。
        </p>

        <pre class="script">{{ script }}</pre>

        <div class="dialog-foot">
          <button class="btn" @click="copy(script, 'script')">
            {{ copied === 'script' ? '已复制' : '复制脚本' }}
          </button>
          <button class="btn primary" @click="showScript = false">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup {
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
  flex-wrap: wrap;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.pm-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 9.5px;
  line-height: 16px;
}
.search {
  flex: 0 1 220px;
  min-width: 120px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.search:focus {
  border-color: var(--accent);
}
.spacer {
  margin-left: auto;
}
.progress {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.bar {
  display: block;
  width: 60px;
  height: 4px;
  border-radius: 99px;
  background: var(--fill-2);
  overflow: hidden;
}
.bar b {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--success);
  transition: width 0.25s ease;
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
  gap: 12px;
}
.group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.group-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-dim);
}
.group-tip {
  font-size: 10px;
  color: var(--text-faint);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 8px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.card.done {
  border-color: rgba(52, 199, 89, 0.4);
  background: linear-gradient(160deg, var(--success-soft), transparent 65%);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 7px;
}
.check {
  flex: none;
  width: 15px;
  height: 15px;
  border: 1.5px solid var(--border-strong);
  border-radius: 4px;
  font-size: 9px;
  line-height: 1;
  color: #fff;
}
.check.on {
  border-color: transparent;
  background: var(--success);
}
.name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.site {
  flex: none;
  font-size: 10px;
  color: var(--accent);
  white-space: nowrap;
}
.site:hover {
  text-decoration: underline;
}
.desc {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-dim);
}
.note {
  margin: 0;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--fill-1);
  font-size: 9.5px;
  line-height: 1.5;
  color: var(--text-faint);
}
.cmd {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.cmd code {
  flex: 1;
  min-width: 0;
  padding: 3px 7px;
  border-radius: 5px;
  background: var(--code-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini {
  flex: none;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--accent);
}
.mini:hover {
  background: var(--accent-soft);
}
.no-cmd {
  margin: 2px 0 0;
  font-size: 9.5px;
  color: var(--text-faint);
}
.empty {
  margin: 30px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
.msg {
  margin: 0;
  font-size: 10.5px;
  color: var(--accent);
}
.modal {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
}
.dialog {
  width: min(560px, 90%);
  max-height: 82%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}
.dialog-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.dialog-title {
  font-size: 12.5px;
  font-weight: 600;
}
.dialog-head .chk {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
  cursor: pointer;
}
.close {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  font-size: 10px;
  color: var(--text-faint);
}
.close:hover {
  background: var(--fill-2);
  color: var(--text);
}
.dialog-tip {
  flex: none;
  margin: 0;
  padding: 8px 14px 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-faint);
}
.script {
  flex: 1;
  min-height: 0;
  margin: 8px 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--code-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text);
  overflow: auto;
  white-space: pre;
}
.dialog-foot {
  flex: none;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--fill-1);
}
</style>
