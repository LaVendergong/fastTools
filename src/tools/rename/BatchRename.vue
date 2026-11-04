<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import {
  extOf,
  formatSize,
  getOpfsRoot,
  listDir,
  loadLocalDirectory,
  pickLocalDirectory,
  renameEntry,
  supportsLocalDir,
} from '../files/fs'

const backend = ref('opfs')
const rootHandle = ref(null)
const stack = ref([])
const files = ref([])
const selected = ref(new Set())
const loading = ref(false)
const error = ref('')
const message = ref('')
const executing = ref(false)
const localSupported = supportsLocalDir()

const rule = reactive({
  find: '',
  replace: '',
  useRegex: false,
  prefix: '',
  suffix: '',
  withIndex: false,
  startIndex: 1,
  padLength: 3,
  indexPosition: 'suffix', // prefix | suffix
  separator: '_',
  caseMode: 'keep', // keep | lower | upper | title
  extMode: 'keep', // keep | lower | upper | remove | custom
  customExt: '',
})

const lastBatch = ref(null) // { dir, items: [{ from, to }] }

const currentDir = computed(() =>
  stack.value.length ? stack.value[stack.value.length - 1].handle : rootHandle.value,
)
const pathLabel = computed(() =>
  [backend.value === 'opfs' ? '本站空间' : '本地目录', ...stack.value.map((s) => s.name)].join(' / '),
)

/* ---------------- 名称计算 ---------------- */

function computeNewName(original, order) {
  const ext = extOf(original)
  let base = ext ? original.slice(0, -(ext.length + 1)) : original

  if (rule.find) {
    if (rule.useRegex) {
      try {
        base = base.replace(new RegExp(rule.find, 'g'), rule.replace)
      } catch {
        /* 非法正则忽略 */
      }
    } else {
      base = base.split(rule.find).join(rule.replace)
    }
  }

  if (rule.caseMode === 'lower') base = base.toLowerCase()
  else if (rule.caseMode === 'upper') base = base.toUpperCase()
  else if (rule.caseMode === 'title') base = base.replace(/(^|\s)\S/g, (c) => c.toUpperCase())

  base = `${rule.prefix}${base}${rule.suffix}`

  if (rule.withIndex) {
    const num = String(rule.startIndex + order).padStart(rule.padLength, '0')
    base = rule.indexPosition === 'prefix' ? `${num}${rule.separator}${base}` : `${base}${rule.separator}${num}`
  }

  let newExt = ext
  if (rule.extMode === 'lower') newExt = ext.toLowerCase()
  else if (rule.extMode === 'upper') newExt = ext.toUpperCase()
  else if (rule.extMode === 'remove') newExt = ''
  else if (rule.extMode === 'custom') newExt = rule.customExt.replace(/^\./, '')

  return newExt ? `${base}.${newExt}` : base
}

const targets = computed(() => files.value.filter((f) => selected.value.has(f.name)))

