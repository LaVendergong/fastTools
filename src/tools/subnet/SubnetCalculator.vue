<script setup>
import { computed, ref } from 'vue'

const input = ref('192.168.1.10/24')
const splitPrefix = ref(26)

/* ---------------- IP 工具 ---------------- */

function parseIp(text) {
  const parts = String(text).trim().split('.')
  if (parts.length !== 4) throw new Error('IPv4 应该是 4 段，如 192.168.1.1')
  const nums = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) throw new Error(`「${p}」不是合法的数字段`)
    const n = Number(p)
    if (n > 255) throw new Error(`「${p}」超过 255`)
    return n
  })
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

function ipToStr(value) {
  const n = value >>> 0
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

function ipToBinary(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
    .map((b) => b.toString(2).padStart(8, '0'))
    .join('.')
}

function prefixFromMask(maskStr) {
  const mask = parseIp(maskStr)
  const bin = mask.toString(2).padStart(32, '0')
  if (!/^1*0*$/.test(bin)) throw new Error('子网掩码不是连续的 1（如 255.255.255.0）')
  return bin.split('1').length - 1
}

/* ---------------- 主计算 ---------------- */

const parsed = computed(() => {
  const raw = input.value.trim()
  if (!raw) return { ok: false, error: '' }

  try {
    let ipPart = raw
    let prefix

    if (raw.includes('/')) {
      const [ip, p] = raw.split('/')
      ipPart = ip
      if (!/^\d{1,2}$/.test(p) || Number(p) > 32) throw new Error('前缀长度应在 0–32 之间')
      prefix = Number(p)
    } else if (raw.split('.').length === 4) {
      // 先判断是不是子网掩码（连续的 1），如 255.255.255.0
      let asMask = null
      try {
        const p = prefixFromMask(raw)
        if (p < 32) asMask = p
      } catch {
        asMask = null
      }
      if (asMask !== null) return { ok: false, error: '', maskOnly: asMask }
      prefix = 32
    } else {
      prefix = 32
    }

    const ip = parseIp(ipPart)
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    const network = (ip & mask) >>> 0
    const broadcast = (network | (~mask >>> 0)) >>> 0
    const totalHosts = 2 ** (32 - prefix)

    let usableCount = 0
    let first = network
    let last = broadcast
    if (prefix <= 30) {
      usableCount = totalHosts - 2
      first = network + 1
      last = broadcast - 1
    } else if (prefix === 31) {
      usableCount = 2
      first = network
      last = broadcast
    } else {
      usableCount = 1
      first = network
      last = network
    }

    const firstOctet = (ip >>> 24) & 255
    let ipClass = 'E'
    if (firstOctet < 128) ipClass = 'A'
    else if (firstOctet < 192) ipClass = 'B'
    else if (firstOctet < 224) ipClass = 'C'
    else if (firstOctet < 240) ipClass = 'D（组播）'

    const ranges = []
    if ((network >>> 24) === 10) ranges.push('私有地址 10.0.0.0/8')
    if (network >>> 20 === 0xac1 && prefix >= 16) ranges.push('私有地址 172.16.0.0/12')
    if (network >>> 16 === 0xc0a8) ranges.push('私有地址 192.168.0.0/16')
    if (network >>> 24 === 127) ranges.push('回环 127.0.0.0/8')
    if (network >>> 16 === 0xa9fe) ranges.push('链路本地 169.254.0.0/16')
    if (network >>> 28 === 0xe || (network >>> 24) === 224) ranges.push('组播')

    return {
      ok: true,
      ip: ipToStr(ip),
      prefix,
      cidr: `${ipToStr(network)}/${prefix}`,
      network: ipToStr(network),
      broadcast: ipToStr(broadcast),
      mask: ipToStr(mask),
      wildcard: ipToStr(~mask >>> 0),
      first: ipToStr(first),
      last: ipToStr(last),
      usableCount,
      totalHosts,
      ipBinary: ipToBinary(ip),
      maskBinary: ipToBinary(mask),
      ipClass,
      ranges,
      ipInt: ip,
      networkInt: network,
    }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

/* ---------------- 子网拆分 ---------------- */

const subnets = computed(() => {
  const base = parsed.value
  if (!base.ok) return []
  const newPrefix = Number(splitPrefix.value)
  if (!(newPrefix > base.prefix) || newPrefix > 32) return []

  const count = 2 ** (newPrefix - base.prefix)
  const step = 2 ** (32 - newPrefix)
  const limit = Math.min(count, 256)

  const list = []
  for (let i = 0; i < limit; i++) {
    const net = (base.networkInt + i * step) >>> 0
    const mask = newPrefix === 0 ? 0 : (0xffffffff << (32 - newPrefix)) >>> 0
    const bc = (net | (~mask >>> 0)) >>> 0
    const usable = newPrefix <= 30 ? step - 2 : newPrefix === 31 ? 2 : 1
    list.push({
      index: i + 1,
      cidr: `${ipToStr(net)}/${newPrefix}`,
      range: newPrefix <= 30 ? `${ipToStr(net + 1)} – ${ipToStr(bc - 1)}` : `${ipToStr(net)} – ${ipToStr(bc)}`,
      broadcast: ipToStr(bc),
      usable,
    })
  }
  return list
})

const subnetTotal = computed(() => {
  const base = parsed.value
  const newPrefix = Number(splitPrefix.value)
  if (!base.ok || !(newPrefix > base.prefix)) return 0
  return 2 ** (newPrefix - base.prefix)
})

const copied = ref('')

async function copy(text, tag) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = tag
    setTimeout(() => {
      if (copied.value === tag) copied.value = ''
    }, 1200)
  } catch {
    /* 忽略 */
  }
}

const rows = computed(() => {
  const r = parsed.value
  if (!r.ok) return []
  return [
    { label: '网络地址', value: r.network, tag: 'network' },
    { label: '广播地址', value: r.broadcast, tag: 'broadcast' },
    { label: '可用地址范围', value: `${r.first} – ${r.last}`, tag: 'range' },
    { label: '可用主机数', value: r.usableCount.toLocaleString('zh-CN') },
    { label: '地址总数', value: r.totalHosts.toLocaleString('zh-CN') },
    { label: '子网掩码', value: r.mask, tag: 'mask' },
    { label: '通配符掩码', value: r.wildcard, tag: 'wildcard' },
    { label: 'CIDR', value: r.cidr, tag: 'cidr' },
    { label: 'IP 类别', value: r.ipClass },
    { label: '地址性质', value: r.ranges.length ? r.ranges.join('、') : '公网地址' },
  ]
})
</script>

<template>
  <div class="subnet">
    <div class="toolbar">
      <input
        v-model="input"
        class="input mono"
        spellcheck="false"
        placeholder="192.168.1.10/24 或 192.168.1.10"
      />
      <span class="hint-inline">支持 /24 或 255.255.255.0 两种写法</span>
      <span class="spacer" />
      <button class="btn" @click="input = '192.168.1.10/24'">内网示例</button>
      <button class="btn" @click="input = '203.0.113.45/28'">公网示例</button>
      <button class="btn primary" :disabled="!parsed.ok" @click="copy(parsed.ok ? `${parsed.network}/${parsed.prefix}` : '', 'net')">
        {{ copied === 'net' ? '已复制' : '复制网段' }}
      </button>
    </div>

    <p v-if="parsed.error" class="err">{{ parsed.error }}</p>
    <p v-else-if="parsed.maskOnly !== undefined" class="tip">
      你输入的是子网掩码，对应前缀长度 <b>/{{ parsed.maskOnly }}</b>，可以改成
      <code>ip/{{ parsed.maskOnly }}</code> 再算
    </p>

    <template v-if="parsed.ok">
      <div class="cards">
        <div class="card accent">
          <span class="card-label">网段</span>
          <span class="card-value mono">{{ parsed.cidr }}</span>
          <span class="card-sub">掩码 {{ parsed.mask }}</span>
        </div>
        <div class="card">
          <span class="card-label">可用主机</span>
          <span class="card-value">{{ parsed.usableCount.toLocaleString('zh-CN') }}</span>
          <span class="card-sub">共 {{ parsed.totalHosts.toLocaleString('zh-CN') }} 个地址</span>
        </div>
        <div class="card">
          <span class="card-label">可用范围</span>
          <span class="card-value small mono">{{ parsed.first }}</span>
          <span class="card-sub mono">→ {{ parsed.last }}</span>
        </div>
      </div>

      <div class="body">
        <section class="info">
          <div class="info-head">
            <span class="info-title">详细信息</span>
            <span class="info-meta">{{ parsed.ranges.length ? parsed.ranges.join('、') : '公网' }}</span>
          </div>
          <div class="rows">
            <div v-for="row in rows" :key="row.label" class="row">
              <span class="k">{{ row.label }}</span>
              <span class="v mono">{{ row.value }}</span>
              <button v-if="row.tag && row.value" class="mini" @click="copy(String(row.value), row.tag)">
                {{ copied === row.tag ? '已复制' : '复制' }}
              </button>
            </div>
          </div>

          <div class="binary">
            <div class="bin-row">
              <span class="k">IP</span>
              <code class="mono">{{ parsed.ipBinary }}</code>
            </div>
            <div class="bin-row">
              <span class="k">掩码</span>
              <code class="mono">{{ parsed.maskBinary }}</code>
            </div>
          </div>
        </section>

        <section class="split">
          <div class="split-head">
            <span class="info-title">拆分子网</span>
            <span class="k">新前缀 /</span>
            <input v-model.number="splitPrefix" class="num" type="number" :min="parsed.prefix + 1" max="32" />
            <span v-if="subnetTotal" class="split-meta">共 {{ subnetTotal }} 个子网</span>
          </div>

          <div v-if="!subnets.length" class="split-tip">
            把前缀设成大于 /{{ parsed.prefix }} 的值（如 /{{ Math.min(32, parsed.prefix + 2) }}）来拆分
          </div>

          <div v-else class="split-table">
            <div class="st-head">
              <span>#</span>
              <span>子网</span>
              <span>可用范围</span>
              <span>可用数</span>
            </div>
            <div class="st-body">
              <div v-for="s in subnets" :key="s.index" class="st-row">
                <span class="st-idx">{{ s.index }}</span>
                <span class="mono">{{ s.cidr }}</span>
                <span class="mono dim">{{ s.range }}</span>
                <span class="st-num">{{ s.usable.toLocaleString('zh-CN') }}</span>
              </div>
            </div>
            <p v-if="subnetTotal > subnets.length" class="st-more">
              仅显示前 {{ subnets.length }} 个，共 {{ subnetTotal }} 个
            </p>
          </div>
        </section>
      </div>
    </template>

    <p class="note">
      纯前端计算（位运算），支持 /0–/32；/31 按点对点链路处理（2 个可用地址），/32 为单个主机地址。
    </p>
  </div>
</template>

<style scoped>
.subnet {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  overflow: auto;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.input {
  flex: 0 1 260px;
  min-width: 140px;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 13px;
}
.hint-inline {
  font-size: 10px;
  color: var(--text-faint);
}
.spacer {
  margin-left: auto;
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
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
.err {
  flex: none;
  margin: 0;
  font-size: 11.5px;
  color: var(--danger);
}
.tip {
  flex: none;
  margin: 0;
  font-size: 11px;
  color: var(--warn);
}
.tip code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
.cards {
  flex: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.card.accent {
  border-color: transparent;
  background: linear-gradient(150deg, var(--accent-soft), transparent 72%);
}
.card-label {
  font-size: 10.5px;
  color: var(--text-dim);
}
.card-value {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.card-value.small {
  font-size: 15px;
}
.card.accent .card-value {
  color: var(--accent);
}
.card-sub {
  font-size: 10px;
  color: var(--text-faint);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.info,
.split {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.info {
  flex: 1;
}
.split {
  flex: 1;
}
.info-head,
.split-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.info-title {
  font-size: 11.5px;
  font-weight: 600;
}
.info-meta {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-faint);
}
.rows {
  flex: none;
  padding: 4px 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 3px 12px;
}
.row:hover {
  background: var(--fill-1);
}
.k {
  flex: none;
  width: 96px;
  font-size: 10.5px;
  color: var(--text-faint);
}
.v {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini {
  flex: none;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--accent);
}
.mini:hover {
  background: var(--accent-soft);
}
.binary {
  flex: none;
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bin-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bin-row code {
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--text-dim);
  word-break: break-all;
}
.num {
  width: 56px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11px;
  text-align: center;
}
.split-meta {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-faint);
}
.split-tip {
  padding: 20px 12px;
  font-size: 11px;
  color: var(--text-faint);
}
.split-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.st-head,
.st-row {
  display: grid;
  grid-template-columns: 28px 1.1fr 1.5fr 60px;
  gap: 8px;
  padding: 5px 12px;
  align-items: center;
}
.st-head {
  flex: none;
  border-bottom: 1px solid var(--border);
  font-size: 9.5px;
  color: var(--text-faint);
}
.st-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.st-row {
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.st-row:last-child {
  border-bottom: none;
}
.st-idx {
  color: var(--text-faint);
}
.dim {
  color: var(--text-dim);
}
.st-num {
  text-align: right;
  color: var(--text-dim);
}
.st-more {
  flex: none;
  margin: 0;
  padding: 5px 12px;
  border-top: 1px solid var(--border);
  font-size: 9.5px;
  color: var(--text-faint);
}
.note {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
</style>
