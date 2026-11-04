<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import jsQR from 'jsqr'

const fileInputEl = ref(null)
const videoEl = ref(null)
const canvasEl = ref(null)
const dragOver = ref(false)
const scanning = ref(false)
const cameraOn = ref(false)
const message = ref('')
const result = ref(null) // { text, imageUrl, width, height, time }
const history = ref([])
const copied = ref(false)

const hasResult = computed(() => Boolean(result.value?.text))

let stream = null
let rafId = null

/* ---------------- 图片解码 ---------------- */

function decodeFromCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })
}

async function decodeBlob(blob) {
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  }).catch(() => {})

  if (!img.naturalWidth) {
    URL.revokeObjectURL(url)
    message.value = '图片读取失败'
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d').drawImage(img, 0, 0)

  const code = decodeFromCanvas(canvas)
  if (!code) {
    message.value = '没有识别到二维码，试试更清晰、更完整的图片'
    scanning.value = false
    return
  }

  message.value = ''
  result.value = {
    text: code.data,
    imageUrl: url,
    width: img.naturalWidth,
    height: img.naturalHeight,
  }
  pushHistory(code.data)
  scanning.value = false
}

function pushHistory(text) {
  const exists = history.value.find((h) => h.text === text)
  if (exists) {
    exists.time = Date.now()
    return
  }
  history.value.unshift({ text, time: Date.now() })
  if (history.value.length > 20) history.value.pop()
}

async function onPickFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  scanning.value = true
  message.value = ''
  await decodeBlob(file)
}

function onDrop(e) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  scanning.value = true
  decodeBlob(file)
}

// 支持直接粘贴截图
async function onPaste(e) {
  const items = Array.from(e.clipboardData?.items || [])
  const imageItem = items.find((i) => i.type.startsWith('image/'))
  if (!imageItem) return
  const file = imageItem.getAsFile()
  if (!file) return
  scanning.value = true
  message.value = ''
  await decodeBlob(file)
}

/* ---------------- 摄像头扫描 ---------------- */

async function toggleCamera() {
  if (cameraOn.value) {
    stopCamera()
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
    })
    cameraOn.value = true
    message.value = ''
    await new Promise((resolve) => setTimeout(resolve, 100))
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play()
    }
    scanFrame()
  } catch (e) {
    cameraOn.value = false
    message.value = `无法打开摄像头：${e.message}`
  }
}

function scanFrame() {
  const video = videoEl.value
  const canvas = canvasEl.value
  if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
    rafId = requestAnimationFrame(scanFrame)
    return
  }

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  const code = decodeFromCanvas(canvas)
  if (code?.data) {
    result.value = {
      text: code.data,
      imageUrl: '',
      width: canvas.width,
      height: canvas.height,
    }
    pushHistory(code.data)
    stopCamera()
    return
  }
  rafId = requestAnimationFrame(scanFrame)
}

function stopCamera() {
  cancelAnimationFrame(rafId)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  cameraOn.value = false
}

/* ---------------- 结果操作 ---------------- */

async function copyResult() {
  if (!result.value?.text) return
  try {
    await navigator.clipboard.writeText(result.value.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1200)
  } catch {
    /* 忽略 */
  }
}

