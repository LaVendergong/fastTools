// Git 命令构造
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { findScenario, GROUPS, missingFields, SCENARIOS, toScript } from '../src/tools/git/commands.js'

test('场景表结构完整且 id 不重复', () => {
  const ids = new Set()
  const groups = new Set(GROUPS.map((g) => g.id))

  for (const item of SCENARIOS) {
    assert.ok(item.id && !ids.has(item.id), `id 重复：${item.id}`)
    ids.add(item.id)
    assert.ok(groups.has(item.group), `未知分组：${item.group}`)
    assert.ok(item.name && item.desc, `${item.id} 缺名称或说明`)
    assert.ok(Array.isArray(item.fields), `${item.id} 缺 fields`)
    assert.ok(typeof item.build === 'function')
  }

  assert.ok(SCENARIOS.length >= 12, `场景数 ${SCENARIOS.length}`)
})

test('每个场景都能生成非空命令', () => {
  for (const item of SCENARIOS) {
    const commands = item.build({})
    assert.ok(commands.length > 0, `${item.id} 没有生成命令`)
    for (const c of commands) {
      assert.ok(c.cmd && c.cmd.startsWith('git '), `${item.id} 的命令不是 git 开头：${c.cmd}`)
    }
  }
})

test('缺参数时用占位符而非空串', () => {
  const discard = findScenario('discard')
  const commands = discard.build({})
  assert.ok(commands[0].cmd.includes('<文件>'), commands[0].cmd)
})

test('填了参数后替换进命令', () => {
  const amend = findScenario('amend-msg')
  const [first] = amend.build({ message: 'fix: 修正跳转' })
  assert.equal(first.cmd, 'git commit --amend -m "fix: 修正跳转"')

  const merge = findScenario('merge')
  const cmds = merge.build({ target: 'dev', source: 'feature/x' })
  assert.equal(cmds[0].cmd, 'git switch dev')
  assert.equal(cmds[2].cmd, 'git merge --no-ff feature/x')
})

test('rebuild 的分支参数默认值生效', () => {
  const rebase = findScenario('rebase')
  const cmds = rebase.build({})
  assert.ok(cmds[1].cmd.includes('origin/main'), cmds[1].cmd)
})

test('危险操作都带 warn', () => {
  for (const id of ['discard', 'clean', 'amend-msg', 'rebase']) {
    assert.ok(findScenario(id).warn, `${id} 缺少风险提示`)
  }
})

test('missingFields 只统计没有默认值的字段', () => {
  const merge = findScenario('merge')
  // target 有默认值 main，source 没有
  assert.deepEqual(missingFields(merge, {}), ['来源分支'])
  assert.deepEqual(missingFields(merge, { source: 'feat' }), [])
})

test('findScenario 未知 id 回落到第一个', () => {
  assert.equal(findScenario('nope').id, SCENARIOS[0].id)
})

test('toScript 逐行拼接命令', () => {
  const cmds = [
    { cmd: 'git add .' },
    { cmd: 'git commit -m "x"' },
  ]
  assert.equal(toScript(cmds), 'git add .\ngit commit -m "x"')
  assert.equal(toScript([]), '')
})
