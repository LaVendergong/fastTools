/**
 * 把一段 JSON 拍平成「字段 / 类型 / 示例」的表格行，并生成 Markdown 文档
 */

export function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function sampleOf(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const text = value.length > 32 ? `${value.slice(0, 32)}…` : value
    return `"${text}"`
  }
  return String(value)
}

/**
 * @param {any} root 解析后的 JSON
 * @param {{maxDepth?: number, maxRows?: number}} [options]
 * @returns {{rows: Array<{path: string, type: string, sample: string, depth: number}>, truncated: boolean}}
 */
export function flattenFields(root, options = {}) {
  const maxDepth = options.maxDepth ?? 6
  const maxRows = options.maxRows ?? 500
  const rows = []
  let truncated = false

  const walk = (value, path, depth) => {
    if (rows.length >= maxRows) {
      truncated = true
      return
    }
    if (depth > maxDepth) {
      truncated = true
      return
    }

    const type = typeOf(value)

    if (type === 'object') {
      const keys = Object.keys(value || {})
      if (!keys.length) {
        if (path) rows.push({ path, type: 'object', sample: '{}', depth })
        return
      }
      if (path) rows.push({ path, type: 'object', sample: `{${keys.length} 个字段}`, depth })
      for (const key of keys) walk(value[key], path ? `${path}.${key}` : key, depth + 1)
      return
    }

    if (type === 'array') {
      const first = value[0]
      const itemType = value.length ? typeOf(first) : 'unknown'
      if (path) {
        // 元素是对象时用 path[] 作为父行，子字段再挂在它下面；
        // 元素是基础类型时字段本身就是数组，直接用 path
        const rowPath = itemType === 'object' ? `${path}[]` : path
        rows.push({ path: rowPath, type: `array<${itemType}>`, sample: `[${value.length} 项]`, depth })
      }
      if (itemType === 'object') {
        // 数组元素字段取并集：接口返回里每条可能缺字段
        const merged = {}
        for (const item of value) {
          for (const [k, v] of Object.entries(item)) {
            if (!(k in merged)) merged[k] = v
          }
        }
        for (const key of Object.keys(merged)) {
          walk(merged[key], `${path}[].${key}`, depth + 1)
        }
      }
      return
    }

    if (path) rows.push({ path, type, sample: sampleOf(value), depth })
  }

  walk(root, '', 0)
  return { rows, truncated }
}

/** 生成字段表格；withSample=false 时省略示例列 */
export function toMarkdownTable(rows, { withSample = true } = {}) {
  if (!rows.length) return '_（无字段）_\n'

  const header = withSample ? '| 字段 | 类型 | 示例 | 说明 |' : '| 字段 | 类型 | 说明 |'
  const divider = withSample ? '| --- | --- | --- | --- |' : '| --- | --- | --- |'

  const body = rows.map((row) => {
    // 顶层字段不缩进，每深一层加两个空格占位（最多 4 层）
    const indent = '&nbsp;&nbsp;'.repeat(Math.min(row.depth, 4))
    // 表格里的竖线会把列切断，必须转义
    const path = `${indent}\`${row.path.replace(/\|/g, '\\|')}\``
    const type = row.type.replace(/\|/g, '\\|')
    if (!withSample) return `| ${path} | ${type} |  |`
    const sample = row.sample.replace(/\|/g, '\\|')
    return `| ${path} | ${type} | ${sample} |  |`
  })

  return `${[header, divider, ...body].join('\n')}\n`
}

/**
 * 组装完整接口文档
 * @param {{name?, method?, url?, description?, params?, response?, withSample?}} doc
 */
export function buildMarkdown(doc) {
  const lines = []
  const name = (doc.name || '接口文档').trim()
  const method = (doc.method || 'GET').toUpperCase()
  const url = (doc.url || '').trim()

  lines.push(`## ${name}`)
  lines.push('')
  if (url) lines.push(`\`${method}\` ${url}`)
  if (doc.description?.trim()) {
    lines.push('')
    lines.push(doc.description.trim())
  }

  const sections = [
    { title: '请求参数', value: doc.params },
    { title: '响应字段', value: doc.response },
  ]

  for (const section of sections) {
    if (!section.value || !String(section.value).trim()) continue
    lines.push('')
    lines.push(`### ${section.title}`)
    lines.push('')

    let parsed
    try {
      parsed = JSON.parse(section.value)
    } catch (e) {
      lines.push(`> JSON 解析失败：${e.message}`)
      continue
    }

    const { rows, truncated } = flattenFields(parsed)
    lines.push(toMarkdownTable(rows, { withSample: doc.withSample !== false }).trimEnd())
    if (truncated) {
      lines.push('')
      lines.push('> 字段过多，仅列出前若干层/项。')
    }
  }

  lines.push('')
  return lines.join('\n')
}
