<script setup>
import { onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'

const STORAGE_KEY = 'toolbox:qrcode'
const SIZES = [128, 192, 256, 320, 384, 512]
const LEVELS = [
  { value: 'L', label: 'L' },
  { value: 'M', label: 'M' },
  { value: 'Q', label: 'Q' },
  { value: 'H', label: 'H' },
]

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const text = ref(saved.text ?? 'https://example.com')
const size = ref(saved.size ?? 256)
const level = ref(saved.level ?? 'M')
const dark = ref(saved.dark ?? '#000000')
const light = ref(saved.light ?? '#FFFFFF')
const margin = ref(saved.margin ?? 2)

const canvasEl = ref(null)
const error = ref('')

async function render() {
  if (!canvasEl.value) return
  if (!text.value.trim()) {
    error.value = '请输入要生成二维码的内容'
    const ctx = canvasEl.value.getContext('2d')
    ctx.clearRect(0, 0, canvasEl.value.width, canvasEl.value.height)
    return
  }

  try {
    await QRCode.toCanvas(canvasEl.value, text.value, {
      width: size.value,
      margin: margin.value,
      errorCorrectionLevel: level.value,
      color: { dark: dark.value, light: light.value },
    })
    error.value = ''
  } catch {
    error.value = '内容太长，无法在所选尺寸下生成，可降低纠错级别或缩短内容'
  }
}

onMounted(render)

let saveTimer
watch(
  [text, size, level, dark, light, margin],
  () => {
    render()
    clearTimeout(saveTimer)
    saveTimer = setTimeout(
      () =>
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            text: text.value,
            size: size.value,
            level: level.value,
            dark: dark.value,
            light: light.value,
            margin: margin.value,
          }),
        ),
      300,
    )
  },
  { flush: 'post' },
)

function download() {
  if (!canvasEl.value || error.value) return
  const a = document.createElement('a')
  a.href = canvasEl.value.toDataURL('image/png')
  a.download = 'qrcode.png'
  a.click()
}
</script>

<template>
  <div class="qr-tool">
    <div class="body">
      <div class="preview">
        <div class="canvas-wrap">
          <canvas ref="canvasEl" class="canvas" />
        </div>
        <p v-if="error" class="err">{{ error }}</p>
        <button class="tbtn primary" :disabled="!!error || !text.trim()" @click="download">
          下载 PNG
        </button>
      </div>

      <div class="panel">
        <div class="panel-head">
          <span class="panel-title">内容与样式</span>
        </div>
        <div class="pane">
          <label class="field-label">内容</label>
          <textarea
            v-model="text"
            class="textarea"
            spellcheck="false"
            placeholder="输入文本、链接或任意内容"
          />

          <div class="row">
            <span class="field-label">尺寸</span>
            <select v-model.number="size" class="select">
              <option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option>
            </select>
          </div>

          <div class="row">
            <span class="field-label">纠错级别</span>
            <div class="segmented">
              <button
                v-for="l in LEVELS"
                :key="l.value"
                :class="{ on: level === l.value }"
                :title="`纠错级别 ${l.value}`"
                @click="level = l.value"
              >
                {{ l.label }}
              </button>
            </div>
          </div>

          <div class="row">
            <span class="field-label">前景色</span>
            <input v-model="dark" type="color" class="color" />
            <code>{{ dark.toUpperCase() }}</code>
          </div>

          <div class="row">
            <span class="field-label">背景色</span>
            <input v-model="light" type="color" class="color" />
            <code>{{ light.toUpperCase() }}</code>
          </div>

          <div class="row">
            <span class="field-label">留白</span>
            <input v-model.number="margin" type="range" min="0" max="8" class="range" />
            <span class="val">{{ margin }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-tool {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 10px;
}
.preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #f5f5f7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: auto;
}
.canvas-wrap {
  display: flex;
  padding: 12px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.1);
}
.canvas {
  display: block;
  max-width: 100%;
  height: auto;
  image-rendering: pixelated;
}
.tbtn {
  padding: 6px 16px;
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 12.5px;
  background: #fff;
}
.tbtn:hover:not(:disabled) {
  background: var(--hover);
}
.tbtn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.tbtn.primary:hover:not(:disabled) {
  background: #0071e3;
}
.tbtn:disabled {
  opacity: 0.45;
  cursor: default;
}
.err {
  margin: 0;
  max-width: 42ch;
  font-size: 12px;
  color: #d70015;
  text-align: center;
}
.panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.panel-head {
  flex: none;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
}
.pane {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
}
.field-label {
  flex: none;
  font-size: 12px;
  color: var(--text-dim);
}
.textarea {
  width: 100%;
  min-height: 84px;
  margin: 6px 0 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.6;
}
.textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.row .field-label {
  width: 56px;
}
.select {
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  outline: none;
}
.segmented {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
}
.segmented button {
  width: 30px;
  height: 22px;
  border-radius: 4px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.segmented button.on {
  background: #fff;
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
.color {
  width: 34px;
  height: 26px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
}
code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-dim);
}
.range {
  flex: 1;
  min-width: 60px;
  accent-color: var(--accent);
}
.val {
  flex: none;
  width: 16px;
  font-size: 12px;
  color: var(--text-dim);
  text-align: right;
}
</style>
