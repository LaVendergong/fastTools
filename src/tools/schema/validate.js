/**
 * 轻量 JSON Schema 校验器（支持常用关键字，不追求完整规范）
 * 纯函数：validate(schema, data) → { valid, errors }
 */

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value, expected) {
  const actual = typeOf(value)
  if (expected === 'number') return actual === 'number' || actual === 'integer'
  if (expected === 'integer') return actual === 'integer'
  return actual === expected
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (typeof a !== 'object') return false

  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual(a[k], b[k]))
}

function joinPath(path, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}["${key}"]`
}

/**
 * @param {object} schema JSON Schema
 * @param {any} data 待校验数据
 * @param {{maxErrors?: number}} [options]
 * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
 */
export function validate(schema, data, options = {}) {
  const maxErrors = options.maxErrors ?? 50
  const errors = []

  const fail = (path, message) => {
    if (errors.length < maxErrors) errors.push({ path, message })
  }

  const walk = (sch, value, path) => {
    if (errors.length >= maxErrors) return
    if (!sch || typeof sch !== 'object' || Array.isArray(sch)) return

    // 组合关键字
    if (Array.isArray(sch.allOf)) {
      for (const sub of sch.allOf) walk(sub, value, path)
    }

    if (Array.isArray(sch.anyOf)) {
      const ok = sch.anyOf.some((sub) => validate(sub, value, { maxErrors: 1 }).valid)
      if (!ok) fail(path, '不满足 anyOf 中任何一个分支')
    }

    if (Array.isArray(sch.oneOf)) {
      const hits = sch.oneOf.filter((sub) => validate(sub, value, { maxErrors: 1 }).valid).length
      if (hits !== 1) fail(path, `oneOf 要求恰好匹配一个分支，实际匹配 ${hits} 个`)
    }

    if (sch.not && validate(sch.not, value, { maxErrors: 1 }).valid) {
      fail(path, '命中了 not 排除的规则')
    }

    // 类型
    if (sch.type) {
      const expected = Array.isArray(sch.type) ? sch.type : [sch.type]
      if (!expected.some((t) => matchesType(value, t))) {
        fail(path, `类型应为 ${expected.join(' / ')}，实际是 ${typeOf(value)}`)
        // 类型不符时后续关键字没意义，直接返回
        return
      }
    }

    // 枚举与常量
    if (Array.isArray(sch.enum) && !sch.enum.some((item) => deepEqual(item, value))) {
      fail(path, `取值必须是 ${sch.enum.map((v) => JSON.stringify(v)).join(' / ')} 之一`)
    }
    if ('const' in sch && !deepEqual(sch.const, value)) {
      fail(path, `取值必须等于 ${JSON.stringify(sch.const)}`)
    }

    // 数值
    if (typeof value === 'number') {
      if (typeof sch.minimum === 'number' && value < sch.minimum) {
        fail(path, `不能小于 ${sch.minimum}，实际 ${value}`)
      }
      if (typeof sch.maximum === 'number' && value > sch.maximum) {
        fail(path, `不能大于 ${sch.maximum}，实际 ${value}`)
      }
      if (typeof sch.exclusiveMinimum === 'number' && value <= sch.exclusiveMinimum) {
        fail(path, `必须大于 ${sch.exclusiveMinimum}`)
      }
      if (typeof sch.exclusiveMaximum === 'number' && value >= sch.exclusiveMaximum) {
        fail(path, `必须小于 ${sch.exclusiveMaximum}`)
      }
      if (typeof sch.multipleOf === 'number' && sch.multipleOf !== 0) {
        const rest = Math.abs(value % sch.multipleOf)
        if (rest > 1e-9 && Math.abs(rest - sch.multipleOf) > 1e-9) {
          fail(path, `必须是 ${sch.multipleOf} 的整数倍`)
        }
      }
    }

    // 字符串
    if (typeof value === 'string') {
      if (typeof sch.minLength === 'number' && value.length < sch.minLength) {
        fail(path, `长度不能少于 ${sch.minLength}，实际 ${value.length}`)
      }
      if (typeof sch.maxLength === 'number' && value.length > sch.maxLength) {
        fail(path, `长度不能超过 ${sch.maxLength}，实际 ${value.length}`)
      }
      if (typeof sch.pattern === 'string') {
        let re
        try {
          re = new RegExp(sch.pattern)
        } catch {
          re = null
        }
        if (re && !re.test(value)) fail(path, `不匹配模式 /${sch.pattern}/`)
      }
    }

    // 数组
    if (Array.isArray(value)) {
      if (typeof sch.minItems === 'number' && value.length < sch.minItems) {
        fail(path, `元素不能少于 ${sch.minItems} 个，实际 ${value.length}`)
      }
      if (typeof sch.maxItems === 'number' && value.length > sch.maxItems) {
        fail(path, `元素不能多于 ${sch.maxItems} 个，实际 ${value.length}`)
      }
      if (sch.uniqueItems === true) {
        const seen = new Set()
        value.forEach((item, i) => {
          const key = JSON.stringify(item)
          if (seen.has(key)) fail(`${path}[${i}]`, '数组元素重复')
          seen.add(key)
        })
      }
      if (sch.items && !Array.isArray(sch.items)) {
        value.forEach((item, i) => walk(sch.items, item, `${path}[${i}]`))
      }
      if (Array.isArray(sch.items)) {
        // 旧版元组写法
        value.forEach((item, i) => {
          if (sch.items[i]) walk(sch.items[i], item, `${path}[${i}]`)
        })
      }
    }

    // 对象
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value)

      if (Array.isArray(sch.required)) {
        for (const key of sch.required) {
          if (!(key in value)) fail(path, `缺少必填字段 ${key}`)
        }
      }

      const props = sch.properties || {}
      for (const key of keys) {
        if (props[key]) walk(props[key], value[key], joinPath(path, key))
      }

      if (sch.additionalProperties === false) {
        for (const key of keys) {
          if (!props[key]) fail(joinPath(path, key), '不允许的额外字段')
        }
      }

      const minProps = sch.minProperties
      const maxProps = sch.maxProperties
      if (typeof minProps === 'number' && keys.length < minProps) {
        fail(path, `字段数不能少于 ${minProps}`)
      }
      if (typeof maxProps === 'number' && keys.length > maxProps) {
        fail(path, `字段数不能多于 ${maxProps}`)
      }
    }
  }

  walk(schema, data, '$')
  return { valid: errors.length === 0, errors }
}

/** 从 JSON Schema 生成一份最小可用示例数据，方便快速试 */
export function sampleFromSchema(schema) {
  if (!schema || typeof schema !== 'object') return null

  if ('const' in schema) return schema.const
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]

  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type

  switch (type) {
    case 'object': {
      const out = {}
      const props = schema.properties || {}
      const required = Array.isArray(schema.required) ? schema.required : Object.keys(props)
      for (const key of required) {
        if (props[key]) out[key] = sampleFromSchema(props[key])
      }
      return out
    }
    case 'array':
      return schema.items && !Array.isArray(schema.items) ? [sampleFromSchema(schema.items)] : []
    case 'integer':
      return 0
    case 'number':
      return 0
    case 'boolean':
      return true
    case 'null':
      return null
    default:
      return 'string'
  }
}
