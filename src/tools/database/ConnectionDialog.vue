<script setup>
import { reactive, ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  connection: { type: Object, default: null },
})
const emit = defineEmits(['close', 'save'])

const TYPES = [
  { value: 'mysql', label: 'MySQL', port: 3306 },
  { value: 'postgres', label: 'PostgreSQL', port: 5432 },
  { value: 'sqlite', label: 'SQLite', port: 0 },
]

const form = reactive({
  id: '',
  name: '',
  type: 'mysql',
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: '',
  ssh: {
    enabled: false,
    host: '',
    port: 22,
    username: '',
    password: '',
    privateKey: '',
    passphrase: '',
  },
})

const sshOpen = ref(false)
const testing = ref(false)
const testResult = ref({ ok: null, text: '' })

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    testResult.value = { ok: null, text: '' }
    const emptySsh = {
      enabled: false,
      host: '',
      port: 22,
      username: '',
      password: '',
      privateKey: '',
      passphrase: '',
    }
    if (props.connection) {
      Object.assign(form, props.connection, { ssh: { ...emptySsh, ...(props.connection.ssh || {}) } })
    } else {
      Object.assign(form, {
        id: '',
        name: '',
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        user: 'root',
        password: '',
        database: '',
        ssh: emptySsh,
      })
    }
  },
)

watch(
  () => form.type,
  (type) => {
    const found = TYPES.find((t) => t.value === type)
    if (!found) return
    // 当前端口为空或等于某个默认端口时，跟随类型切换
    const defaultPorts = TYPES.map((t) => t.port)
    if (!form.port || defaultPorts.includes(form.port)) form.port = found.port
  },
)

async function test() {
  testing.value = true
  testResult.value = { ok: null, text: '连接中…' }
  try {
    const res = await fetch('/api/db/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    testResult.value = data.ok
      ? { ok: true, text: '连接成功' }
      : { ok: false, text: data.error || '连接失败' }
  } catch {
    testResult.value = { ok: false, text: '网关无响应，请先在 server 目录执行 npm start' }
  } finally {
    testing.value = false
  }
}

function save() {
  if (!form.name.trim()) form.name = form.database || `${form.type}@${form.host}`
  emit('save', { ...form })
}
</script>

<template>
  <div v-if="visible" class="mask" @click.self="emit('close')">
    <div class="dialog">
      <header>
        <span>{{ connection ? '编辑连接' : '新建连接' }}</span>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div class="content">
        <div class="field">
          <label>名称</label>
          <input v-model="form.name" placeholder="如 本地 MySQL" spellcheck="false" />
        </div>

        <div class="field">
          <label>类型</label>
          <select v-model="form.type">
            <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </div>

        <template v-if="form.type !== 'sqlite'">
          <div class="field">
            <label>主机</label>
            <input v-model="form.host" placeholder="127.0.0.1 或数据库地址" spellcheck="false" />
          </div>
          <div class="field">
            <label>端口</label>
            <input v-model.number="form.port" type="number" />
          </div>
          <div class="field">
            <label>用户名</label>
            <input v-model="form.user" spellcheck="false" />
          </div>
          <div class="field">
            <label>密码</label>
            <input v-model="form.password" type="password" />
          </div>
        </template>

        <div class="field">
          <label>{{ form.type === 'sqlite' ? '文件路径' : '数据库' }}</label>
          <input
            v-model="form.database"
            :placeholder="form.type === 'sqlite' ? 'D:/data/app.db' : '库名，可留空'"
            spellcheck="false"
          />
        </div>

        <div v-if="form.type !== 'sqlite'" class="ssh-box">
          <label class="ssh-head">
            <input v-model="form.ssh.enabled" type="checkbox" />
            <span>SSH 隧道</span>
            <button type="button" class="caret" :class="{ open: sshOpen }" @click.prevent="sshOpen = !sshOpen">
              ▸
            </button>
          </label>

          <div v-if="sshOpen" class="ssh-body">
            <div class="field">
              <label>跳板机</label>
              <input v-model="form.ssh.host" placeholder="SSH 主机地址" spellcheck="false" />
            </div>
            <div class="field">
              <label>SSH 端口</label>
              <input v-model.number="form.ssh.port" type="number" placeholder="22" />
            </div>
            <div class="field">
              <label>SSH 用户</label>
              <input v-model="form.ssh.username" spellcheck="false" />
            </div>
            <div class="field">
              <label>SSH 密码</label>
              <input v-model="form.ssh.password" type="password" />
            </div>
            <div class="field">
              <label>私钥</label>
              <textarea
                v-model="form.ssh.privateKey"
                placeholder="粘贴私钥内容（填写后优先于密码）"
                spellcheck="false"
              />
            </div>
            <div v-if="form.ssh.privateKey" class="field">
              <label>私钥口令</label>
              <input v-model="form.ssh.passphrase" type="password" />
            </div>
          </div>
        </div>

        <p v-if="testResult.text" class="test-msg" :class="{ ok: testResult.ok, bad: testResult.ok === false }">
          {{ testResult.text }}
        </p>
      </div>

      <footer>
        <button class="tbtn" :disabled="testing" @click="test">
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <div class="right">
          <button class="tbtn" @click="emit('close')">取消</button>
          <button class="tbtn primary" @click="save">保存</button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fill-3);
}
.dialog {
  width: 420px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--panel-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
header {
  flex: none;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  font-size: 13px;
  font-weight: 600;
}
.close {
  margin-left: auto;
  color: var(--text-dim);
}
.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}
.field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.field label {
  flex: none;
  width: 68px;
  font-size: 12px;
  color: var(--text-dim);
}
.field input,
.field select {
  flex: 1;
  min-width: 0;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  outline: none;
  font-size: 12.5px;
}
.field input:focus,
.field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.ssh-box {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
}
.ssh-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
}
.ssh-head .caret {
  margin-left: auto;
  font-size: 10px;
  transition: transform 0.12s ease;
}
.ssh-head .caret.open {
  transform: rotate(90deg);
}
.ssh-body {
  margin-top: 8px;
}
.ssh-body textarea {
  flex: 1;
  min-height: 62px;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  resize: vertical;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.test-msg {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-dim);
}
.test-msg.ok {
  color: var(--success);
}
.test-msg.bad {
  color: var(--danger);
}
footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.tbtn {
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.tbtn.primary:hover {
  background: var(--accent-strong);
}
.tbtn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
