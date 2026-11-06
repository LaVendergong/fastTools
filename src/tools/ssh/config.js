/**
 * 生成 ~/.ssh/config（纯函数）
 */

export const DEFAULT_GLOBAL = {
  keepAlive: true,
  compression: false,
  addKeysToAgent: true,
  identitiesOnly: false,
}

export function emptyHost() {
  return {
    alias: '',
    hostname: '',
    user: '',
    port: '',
    identityFile: '',
    proxyJump: '',
    localForward: '',
    extra: '',
  }
}

function hostBlock(host) {
  const lines = [`Host ${host.alias.trim()}`]

  const push = (key, value) => {
    const text = String(value ?? '').trim()
    if (text) lines.push(`  ${key} ${text}`)
  }

  push('HostName', host.hostname)
  push('User', host.user)
  push('Port', host.port)
  push('IdentityFile', host.identityFile)
  push('ProxyJump', host.proxyJump)

  // LocalForward 支持多行（每行一条）
  for (const line of String(host.localForward || '').split('\n')) {
    const text = line.trim()
    if (text) lines.push(`  LocalForward ${text}`)
  }

  for (const line of String(host.extra || '').split('\n')) {
    const text = line.trim()
    if (text) lines.push(`  ${text}`)
  }

  return lines.join('\n')
}

/**
 * @param {{hosts: Array, global: object}} input
 * @returns {{text: string, warnings: string[]}}
 */
export function buildSshConfig(input) {
  const hosts = (input?.hosts || []).filter((h) => String(h.alias || '').trim())
  const global = { ...DEFAULT_GLOBAL, ...(input?.global || {}) }
  const warnings = []

  // 别名重复会让后面的配置覆盖前面的，提前提示
  const seen = new Map()
  for (const host of hosts) {
    const alias = host.alias.trim()
    if (/\s/.test(alias)) warnings.push(`别名「${alias}」含空格，ssh 会解析失败`)
    if (seen.has(alias)) warnings.push(`别名「${alias}」重复，只有最后一段生效`)
    seen.set(alias, true)
    if (!String(host.hostname || '').trim()) {
      warnings.push(`「${alias}」没填 HostName，连接时会当成域名解析`)
    }
  }

  const blocks = []

  const globalLines = []
  if (global.keepAlive) {
    globalLines.push('  ServerAliveInterval 60', '  ServerAliveCountMax 3')
  }
  if (global.compression) globalLines.push('  Compression yes')
  if (global.addKeysToAgent) globalLines.push('  AddKeysToAgent yes')
  if (global.identitiesOnly) globalLines.push('  IdentitiesOnly yes')
  if (globalLines.length) {
    blocks.push(['Host *', ...globalLines].join('\n'))
  }

  for (const host of hosts) blocks.push(hostBlock(host))

  const text = blocks.length
    ? `${blocks.join('\n\n')}\n`
    : '# 还没有配置任何主机\n'

  return { text, warnings }
}

/** 生成一段可直接粘贴的 ssh 命令 */
export function sshCommand(host) {
  const alias = String(host?.alias || '').trim()
  if (!alias) return ''
  return `ssh ${alias}`
}
