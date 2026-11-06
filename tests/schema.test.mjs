// JSON Schema 校验器
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sampleFromSchema, validate } from '../src/tools/schema/validate.js'

const ok = (schema, data) => validate(schema, data).valid
const errorsOf = (schema, data) => validate(schema, data).errors

test('type：基础类型与整数区分', () => {
  assert.ok(ok({ type: 'string' }, 'a'))
  assert.ok(!ok({ type: 'string' }, 1))
  assert.ok(ok({ type: 'integer' }, 3))
  assert.ok(!ok({ type: 'integer' }, 3.5))
  assert.ok(ok({ type: 'number' }, 3.5))
  assert.ok(ok({ type: 'number' }, 3))
  assert.ok(ok({ type: ['string', 'null'] }, null))
  assert.ok(!ok({ type: ['string', 'null'] }, 1))
})

test('required：缺字段报出父路径与字段名', () => {
  const errors = errorsOf({ type: 'object', required: ['a', 'b'] }, { a: 1 })
  assert.equal(errors.length, 1)
  assert.equal(errors[0].path, '$')
  assert.match(errors[0].message, /b/)
})

test('properties：嵌套错误路径可定位', () => {
  const schema = {
    type: 'object',
    properties: { data: { type: 'object', properties: { id: { type: 'integer' } } } },
  }
  const errors = errorsOf(schema, { data: { id: 'x' } })
  assert.equal(errors[0].path, '$.data.id')
})

test('数组：items 校验与下标路径', () => {
  const schema = { type: 'array', items: { type: 'integer' } }
  assert.ok(ok(schema, [1, 2, 3]))
  const errors = errorsOf(schema, [1, 'x'])
  assert.equal(errors[0].path, '$[1]')
  assert.match(errors[0].message, /类型/)
})

test('数组：长度与唯一性', () => {
  const schema = { type: 'array', minItems: 2, maxItems: 3, uniqueItems: true }
  assert.ok(ok(schema, [1, 2]))
  assert.ok(!ok(schema, [1]))
  assert.ok(!ok(schema, [1, 2, 3, 4]))
  assert.ok(!ok(schema, [1, 1]))
})

test('字符串：长度与模式', () => {
  const schema = { type: 'string', minLength: 2, maxLength: 4, pattern: '^[a-z]+$' }
  assert.ok(ok(schema, 'abc'))
  assert.ok(!ok(schema, 'a'))
  assert.ok(!ok(schema, 'abcdef'))
  assert.ok(!ok(schema, 'ABC'))
})

test('数值：区间与倍数', () => {
  const schema = { type: 'number', minimum: 0, maximum: 10, multipleOf: 2 }
  assert.ok(ok(schema, 4))
  assert.ok(!ok(schema, -2))
  assert.ok(!ok(schema, 12))
  assert.ok(!ok(schema, 3))
})

test('enum 与 const', () => {
  assert.ok(ok({ enum: ['a', 'b'] }, 'a'))
  assert.ok(!ok({ enum: ['a', 'b'] }, 'c'))
  assert.ok(ok({ const: 42 }, 42))
  assert.ok(!ok({ const: 42 }, 41))
})

test('additionalProperties: false 拦截多余字段', () => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'integer' } },
    additionalProperties: false,
  }
  assert.ok(ok(schema, { a: 1 }))
  const errors = errorsOf(schema, { a: 1, b: 2 })
  assert.equal(errors[0].path, '$.b')
})

test('anyOf / oneOf / not', () => {
  assert.ok(ok({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 3))
  assert.ok(!ok({ anyOf: [{ type: 'string' }, { type: 'boolean' }] }, 3))

  assert.ok(ok({ oneOf: [{ type: 'string' }, { type: 'integer' }] }, 'a'))
  assert.ok(!ok({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 3), '同时匹配两个应失败')

  assert.ok(ok({ not: { type: 'string' } }, 1))
  assert.ok(!ok({ not: { type: 'string' } }, 'a'))
})

test('类型不符时不再重复报后续关键字', () => {
  const errors = errorsOf({ type: 'string', minLength: 5 }, 123)
  assert.equal(errors.length, 1)
})

test('错误数量有上限', () => {
  const data = {}
  for (let i = 0; i < 100; i += 1) data[`k${i}`] = 'x'
  const schema = { type: 'object', additionalProperties: false, properties: {} }
  const { errors } = validate(schema, data, { maxErrors: 5 })
  assert.equal(errors.length, 5)
})

test('sampleFromSchema：按 required 生成对象与数组', () => {
  const schema = {
    type: 'object',
    required: ['id', 'tags'],
    properties: {
      id: { type: 'integer' },
      tags: { type: 'array', items: { type: 'string' } },
      note: { type: 'string' },
    },
  }
  const sample = sampleFromSchema(schema)
  assert.deepEqual(sample, { id: 0, tags: ['string'] })
})

test('sampleFromSchema：枚举取第一个值', () => {
  assert.equal(sampleFromSchema({ enum: ['admin', 'user'] }), 'admin')
  assert.equal(sampleFromSchema({ const: 'x' }), 'x')
})

test('schema 自身异常不抛错', () => {
  assert.ok(ok({}, 'anything'))
  assert.ok(ok(null, 1))
})
