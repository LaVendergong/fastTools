<script setup>
import { computed, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'

const { copied, copy: copyText } = useCopy()

const SAMPLE = `CREATE TABLE \`sys_user\` (
  \`user_id\` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  \`dept_id\` bigint(20) DEFAULT NULL COMMENT '部门ID',
  \`user_name\` varchar(30) NOT NULL COMMENT '用户账号',
  \`nick_name\` varchar(30) NOT NULL COMMENT '用户昵称',
  \`email\` varchar(50) DEFAULT '' COMMENT '用户邮箱',
  \`phone\` varchar(11) DEFAULT '' COMMENT '手机号码',
  \`status\` char(1) DEFAULT '0' COMMENT '帐号状态（0正常 1停用）',
  \`balance\` decimal(10,2) DEFAULT 0.00 COMMENT '账户余额',
  \`create_time\` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (\`user_id\`)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='用户信息表';`

const STORAGE_KEY = 'toolbox:sqlcode'

const saved = readJSON(STORAGE_KEY)

const ddl = ref(saved.ddl ?? SAMPLE)
const pkg = ref(saved.pkg ?? 'com.ruoyi.system.domain')
const prefix = ref(saved.prefix ?? 'sys_')
const className = ref(saved.className ?? '')
const tab = ref('entity')
const error = ref('')

/* ---------------- DDL 解析 ---------------- */

function splitColumns(body) {
  const parts = []
  let depth = 0
  let current = ''
  let quote = ''
  for (const ch of body) {
    if (quote) {
      current += ch
      if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      current += ch
      continue
    }
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

const JAVA_TYPES = {
  bigint: 'Long',
  int: 'Integer',
  integer: 'Integer',
  mediumint: 'Integer',
  smallint: 'Integer',
  tinyint: 'Integer',
  bit: 'Boolean',
  boolean: 'Boolean',
  bool: 'Boolean',
  decimal: 'BigDecimal',
  numeric: 'BigDecimal',
  double: 'Double',
  float: 'Float',
  real: 'Double',
  date: 'Date',
  datetime: 'Date',
  timestamp: 'Date',
  time: 'Date',
  year: 'Integer',
  char: 'String',
  varchar: 'String',
  tinytext: 'String',
  text: 'String',
  mediumtext: 'String',
  longtext: 'String',
  enum: 'String',
  set: 'String',
  json: 'String',
  blob: 'byte[]',
  longblob: 'byte[]',
}

const parsed = computed(() => {
  error.value = ''
  const text = ddl.value
  if (!text.trim()) return null

  const tableMatch = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"']?[\w.]+[`"']?)/i.exec(text)
  if (!tableMatch) {
    error.value = '没找到 CREATE TABLE 语句'
    return null
  }

  const rawTable = tableMatch[1].replace(/[`"']/g, '')
  const tableName = rawTable.split('.').pop()

  const open = text.indexOf('(', tableMatch.index)
  if (open < 0) {
    error.value = '建表语句缺少括号'
    return null
  }

  let depth = 0
  let close = -1
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close < 0) {
    error.value = '建表语句括号不匹配'
    return null
  }

  // 表注释在右括号之后（ENGINE=... COMMENT='用户信息表'），不能取成列注释
  const tableComment = /comment\s*=?\s*'([^']*)'/i.exec(text.slice(close + 1))?.[1] || ''

  const body = text.slice(open + 1, close)
  const columns = []
  const primaryKeys = new Set()

  for (const raw of splitColumns(body)) {
    const line = raw.trim()
    if (!line) continue

    const pk = /^primary\s+key\s*\(([^)]*)\)/i.exec(line)
    if (pk) {
      pk[1]
        .split(',')
        .map((s) => s.replace(/[`"'\s]/g, ''))
        .filter(Boolean)
        .forEach((c) => primaryKeys.add(c))
      continue
    }
    if (/^(unique|key|index|constraint|foreign|check)\b/i.test(line)) continue

    const m = /^[`"']?([\w$]+)[`"']?\s+([a-zA-Z]+)(?:\s*\(([^)]*)\))?([\s\S]*)$/.exec(line)
    if (!m) continue

    const [, name, rawType, len, rest] = m
    const type = rawType.toLowerCase()
    const comment = /comment\s+'([^']*)'/i.exec(rest)?.[1] || ''
    const isNull = !/not\s+null/i.test(rest)
    const auto = /auto_increment/i.test(rest)
    const def = /default\s+('([^']*)'|[\w.()]+)/i.exec(rest)?.[2] ?? (/default\s+([\w.]+)/i.exec(rest)?.[1] || '')

    columns.push({
      name,
      type,
      len: len || '',
      comment,
      nullable: isNull,
      auto,
      default: def,
      javaType: JAVA_TYPES[type] || 'String',
    })
  }

  columns.forEach((c) => {
    if (primaryKeys.has(c.name)) c.primary = true
  })

  return { tableName, tableComment, columns }
})

/* ---------------- 命名 ---------------- */

function pascal(text) {
  const cleaned = String(text).replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  if (!cleaned) return 'Entity'
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

function camel(text) {
  const p = pascal(text)
  return p.charAt(0).toLowerCase() + p.slice(1)
}

const entityName = computed(() => {
  if (!parsed.value) return 'Entity'
  if (className.value.trim()) return className.value.trim()
  let base = parsed.value.tableName
  const p = prefix.value.trim()
  if (p && base.toLowerCase().startsWith(p.toLowerCase())) base = base.slice(p.length)
  return pascal(base)
})

const pkColumn = computed(() => parsed.value?.columns.find((c) => c.primary || c.auto) || null)

const AUDIT = new Set(['create_by', 'create_time', 'update_by', 'update_time', 'del_flag', 'remark'])

/* ---------------- 生成代码 ---------------- */

const entityCode = computed(() => {
  const info = parsed.value
  if (!info) return ''
  const name = entityName.value
  const needsBigDecimal = info.columns.some((c) => c.javaType === 'BigDecimal')
  const needsDate = info.columns.some((c) => c.javaType === 'Date')

  const imports = ['lombok.Data']
  if (needsBigDecimal) imports.push('java.math.BigDecimal')
  if (needsDate) imports.push('java.util.Date')

  const fields = info.columns.map((c) => {
    const comment = c.comment || c.name
    return `    /** ${comment} */\n    private ${c.javaType} ${camel(c.name)};`
  })

  return [
    `package ${pkg.value};`,
    '',
    ...imports.map((i) => `import ${i};`),
    '',
    '/**',
    ` * ${info.tableComment || info.tableName} 实体类`,
    ' */',
    '@Data',
    `public class ${name} {`,
    '',
    fields.join('\n\n'),
    '}',
    '',
  ].join('\n')
})

const mapperCode = computed(() => {
  const info = parsed.value
  if (!info) return ''
  const name = entityName.value
  const pk = pkColumn.value
  const pkType = pk ? pk.javaType : 'Long'
  const pkName = pk ? camel(pk.name) : 'id'

  return [
    `package ${pkg.value.replace(/\.domain$/, '.mapper')};`,
    '',
    'import org.apache.ibatis.annotations.Mapper;',
    'import org.apache.ibatis.annotations.Param;',
    `import ${pkg.value}.${name};`,
    '',
    'import java.util.List;',
    '',
    '@Mapper',
    `public interface ${name}Mapper {`,
    '',
    '    /** 条件查询列表 */',
    `    List<${name}> selectList(${name} query);`,
    '',
    '    /** 按主键查询 */',
    `    ${name} selectById(@Param("${pkName}") ${pkType} ${pkName});`,
    '',
    '    /** 新增 */',
    `    int insert(${name} record);`,
    '',
    '    /** 修改 */',
    `    int update(${name} record);`,
    '',
    '    /** 批量删除 */',
    `    int deleteByIds(@Param("ids") ${pkType}[] ids);`,
    '}',
    '',
  ].join('\n')
})

const vueCode = computed(() => {
  const info = parsed.value
  if (!info) return ''
  const name = entityName.value
  const pk = pkColumn.value
  const pkName = pk ? camel(pk.name) : 'id'

  const searchCols = info.columns
    .filter((c) => c.javaType === 'String' && !AUDIT.has(c.name))
    .slice(0, 3)

  const tableCols = info.columns.filter((c) => !AUDIT.has(c.name) || c.name === 'create_time')
  const formCols = info.columns.filter((c) => !c.primary && !c.auto && !AUDIT.has(c.name))

  const colLines = tableCols
    .map(
      (c) =>
        `      <el-table-column prop="${camel(c.name)}" label="${c.comment || c.name}"${
          c.len && Number(c.len) > 60 ? ' show-overflow-tooltip' : ''
        } />`,
    )
    .join('\n')

  const searchLines = searchCols
    .map(
      (c) => `      <el-form-item label="${c.comment || c.name}" prop="${camel(c.name)}">
        <el-input v-model="queryParams.${camel(c.name)}" placeholder="请输入${c.comment || c.name}" clearable
          @keyup.enter="handleQuery" />
      </el-form-item>`,
    )
    .join('\n')

  const formLines = formCols
    .map(
      (c) => `        <el-form-item label="${c.comment || c.name}" prop="${camel(c.name)}">
          <el-input v-model="form.${camel(c.name)}" placeholder="请输入${c.comment || c.name}" />
        </el-form-item>`,
    )
    .join('\n')

  const queryInit = searchCols.map((c) => `  ${camel(c.name)}: ''`).join(',\n')
  const formInit = formCols
    .map((c) => `  ${camel(c.name)}: ${c.javaType === 'String' ? "''" : 'undefined'}`)
    .join(',\n')

  return `<template>
  <div class="app-container">
    <el-form ref="queryRef" :model="queryParams" :inline="true">
${searchLines}
      <el-form-item>
        <el-button type="primary" @click="handleQuery">搜索</el-button>
        <el-button @click="resetQuery">重置</el-button>
        <el-button type="success" @click="handleAdd">新增</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="list" border>
${colLines}
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleEdit(row)">修改</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="queryParams.pageNum"
      v-model:page-size="queryParams.pageSize"
      :total="total"
      :page-sizes="[10, 20, 50]"
      layout="total, sizes, prev, pager, next"
      class="pager"
      @change="getList"
    />

    <el-dialog v-model="open" :title="form.${pkName} ? '修改' : '新增'" width="620px">
      <el-form ref="formRef" :model="form" label-width="110px">
${formLines}
      </el-form>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" @click="submitForm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import request from '@/utils/request'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const open = ref(false)

const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
${queryInit}
})

const form = reactive({
${formInit}
})

async function getList() {
  loading.value = true
  try {
    const res = await request({ url: '/${info.tableName}/list', method: 'get', params: queryParams })
    list.value = res.rows || res.data || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  queryParams.pageNum = 1
  getList()
}

function resetQuery() {
${searchCols.map((c) => `  queryParams.${camel(c.name)} = ''`).join('\n')}
  handleQuery()
}

function resetForm() {
  Object.assign(form, {
${formInit}
  })
}

function handleAdd() {
  resetForm()
  open.value = true
}

function handleEdit(row) {
  resetForm()
  Object.assign(form, row)
  open.value = true
}

async function submitForm() {
  const isEdit = Boolean(form.${pkName})
  await request({
    url: \`/${info.tableName}\${isEdit ? '/' + form.${pkName} : ''}\`,
    method: isEdit ? 'put' : 'post',
    data: form,
  })
  open.value = false
  getList()
}

async function handleDelete(row) {
  await request({ url: \`/${info.tableName}/\${row.${pkName}}\`, method: 'delete' })
  getList()
}

onMounted(getList)
<\/script>

<style scoped>
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
`
})

const TABS = [
  { id: 'entity', name: 'Java 实体', file: 'Entity.java' },
  { id: 'mapper', name: 'Mapper', file: 'Mapper.java' },
  { id: 'vue', name: 'Vue 页面', file: 'index.vue' },
]

const currentCode = computed(() => {
  if (tab.value === 'entity') return entityCode.value
  if (tab.value === 'mapper') return mapperCode.value
  return vueCode.value
})

const stats = computed(() => ({
  columns: parsed.value?.columns.length || 0,
  lines: currentCode.value.split('\n').length,
}))

/* ---------------- 操作 ---------------- */

// 模板里是 @click="copy"，不带参数，这里包一层取当前代码
function copy() {
  if (!currentCode.value) return
  copyText(currentCode.value, 'code')
}

function download() {
  if (!currentCode.value) return
  const tabInfo = TABS.find((t) => t.id === tab.value)
  const suffix =
    tab.value === 'entity'
      ? `${entityName.value}.java`
      : tab.value === 'mapper'
        ? `${entityName.value}Mapper.java`
        : 'index.vue'
  const blob = new Blob([currentCode.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = suffix || tabInfo.file
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function loadSample() {
  ddl.value = SAMPLE
  className.value = ''
}

let saveTimer = null
watch(
  [ddl, pkg, prefix, className],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ddl: ddl.value,
          pkg: pkg.value,
          prefix: prefix.value,
          className: className.value,
        }),
      )
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="sql2c">
    <div class="toolbar">
      <span class="label">建表语句</span>
      <span v-if="parsed" class="meta">
        {{ parsed.tableName }} · {{ parsed.columns.length }} 列 · 实体 {{ entityName }}
      </span>

      <span class="spacer" />
      <label class="opt">
        包名
        <input v-model="pkg" class="tiny-input wide" spellcheck="false" />
      </label>
      <label class="opt">
        表前缀
        <input v-model="prefix" class="tiny-input" placeholder="sys_" spellcheck="false" />
      </label>
      <label class="opt">
        类名
        <input v-model="className" class="tiny-input" :placeholder="entityName" spellcheck="false" />
      </label>
      <button class="btn" @click="loadSample">示例</button>
      <button class="btn" :disabled="!currentCode" @click="download">下载</button>
      <button class="btn primary" :disabled="!currentCode" @click="copy">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>

    <p v-if="error" class="err-bar">{{ error }}</p>

    <div class="body">
      <section class="pane">
        <header>
          <span class="pane-title">CREATE TABLE</span>
          <span class="pane-meta">粘贴 MySQL 建表语句</span>
        </header>
        <textarea v-model="ddl" class="code" spellcheck="false" placeholder="CREATE TABLE ..." />
      </section>

      <section class="pane">
        <header class="tabs">
          <button
            v-for="t in TABS"
            :key="t.id"
            :class="{ on: tab === t.id }"
            @click="tab = t.id"
          >
            {{ t.name }}
          </button>
          <span class="pane-meta">{{ stats.lines }} 行</span>
        </header>
        <pre class="code out">{{ currentCode || '（解析后显示生成的代码）' }}</pre>
      </section>
    </div>

    <p class="hint">
      解析 MySQL DDL：列名、类型、注释、可空、自增、主键都会识别。
      实体默认用 Lombok <code>@Data</code>；Mapper 是 MyBatis 注解接口；Vue 页面基于 Element Plus，
      接口路径按 <code>/表名/list</code> 生成，请按项目实际调整。
    </p>
  </div>
</template>

<style scoped>
.sql2c {
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
.label {
  font-size: 11px;
  color: var(--text-dim);
}
.meta {
  font-size: 10px;
  color: var(--text-faint);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.spacer {
  margin-left: auto;
}
.opt {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.tiny-input {
  width: 72px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.tiny-input.wide {
  width: 170px;
}
.tiny-input:focus {
  border-color: var(--accent);
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
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1.15fr;
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
.tabs button {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.tabs button.on {
  background: var(--panel-bg);
  color: var(--accent);
  font-weight: 500;
  box-shadow: var(--shadow-1);
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
  white-space: pre;
  overflow: auto;
}
.out {
  white-space: pre;
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
