<script setup>
import { computed, ref } from 'vue'

const MAX_LINES = 2000

const left = ref('')
const right = ref('')
const ignoreSpace = ref(false)
const ignoreCase = ref(false)
const copied = ref('')
const message = ref('')

function normalize(text) {
  let value = text
  if (ignoreCase.value) value = value.toLowerCase()
  if (ignoreSpace.value) value = value.replace(/[ \t]+/g, ' ').trimEnd()
  return value
}

const leftLines = computed(() => left.value.replace(/\r\n/g, '\n').split('\n'))
const rightLines = computed(() => right.value.replace(/\r\n/g, '\n').split('\n'))

const tooLarge = computed(() => leftLines.value.length > MAX_LINES || rightLines.value.length > MAX_LINES)

/* ---------------- 行级 LCS ---------------- */

const diffRows = computed(() => {
  if (tooLarge.value) return []
  const a = leftLines.value.map(normalize)
  const b = rightLines.value.map(normalize)
  const n = a.length
  const m = b.length

  // 空输入时直接返回
  if (!left.value && !right.value) return []

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', i, j })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', i })
      i += 1
    } else {
      ops.push({ type: 'add', j })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: 'del', i })
    i += 1
  }
  while (j < m) {
    ops.push({ type: 'add', j })
    j += 1
  }

  // 把相邻的 del / add 配对成「修改」行，便于左右对齐
  const rows = []
  let k = 0
  while (k < ops.length) {
    const op = ops[k]
    if (op.type === 'same') {
      rows.push({
        type: 'same',
        leftNo: op.i + 1,
        rightNo: op.j + 1,
        leftText: leftLines.value[op.i],
        rightText: rightLines.value[op.j],
      })
      k += 1
      continue
    }

    const dels = []
    const adds = []
    while (k < ops.length && ops[k].type !== 'same') {
      if (ops[k].type === 'del') dels.push(ops[k].i)
      else adds.push(ops[k].j)
      k += 1
    }

    const count = Math.max(dels.length, adds.length)
    for (let t = 0; t < count; t += 1) {
      const di = dels[t]
      const ai = adds[t]
      const hasBoth = di !== undefined && ai !== undefined
      rows.push({
        type: hasBoth ? 'change' : di !== undefined ? 'del' : 'add',
        leftNo: di !== undefined ? di + 1 : '',
        rightNo: ai !== undefined ? ai + 1 : '',
        leftText: di !== undefined ? leftLines.value[di] : '',
        rightText: ai !== undefined ? rightLines.value[ai] : '',
      })
    }
  }
  return rows
})

const stats = computed(() => {
  let add = 0
  let del = 0
  for (const row of diffRows.value) {
    if (row.type === 'add') add += 1
    else if (row.type === 'del') del += 1
    else if (row.type === 'change') {
      add += 1
      del += 1
    }
  }
  return { add, del, same: diffRows.value.filter((r) => r.type === 'same').length }
})

/* ---------------- 操作 ---------------- */

function swap() {
  const tmp = left.value
  left.value = right.value
  right.value = tmp
}

function clearAll() {
  left.value = ''
  right.value = ''
  message.value = ''
}

async function copyDiff() {
  const lines = []
  for (const row of diffRows.value) {
    if (row.type === 'same') lines.push(`  ${row.rightText}`)
    else if (row.type === 'change') {
      lines.push(`- ${row.leftText}`)
      lines.push(`+ ${row.rightText}`)
    } else if (row.type === 'del') lines.push(`- ${row.leftText}`)
    else lines.push(`+ ${row.rightText}`)
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    copied.value = 'diff'
    setTimeout(() => (copied.value = ''), 1200)
  } catch {
    /* 忽略 */
  }
}

async function loadSample() {
  left.value = `{\n  "name": "toolbox",\n  "version": "1.0.0",\n  "debug": true,\n  "port": 5200\n}`
  right.value = `{\n  "name": "toolbox",\n  "version": "1.1.0",\n  "debug": false,\n  "port": 5200,\n  "base": "/" \n}`
}
</script>

