<script setup>
import { computed, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

const SAMPLE = `{
  "code": 0,
  "message": "ok",
  "data": {
    "total": 2,
    "page": 1,
    "list": [
      {
        "id": 1,
        "name": "张三",
        "role": "admin",
        "active": true,
        "tags": ["backend", "vue"],
        "profile": { "city": "杭州", "age": 28 }
      },
      {
        "id": 2,
        "name": "李四",
        "role": "user",
        "active": false,
        "profile": { "city": "上海" },
        "deletedAt": null
      }
    ]
  }
}`

const STORAGE_KEY = 'toolbox:json2ts'

const saved = readJSON(STORAGE_KEY)

const input = ref(saved.input ?? SAMPLE)
const rootName = ref(saved.rootName ?? 'Root')
const useExport = ref(saved.useExport ?? true)
const useInterface = ref(saved.useInterface ?? true)
const optionalOnMissing = ref(saved.optionalOnMissing ?? true)
const outputMode = ref(saved.outputMode ?? 'ts') // ts | schema | go | java | python
const packageName = ref(saved.packageName ?? 'com.example.domain')
const error = ref('')
const message = ref('')

/* ---------------- 类型推断 ---------------- */

const ANY = { kind: 'any' }

function infer(value) {
  if (value === null) return { kind: 'prim', type: 'null' }
  if (Array.isArray(value)) {
    if (!value.length) return { kind: 'array', elem: ANY }
    const elem = value.map(infer).reduce((acc, cur) => merge(acc, cur), null)
    return { kind: 'array', elem: elem || ANY }
  }
  if (typeof value === 'object') {
    const props = {}
    for (const [k, v] of Object.entries(value)) {
      props[k] = { desc: infer(v), optional: false }
    }
    return { kind: 'object', props }
  }
  const type = typeof value
  // 记录整数信息，Go / Java / Python 生成时用 int 而不是浮点
  return { kind: 'prim', type, int: type === 'number' ? Number.isInteger(value) : false }
}

function merge(a, b) {
  if (!a) return b
  if (!b) return a
  if (a.kind === 'any') return b
  if (b.kind === 'any') return a

  if (a.kind === 'prim' && b.kind === 'prim') {
    if (a.type === b.type) {
      return {
        kind: 'prim',
        type: a.type,
        int: a.type === 'number' ? Boolean(a.int && b.int) : false,
      }
    }
    return unionOf([a, b])
  }

  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', elem: merge(a.elem, b.elem) }
  }

  if (a.kind === 'object' && b.kind === 'object') {
    const props = {}
    const keys = new Set([...Object.keys(a.props), ...Object.keys(b.props)])
    for (const key of keys) {
      const pa = a.props[key]
      const pb = b.props[key]
      if (pa && pb) {
        props[key] = {
          desc: merge(pa.desc, pb.desc),
          optional: pa.optional || pb.optional,
        }
      } else {
        // 只在其中一侧出现 → 另一个对象没这个字段，标记为可选
        const only = pa || pb
        props[key] = { desc: only.desc, optional: optionalOnMissing.value }
      }
    }
    return { kind: 'object', props }
  }

  if (a.kind === 'union' || b.kind === 'union') {
    const list = [...(a.kind === 'union' ? a.types : [a]), ...(b.kind === 'union' ? b.types : [b])]
    return unionOf(list)
  }

  return unionOf([a, b])
}

function unionOf(types) {
  const flat = []
  const push = (t) => {
    if (t.kind === 'union') t.types.forEach(push)
    else flat.push(t)
  }
  types.forEach(push)

  // 去重（按签名）
  const seen = new Map()
  for (const t of flat) seen.set(sig(t), t)
  let list = [...seen.values()]

  // 习惯上把 null 放在联合类型末尾：Foo | null
  list = [...list.filter((t) => !(t.kind === 'prim' && t.type === 'null')), ...list.filter((t) => t.kind === 'prim' && t.type === 'null')]

  if (list.length === 1) return list[0]
  return { kind: 'union', types: list }
}

function sig(desc) {
  if (desc.kind === 'prim') return `p:${desc.type}`
  if (desc.kind === 'any') return 'any'
  if (desc.kind === 'array') return `a:${sig(desc.elem)}`
  if (desc.kind === 'union') return `u:${desc.types.map(sig).sort().join('|')}`
  const keys = Object.keys(desc.props).sort()
  return `o:{${keys.map((k) => `${k}${desc.props[k].optional ? '?' : ''}:${sig(desc.props[k].desc)}`).join(',')}}`
}

/* ---------------- 多语言结构体 ---------------- */

