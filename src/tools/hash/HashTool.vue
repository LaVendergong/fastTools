<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'
import { useCopy } from '../../lib/useCopy'
const { copied, copy } = useCopy()

/* ---------------- MD5（WebCrypto 不支持，手写实现） ---------------- */
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
  14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296))

function md5(bytes) {
  const len = bytes.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) * 64)
  padded.set(bytes)
  padded[len] = 0x80

  const view = new DataView(padded.buffer)
  const bitLen = len * 8
  view.setUint32(padded.length - 8, bitLen >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(bitLen / 4294967296), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < padded.length; offset += 64) {
    const M = new Uint32Array(16)
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true)

    let A = a0
    let B = b0
    let C = c0
    let D = d0

    for (let i = 0; i < 64; i++) {
      let F
      let g
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }

      F = (F + A + MD5_K[i] + M[g]) >>> 0
      A = D
      D = C
      C = B
      B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) >>> 0
    }

    a0 = (a0 + A) >>> 0
    b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0
    d0 = (d0 + D) >>> 0
  }

  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, a0, true)
  outView.setUint32(4, b0, true)
  outView.setUint32(8, c0, true)
  outView.setUint32(12, d0, true)
  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/* ---------------- 算法定义 ---------------- */

const ALGOS = [
  { id: 'md5', name: 'MD5', subtle: null, bits: 128 },
  { id: 'sha1', name: 'SHA-1', subtle: 'SHA-1', bits: 160 },
  { id: 'sha256', name: 'SHA-256', subtle: 'SHA-256', bits: 256 },
  { id: 'sha384', name: 'SHA-384', subtle: 'SHA-384', bits: 384 },
  { id: 'sha512', name: 'SHA-512', subtle: 'SHA-512', bits: 512 },
]

const STORAGE_KEY = 'toolbox:hash'
const saved = readJSON(STORAGE_KEY)

const mode = ref(saved.mode ?? 'text') // text | file
const text = ref(saved.text ?? '')
const uppercase = ref(saved.uppercase ?? false)
const results = ref({})
const computing = ref(false)
const fileInfo = ref(null) // { name, size }
const fileBytes = ref(null)
const expect = ref('')
const error = ref('')
const dragOver = ref(false)
const fileInputEl = ref(null)

const formatValue = (hash) => (uppercase.value ? hash.toUpperCase() : hash)

function hexFromBuffer(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeAll(bytes) {
  if (!bytes) {
    results.value = {}
    return
  }
  computing.value = true
  error.value = ''
  const next = {}
  try {
    next.md5 = md5(bytes)
    if (crypto?.subtle) {
      for (const algo of ALGOS) {
        if (!algo.subtle) continue
        const digest = await crypto.subtle.digest(algo.subtle, bytes)
        next[algo.id] = hexFromBuffer(digest)
      }
    } else {
      error.value = '当前环境不支持 WebCrypto（需 HTTPS 或 localhost），仅能计算 MD5'
    }
    results.value = next
  } catch (e) {
    error.value = `计算失败：${e.message}`
  } finally {
    computing.value = false
  }
}

/* ---------------- 输入 ---------------- */

let timer = null
watch([text, mode], () => {
  if (mode.value !== 'text') return
  clearTimeout(timer)
  timer = setTimeout(() => {
    computeAll(new TextEncoder().encode(text.value))
  }, 220)
})

async function onPickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (file) await loadFile(file)
}

async function loadFile(file) {
  if (!file) return
  mode.value = 'file'
  fileInfo.value = { name: file.name, size: file.size }
  computing.value = true
  try {
    const buffer = await file.arrayBuffer()
    fileBytes.value = new Uint8Array(buffer)
    await computeAll(fileBytes.value)
  } catch (e) {
    error.value = `读取文件失败：${e.message}`
  } finally {
    computing.value = false
  }
}

function onDrop(e) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) loadFile(file)
}

function switchMode(next) {
  mode.value = next
  if (next === 'text') {
    fileInfo.value = null
    fileBytes.value = null
    computeAll(new TextEncoder().encode(text.value))
  } else if (fileBytes.value) {
    computeAll(fileBytes.value)
  } else {
    results.value = {}
  }
}

/* ---------------- 校验 ---------------- */

const matchedAlgos = computed(() => {
  const target = expect.value.trim().toLowerCase()
  if (!target) return []
  return ALGOS.filter((a) => (results.value[a.id] || '').toLowerCase() === target).map((a) => a.id)
})

/* ---------------- 复制 ---------------- */


function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

let saveTimer = null
watch([mode, text, uppercase], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode: mode.value, text: text.value, uppercase: uppercase.value }),
    )
  }, 400)
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(saveTimer)
})

