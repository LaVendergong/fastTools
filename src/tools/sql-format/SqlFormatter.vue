<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:sql-format'

const SAMPLE = `select u.id,u.name,u.email,count(o.id) as order_count from users u left join orders o on o.user_id=u.id where u.status='active' and u.created_at>'2024-01-01' group by u.id,u.name,u.email having count(o.id)>2 order by order_count desc limit 20;`

// 多词关键字先合成一个整体（用 \u0001 连接），避免被拆开处理
const MULTI = [
  'GROUP BY', 'ORDER BY', 'UNION ALL', 'INSERT INTO', 'DELETE FROM', 'REPLACE INTO',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'CREATE TABLE', 'CREATE INDEX', 'CREATE VIEW',
  'ALTER TABLE', 'DROP TABLE', 'DROP INDEX', 'DROP VIEW', 'PRIMARY KEY', 'FOREIGN KEY',
  'ON DUPLICATE KEY UPDATE', 'PARTITION BY', 'IS NOT NULL', 'IS NULL', 'NOT IN', 'NOT LIKE',
]

const LINE_START = [
  'SELECT', 'FROM', 'WHERE', 'GROUP\u0001BY', 'ORDER\u0001BY', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION\u0001ALL', 'UNION', 'INSERT\u0001INTO', 'REPLACE\u0001INTO', 'VALUES', 'UPDATE',
  'SET', 'DELETE\u0001FROM', 'WITH', 'CREATE\u0001TABLE', 'CREATE\u0001INDEX', 'CREATE\u0001VIEW',
  'ALTER\u0001TABLE', 'DROP\u0001TABLE', 'DROP\u0001INDEX', 'DROP\u0001VIEW',
  'LEFT\u0001OUTER\u0001JOIN', 'RIGHT\u0001OUTER\u0001JOIN', 'FULL\u0001OUTER\u0001JOIN',
  'LEFT\u0001JOIN', 'RIGHT\u0001JOIN', 'INNER\u0001JOIN', 'FULL\u0001JOIN', 'CROSS\u0001JOIN',
]

const SUB_INDENT = ['ON', 'AND', 'OR', 'HAVING']

const KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP\u0001BY', 'ORDER\u0001BY', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION\u0001ALL', 'UNION', 'INSERT\u0001INTO', 'REPLACE\u0001INTO', 'VALUES', 'UPDATE',
  'SET', 'DELETE\u0001FROM', 'WITH', 'AS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'IS', 'NULL', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'ASC', 'DESC', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'JOIN',
  'CREATE', 'TABLE', 'INDEX', 'VIEW', 'ALTER', 'DROP', 'ADD', 'COLUMN', 'PRIMARY', 'KEY',
  'FOREIGN', 'REFERENCES', 'DEFAULT', 'EXISTS', 'IF', 'TRUE', 'FALSE', 'USE', 'DATABASE',
  'PARTITION\u0001BY', 'IS\u0001NOT\u0001NULL', 'IS\u0001NULL', 'NOT\u0001IN', 'NOT\u0001LIKE',
]

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const input = ref(saved.input ?? SAMPLE)
const indentSize = ref(saved.indentSize ?? 2)
const upperKeywords = ref(saved.upperKeywords ?? true)
const commaBreak = ref(saved.commaBreak ?? true)
const blankBetween = ref(saved.blankBetween ?? true)
const copied = ref(false)

const PLACEHOLDER = (i) => `\u0002${i}\u0002`