function openInBrowser() {
  const text = result.value?.text || ''
  if (/^https?:\/\//i.test(text)) window.open(text, '_blank', 'noopener,noreferrer')
}

function clearAll() {
  if (result.value?.imageUrl) URL.revokeObjectURL(result.value.imageUrl)
  result.value = null
  message.value = ''
}

function reuseHistory(item) {
  result.value = { text: item.text, imageUrl: '', width: 0, height: 0 }
}

onMounted(() => {
  window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  stopCamera()
  if (result.value?.imageUrl) URL.revokeObjectURL(result.value.imageUrl)
})
</script>

<template>
  <div
    class="qrd"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <button class="btn primary" @click="fileInputEl?.click()">选择图片</button>
      <button class="btn" :class="{ on: cameraOn }" @click="toggleCamera">
        {{ cameraOn ? '停止摄像头' : '用摄像头扫' }}
      </button>
      <span class="hint">也可以直接拖图片进来，或 Ctrl+V 粘贴截图</span>
      <span class="spacer" />
      <button class="btn" :disabled="!hasResult" @click="copyResult">
        {{ copied ? '已复制' : '复制内容' }}
      </button>
      <button
        v-if="hasResult && /^https?:\/\//i.test(result.text)"
        class="btn"
        @click="openInBrowser"
      >
        打开链接
      </button>
      <button class="btn" :disabled="!result" @click="clearAll">清空</button>
    </div>

    <div class="body">
      <section class="stage">
        <video v-show="cameraOn" ref="videoEl" class="video" muted playsinline />
        <canvas ref="canvasEl" hidden />

        <div v-if="!cameraOn" class="stage-inner">
          <img v-if="result?.imageUrl" :src="result.imageUrl" class="preview-img" alt="二维码" />
          <div v-else class="placeholder">
            <p class="big">拖入二维码图片</p>
            <p class="small">支持 PNG / JPEG / WebP，也可以粘贴截图或用摄像头实时扫描</p>
          </div>
        </div>

        <p v-if="cameraOn" class="camera-tip">把二维码对准取景框，识别后自动停止</p>
      </section>

      <aside class="result-panel">
        <div class="rp-head">
          <span class="rp-title">识别结果</span>
          <span v-if="result" class="rp-meta">{{ result.text.length }} 字符</span>
        </div>

        <div class="rp-body">
          <p v-if="message" class="msg">{{ message }}</p>
          <p v-else-if="!hasResult" class="tip">还没有识别结果</p>
          <template v-else>
            <pre class="text">{{ result.text }}</pre>
            <p v-if="/^https?:\/\//i.test(result.text)" class="link-tip">这是一个网址，可以点上方「打开链接」</p>
          </template>
        </div>

        <div v-if="history.length" class="history">
          <p class="history-title">最近识别</p>
          <button
            v-for="(h, i) in history"
            :key="i"
            class="history-row"
            :title="h.text"
            @click="reuseHistory(h)"
          >
            {{ h.text.slice(0, 60) }}{{ h.text.length > 60 ? '…' : '' }}
          </button>
        </div>
      </aside>
    </div>

    <input ref="fileInputEl" type="file" accept="image/*" hidden @change="onPickFile" />
  </div>
</template>

<style scoped>
.qrd {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.qrd.dragging {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
  border-radius: 10px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
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
.btn.primary:hover {
  background: var(--accent-strong);
}
.btn.on {
  border-color: transparent;
  background: var(--danger-soft);
  color: var(--danger);
}
.hint {
  min-width: 0;
  font-size: 10.5px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spacer {
  margin-left: auto;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.stage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-4);
  overflow: hidden;
}
.stage-inner {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: var(--shadow-2);
}
.placeholder {
  text-align: center;
}
.placeholder .big {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-dim);
}
.placeholder .small {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-faint);
}
.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}
.camera-tip {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10.5px;
  white-space: nowrap;
}
.result-panel {
  flex: none;
  width: 300px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
}
.rp-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--fill-1);
}
.rp-title {
  font-size: 11.5px;
  font-weight: 600;
}
.rp-meta {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-faint);
}
.rp-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
}
.text {
  margin: 0;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--code-bg);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}
.link-tip {
  margin: 8px 0 0;
  font-size: 10.5px;
  color: var(--accent);
}
.msg {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--danger);
}
.tip {
  margin: 10px 0;
  font-size: 11.5px;
  color: var(--text-faint);
}
.history {
  flex: none;
  max-height: 150px;
  overflow: auto;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  background: var(--fill-1);
}
.history-title {
  margin: 0 0 5px;
  font-size: 10px;
  color: var(--text-faint);
}
.history-row {
  display: block;
  width: 100%;
  padding: 3px 6px;
  border-radius: 5px;
  text-align: left;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-row:hover {
  background: var(--fill-2);
  color: var(--text);
}
</style>
