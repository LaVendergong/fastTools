<script setup>
import { computed, reactive, ref, watch } from 'vue'

const ROLES = [
  { id: 'u', name: '所有者', en: 'user', hint: '文件的主人' },
  { id: 'g', name: '同组用户', en: 'group', hint: '与所有者同组的其他用户' },
  { id: 'o', name: '其他用户', en: 'others', hint: '系统里的其他人' },
]

const PERMS = [
  { id: 'r', name: '读', value: 4, desc: '查看文件内容 / 列出目录' },
  { id: 'w', name: '写', value: 2, desc: '修改文件 / 在目录中增删文件' },
  { id: 'x', name: '执行', value: 1, desc: '运行程序 / 进入目录' },
]

const SPECIALS = [
  { id: 'setuid', name: 'setuid', value: 4, desc: '以文件所有者身份执行（如 sudo）' },
  { id: 'setgid', name: 'setgid', value: 2, desc: '以文件所属组身份执行' },
  { id: 'sticky', name: 'sticky', value: 1, desc: '仅所有者可删除（如 /tmp）' },
]

const PRESETS = [
  { name: '600', desc: '私钥文件', bits: 'rw-------' },
  { name: '644', desc: '普通文件', bits: 'rw-r--r--' },
  { name: '664', desc: '组内可写文件', bits: 'rw-rw-r--' },
  { name: '700', desc: '私有目录', bits: 'rwx------' },
  { name: '755', desc: '可执行 / 目录', bits: 'rwxr-xr-x' },
  { name: '775', desc: '组内可写目录', bits: 'rwxrwxr-x' },
  { name: '777', desc: '完全开放（慎用）', bits: 'rwxrwxrwx' },
]

const bits = reactive({
  u: { r: true, w: true, x: true },
  g: { r: true, w: false, x: true },
  o: { r: true, w: false, x: true },
})

const special = reactive({ setuid: false, setgid: false, sticky: false })

const octalInput = ref('')
const copied = ref('')
const message = ref('')

function digitOf(role) {
  return PERMS.reduce((sum, p) => sum + (bits[role][p.id] ? p.value : 0), 0)
}

const octal = computed(() => {
  const s = SPECIALS.reduce((sum, sp) => sum + (special[sp.id] ? sp.value : 0), 0)
  const body = `${digitOf('u')}${digitOf('g')}${digitOf('o')}`
  return s ? `${s}${body}` : body
})

// -rwxr-xr-x 形式，其中 setuid/setgid/sticky 影响 x 位的 s/S、t/T
function symbolicTriplet(role, specialOn, specialChar) {
  const b = bits[role]
  const r = b.r ? 'r' : '-'
  const w = b.w ? 'w' : '-'
  let x = '-'
  if (b.x && specialOn) x = specialChar
  else if (b.x) x = 'x'
  else if (specialOn) x = specialChar.toUpperCase()
  return `${r}${w}${x}`
}

const symbolic = computed(() => {
  const isDir = false
  return `${isDir ? 'd' : '-'}${symbolicTriplet('u', special.setuid, 's')}${symbolicTriplet(
    'g',
    special.setgid,
    's',
  )}${symbolicTriplet('o', special.sticky, 't')}`
})

const command = computed(() => `chmod ${octal.value} 文件名`)

const summary = computed(() =>
  ROLES.map((role) => ({
    ...role,
    digit: digitOf(role.id),
    allowed: PERMS.filter((p) => bits[role.id][p.id]).map((p) => p.name),
  })),
)

/* ---------------- 反向解析 ---------------- */

function applyOctal(text) {
  const clean = String(text).trim()
  if (!/^[0-7]{3,4}$/.test(clean)) return false

  const digits = clean.padStart(4, '0')
  const specialDigit = Number(digits[0])
  const body = digits.slice(1)

  special.setuid = Boolean(specialDigit & 4)
  special.setgid = Boolean(specialDigit & 2)
  special.sticky = Boolean(specialDigit & 1)

  ;['u', 'g', 'o'].forEach((role, index) => {
    const value = Number(body[index])
    bits[role].r = Boolean(value & 4)
    bits[role].w = Boolean(value & 2)
    bits[role].x = Boolean(value & 1)
  })
  return true
}

watch(octalInput, (text) => {
  if (!text) return
  if (applyOctal(text)) {
    message.value = ''
  } else {
    message.value = '八进制只能是 3~4 位 0-7 的数字，如 755 / 0644'
  }
})

function usePreset(preset) {
  octalInput.value = ''
  applyOctal(preset.name)
  message.value = `已应用 ${preset.name}（${preset.desc}）`
  setTimeout(() => {
    if (message.value.startsWith('已应用')) message.value = ''
  }, 1600)
}

function toggleAll(role, on) {
  PERMS.forEach((p) => {
    bits[role][p.id] = on
  })
}

async function copy(text, tag) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = tag
    setTimeout(() => {
      if (copied.value === tag) copied.value = ''
    }, 1200)
  } catch {
    /* 忽略 */
  }
}
</script>