function formatSql(sql, opts) {
  const { indent, upper, comma } = opts
  const pad = ' '.repeat(indent)

  // 1. 保护字符串 / 引号标识符 / 注释
  const literals = []
  let text = String(sql).replace(
    /('(?:[^']|'')*'|"(?:[^"]|"")*"|`(?:[^`]|``)*`|--[^\n]*|\/\*[\s\S]*?\*\/)/g,
    (m) => {
      literals.push(m)
      return PLACEHOLDER(literals.length - 1)
    },
  )

  // 2. 压缩空白
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return ''

  // 3. 多词关键字合体（保留原始大小写，交给后面的「关键字大写」开关决定）
  for (const kw of MULTI) {
    const re = new RegExp(kw.replace(/ /g, '\\s+'), 'gi')
    text = text.replace(re, (m) => m.replace(/\s+/g, '\u0001'))
  }

  // 4. 主关键字前换行（多词关键字内部此刻是 \u0001，匹配时也要认）
  const SEP = '[\\s\\u0001]+'
  const lineRe = new RegExp(
    `[\\s\\u0001]*(${LINE_START.map((k) => k.replace(/\u0001/g, SEP)).join('|')})[\\s\\u0001]*`,
    'gi',
  )
  text = text.replace(lineRe, (m, kw) => `\n${kw.replace(/[\s\u0001]+/g, '\u0001')} `)

  // 5. SELECT 列表里的顶层逗号换行（其他子句的逗号保持原样）
  if (comma) {
    const breakCommas = (body) => {
      let depth = 0
      let out = ''
      for (let i = 0; i < body.length; i++) {
        const ch = body[i]
        if (ch === '(') depth += 1
        else if (ch === ')') depth = Math.max(0, depth - 1)
        if (ch === ',' && depth === 0) out += ',\n'
        else out += ch
      }
      return out
    }
    text = text.replace(/SELECT([\s\S]*?)(?=\nFROM\b)/gi, (m, body) => `SELECT${breakCommas(body)}`)
  }

  // 6. 关键字大小写
  if (upper) {
    const kwRe = new RegExp(
      `\\b(${KEYWORDS.map((k) => k.replace(/\u0001/g, SEP)).join('|')})\\b`,
      'gi',
    )
    text = text.replace(kwRe, (m) =>
      m.replace(/[\s\u0001]+/g, ' ').toUpperCase().replace(/ /g, '\u0001'),
    )
  }

  // 7. 逐行整形
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  const out = []
  for (const line of lines) {
    const plain = line.replace(/\u0001/g, ' ')
    const upperPlain = plain.toUpperCase()

    const isLineStart = LINE_START.some((k) => {
      const kw = k.replace(/\u0001/g, ' ').toUpperCase()
      return upperPlain === kw || upperPlain.startsWith(`${kw} `)
    })
    const isSub = SUB_INDENT.some((kw) => {
      const upperKw = kw.toUpperCase()
      return upperPlain === upperKw || upperPlain.startsWith(`${upperKw} `)
    })

    if (isLineStart) {
      const kw = LINE_START.map((k) => k.replace(/\u0001/g, ' '))
        .sort((a, b) => b.length - a.length)
        .find((k) => upperPlain.startsWith(k.toUpperCase()))
      const head = plain.slice(0, kw.length)
      const rest = plain.slice(kw.length).trim()
      // SELECT / WITH 之类的长列表拆行更易读
      if (rest && (kw.toUpperCase() === 'SELECT' || kw.toUpperCase() === 'WITH')) {
        out.push(head)
        rest.split('\n').forEach((part) => {
          const trimmed = part.trim()
          if (trimmed) out.push(`${pad}${trimmed}`)
        })
      } else if (rest) {
        out.push(`${head} ${rest}`)
      } else {
        out.push(head)
      }
      continue
    }

    if (isSub) out.push(`${pad}${plain}`)
    else out.push(`${pad}${plain}`)
  }

  let result = out.join('\n')

  // 8. 恢复字面量
  result = result.replace(/\u0002(\d+)\u0002/g, (m, i) => literals[Number(i)] ?? m)

  // 9. 语句之间空行
  if (opts.blank) {
    result = result
      .split('\n')
      .map((line) => (line.trim().endsWith(';') ? `${line}\n` : line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
  }

  return result.trim()
}

const output = computed(() =>
  formatSql(input.value, {
    indent: Number(indentSize.value) || 2,
    upper: upperKeywords.value,
    comma: commaBreak.value,
    blank: blankBetween.value,
  }),
)

const stats = computed(() => ({
  inLines: input.value ? input.value.split('\n').length : 0,
  outLines: output.value ? output.value.split('\n').length : 0,
  statements: (output.value.match(/;/g) || []).length,
}))

/* ---------------- 操作 ---------------- */

function compress() {
  const text = input.value
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  input.value = text
}

async function copyOutput() {
  if (!output.value) return
  try {
    await navigator.clipboard.writeText(output.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 忽略 */
  }
}

function useOutput() {
  input.value = output.value
}

function loadSample() {
  input.value = SAMPLE
}

function clearAll() {
  input.value = ''
}

function downloadOutput() {
  if (!output.value) return
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'formatted.sql'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

let saveTimer = null
watch(
  [input, indentSize, upperKeywords, commaBreak, blankBetween],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          input: input.value,
          indentSize: indentSize.value,
          upperKeywords: upperKeywords.value,
          commaBreak: commaBreak.value,
          blankBetween: blankBetween.value,
        }),
      )
    }, 400)
  },
  { deep: true },
)

onMounted(() => {
  if (!input.value) input.value = SAMPLE
})
</script>

<template>
  <div class="sqlfmt">
    <div class="toolbar">
      <label class="opt">
        缩进
        <select v-model.number="indentSize" class="select">
          <option :value="2">2 空格</option>
          <option :value="4">4 空格</option>
        </select>
      </label>
      <label class="opt"><input v-model="upperKeywords" type="checkbox" />关键字大写</label>
      <label class="opt"><input v-model="commaBreak" type="checkbox" />逗号换行</label>
      <label class="opt"><input v-model="blankBetween" type="checkbox" />语句间空行</label>
      <span class="spacer" />
      <button class="btn" @click="compress">压缩</button>
      <button class="btn" @click="useOutput">结果作为输入</button>
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" @click="clearAll">清空</button>
      <button class="btn" :disabled="!output" @click="downloadOutput">下载</button>
      <button class="btn primary" :disabled="!output" @click="copyOutput">
        {{ copied ? '已复制' : '复制结果' }}
      </button>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">原始 SQL</span>
          <span class="pane-meta">{{ stats.inLines }} 行</span>
        </header>
        <textarea v-model="input" class="code" spellcheck="false" placeholder="粘贴 SQL 语句" />
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">格式化结果</span>
          <span class="pane-meta">
            {{ stats.outLines }} 行<template v-if="stats.statements"> · {{ stats.statements }} 条</template>
          </span>
        </header>
        <pre class="code output">{{ output || '（格式化结果会显示在这里）' }}</pre>
      </section>
    </div>

    <p class="hint">
      支持 SELECT / INSERT / UPDATE / DELETE / CREATE / JOIN 等常见语句；字符串、反引号标识符与注释会原样保留。
    </p>
  </div>
</template>

<style scoped>
.sqlfmt {
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
  gap: 10px;
  flex-wrap: wrap;
}
.opt {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  cursor: pointer;
}
.select {
  padding: 2px 5px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  font-size: 11px;
  outline: none;
}
.spacer {
  margin-left: auto;
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
.panes {
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
  font-size: 10.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
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
  line-height: 1.75;
  white-space: pre;
  overflow: auto;
}
.output {
  color: var(--text);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text-faint);
}
</style>