const plan = computed(() => {
  const list = targets.value.map((file, i) => {
    const to = computeNewName(file.name, i)
    return { from: file.name, to, size: file.size }
  })

  const others = new Set(files.value.filter((f) => !selected.value.has(f.name)).map((f) => f.name))
  const seen = new Map()
  for (const item of list) {
    const problems = []
    if (!item.to.trim()) problems.push('名称为空')
    if (/[\\/:*?"<>|]/.test(item.to)) problems.push('包含非法字符')
    if (item.to === item.from) problems.push('未变化')
    if (others.has(item.to)) problems.push('与未选中的文件重名')
    if (seen.has(item.to)) problems.push('与其他目标重名')
    seen.set(item.to, true)
    item.problems = problems
    item.changed = !problems.includes('未变化') && problems.length === 0
  }
  return list
})

const changedCount = computed(() => plan.value.filter((p) => p.changed).length)
const blockedCount = computed(() => plan.value.filter((p) => p.problems.length && !p.problems.includes('未变化')).length)

/* ---------------- 文件浏览 ---------------- */

async function initBackend(kind) {
  loading.value = true
  error.value = ''
  files.value = []
  selected.value = new Set()
  try {
    if (kind === 'opfs') {
      rootHandle.value = await getOpfsRoot()
    } else {
      let handle = await loadLocalDirectory()
      if (!handle) handle = await pickLocalDirectory()
      rootHandle.value = handle
    }
    backend.value = kind
    stack.value = []
    await refreshAll()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function refresh() {
  if (!currentDir.value) return
  loading.value = true
  error.value = ''
  try {
    const entries = await listDir(currentDir.value)
    files.value = entries
      .filter((e) => e.kind === 'file')
      .map((e) => ({ name: e.name, size: e.size, handle: e.handle }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    selected.value = new Set(files.value.map((f) => f.name))
  } catch (e) {
    error.value = e.message
    files.value = []
  } finally {
    loading.value = false
  }
}

async function enterDir(dirHandle, name) {
  stack.value.push({ name, handle: dirHandle })
  await refreshAll()
}

async function goUp() {
  if (!stack.value.length) return
  stack.value.pop()
  await refreshAll()
}

async function openSubdir(name) {
  try {
    const dir = await currentDir.value.getDirectoryHandle(name)
    await enterDir(dir, name)
  } catch (e) {
    error.value = e.message
  }
}

const dirs = ref([])

async function loadDirs() {
  if (!currentDir.value) return
  try {
    const entries = await listDir(currentDir.value)
    dirs.value = entries.filter((e) => e.kind === 'dir').map((e) => ({ name: e.name, handle: e.handle }))
  } catch {
    dirs.value = []
  }
}

async function refreshAll() {
  await refresh()
  await loadDirs()
}

/* ---------------- 选择 ---------------- */

function toggle(name) {
  const next = new Set(selected.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selected.value = next
}

function selectAll() {
  selected.value = new Set(files.value.map((f) => f.name))
}

function selectNone() {
  selected.value = new Set()
}

/* ---------------- 执行 / 撤销 ---------------- */

async function applyBatch(items) {
  const dir = currentDir.value
  const tempNames = []
  // 两阶段：先改成临时名，避免 a→b、b→c 互相覆盖
  for (let i = 0; i < items.length; i++) {
    const temp = `__tmp_${Date.now().toString(36)}_${i}`
    await renameEntry(dir, items[i].from, temp)
    tempNames.push(temp)
  }
  for (let i = 0; i < items.length; i++) {
    await renameEntry(dir, tempNames[i], items[i].to)
  }
}

async function execute() {
  const items = plan.value.filter((p) => p.changed).map(({ from, to }) => ({ from, to }))
  if (!items.length) return
  if (!window.confirm(`确定重命名 ${items.length} 个文件？`)) return

  executing.value = true
  error.value = ''
  message.value = ''
  try {
    await applyBatch(items)
    lastBatch.value = { dir: currentDir.value, items }
    message.value = `已重命名 ${items.length} 个文件`
    await refreshAll()
  } catch (e) {
    error.value = `重命名失败：${e.message}`
  } finally {
    executing.value = false
  }
}

async function undo() {
  const batch = lastBatch.value
  if (!batch) return
  executing.value = true
  error.value = ''
  try {
    await applyBatch(batch.items.map((item) => ({ from: item.to, to: item.from })))
    message.value = `已撤销 ${batch.items.length} 个重命名`
    lastBatch.value = null
    await refreshAll()
  } catch (e) {
    error.value = `撤销失败：${e.message}`
  } finally {
    executing.value = false
  }
}

function resetRule() {
  Object.assign(rule, {
    find: '',
    replace: '',
    useRegex: false,
    prefix: '',
    suffix: '',
    withIndex: false,
    startIndex: 1,
    padLength: 3,
    indexPosition: 'suffix',
    separator: '_',
    caseMode: 'keep',
    extMode: 'keep',
    customExt: '',
  })
}

onMounted(() => initBackend('opfs'))
</script>

<template>
  <div class="rename">
    <div class="bar">
      <button class="place" :class="{ on: backend === 'opfs' }" @click="initBackend('opfs')">
        🗄️ 本站空间
      </button>
      <button
        class="place"
        :class="{ on: backend === 'local' }"
        :disabled="!localSupported"
        :title="localSupported ? '' : 'Chrome / Edge 可用'"
        @click="initBackend('local')"
      >
        💻 本地目录
      </button>
      <span class="path" :title="pathLabel">{{ pathLabel }}</span>
      <button class="mini-btn" :disabled="!stack.length" @click="goUp">↑ 上级</button>
      <button class="mini-btn" @click="refreshAll">⟳ 刷新</button>
    </div>

    <div class="body">
      <!-- 左：文件列表 -->
      <section class="list-panel">
        <header>
          <span class="panel-title">文件 · {{ files.length }}</span>
          <button class="link" @click="selectAll">全选</button>
          <button class="link" @click="selectNone">清空</button>
        </header>

        <div class="list">
          <p v-if="loading" class="tip">读取中…</p>
          <template v-else>
            <button
              v-for="dir in dirs"
              :key="`d-${dir.name}`"
              class="row dir"
              @click="enterDir(dir.handle, dir.name)"
            >
              <span class="box-space" />
              <span class="icon">📁</span>
              <span class="fname">{{ dir.name }}</span>
            </button>

            <button
              v-for="file in files"
              :key="file.name"
              class="row"
              :class="{ on: selected.has(file.name) }"
              @click="toggle(file.name)"
            >
              <span class="box" :class="{ checked: selected.has(file.name) }" />
              <span class="icon">📄</span>
              <span class="fname" :title="file.name">{{ file.name }}</span>
              <span class="fsize">{{ formatSize(file.size) }}</span>
            </button>

            <p v-if="!files.length && !dirs.length" class="tip">这个目录是空的</p>
          </template>
        </div>
      </section>

      <!-- 右：规则 + 预览 -->
      <section class="rule-panel">
        <div class="rule-scroll">
          <p class="section">查找替换</p>
          <div class="row-line">
            <input v-model="rule.find" class="input" placeholder="查找内容" spellcheck="false" />
            <span class="arrow">→</span>
            <input v-model="rule.replace" class="input" placeholder="替换为（可空）" spellcheck="false" />
            <label class="chk"><input v-model="rule.useRegex" type="checkbox" />正则</label>
          </div>

          <p class="section">前后缀</p>
          <div class="row-line">
            <input v-model="rule.prefix" class="input" placeholder="前缀" spellcheck="false" />
            <input v-model="rule.suffix" class="input" placeholder="后缀" spellcheck="false" />
          </div>

          <p class="section">序号</p>
          <div class="row-line">
            <label class="chk"><input v-model="rule.withIndex" type="checkbox" />启用</label>
            <span class="lbl">起始</span>
            <input v-model.number="rule.startIndex" class="num" type="number" min="0" />
            <span class="lbl">位数</span>
            <input v-model.number="rule.padLength" class="num" type="number" min="1" max="10" />
            <select v-model="rule.indexPosition" class="select">
              <option value="prefix">放在前面</option>
              <option value="suffix">放在后面</option>
            </select>
            <input v-model="rule.separator" class="num sep" maxlength="3" title="分隔符" />
          </div>

          <p class="section">大小写与扩展名</p>
          <div class="row-line">
            <select v-model="rule.caseMode" class="select">
              <option value="keep">大小写保持</option>
              <option value="lower">全部小写</option>
              <option value="upper">全部大写</option>
              <option value="title">首字母大写</option>
            </select>
            <select v-model="rule.extMode" class="select">
              <option value="keep">扩展名保持</option>
              <option value="lower">扩展名小写</option>
              <option value="upper">扩展名大写</option>
              <option value="remove">去掉扩展名</option>
              <option value="custom">改成指定</option>
            </select>
            <input v-if="rule.extMode === 'custom'" v-model="rule.customExt" class="num" placeholder="txt" />
            <button class="link" @click="resetRule">重置规则</button>
          </div>

          <p class="section">
            预览
            <span class="count">已选 {{ targets.length }} · 将改名 {{ changedCount }}</span>
            <span v-if="blockedCount" class="warn">{{ blockedCount }} 个有问题</span>
          </p>

          <div class="preview">
            <p v-if="!plan.length" class="tip">勾选左侧文件后显示预览</p>
            <div v-for="item in plan" :key="item.from" class="pv-row" :class="{ bad: item.problems.length && !item.problems.includes('未变化') }">
              <span class="pv-from" :title="item.from">{{ item.from }}</span>
              <span class="pv-arrow">→</span>
              <span class="pv-to" :title="item.to">{{ item.to || '（空）' }}</span>
              <span v-if="item.problems.length" class="pv-issue">{{ item.problems[0] }}</span>
            </div>
          </div>
        </div>

        <div class="foot">
          <span v-if="message" class="ok">{{ message }}</span>
          <span v-if="error" class="err">{{ error }}</span>
          <button class="btn" :disabled="!lastBatch || executing" @click="undo">撤销上次</button>
          <button class="btn primary" :disabled="!changedCount || executing" @click="execute">
            {{ executing ? '执行中…' : `执行重命名 (${changedCount})` }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.rename {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
}
.place {
  flex: none;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text-dim);
}
.place.on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}
.place:disabled {
  opacity: 0.45;
  cursor: default;
}
.path {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-btn {
  flex: none;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-dim);
}
.mini-btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.mini-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 10px;
}
.list-panel,
.rule-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.list-panel header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.panel-title {
  font-size: 11.5px;
  font-weight: 600;
  margin-right: auto;
}
.link {
  font-size: 10.5px;
  color: var(--accent);
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 5px 7px;
  border-radius: 6px;
  text-align: left;
  color: var(--text);
}
.row:hover {
  background: var(--fill-1);
}
.row.on {
  background: var(--accent-soft);
}
.row.dir {
  color: var(--text-dim);
}
.box-space {
  width: 13px;
}
.box {
  flex: none;
  width: 13px;
  height: 13px;
  border: 1.5px solid var(--border-strong);
  border-radius: 3.5px;
}
.box.checked {
  border-color: var(--accent);
  background: var(--accent);
  box-shadow: inset 0 0 0 2px var(--panel-bg);
}
.icon {
  flex: none;
  font-size: 12px;
}
.fname {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fsize {
  flex: none;
  font-size: 10px;
  color: var(--text-faint);
}
.tip {
  margin: 24px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-dim);
}

.rule-panel {
  display: flex;
  flex-direction: column;
}
.rule-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
}
.section {
  margin: 12px 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  gap: 8px;
}
.section:first-child {
  margin-top: 0;
}
.count {
  font-weight: 400;
  color: var(--text-faint);
}
.warn {
  font-weight: 400;
  color: var(--danger);
}
.row-line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.input {
  flex: 1;
  min-width: 90px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.num {
  width: 56px;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.num.sep {
  width: 40px;
  text-align: center;
}
.select {
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.input:focus,
.num:focus {
  border-color: var(--accent);
}
.chk {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
  cursor: pointer;
}
.lbl {
  font-size: 10.5px;
  color: var(--text-faint);
}
.arrow {
  font-size: 11px;
  color: var(--text-faint);
}
.preview {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  max-height: 220px;
  overflow-y: auto;
}
.pv-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 9px;
  border-bottom: 1px solid var(--border);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
}
.pv-row:last-child {
  border-bottom: none;
}
.pv-row.bad {
  background: var(--danger-soft);
}
.pv-from {
  flex: 1;
  min-width: 0;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-arrow {
  flex: none;
  color: var(--text-faint);
}
.pv-to {
  flex: 1.2;
  min-width: 0;
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-issue {
  flex: none;
  font-size: 10px;
  color: var(--danger);
}
.foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--fill-1);
}
.btn {
  padding: 5px 13px;
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
.btn.primary {
  margin-left: auto;
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover:not(:disabled) {
  background: var(--accent-strong);
}
.ok {
  font-size: 11px;
  color: var(--success);
}
.err {
  font-size: 11px;
  color: var(--danger);
}
</style>
