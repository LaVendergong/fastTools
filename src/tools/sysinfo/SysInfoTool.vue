<script setup>
import { computed, onMounted, ref } from 'vue'

const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
const storage = ref(null)
const battery = ref(null)
const copied = ref('')

const ua = navigator.userAgent

/* ---------------- UA 解析 ---------------- */

function parseBrowser(text) {
  const list = [
    { name: 'Microsoft Edge', re: /Edg\/([\d.]+)/ },
    { name: 'Chrome', re: /Chrome\/([\d.]+)/ },
    { name: 'Firefox', re: /Firefox\/([\d.]+)/ },
    { name: 'Safari', re: /Version\/([\d.]+).*Safari/ },
  ]
  for (const item of list) {
    const m = item.re.exec(text)
    if (m) return `${item.name} ${m[1]}`
  }
  return '未知浏览器'
}

function parseOS(text) {
  const checks = [
    [/Windows NT 10/, 'Windows 10 / 11'],
    [/Windows NT 6\.3/, 'Windows 8.1'],
    [/Windows NT 6\.1/, 'Windows 7'],
    [/Mac OS X ([\d_]+)/, (m) => `macOS ${m[1].replace(/_/g, '.')}`],
    [/Android ([\d.]+)/, (m) => `Android ${m[1]}`],
    [/iPhone OS ([\d_]+)/, (m) => `iOS ${m[1].replace(/_/g, '.')}`],
    [/Linux/, 'Linux'],
  ]
  for (const [re, name] of checks) {
    const m = re.exec(text)
    if (m) return typeof name === 'function' ? name(m) : name
  }
  return '未知系统'
}