computeAll(new TextEncoder().encode(text.value))
</script>

<template>
  <div
    class="hash-tool"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="tabs">
      <button :class="{ on: mode === 'text' }" @click="switchMode('text')">文本</button>
      <button :class="{ on: mode === 'file' }" @click="switchMode('file')">文件</button>
      <label class="opt">
        <input v-model="uppercase" type="checkbox" />
        大写输出
      </label>
      <span class="spacer" />
      <span class="hint">拖文件到窗口也可直接计算</span>
    </div>

    <div class="input-area">
      <textarea
        v-if="mode === 'text'"
        v-model="text"
        class="text-input"
        spellcheck="false"
        placeholder="输入要计算摘要的文本"
      />
      <div v-else class="file-zone" @click="fileInputEl?.click()">
        <template v-if="fileInfo">
          <span class="file-icon">📄</span>
          <div class="file-meta">
            <p class="file-name">{{ fileInfo.name }}</p>
            <p class="file-sub">{{ formatSize(fileInfo.size) }}</p>
          </div>
          <button class="btn" @click.stop="fileInputEl?.click()">更换文件</button>
        </template>
        <template v-else>
          <span class="file-icon">⬆</span>
          <p class="file-hint">点击选择文件，或把文件拖到这里</p>
        </template>
      </div>
    </div>

    <div class="results">
      <div v-for="algo in ALGOS" :key="algo.id" class="row" :class="{ match: matchedAlgos.includes(algo.id) }">
        <span class="algo">{{ algo.name }}</span>
        <code class="digest">{{ formatValue(results[algo.id] || '') || '—' }}</code>
        <button class="mini" :disabled="!results[algo.id]" @click="copy(formatValue(results[algo.id]), algo.id)">
          {{ copied === algo.id ? '已复制' : '复制' }}
        </button>
      </div>
    </div>

    <div class="verify">
      <label class="verify-label">校验</label>
      <input v-model="expect" class="expect" placeholder="粘贴一个摘要，自动比对是哪种算法" spellcheck="false" />
      <span v-if="expect" class="verify-result" :class="{ ok: matchedAlgos.length }">
        {{ matchedAlgos.length ? `命中 ${matchedAlgos.map((id) => ALGOS.find((a) => a.id === id).name).join(' / ')}` : '未匹配' }}
      </span>
    </div>

    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="computing" class="computing">计算中…</p>

    <input ref="fileInputEl" type="file" hidden @change="onPickFile" />
  </div>
</template>

<style scoped>
.hash-tool {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hash-tool.dragging {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
  border-radius: 10px;
}
.tabs {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tabs > button {
  padding: 4px 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 12px;
  color: var(--text-dim);
}
.tabs > button.on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}
.opt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
}
.spacer {
  margin-left: auto;
}
.hint {
  font-size: 10.5px;
  color: var(--text-faint);
}
.input-area {
  flex: none;
}
.text-input {
  width: 100%;
  height: 120px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  resize: vertical;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
}
.text-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.file-zone {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 92px;
  padding: 0 16px;
  border: 1px dashed var(--border-strong);
  border-radius: 9px;
  background: var(--panel-bg);
  cursor: pointer;
}
.file-zone:hover {
  border-color: var(--accent);
}
.file-icon {
  font-size: 22px;
}
.file-meta {
  flex: 1;
  min-width: 0;
}
.file-name {
  margin: 0 0 2px;
  font-size: 12.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-sub {
  margin: 0;
  font-size: 11px;
  color: var(--text-faint);
}
.file-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-dim);
}
.btn {
  flex: none;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
}
.btn:hover {
  background: var(--fill-1);
}
.results {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}
.row:last-child {
  border-bottom: none;
}
.row.match {
  background: var(--success-soft);
}
.algo {
  flex: none;
  width: 62px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-dim);
}
.row.match .algo {
  color: var(--success);
}
.digest {
  flex: 1;
  min-width: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  word-break: break-all;
  color: var(--text);
}
.mini {
  flex: none;
  font-size: 10.5px;
  color: var(--accent);
}
.mini:disabled {
  color: var(--text-faint);
  cursor: default;
}
.verify {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
}
.verify-label {
  flex: none;
  font-size: 11.5px;
  color: var(--text-dim);
}
.expect {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.expect:focus {
  border-color: var(--accent);
}
.verify-result {
  flex: none;
  font-size: 11px;
  color: var(--danger);
}
.verify-result.ok {
  color: var(--success);
  font-weight: 500;
}
.err {
  margin: 0;
  font-size: 11.5px;
  color: var(--danger);
}
.computing {
  margin: 0;
  font-size: 11px;
  color: var(--text-faint);
}
</style>