// 把描述树压成「带名字的类型表 + 语言无关的类型表达式」
function shapeOf(desc, hint, ctx) {
  if (!desc || desc.kind === 'any') return { k: 'any' }
  if (desc.kind === 'prim') return { k: 'prim', t: desc.type, int: Boolean(desc.int) }

  if (desc.kind === 'array') return { k: 'array', of: shapeOf(desc.elem, `${hint}Item`, ctx) }

  if (desc.kind === 'union') {
    const list = desc.types.map((t) => shapeOf(t, hint, ctx))
    const nonNull = list.filter((s) => !(s.k === 'prim' && s.t === 'null'))
    if (nonNull.length === 1) return { ...nonNull[0], nullable: true }
    return { k: 'union', list }
  }

  const signature = sig(desc)
  if (ctx.bySig.has(signature)) return { k: 'ref', name: ctx.bySig.get(signature) }

  let name = pascal(hint) || 'Item'
  if (ctx.used.has(name)) {
    const base = name
    let i = 2
    while (ctx.used.has(`${base}${i}`)) i += 1
    name = `${base}${i}`
  }
  ctx.used.add(name)
  ctx.bySig.set(signature, name)

  const entry = { name, fields: [] }
  ctx.types.push(entry)
  for (const [key, prop] of Object.entries(desc.props)) {
    entry.fields.push({
      key,
      optional: prop.optional,
      shape: shapeOf(prop.desc, key, ctx),
    })
  }
  return { k: 'ref', name }
}

function cap(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const GO_KEYWORDS = new Set([
  'type', 'func', 'range', 'select', 'case', 'default', 'defer', 'go', 'map', 'struct',
  'interface', 'chan', 'const', 'var', 'package', 'import', 'return', 'switch', 'for',
  'if', 'else', 'break', 'continue', 'goto',
])

// Go 习惯把常见缩写全大写：user_id → UserID
const GO_ACRONYMS = {
  id: 'ID',
  url: 'URL',
  uri: 'URI',
  api: 'API',
  http: 'HTTP',
  https: 'HTTPS',
  json: 'JSON',
  xml: 'XML',
  uuid: 'UUID',
  sql: 'SQL',
  ip: 'IP',
  io: 'IO',
  os: 'OS',
  ui: 'UI',
}

function goFieldName(key) {
  const parts = String(key).split(/[^a-zA-Z0-9]+/).filter(Boolean)
  let name =
    parts.map((p) => GO_ACRONYMS[p.toLowerCase()] || cap(p)).join('') || 'Field'
  if (/^\d/.test(name)) name = `F${name}`
  if (GO_KEYWORDS.has(name.toLowerCase())) name += 'F'
  return name
}

function goType(shape) {
  switch (shape.k) {
    case 'prim':
      if (shape.t === 'string') return 'string'
      if (shape.t === 'number') return shape.int ? 'int' : 'float64'
      if (shape.t === 'boolean') return 'bool'
      return 'any'
    case 'array':
      return `[]${goType(shape.of)}`
    case 'ref':
      return shape.name
    default:
      return 'any'
  }
}

function renderGo(ctx) {
  const blocks = ctx.types.map((t) => {
    const lines = t.fields.map((f) => {
      let type = goType(f.shape)
      // 数据里明确出现过 null 的，用指针区分零值
      if (f.shape.nullable && f.shape.k === 'prim') type = `*${type}`
      const tag = `json:"${f.key}${f.optional ? ',omitempty' : ''}"`
      return `\t${goFieldName(f.key)} ${type} \`${tag}\``
    })
    return `type ${t.name} struct {\n${lines.join('\n')}\n}`
  })
  return `${blocks.join('\n\n')}\n`
}

const JAVA_KEYWORDS = new Set([
  'class', 'interface', 'enum', 'public', 'private', 'protected', 'static', 'final', 'void',
  'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short', 'if', 'else', 'for',
  'while', 'return', 'new', 'this', 'super', 'extends', 'implements', 'package', 'import',
  'abstract', 'synchronized', 'volatile', 'transient', 'native', 'instanceof', 'switch',
  'case', 'default', 'do', 'try', 'catch', 'finally', 'throw', 'throws', 'null', 'true', 'false',
])

function camelName(key) {
  const parts = String(key).split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (!parts.length) return 'value'
  let name = parts
    .map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : cap(p)))
    .join('')
  if (/^\d/.test(name)) name = `v${name}`
  if (JAVA_KEYWORDS.has(name)) name += 'Value'
  return name
}

