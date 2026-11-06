<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
import { buildSshConfig, DEFAULT_GLOBAL, emptyHost } from './config.js'

const STORAGE_KEY = 'toolbox:ssh'

const saved = readJSON(STORAGE_KEY)

const hosts = ref(
  saved.hosts?.length
    ? saved.hosts
    : [
        {
          alias: 'prod',
          hostname: '10.0.0.10',
          user: 'root',
          port: '22',
          identityFile: '~/.ssh/id_ed25519',
          proxyJump: '',
          localForward: '',
          extra: '',
        },
        {
          alias: 'bastion',
          hostname: 'bastion.example.com',
          user: 'ops',
          port: '2222',
          identityFile: '~/.ssh/id_rsa',
          proxyJump: '',
          localForward: '3306 db.internal:3306',
          extra: '',
        },
      ],
)

const global = reactive({ ...DEFAULT_GLOBAL, ...(saved.global || {}) })
const { copied, copy } = useCopy()

const result = computed(() => buildSshConfig({ hosts: hosts.value, global }))

function addHost() {
  hosts.value = [...hosts.value, emptyHost()]
}

function removeHost(index) {
  hosts.value = hosts.value.filter((_, i) => i !== index)
}

function moveHost(index, delta) {
  const next = [...hosts.value]
  const target = index + delta
  if (target < 0 || target >= next.length) return
  ;[next[index], next[target]] = [next[target], next[index]]
  hosts.value = next
}

function download() {
  const blob = new Blob([result.value.text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'config'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

let saveTimer = null
watch(
  [hosts, global],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hosts: hosts.value, global: { ...global } }),
      )
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="ssh">
    <div class="toolbar">
      <label class="chk"><input v-model="global.keepAlive" type="checkbox" /> 保持连接</label>
      <label class="chk"><input v-model="global.compression" type="checkbox" /> 压缩传输</label>
      <label class="chk"><input v-model="global.addKeysToAgent" type="checkbox" /> 密钥入 agent</label>
      <label class="chk"><input v-model="global.identitiesOnly" type="checkbox" /> 只用指定密钥</label>

      <span class="spacer" />
      <span class="stat">{{ hosts.length }} 台主机</span>
      <button class="btn" @click="addHost">＋ 主机</button>
      <button class="btn" @click="download">下载 config</button>
      <button class="btn primary" @click="copy(result.text, 'cfg')">
        {{ copied ? '已复制' : '复制配置' }}
      </button>
    </div>

    <div class="body">
      <section class="list">
        <article v-for="(host, i) in hosts" :key="i" class="card">
          <div class="card-head">
            <input v-model="host.alias" class="alias mono" placeholder="别名，如 prod" spellcheck="false" />
            <button class="mini" :disabled="i === 0" @click="moveHost(i, -1)">↑</button>
            <button class="mini" :disabled="i === hosts.length - 1" @click="moveHost(i, 1)">↓</button>
            <button class="mini danger" @click="removeHost(i)">删除</button>
          </div>

          <div class="grid">
            <label class="field">
              <span>HostName</span>
              <input v-model="host.hostname" class="input mono" placeholder="IP 或域名" spellcheck="false" />
            </label>
            <label class="field">
              <span>User</span>
              <input v-model="host.user" class="input mono" placeholder="root" spellcheck="false" />
            </label>
            <label class="field">
              <span>Port</span>
              <input v-model="host.port" class="input mono" placeholder="22" spellcheck="false" />
            </label>
            <label class="field">
              <span>IdentityFile</span>
              <input
                v-model="host.identityFile"
                class="input mono"
                placeholder="~/.ssh/id_ed25519"
                spellcheck="false"
              />
            </label>
            <label class="field">
              <span>ProxyJump</span>
              <input v-model="host.proxyJump" class="input mono" placeholder="跳板机别名" spellcheck="false" />
            </label>
            <label class="field">
              <span>LocalForward</span>
              <input
                v-model="host.localForward"
                class="input mono"
                placeholder="3306 127.0.0.1:3306"
                spellcheck="false"
              />
            </label>
          </div>
        </article>

        <p v-if="!hosts.length" class="empty">还没有主机，点右上角「＋ 主机」开始配置</p>
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">~/.ssh/config</span>
          <span class="pane-meta">保存后 chmod 600</span>
        </header>
        <pre class="code out">{{ result.text }}</pre>
      </section>
    </div>

    <p v-if="result.warnings.length" class="warn-bar">
      {{ result.warnings.join('；') }}
    </p>

    <p class="hint">
      配置写进 <code>~/.ssh/config</code> 后执行 <code>chmod 600 ~/.ssh/config</code>，
      之后直接 <code>ssh 别名</code> 即可。跳板机要先单独配一段 Host，再在目标主机里用 ProxyJump 引用它的别名。
    </p>
  </div>
</template>

<style scoped>
.ssh {
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
.chk {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
  cursor: pointer;
  white-space: nowrap;
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
  white-space: nowrap;
}
.btn:hover {
  background: var(--fill-1);
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover {
  background: var(--accent-strong);
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 10px;
}
.list {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card {
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
}
.alias {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
  font-weight: 600;
}
.alias:focus,
.input:focus {
  border-color: var(--accent);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
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
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.mini {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-dim);
}
.mini:hover:not(:disabled) {
  background: var(--fill-1);
}
.mini:disabled {
  opacity: 0.35;
  cursor: default;
}
.mini.danger {
  color: var(--danger);
}
.empty {
  margin: 24px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
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
  overflow: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.75;
  color: var(--text);
  white-space: pre;
}
.warn-bar {
  flex: none;
  margin: 0;
  padding: 5px 9px;
  border-radius: 7px;
  background: var(--warn-soft);
  font-size: 10.5px;
  color: var(--warn);
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
