<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:base64'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const mode = ref(saved.mode ?? 'encode')
const urlSafe = ref(saved.urlSafe ?? false)
const input = ref(saved.input ?? '工具箱 Base64 测试 123')
const outputMode = ref(saved.outputMode ?? 'dataurl')
const copied = ref(false)

const fileInfo = ref(null) // { name, size, type, dataUrl }
const fileInputEl = ref(null)

let saveTimer
function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      mode: mode.value,
      urlSafe: urlSafe.value,
      input: input.value,
      outputMode: outputMode.value,
    }),
  )
}

watch([mode, urlSafe, input, outputMode], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 300)
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  save()
})

// 通过文件头识别常见二进制类型（图片 / 文档 / 压缩包 / 音视频 / 字体）
function sniffMime(bytes) {
  if (bytes.length < 12) return ''
  const at = (i) => bytes[i]
  if (at(0) === 0x89 && at(1) === 0x50) return 'image/png'
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) return 'image/gif'
  if (at(0) === 0x52 && at(1) === 0x49 && at(8) === 0x57 && at(9) === 0x45) return 'image/webp'
  if (at(0) === 0x42 && at(1) === 0x4d) return 'image/bmp'
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'application/pdf'
  if (at(0) === 0x50 && at(1) === 0x4b && at(2) === 0x03 && at(3) === 0x04) return 'application/zip'
  if (at(0) === 0x1f && at(1) === 0x8b) return 'application/gzip'
  if (at(0) === 0x52 && at(1) === 0x61 && at(2) === 0x72 && at(3) === 0x21) return 'application/vnd.rar'
  if (at(0) === 0x49 && at(1) === 0x44 && at(2) === 0x33) return 'audio/mpeg'
  if (at(0) === 0x4f && at(1) === 0x67 && at(2) === 0x67 && at(3) === 0x53) return 'audio/ogg'
  if (at(0) === 0x77 && at(1) === 0x4f && at(2) === 0x46 && at(3) === 0x46) return 'font/woff'
  if (at(0) === 0x77 && at(1) === 0x4f && at(2) === 0x46 && at(3) === 0x32) return 'font/woff2'
  if (at(0) === 0x00 && at(1) === 0x00 && at(2) === 0x01 && at(3) === 0x00) return 'image/x-icon'
  return ''
}

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/gzip': 'gz',
  'application/vnd.rar': 'rar',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
}

function isTextLike(mime) {
  return !mime || mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml'
}

function normalizeBase64(src) {
  let s = src.replace(/\s+/g, '')
  if (urlSafe.value) s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return s
}

const result = computed(() => {
  const raw = input.value
  if (mode.value === 'file' || !raw.trim())
    return { ok: true, text: '', error: '', image: null }

  try {
    if (mode.value === 'encode') {
      const bytes = new TextEncoder().encode(raw)
      let bin = ''
      for (const b of bytes) bin += String.fromCharCode(b)
      let b64 = btoa(bin)
      if (urlSafe.value) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      return { ok: true, text: b64, error: '', image: null }
    }

    const dataUrl = /^data:([^;,]+)?;base64,(.*)$/s.exec(raw.trim())
    const b64 = normalizeBase64(dataUrl ? dataUrl[2] : raw)
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const mime = dataUrl?.[1] || sniffMime(bytes)

    // 非文本类型（图片/PDF/压缩包/音视频/字体）额外给出文件卡片与下载
    const file = mime && !isTextLike(mime)
      ? {
          mime,
          size: bytes.length,
          ext: MIME_EXT[mime] || 'bin',
          image: mime.startsWith('image/'),
          dataUrl: `data:${mime};base64,${b64}`,
        }
      : null

    return {
      ok: true,
      text: file ? '' : new TextDecoder().decode(bytes),
      error: '',
      image: file?.image ? { mime, dataUrl: file.dataUrl } : null,
      file,
    }
  } catch {
    return {
      ok: false,
      text: '',
      error: mode.value === 'decode' ? '不是合法的 Base64 内容' : '编码失败',
      image: null,
    }
  }
})