<template>
  <div class="chmod">
    <div class="toolbar">
      <span class="label">常用</span>
      <button v-for="p in PRESETS" :key="p.name" class="chip" :title="p.bits" @click="usePreset(p)">
        {{ p.name }}
        <span class="chip-desc">{{ p.desc }}</span>
      </button>
    </div>

    <div class="body">
      <section class="matrix">
        <div class="head-row">
          <span class="corner" />
          <span v-for="p in PERMS" :key="p.id" class="col-head" :title="p.desc">
            {{ p.name }}
            <i>{{ p.value }}</i>
          </span>
          <span class="col-head all">全选</span>
        </div>

        <div v-for="role in ROLES" :key="role.id" class="row">
          <div class="role">
            <span class="role-name">{{ role.name }}</span>
            <span class="role-hint">{{ role.en }}</span>
          </div>
          <label v-for="p in PERMS" :key="p.id" class="cell" :title="p.desc">
            <input v-model="bits[role.id][p.id]" type="checkbox" />
            <span class="mark">{{ bits[role.id][p.id] ? '✓' : '' }}</span>
          </label>
          <div class="row-actions">
            <button class="mini" @click="toggleAll(role.id, true)">全给</button>
            <button class="mini" @click="toggleAll(role.id, false)">清空</button>
          </div>
        </div>

        <div class="special">
          <span class="role-name">特殊位</span>
          <label v-for="sp in SPECIALS" :key="sp.id" class="sp-item" :title="sp.desc">
            <input v-model="special[sp.id]" type="checkbox" />
            {{ sp.name }}
          </label>
        </div>
      </section>

      <aside class="result">
        <div class="big-card">
          <span class="card-label">八进制权限</span>
          <span class="big mono" @click="copy(octal, 'octal')">{{ octal }}</span>
          <span class="card-sub">点击复制</span>
        </div>

        <div class="line-card">
          <div class="line-head">
            <span>符号形式</span>
            <button class="mini" @click="copy(symbolic, 'sym')">
              {{ copied === 'sym' ? '已复制' : '复制' }}
            </button>
          </div>
          <code class="mono sym">{{ symbolic }}</code>
        </div>

        <div class="line-card">
          <div class="line-head">
            <span>命令</span>
            <button class="mini" @click="copy(command, 'cmd')">
              {{ copied === 'cmd' ? '已复制' : '复制' }}
            </button>
          </div>
          <code class="mono">{{ command }}</code>
        </div>

        <div class="reverse">
          <label class="rev-label">反查：输入八进制</label>
          <input v-model="octalInput" class="rev-input mono" placeholder="755" maxlength="4" spellcheck="false" />
        </div>

        <div class="detail">
          <div v-for="item in summary" :key="item.id" class="detail-row">
            <span class="d-role">{{ item.name }}</span>
            <span class="d-digit mono">{{ item.digit }}</span>
            <span class="d-perms">{{ item.allowed.length ? item.allowed.join('、') : '无权限' }}</span>
          </div>
        </div>

        <p v-if="message" class="msg">{{ message }}</p>
      </aside>
    </div>

    <p class="hint">
      权限数值：读 4、写 2、执行 1，三个角色相加即为一位八进制数；
      特殊位 setuid(4) / setgid(2) / sticky(1) 加在最前面，例如 <code>4755</code>、<code>1777</code>。
    </p>
  </div>
</template>

<style scoped>
.chmod {
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
  gap: 6px;
  flex-wrap: wrap;
}
.label {
  font-size: 11px;
  color: var(--text-dim);
}
.chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text);
}
.chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.chip-desc {
  font-family: inherit;
  font-size: 9.5px;
  color: var(--text-faint);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.matrix {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.head-row {
  display: grid;
  grid-template-columns: 120px repeat(3, 1fr) 96px;
  gap: 8px;
  align-items: center;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.col-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.col-head i {
  font-style: normal;
  font-size: 9.5px;
  color: var(--text-faint);
}
.row {
  display: grid;
  grid-template-columns: 120px repeat(3, 1fr) 96px;
  gap: 8px;
  align-items: center;
}
.role {
  display: flex;
  flex-direction: column;
}
.role-name {
  font-size: 12px;
  font-weight: 500;
}
.role-hint {
  font-size: 9.5px;
  color: var(--text-faint);
}
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--fill-1);
  cursor: pointer;
}
.cell:hover {
  border-color: var(--accent);
}
.cell input {
  display: none;
}
.mark {
  font-size: 13px;
  color: var(--accent);
  font-weight: 700;
}
.cell:has(input:checked) {
  border-color: transparent;
  background: var(--accent-soft);
}
.row-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.mini {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--accent);
  white-space: nowrap;
}
.mini:hover {
  background: var(--accent-soft);
}
.special {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 11px;
}
.sp-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-dim);
  cursor: pointer;
}
.result {
  flex: none;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.big-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 14px;
  border-radius: 10px;
  background: linear-gradient(150deg, var(--accent-soft), transparent 70%);
  border: 1px solid var(--border);
}
.card-label {
  font-size: 10.5px;
  color: var(--text-dim);
}
.big {
  font-size: 34px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--accent);
  cursor: pointer;
}
.card-sub {
  font-size: 9.5px;
  color: var(--text-faint);
}
.line-card {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.line-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 10px;
  color: var(--text-faint);
}
.line-head .mini {
  margin-left: auto;
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--text);
  word-break: break-all;
}
.sym {
  font-size: 13px;
  letter-spacing: 0.06em;
}
.reverse {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.rev-label {
  font-size: 10px;
  color: var(--text-faint);
  white-space: nowrap;
}
.rev-input {
  flex: 1;
  min-width: 0;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
}
.rev-input:focus {
  border-color: var(--accent);
}
.detail {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.detail-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 10.5px;
}
.d-role {
  flex: none;
  width: 60px;
  color: var(--text-faint);
}
.d-digit {
  flex: none;
  color: var(--accent);
  font-weight: 600;
}
.d-perms {
  flex: 1;
  min-width: 0;
  color: var(--text-dim);
}
.msg {
  margin: 0;
  font-size: 10px;
  color: var(--accent);
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