<template>
  <div class="diff">
    <div class="toolbar">
      <label class="chk"><input v-model="ignoreSpace" type="checkbox" /> 忽略空白</label>
      <label class="chk"><input v-model="ignoreCase" type="checkbox" /> 忽略大小写</label>
      <span class="spacer" />
      <span class="stat">
        <b class="add">+{{ stats.add }}</b>
        <b class="del">-{{ stats.del }}</b>
        <span class="same">{{ stats.same }} 行相同</span>
      </span>
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" @click="swap">⇄ 交换</button>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn primary" :disabled="!diffRows.length" @click="copyDiff">
        {{ copied ? '已复制' : '复制差异' }}
      </button>
    </div>

    <p v-if="tooLarge" class="err-bar">
      文本超过 {{ MAX_LINES }} 行，为保护性能暂不对比，请分段处理
    </p>

    <div class="body">
      <section class="pane">
        <header>
          <span class="pane-title">原始文本</span>
          <span class="pane-meta">{{ leftLines.length }} 行</span>
        </header>
        <textarea v-model="left" class="code" spellcheck="false" placeholder="粘贴原始文本" />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">修改后文本</span>
          <span class="pane-meta">{{ rightLines.length }} 行</span>
        </header>
        <textarea v-model="right" class="code" spellcheck="false" placeholder="粘贴修改后的文本" />
      </section>
    </div>

    <section class="result">
      <header>
        <span class="pane-title">对比结果</span>
        <span class="legend">
          <i class="lg add" /> 新增
          <i class="lg del" /> 删除
          <i class="lg chg" /> 修改
        </span>
      </header>

      <div v-if="!diffRows.length" class="empty">两侧都填入内容后这里显示逐行差异</div>

      <div v-else class="rows">
        <div v-for="(row, i) in diffRows" :key="i" class="row" :class="row.type">
          <span class="no">{{ row.leftNo }}</span>
          <code class="text left-text">{{ row.leftText }}</code>
          <span class="no">{{ row.rightNo }}</span>
          <code class="text right-text">{{ row.rightText }}</code>
        </div>
      </div>
    </section>

    <p class="hint">
      逐行对比（LCS 算法），左侧为删除/修改前，右侧为新增/修改后；
      「复制差异」输出 <code>-</code> / <code>+</code> 前缀的标准 diff 文本，可直接贴进 PR 或邮件。
    </p>
  </div>
</template>

<style scoped>
.diff {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
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
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.stat .add {
  color: var(--success);
}
.stat .del {
  color: var(--danger);
}
.stat .same {
  font-size: 10px;
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
.err-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--warn-soft);
  font-size: 11px;
  color: var(--warn);
}
.body {
  flex: none;
  height: 34%;
  display: flex;
  gap: 10px;
}
.pane {
  flex: 1;
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
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.code {
  flex: 1;
  min-height: 0;
  padding: 8px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.65;
}
.result {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.legend {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9.5px;
  color: var(--text-faint);
}
.lg {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  margin-left: 6px;
}
.lg.add {
  background: rgba(52, 199, 89, 0.45);
}
.lg.del {
  background: rgba(255, 59, 48, 0.35);
}
.lg.chg {
  background: rgba(255, 149, 0, 0.45);
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
.rows {
  flex: 1;
  min-height: 0;
  overflow: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.65;
}
.row {
  display: grid;
  grid-template-columns: 46px 1fr 46px 1fr;
  align-items: stretch;
}
.row .no {
  padding: 0 6px;
  text-align: right;
  color: var(--text-faint);
  font-size: 10px;
  background: var(--fill-1);
  border-right: 1px solid var(--border);
  user-select: none;
}
.text {
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
  min-width: 0;
}
.row.add .right-text {
  background: rgba(52, 199, 89, 0.14);
}
.row.del .left-text {
  background: rgba(255, 59, 48, 0.12);
}
.row.change .left-text {
  background: rgba(255, 149, 0, 0.14);
}
.row.change .right-text {
  background: rgba(255, 149, 0, 0.14);
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