function javaType(shape) {
  switch (shape.k) {
    case 'prim':
      if (shape.t === 'string') return 'String'
      if (shape.t === 'number') return shape.int ? 'Integer' : 'Double'
      if (shape.t === 'boolean') return 'Boolean'
      return 'Object'
    case 'array':
      return `List<${javaType(shape.of)}>`
    case 'ref':
      return shape.name
    default:
      return 'Object'
  }
}

function renderJava(ctx, pkg) {
  const usesList = JSON.stringify(ctx.types).includes('"k":"array"')
  const imports = ['lombok.Data']
  if (usesList) imports.push('java.util.List')

  // java.* 放前面，空一行再放第三方
  const javaImports = imports.filter((i) => i.startsWith('java.')).sort()
  const otherImports = imports.filter((i) => !i.startsWith('java.')).sort()

  const header = [
    pkg ? `package ${pkg};` : '',
    '',
    ...otherImports.map((i) => `import ${i};`),
    ...(javaImports.length ? ['', ...javaImports.map((i) => `import ${i};`)] : []),
    '',
  ]
    .filter((line, i) => line !== '' || i > 0)
    .join('\n')

  const blocks = ctx.types.map((t) => {
    const lines = t.fields.map(
      (f) => `    /** ${f.key} */\n    private ${javaType(f.shape)} ${camelName(f.key)};`,
    )
    return `@Data\npublic class ${t.name} {\n${lines.join('\n\n')}\n}`
  })

  return `${header}\n${blocks.join('\n\n')}\n`
}

const PY_KEYWORDS = new Set([
  'class', 'def', 'return', 'if', 'else', 'elif', 'for', 'while', 'import', 'from', 'as',
  'pass', 'break', 'continue', 'try', 'except', 'finally', 'with', 'lambda', 'global',
  'nonlocal', 'assert', 'del', 'raise', 'yield', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is',
])

function snakeName(key) {
  let name = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  if (!name) name = 'value'
  if (/^\d/.test(name)) name = `v_${name}`
  if (PY_KEYWORDS.has(name)) name += '_'
  return name
}

function pyType(shape) {
  switch (shape.k) {
    case 'prim':
      if (shape.t === 'string') return 'str'
      if (shape.t === 'number') return shape.int ? 'int' : 'float'
      if (shape.t === 'boolean') return 'bool'
      return 'Any'
    case 'array':
      return `List[${pyType(shape.of)}]`
    case 'ref':
      return shape.name
    default:
      return 'Any'
  }
}

function renderPython(ctx) {
  const text = JSON.stringify(ctx.types)
  const typing = ['Any']
  if (text.includes('"k":"array"')) typing.push('List')
  if (text.includes('"optional":true') || text.includes('"nullable":true')) typing.push('Optional')

  const blocks = ctx.types.map((t) => {
    const lines = t.fields.map((f) => {
      let type = pyType(f.shape)
      if (f.optional || f.shape.nullable) type = `Optional[${type}]`
      const name = snakeName(f.key)
      return f.optional ? `    ${name}: ${type} = None` : `    ${name}: ${type}`
    })
    return `@dataclass\nclass ${t.name}:\n${lines.join('\n')}`
  })

  return [
    'from __future__ import annotations',
    '',
    'from dataclasses import dataclass',
    `from typing import ${typing.join(', ')}`,
    '',
    '',
    blocks.join('\n\n\n'),
    '',
  ].join('\n')
}

/* ---------------- 生成 TypeScript ---------------- */