function parseEngine(text) {
  if (/Edg\/|Chrome\//.test(text)) return 'Blink'
  if (/Firefox\//.test(text)) return 'Gecko'
  if (/Safari/.test(text)) return 'WebKit'
  return '未知'
}

/* ---------------- 能力检测 ---------------- */

function detectCapabilities() {
  const nav = navigator
  return [
    { name: 'WebGL', ok: Boolean(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')) },
    { name: 'WebGPU', ok: 'gpu' in nav },
    { name: 'WebAssembly', ok: typeof WebAssembly === 'object' },
    { name: 'Service Worker', ok: 'serviceWorker' in nav },
    { name: 'Web Worker', ok: typeof Worker === 'function' },
    { name: '本站文件空间 OPFS', ok: Boolean(nav.storage?.getDirectory) },
    { name: '本地目录访问', ok: typeof window.showDirectoryPicker === 'function' },
    { name: '文件系统访问', ok: typeof window.showOpenFilePicker === 'function' },
    { name: '剪贴板读写', ok: Boolean(nav.clipboard?.writeText) },
    { name: '屏幕取色 EyeDropper', ok: 'EyeDropper' in window },
    { name: '摄像头 / 麦克风', ok: Boolean(nav.mediaDevices?.getUserMedia) },
    { name: '屏幕共享', ok: Boolean(nav.mediaDevices?.getDisplayMedia) },
    { name: '地理位置', ok: 'geolocation' in nav },
    { name: '通知', ok: 'Notification' in window },
    { name: 'Web Share', ok: 'share' in nav },
    { name: 'Web Bluetooth', ok: 'bluetooth' in nav },
    { name: 'WebUSB', ok: 'usb' in nav },
    { name: 'Web Serial', ok: 'serial' in nav },
    { name: '语音合成', ok: 'speechSynthesis' in window },
    { name: '媒体会话', ok: 'mediaSession' in nav },
    { name: '振动', ok: 'vibrate' in nav },
    { name: '电池状态', ok: 'getBattery' in nav },
  ]
}

const capabilities = ref([])

/* ---------------- 分组数据 ---------------- */

const groups = computed(() => [
  {
    title: '系统与浏览器',
    rows: [
      { label: '浏览器', value: parseBrowser(ua) },
      { label: '操作系统', value: parseOS(ua) },
      { label: '渲染引擎', value: parseEngine(ua) },
      { label: '语言', value: navigator.language + (navigator.languages ? `（${navigator.languages.join(', ')}）` : '') },
      { label: '时区', value: `${Intl.DateTimeFormat().resolvedOptions().timeZone}（UTC${offsetText()}）` },
      { label: '平台', value: navigator.platform || '—' },
      { label: 'CPU 核心', value: navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} 核` : '不提供' },
      { label: '设备内存', value: navigator.deviceMemory ? `约 ${navigator.deviceMemory} GB` : '不提供' },
      { label: 'Cookie 可用', value: navigator.cookieEnabled ? '是' : '否' },
      { label: 'Do Not Track', value: navigator.doNotTrack === '1' ? '已开启' : '未开启' },
      { label: '安全上下文', value: window.isSecureContext ? '是（HTTPS / localhost）' : '否（部分能力不可用）' },
      { label: '完整 UA', value: ua, wide: true },
    ],
  },
  {
    title: '屏幕与窗口',
    rows: [
      { label: '屏幕分辨率', value: `${screen.width} × ${screen.height}` },
      { label: '可用区域', value: `${screen.availWidth} × ${screen.availHeight}` },
      { label: '设备像素比', value: `${window.devicePixelRatio}×` },
      { label: '色深', value: `${screen.colorDepth} 位` },
      { label: '浏览器窗口', value: `${window.innerWidth} × ${window.innerHeight}` },
      { label: '可视区域', value: `${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}` },
      { label: '屏幕方向', value: screen.orientation?.type || '未知' },
      { label: '触摸支持', value: navigator.maxTouchPoints > 0 ? `是（${navigator.maxTouchPoints} 点）` : '否' },
      { label: '深色偏好', value: matchMedia('(prefers-color-scheme: dark)').matches ? '深色' : '浅色' },
      { label: '减少动画偏好', value: matchMedia('(prefers-reduced-motion: reduce)').matches ? '已开启' : '未开启' },
    ],
  },
  {
    title: '网络',
    rows: [
      { label: '在线状态', value: navigator.onLine ? '在线' : '离线' },
      { label: '连接类型', value: connection?.effectiveType?.toUpperCase() || '不提供' },
      { label: '下行速度', value: connection?.downlink ? `${connection.downlink} Mbps` : '不提供' },
      { label: '往返时延', value: connection?.rtt ? `${connection.rtt} ms` : '不提供' },
      { label: '省流模式', value: connection?.saveData ? '开' : '关' },
    ],
  },
  {
    title: '存储',
    rows: [
      { label: '可用配额', value: storage.value ? formatBytes(storage.value.quota) : '读取中…' },
      { label: '已使用', value: storage.value ? formatBytes(storage.value.usage) : '读取中…' },
      {
        label: '使用率',
        value: storage.value?.quota
          ? `${((storage.value.usage / storage.value.quota) * 100).toFixed(2)}%`
          : '—',
      },
      { label: '持久化状态', value: navigator.storage?.persisted ? '可查询' : '不提供' },
      { label: '电池', value: battery.value || '不提供' },
    ],
  },
])

function offsetText() {
  const offset = -new Date().getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/* ---------------- 导出 ---------------- */

function report() {
  const lines = ['=== 环境信息 ===']
  for (const group of groups.value) {
    lines.push('', `【${group.title}】`)
    for (const row of group.rows) lines.push(`${row.label}: ${row.value}`)
  }
  lines.push('', '【能力检测】')
  for (const cap of capabilities.value) lines.push(`${cap.name}: ${cap.ok ? '支持' : '不支持'}`)
  return lines.join('\n')
}

async function copyAll() {
  try {
    await navigator.clipboard.writeText(report())
    copied.value = 'all'
    setTimeout(() => (copied.value = ''), 1500)
  } catch {
    /* 忽略 */
  }
}

async function copyValue(value, label) {
  try {
    await navigator.clipboard.writeText(String(value))
    copied.value = label
    setTimeout(() => (copied.value = ''), 1200)
  } catch {
    /* 忽略 */
  }
}

function downloadReport() {
  const blob = new Blob([report()], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'env-report.txt'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

onMounted(async () => {
  capabilities.value = detectCapabilities()

  try {
    storage.value = await navigator.storage?.estimate?.()
  } catch {
    /* 忽略 */
  }

  if ('getBattery' in navigator) {
    try {
      const b = await navigator.getBattery()
      battery.value = `${Math.round(b.level * 100)}%${b.charging ? '（充电中）' : ''}`
    } catch {
      battery.value = '读取失败'
    }
  }
})
</script>

<template>
  <div class="sys">
    <div class="toolbar">
      <span class="title">当前环境</span>
      <span class="sub">{{ parseBrowser(ua) }} · {{ parseOS(ua) }}</span>
      <span class="spacer" />
      <button class="btn" :disabled="!capabilities.length" @click="downloadReport">导出报告</button>
      <button class="btn primary" @click="copyAll">{{ copied === 'all' ? '已复制' : '复制全部' }}</button>
    </div>

    <div class="scroll">
      <section v-for="group in groups" :key="group.title" class="card">
        <h3>{{ group.title }}</h3>
        <div class="rows">
          <div
            v-for="row in group.rows"
            :key="row.label"
            class="row"
            :class="{ wide: row.wide }"
            :title="`点击复制：${row.value}`"
            @click="copyValue(row.value, row.label)"
          >
            <span class="k">{{ row.label }}</span>
            <span class="v">{{ row.value }}</span>
            <span v-if="copied === row.label" class="copied">已复制</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h3>浏览器能力</h3>
        <div class="caps">
          <span v-for="cap in capabilities" :key="cap.name" class="cap" :class="{ ok: cap.ok }">
            <span class="dot" />
            {{ cap.name }}
          </span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.sys {
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
}
.title {
  font-size: 12.5px;
  font-weight: 600;
}
.sub {
  font-size: 11px;
  color: var(--text-dim);
}
.spacer {
  margin-left: auto;
}
.btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
}
.btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover {
  background: var(--accent-strong);
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card {
  flex: none;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.card h3 {
  margin: 0 0 8px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-dim);
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 3px 6px;
  border-radius: 5px;
  cursor: pointer;
}
.row:hover {
  background: var(--fill-1);
}
.row.wide {
  align-items: flex-start;
}
.k {
  flex: none;
  width: 108px;
  font-size: 11px;
  color: var(--text-faint);
}
.v {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  word-break: break-all;
}
.copied {
  flex: none;
  font-size: 10px;
  color: var(--accent);
}
.caps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cap {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--fill-1);
  font-size: 10.5px;
  color: var(--text-faint);
}
.cap.ok {
  background: var(--success-soft);
  color: var(--success);
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
</style>
