// SSH config 生成
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSshConfig, DEFAULT_GLOBAL, emptyHost, sshCommand } from '../src/tools/ssh/config.js'

const global = { ...DEFAULT_GLOBAL, keepAlive: true, compression: false }

test('生成单台主机的配置块', () => {
  const { text } = buildSshConfig({
    global,
    hosts: [
      {
        ...emptyHost(),
        alias: 'prod',
        hostname: '10.0.0.10',
        user: 'root',
        port: '2222',
        identityFile: '~/.ssh/id_ed25519',
      },
    ],
  })

  assert.ok(text.includes('Host prod'))
  assert.ok(text.includes('  HostName 10.0.0.10'))
  assert.ok(text.includes('  User root'))
  assert.ok(text.includes('  Port 2222'))
  assert.ok(text.includes('  IdentityFile ~/.ssh/id_ed25519'))
})

test('全局段：开启保活才写 ServerAlive', () => {
  const on = buildSshConfig({ global, hosts: [] }).text
  assert.ok(on.includes('Host *'))
  assert.ok(on.includes('ServerAliveInterval 60'))

  const off = buildSshConfig({ global: { ...global, keepAlive: false }, hosts: [] }).text
  assert.ok(!off.includes('ServerAliveInterval'))
})

test('LocalForward 支持多行', () => {
  const { text } = buildSshConfig({
    global,
    hosts: [
      {
        ...emptyHost(),
        alias: 'db',
        hostname: 'db.internal',
        localForward: '3306 127.0.0.1:3306\n6379 127.0.0.1:6379',
      },
    ],
  })
  assert.ok(text.includes('  LocalForward 3306 127.0.0.1:3306'))
  assert.ok(text.includes('  LocalForward 6379 127.0.0.1:6379'))
})

test('空字段不输出对应行', () => {
  const { text } = buildSshConfig({
    global,
    hosts: [{ ...emptyHost(), alias: 'only', hostname: 'example.com' }],
  })
  assert.ok(!text.includes('User'))
  assert.ok(!text.includes('IdentityFile'))
})

test('别名重复与含空格会给出警告', () => {
  const { warnings } = buildSshConfig({
    global,
    hosts: [
      { ...emptyHost(), alias: 'dup', hostname: 'a.com' },
      { ...emptyHost(), alias: 'dup', hostname: 'b.com' },
      { ...emptyHost(), alias: 'bad name', hostname: 'c.com' },
    ],
  })
  assert.ok(warnings.some((w) => w.includes('重复')))
  assert.ok(warnings.some((w) => w.includes('空格')))
})

test('没填 HostName 时提示', () => {
  const { warnings } = buildSshConfig({
    global,
    hosts: [{ ...emptyHost(), alias: 'nohost' }],
  })
  assert.ok(warnings.some((w) => w.includes('HostName')))
})

test('没有主机时给出占位注释', () => {
  const { text } = buildSshConfig({ global, hosts: [] })
  assert.ok(text.includes('还没有配置任何主机') || text.includes('Host *'))
})

test('sshCommand：别名生成命令', () => {
  assert.equal(sshCommand({ alias: 'prod' }), 'ssh prod')
  assert.equal(sshCommand({ alias: '  ' }), '')
})