function pascal(text) {
  const cleaned = String(text).replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  if (!cleaned) return 'Item'
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

function build(desc, hint, ctx) {
  // 返回类型表达式字符串；嵌套对象会登记为独立 interface
  if (desc.kind === 'prim') {
    if (desc.type === 'null') return 'null'
    if (desc.type === 'undefined') return 'undefined'
    return desc.type === 'bigint' ? 'bigint' : desc.type
  }
  if (desc.kind === 'any') return 'unknown'

  if (desc.kind === 'union') {
    const parts = desc.types.map((t) => build(t, hint, ctx))
    return [...new Set(parts)].join(' | ')
  }

  if (desc.kind === 'array') {
    const inner = build(desc.elem, `${hint}Item`, ctx)
    const wrapped = desc.elem.kind === 'union' ? `(${inner})` : inner
    return `${wrapped}[]`
  }

  // object
  const signature = sig(desc)
  if (ctx.bySig.has(signature)) return ctx.bySig.get(signature)

  let name = pascal(hint) || 'Item'
  if (ctx.usedNames.has(name)) {
    // 同名不同结构 → 加序号
    let i = 2
    const base = name
    while (ctx.usedNames.has(`${base}${i}`)) i += 1
    name = `${base}${i}`
  }
  ctx.usedNames.add(name)
  ctx.bySig.set(signature, name)

  // 占位，先登记名字再展开，避免自引用时死循环
  const entry = { name, body: '' }
  ctx.interfaces.push(entry)

  const keys = Object.keys(desc.props)
  if (!keys.length) {
    entry.body = `  [key: string]: unknown`
    return name
  }

  const lines = []
  for (const key of keys) {
    const prop = desc.props[key]
    const valueType = build(prop.desc, key, ctx)
    const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
    lines.push(`  ${safeKey}${prop.optional ? '?' : ''}: ${valueType}`)
  }
  entry.body = lines.join('\n')
  return name
}

const output = computed(() => {
  error.value = ''
  if (!input.value.trim()) return ''

  let data
  try {
    data = JSON.parse(input.value)
  } catch (e) {
    error.value = e.message
    return ''
  }

  const desc = infer(data)

  // Go / Java / Python 用同一棵树，换成各自语言的渲染器
  if (['go', 'java', 'python'].includes(outputMode.value)) {
    const shapeCtx = { types: [], bySig: new Map(), used: new Set() }
    shapeOf(desc, rootName.value || 'Root', shapeCtx)
    if (outputMode.value === 'go') return renderGo(shapeCtx)
    if (outputMode.value === 'java') return renderJava(shapeCtx, packageName.value)
    return renderPython(shapeCtx)
  }

  const ctx = { interfaces: [], bySig: new Map(), usedNames: new Set() }
  const rootType = build(desc, rootName.value || 'Root', ctx)

  // 根节点是对象时，直接用它作为主接口名，而不是再包一层
  const blocks = []

  if (desc.kind === 'object' && ctx.interfaces.length) {
    const first = ctx.interfaces.find((i) => i.name === rootType)
    if (first) {
      const idx = ctx.interfaces.indexOf(first)
      ctx.interfaces.splice(idx, 1)
      ctx.interfaces.unshift(first)
    }
  }

  for (const item of ctx.interfaces) {
    const head = useInterface.value ? `interface ${item.name}` : `type ${item.name} =`
    const prefix = useExport.value ? 'export ' : ''
    blocks.push(`${prefix}${head} {\n${item.body}\n}`)
  }

  // 根类型不是对象（数组/标量）时补一条别名
  if (desc.kind !== 'object') {
    blocks.push(`${useExport.value ? 'export ' : ''}type ${rootName.value || 'Root'} = ${rootType}`)
  }

  return blocks.join('\n\n') + '\n'
})

/* ---------------- JSON Schema ---------------- */

function toSchema(desc) {
  if (!desc || desc.kind === 'any') return {}
  if (desc.kind === 'prim') return { type: desc.type === 'null' ? 'null' : desc.type }
  if (desc.kind === 'union') return { anyOf: desc.types.map(toSchema) }
  if (desc.kind === 'array') return { type: 'array', items: toSchema(desc.elem) }

  const properties = {}
  const required = []
  for (const [key, prop] of Object.entries(desc.props)) {
    properties[key] = toSchema(prop.desc)
    if (!prop.optional) required.push(key)
  }
  const schema = { type: 'object', properties }
  if (required.length) schema.required = required
  return schema
}

const schemaText = computed(() => {
  if (!input.value.trim() || outputMode.value !== 'schema') return ''
  try {
    const data = JSON.parse(input.value)
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: rootName.value || 'Root',
      ...toSchema(infer(data)),
    }
    return JSON.stringify(schema, null, 2)
  } catch {
    return ''
  }
})

const displayText = computed(() => (outputMode.value === 'schema' ? schemaText.value : output.value))

const stats = computed(() => {
  const text = displayText.value
  const count =
    outputMode.value === 'schema'
      ? (text.match(/"(required|properties)"/g) || []).length
      : (text.match(/^(export )?(interface|type) /gm) || []).length
  const lines = text.split('\n').filter(Boolean).length
  return { count, lines }
})

/* ---------------- 操作 ---------------- */


const MODE_INFO = {
  ts: { label: 'TypeScript', file: 'types.ts', ext: '.ts' },
  go: { label: 'Go', file: 'models.go', ext: '.go' },
  java: { label: 'Java', file: 'Models.java', ext: '.java' },
  python: { label: 'Python', file: 'models.py', ext: '.py' },
  schema: { label: 'JSON Schema', file: 'schema.json', ext: '.json' },
}

const currentMode = computed(() => MODE_INFO[outputMode.value] || MODE_INFO.ts)

const downloadLabel = computed(() => `下载 ${currentMode.value.ext}`)

