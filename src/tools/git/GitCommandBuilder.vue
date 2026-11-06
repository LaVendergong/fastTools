<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
import { findScenario, GROUPS, missingFields, SCENARIOS, toScript } from './commands.js'

const STORAGE_KEY = 'toolbox:gitcmd'
const saved = readJSON(STORAGE_KEY)

const activeId = ref(saved.activeId ?? SCENARIOS[0].id)
const values = reactive({ ...(saved.values || {}) })
const { copied, copy } = useCopy()

const scenario = computed(() => findScenario(activeId.value))
const commands = computed(() => scenario.value.build(values))
const missing = computed(() => missingFields(scenario.value, values))
const script = computed(() => toScript(commands.value))

function select(id) {
  activeId.value = id
}

function copyOne(cmd, index) {
  copy(cmd, `cmd-${index}`)
}

let saveTimer = null
watch(
  [activeId, values],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ activeId: activeId.value, values: { ...values } }),
      )
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="gitcmd">
    <div class="toolbar">
      <span class="stat">{{ SCENARIOS.length }} 个常用场景</span>
      <span class="spacer" />
      <button class="btn" :disabled="!script" @click="copy(script, 'all')">
        {{ copied === 'all' ? '已复制' : '复制全部命令' }}
      </button>
    </div>

    <div class="body">
      <aside class="scenes">
        <div v-for="group in GROUPS" :key="group.id" class="group">
          <p class="group-name">{{ group.name }}</p>
          <button
            v-for="item in SCENARIOS.filter((s) => s.group === group.id)"
            :key="item.id"
            class="scene"
            :class="{ on: activeId === item.id }"
            @click="select(item.id)"
          >
            {{ item.name }}
          </button>
        </div>
      </aside>

      <section class="pane">
        <header>
          <span class="pane-title">{{ scenario.name }}</span>
          <span class="pane-meta">{{ commands.length }} 条命令</span>
        </header>

        <div class="content">
          <p class="desc">{{ scenario.desc }}</p>

          <div v-if="scenario.fields.length" class="fields">
            <label v-for="field in scenario.fields" :key="field.key" class="field">
              <span>{{ field.label }}</span>
              <input
                v-model="values[field.key]"
                class="input mono"
                :placeholder="field.placeholder"
                spellcheck="false"
              />
            </label>
          </div>

          <p v-if="missing.length" class="tip">还需要填写：{{ missing.join('、') }}</p>

          <div class="cmds">
            <div v-for="(item, i) in commands" :key="i" class="cmd-row">
              <div class="cmd-main">
                <code class="cmd">{{ item.cmd }}</code>
                <button class="mini" @click="copyOne(item.cmd, i)">
                  {{ copied === `cmd-${i}` ? '已复制' : '复制' }}
                </button>
              </div>
              <p v-if="item.note" class="note">{{ item.note }}</p>
            </div>
          </div>

          <p v-if="scenario.warn" class="warn-bar">⚠ {{ scenario.warn }}</p>
        </div>
      </section>
    </div>

    <p class="hint">
      命令按执行顺序排列，可以逐条复制，也可以一次复制整段脚本。
      带 ⚠ 的是不可逆操作，执行前建议先 <code>git status</code> 或 <code>git stash</code> 留个后路。
    </p>
  </div>
</template>

<style scoped>
.gitcmd {
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
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10.5px;
  color: var(--text-faint);
}
.btn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
}
.btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 230px 1fr;
  gap: 10px;
}
.scenes {
  min-height: 0;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.group + .group {
  margin-top: 10px;
}
.group-name {
  margin: 0 0 4px;
  padding: 0 4px;
  font-size: 9.5px;
  color: var(--text-faint);
  letter-spacing: 0.04em;
}
.scene {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border-radius: 6px;
  text-align: left;
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.5;
}
.scene:hover {
  background: var(--fill-1);
}
.scene.on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
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
.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 11px 13px;
}
.desc {
  margin: 0 0 10px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-dim);
}
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.field span {
  font-size: 9.5px;
  color: var(--text-faint);
}
.input {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
}
.input:focus {
  border-color: var(--accent);
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.tip {
  margin: 0 0 8px;
  font-size: 10.5px;
  color: var(--warn);
}
.cmds {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.cmd-row {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--fill-1);
}
.cmd-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cmd {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
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
}
.mini:hover {
  background: var(--accent-soft);
}
.note {
  margin: 4px 0 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
.warn-bar {
  margin: 10px 0 0;
  padding: 6px 9px;
  border-radius: 7px;
  background: var(--danger-soft);
  font-size: 10.5px;
  line-height: 1.6;
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