const fileBase64 = computed(() => {
  const url = fileInfo.value?.dataUrl || ''
  const i = url.indexOf(',')
  return i >= 0 ? url.slice(i + 1) : ''
})

const fileOutput = computed(() =>
  outputMode.value === 'raw' ? fileBase64.value : fileInfo.value?.dataUrl || '',
)

function loadFile(file) {
  const reader = new FileReader()
  reader.onload = () => {
    fileInfo.value = {
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl: reader.result,
    }
  }
  reader.readAsDataURL(file)
}

function onPickFile(e) {
  const file = e.target.files?.[0]
  if (file) loadFile(file)
  e.target.value = ''
}

function onDrop(e) {
  const file = e.dataTransfer?.files?.[0]
  if (file) loadFile(file)
}

function formatSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function downloadDecoded() {
  const file = result.value.file
  if (!file) return
  const a = document.createElement('a')
  a.href = file.dataUrl
  a.download = `decoded.${file.ext}`
  a.click()
}

function swap() {
  if (!result.value.ok || !result.value.text) return
  input.value = result.value.text
  mode.value = mode.value === 'encode' ? 'decode' : 'encode'
}

function toggleUrlSafe() {
  urlSafe.value = !urlSafe.value
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="b64-tool">
    <div class="toolbar">
      <div class="segmented">
        <button :class="{ on: mode === 'encode' }" @click="mode = 'encode'">文本编码</button>
        <button :class="{ on: mode === 'decode' }" @click="mode = 'decode'">文本解码</button>
        <button :class="{ on: mode === 'file' }" @click="mode = 'file'">文件</button>
      </div>

      <button
        v-if="mode !== 'file'"
        class="toggle"
        :class="{ on: urlSafe }"
        @click="toggleUrlSafe"
      >
        URL-safe
      </button>

      <span v-if="mode === 'file'" class="stats">
        <template v-if="fileInfo">
          {{ formatSize(fileInfo.size) }} → {{ formatSize(fileBase64.length) }}
        </template>
        <template v-else>选择文件后自动生成 Base64</template>
      </span>
      <span v-else class="stats">{{ input.length }} → {{ result.text.length }} 字符</span>

      <div class="right">
        <template v-if="mode === 'file'">
          <button class="tbtn" :disabled="!fileInfo" @click="copyText(fileOutput)">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </template>
        <template v-else>
          <button class="tbtn" :disabled="!result.ok || !result.text" @click="swap">互换</button>
          <button class="tbtn" :disabled="!result.ok || !result.text" @click="copyText(result.text)">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </template>
      </div>
    </div>

    <div class="body">
      <template v-if="mode === 'file'">
        <div
          class="drop"
          :class="{ filled: fileInfo }"
          @click="fileInputEl?.click()"
          @dragover.prevent
          @drop.prevent="onDrop"
        >
          <template v-if="fileInfo">
            <img v-if="fileInfo.type.startsWith('image/')" :src="fileInfo.dataUrl" class="thumb" />
            <div v-else class="doc">📄</div>
            <p class="file-name">{{ fileInfo.name }}</p>
            <p class="file-sub">
              {{ fileInfo.type || '未知类型' }} · {{ formatSize(fileInfo.size) }} · 点击更换
            </p>
          </template>
          <template v-else>
            <div class="doc">＋</div>
            <p class="file-name">拖入文件或点击选择</p>
            <p class="file-sub">图片、PDF、字体等任意文件</p>
          </template>
          <input ref="fileInputEl" type="file" class="hidden" @change="onPickFile" />
        </div>

        <div class="panel">
          <div class="panel-head">
            <span class="panel-title">Base64 结果</span>
            <div v-if="fileInfo" class="segmented small">
              <button :class="{ on: outputMode === 'dataurl' }" @click="outputMode = 'dataurl'">
                DataURL
              </button>
              <button :class="{ on: outputMode === 'raw' }" @click="outputMode = 'raw'">
                纯 Base64
              </button>
            </div>
          </div>
          <div class="out" :class="{ placeholder: !fileInfo }">
            {{ fileInfo ? fileOutput : '选择文件后自动转换…' }}
          </div>
        </div>
      </template>

      <template v-else>
        <textarea
          v-model="input"
          class="in"
          spellcheck="false"
          :placeholder="
            mode === 'encode' ? '输入要编码的文本（支持中文）' : '粘贴 Base64 或 data:image/... 开头的 DataURL'
          "
        />

        <div class="panel">
          <div class="panel-head">
            <span class="panel-title">
              {{ result.file ? (result.file.image ? '图片预览' : '文件内容') : mode === 'encode' ? 'Base64 结果' : '解码结果' }}
            </span>
            <button v-if="result.file" class="tbtn small" @click="downloadDecoded">下载文件</button>
          </div>

          <div v-if="result.file && result.file.image" class="image-view">
            <img :src="result.file.dataUrl" />
          </div>

          <div v-else-if="result.file" class="file-card">
            <div class="file-icon">📄</div>
            <div class="file-meta">
              <p class="file-name">decoded.{{ result.file.ext }}</p>
              <p class="file-sub">
                {{ result.file.mime }} · {{ formatSize(result.file.size) }}
              </p>
            </div>
            <button class="tbtn" @click="downloadDecoded">下载</button>
          </div>

          <div v-else class="out" :class="{ error: !result.ok, placeholder: !input.trim() }">
            <template v-if="!result.ok">{{ result.error }}</template>
            <template v-else>{{ result.text || '等待输入…' }}</template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.b64-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
}
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: var(--fill-1);
  flex: none;
}
.segmented button {
  padding: 3px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-dim);
}
.segmented button.on {
  background: var(--panel-bg);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.segmented.small button {
  padding: 2px 9px;
  font-size: 11px;
}
.toggle {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-dim);
  flex: none;
}
.toggle.on {
  border-color: transparent;
  background: rgba(0, 122, 255, 0.12);
  color: var(--accent);
  font-weight: 500;
}
.stats {
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tbtn {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn:disabled {
  opacity: 0.4;
  cursor: default;
}
.tbtn.small {
  margin-left: auto;
  color: var(--accent);
  border: none;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.in {
  height: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  outline: none;
  resize: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  box-shadow: var(--shadow-1);
}
.in:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  border: 1.5px dashed rgba(0, 0, 0, 0.18);
  border-radius: 10px;
  background: var(--panel-bg);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.drop:hover {
  border-color: var(--accent);
  background: rgba(0, 122, 255, 0.03);
}
.drop.filled {
  justify-content: flex-start;
  border-style: solid;
  gap: 8px;
}
.doc {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--fill-1);
  font-size: 24px;
  color: var(--text-dim);
}
.thumb {
  max-width: 100%;
  max-height: 60%;
  border-radius: 8px;
  object-fit: contain;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.file-name {
  margin: 0;
  max-width: 100%;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-sub {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hidden {
  display: none;
}
.panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  flex: none;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.out {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--fill-1);
}
.out.error {
  color: var(--danger);
}
.out.placeholder {
  color: var(--text-dim);
}
.file-card {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
}
.file-icon {
  flex: none;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--fill-1);
  font-size: 20px;
}
.file-meta {
  flex: 1;
  min-width: 0;
}
.file-name {
  margin: 0 0 3px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
}
.file-sub {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-dim);
}
.image-view {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  overflow: auto;
  background: repeating-conic-gradient(#f2f2f4 0% 25%, #fff 0% 50%) 50% / 16px 16px;
}
.image-view img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