function download() {
  if (!displayText.value) return
  const blob = new Blob([displayText.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = currentMode.value.file
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function formatInput() {
  try {
    input.value = JSON.stringify(JSON.parse(input.value), null, 2)
    message.value = '已格式化'
  } catch (e) {
    error.value = e.message
  }
  setTimeout(() => {
    if (message.value === '已格式化') message.value = ''
  }, 1500)
}

function loadSample() {
  input.value = SAMPLE
  rootName.value = 'Root'
}

let saveTimer = null
watch(
  [input, rootName, useExport, useInterface, optionalOnMissing, outputMode, packageName],
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          input: input.value,
          rootName: rootName.value,
          useExport: useExport.value,
          useInterface: useInterface.value,
          optionalOnMissing: optionalOnMissing.value,
          outputMode: outputMode.value,
          packageName: packageName.value,
        }),
      )
    }, 400)
  },
  { deep: true },
)
</script>

<template>
  <div class="j2t">
    <div class="toolbar">
      <label class="opt">
        输出
        <select v-model="outputMode" class="mode-select">
          <option value="ts">TypeScript</option>
          <option value="go">Go</option>
          <option value="java">Java</option>
          <option value="python">Python</option>
          <option value="schema">JSON Schema</option>
        </select>
      </label>
      <label class="opt">
        根类型
        <input v-model="rootName" class="name-input" spellcheck="false" placeholder="Root" />
      </label>
      <label v-if="outputMode === 'java'" class="opt">
        包名
        <input v-model="packageName" class="pkg-input" spellcheck="false" />
      </label>
      <template v-if="outputMode === 'ts'">
        <label class="chk">
          <input v-model="useExport" type="checkbox" />
          export
        </label>
        <label class="chk">
          <input v-model="useInterface" type="checkbox" />
          interface（否则 type）
        </label>
      </template>
      <label class="chk" title="数组里某个对象缺字段时，该字段标记为可选">
        <input v-model="optionalOnMissing" type="checkbox" />
        缺字段标 ?
      </label>

      <span class="spacer" />
      <span class="stat">{{ stats.lines }} 行</span>
      <button class="btn" :disabled="!displayText" @click="download">{{ downloadLabel }}</button>
      <button class="btn primary" :disabled="!displayText" @click="copy">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>

    <div class="panes">
      <section class="pane">
        <header>
          <span class="pane-title">JSON</span>
          <button class="link" @click="formatInput">格式化</button>
          <button class="link" @click="loadSample">示例</button>
        </header>
        <textarea
          v-model="input"
          class="code"
          spellcheck="false"
          placeholder="粘贴接口返回的 JSON，右侧自动生成类型定义"
        />
        <p v-if="error" class="err-bar">{{ error }}</p>
        <p v-if="message" class="msg">{{ message }}</p>
      </section>

      <section class="pane">
        <header>
          <span class="pane-title">{{ currentMode.label }}</span>
          <span class="pane-meta">{{ currentMode.file }}</span>
        </header>
        <pre class="code out">{{ displayText || '（结果会显示在这里）' }}</pre>
      </section>
    </div>

    <p class="hint">
      数组会合并所有元素的字段：某字段只在部分元素里出现时标记为 <code>?</code>；
      不同类型的同名字段合并成联合类型（<code>string | number</code>）；
      结构相同的对象复用同一个 interface。全部本地解析，不上传。
    </p>
  </div>
</template>

<style scoped>
.j2t {
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
  gap: 9px;
  flex-wrap: wrap;
}
.opt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
}
.name-input {
  width: 88px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.name-input:focus {
  border-color: var(--accent);
}
.mode-select {
  padding: 3px 7px;
  border: 1px solid var(--accent);
  border-radius: 5px;
  background: var(--panel-bg);
  color: var(--accent);
  outline: none;
  font-size: 11px;
}
.pkg-input {
  width: 140px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
}
.pkg-input:focus {
  border-color: var(--accent);
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
  font-size: 10px;
  color: var(--text-faint);
  white-space: nowrap;
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
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  color: var(--text-faint);
}
.link {
  margin-left: auto;
  font-size: 10px;
  color: var(--accent);
}
.link + .link {
  margin-left: 8px;
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
.out {
  white-space: pre;
}
.err-bar {
  flex: none;
  margin: 0;
  padding: 5px 10px;
  border-top: 1px solid var(--border);
  background: var(--danger-soft);
  font-size: 10.5px;
  color: var(--danger);
}
.msg {
  flex: none;
  margin: 0;
  padding: 5px 10px;
  border-top: 1px solid var(--border);
  font-size: 10.5px;
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
