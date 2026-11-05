<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const STORAGE_KEY = 'toolbox:qrdesign'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const text = ref(saved.text ?? 'https://github.com/LaVendergong/fastTools')
const level = ref(saved.level ?? 'M')
const size = ref(saved.size ?? 512)
const margin = ref(saved.margin ?? 4)
const fg = ref(saved.fg ?? '#111827')
const bg = ref(saved.bg ?? '#ffffff')
const dot = ref(saved.dot ?? 'rounded') // square | rounded | dots
const logoSize = ref(saved.logoSize ?? 22)

const canvasEl = ref(null)
const logoFileEl = ref(null)
const logo = ref(null) // { url, img }
const error = ref('')
const message = ref('')
const copied = ref('')

let QRCode = null
async function ensureQr() {
  if (!QRCode) {
    const mod = await import('qrcode')
    QRCode = mod.default || mod
  }
  return QRCode
}

/* ---------------- 绘制 ---------------- */

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius)
  else {
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + w, y, x + w, y + h, radius)
    ctx.arcTo(x + w, y + h, x, y + h, radius)
    ctx.arcTo(x, y + h, x, y, radius)
    ctx.arcTo(x, y, x + w, y, radius)
  }
  ctx.closePath()
}

async function draw() {
  const canvas = canvasEl.value
  if (!canvas) return
  error.value = ''
  const content = text.value.trim()
  if (!content) {
    canvas.width = 0
    canvas.height = 0
    return
  }

  try {
    const lib = await ensureQr()
    const qr = lib.create(content, { errorCorrectionLevel: level.value })
    const count = qr.modules.size
    const data = qr.modules.data

    // 留白按「模块数」算：标准要求至少 4 个模块的静默区，否则扫不出来
    const total = Number(size.value) || 512
    const quiet = Number(margin.value) || 0
    const cell = Math.max(1, Math.floor(total / (count + quiet * 2)))
    const pad = cell * quiet
    const real = cell * (count + quiet * 2)

    canvas.width = real
    canvas.height = real
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = bg.value
    ctx.fillRect(0, 0, real, real)
    ctx.fillStyle = fg.value

    const isDark = (x, y) => data[y * count + x] === 1

    // 三个定位角单独画成实心图形，散点样式下也不会影响识别
    const inFinder = (x, y) =>
      (x < 7 && y < 7) || (x >= count - 7 && y < 7) || (x < 7 && y >= count - 7)

    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        if (!isDark(x, y) || inFinder(x, y)) continue
        const px = pad + x * cell
        const py = pad + y * cell

        if (dot.value === 'square') {
          ctx.fillRect(px, py, cell + 0.5, cell + 0.5)
        } else if (dot.value === 'dots') {
          // 半径不能太小：低于 0.65 个模块时，模块之间断开，jsQR 之类的解析器会失败
          ctx.beginPath()
          ctx.arc(px + cell / 2, py + cell / 2, cell * 0.66, 0, Math.PI * 2)
          ctx.fill()
        } else {
          roundRect(ctx, px, py, cell + 0.5, cell + 0.5, cell * 0.28)
          ctx.fill()
        }
      }
    }

    // 定位图形：外 7×7 实心 + 中间 5×5 挖空 + 内 3×3 实心
    const drawFinder = (ox, oy) => {
      const x = pad + ox * cell
      const y = pad + oy * cell
      const sharp = dot.value === 'square'
      const outer = sharp ? 0 : cell * 1.6
      const hole = sharp ? 0 : cell * 1.1
      const inner = sharp ? 0 : cell * 0.8

      ctx.fillStyle = fg.value
      roundRect(ctx, x, y, cell * 7, cell * 7, outer)
      ctx.fill()

      ctx.fillStyle = bg.value
      roundRect(ctx, x + cell, y + cell, cell * 5, cell * 5, hole)
      ctx.fill()

      ctx.fillStyle = fg.value
      roundRect(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, inner)
      ctx.fill()
    }

    drawFinder(0, 0)
    drawFinder(count - 7, 0)
    drawFinder(0, count - 7)

    // 中间 logo：先铺一块圆角底色，避免花纹干扰识别
    if (logo.value?.img) {
      const ratio = Number(logoSize.value) / 100
      const boxSize = real * ratio
      const boxX = (real - boxSize) / 2
      const boxY = (real - boxSize) / 2
      const inset = boxSize * 0.1

      ctx.fillStyle = bg.value
      roundRect(ctx, boxX - inset, boxY - inset, boxSize + inset * 2, boxSize + inset * 2, boxSize * 0.22)
      ctx.fill()

      ctx.save()
      roundRect(ctx, boxX, boxY, boxSize, boxSize, boxSize * 0.18)
      ctx.clip()
      ctx.drawImage(logo.value.img, boxX, boxY, boxSize, boxSize)
      ctx.restore()
    }
  } catch (e) {
    error.value = `生成失败：${e.message}`
  }
}

/* ---------------- 交互 ---------------- */

function onLogoPick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  img.onload = () => {
    if (logo.value?.url) URL.revokeObjectURL(logo.value.url)
    logo.value = { url, img }
    message.value = '已添加 logo'
    setTimeout(() => (message.value = ''), 1500)
  }
}

function removeLogo() {
  if (logo.value?.url) URL.revokeObjectURL(logo.value.url)
  logo.value = null
  draw()
}

function download() {
  const canvas = canvasEl.value
  if (!canvas || !canvas.width) return
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'qrcode.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }, 'image/png')
}

async function copyText() {
  try {
    await navigator.clipboard.writeText(text.value)
    copied.value = 'text'
    setTimeout(() => (copied.value = ''), 1200)
  } catch {
    /* 忽略 */
  }
}

const PRESETS = [
  { name: '默认', fg: '#111827', bg: '#ffffff', dot: 'rounded' },
  { name: '微信绿', fg: '#07C160', bg: '#ffffff', dot: 'dots' },
  { name: '深蓝', fg: '#1D4ED8', bg: '#F8FAFC', dot: 'rounded' },
  { name: '暗色', fg: '#F9FAFB', bg: '#111827', dot: 'dots' },
  { name: '橙色', fg: '#EA580C', bg: '#FFFBEB', dot: 'square' },
]

function applyPreset(preset) {
  fg.value = preset.fg
  bg.value = preset.bg
  dot.value = preset.dot
  draw()
}

let timer = null
watch([text, level, size, margin, fg, bg, dot, logoSize], () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    draw()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        text: text.value,
        level: level.value,
        size: size.value,
        margin: margin.value,
        fg: fg.value,
        bg: bg.value,
        dot: dot.value,
        logoSize: logoSize.value,
      }),
    )
  }, 220)
})

onMounted(draw)
onBeforeUnmount(() => {
  clearTimeout(timer)
  if (logo.value?.url) URL.revokeObjectURL(logo.value.url)
})
</script>

<template>
  <div class="qrd">
    <div class="toolbar">
      <input v-model="text" class="input" spellcheck="false" placeholder="输入网址或文本" />
      <button class="btn" @click="copyText">{{ copied ? '已复制' : '复制内容' }}</button>
      <span class="spacer" />
      <button class="btn" @click="logoFileEl?.click()">上传 logo</button>
      <button class="btn" :disabled="!canvasEl?.width" @click="download">下载 PNG</button>
    </div>

    <div class="body">
      <aside class="panel">
        <div class="group">
          <span class="group-title">配色</span>
          <div class="presets">
            <button
              v-for="p in PRESETS"
              :key="p.name"
              class="preset"
              :title="p.name"
              :style="{ background: `linear-gradient(135deg, ${p.fg} 45%, ${p.bg} 55%)` }"
              @click="applyPreset(p)"
            />
          </div>
          <label class="field">
            前景色
            <input v-model="fg" type="color" class="color" />
            <code>{{ fg }}</code>
          </label>
          <label class="field">
            背景色
            <input v-model="bg" type="color" class="color" />
            <code>{{ bg }}</code>
          </label>
        </div>

        <div class="group">
          <span class="group-title">样式</span>
          <div class="seg">
            <button :class="{ on: dot === 'square' }" @click="dot = 'square'">方块</button>
            <button :class="{ on: dot === 'rounded' }" @click="dot = 'rounded'">圆角</button>
            <button :class="{ on: dot === 'dots' }" @click="dot = 'dots'">圆点</button>
          </div>

          <label class="field">
            尺寸
            <select v-model.number="size" class="select">
              <option :value="256">256 px</option>
              <option :value="512">512 px</option>
              <option :value="1024">1024 px</option>
            </select>
          </label>

          <label class="field">
            留白
            <input v-model.number="margin" class="num" type="number" min="0" max="10" />
            <span class="unit">模块</span>
          </label>

          <label class="field">
            纠错级别
            <select v-model="level" class="select">
              <option value="L">L（7%）</option>
              <option value="M">M（15%）</option>
              <option value="Q">Q（25%）</option>
              <option value="H">H（30%）</option>
            </select>
          </label>

          <label v-if="logo" class="field">
            logo 大小
            <input v-model.number="logoSize" class="num" type="number" min="10" max="35" />
            <button class="mini" @click="removeLogo">移除</button>
          </label>
        </div>

        <p class="note">
          加 logo 时建议纠错级别选 H（30%），被遮挡也能扫出来。
        </p>
      </aside>

      <section class="preview">
        <div class="canvas-wrap">
          <canvas ref="canvasEl" class="canvas" />
        </div>
        <p v-if="error" class="err">{{ error }}</p>
        <p v-else-if="message" class="msg">{{ message }}</p>
        <p v-else class="tip">改动即时重绘，下载为 PNG（透明背景可用留白 0 + 背景色透明实现）</p>
      </section>
    </div>

    <input ref="logoFileEl" type="file" accept="image/*" hidden @change="onLogoPick" />
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
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.input {
  flex: 1;
  min-width: 0;
  padding: 6px 11px;
  border: 1px solid var(--accent);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 12px;
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
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.panel {
  flex: none;
  width: 230px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: auto;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.group-title {
  font-size: 10px;
  color: var(--text-faint);
  letter-spacing: 0.04em;
}
.presets {
  display: flex;
  gap: 6px;
}
.preset {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  border: 1px solid var(--border);
}
.preset:hover {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.field code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
  color: var(--text-faint);
}
.unit {
  font-size: 9.5px;
  color: var(--text-faint);
}
.color {
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: none;
}
.select {
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
}
.num {
  width: 54px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 10.5px;
  text-align: center;
}
.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.seg button {
  flex: 1;
  padding: 3px 0;
  border-radius: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
}
.seg button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.mini {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--danger);
  background: var(--danger-soft);
}
.note {
  margin: auto 0 0;
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--text-faint);
}
.preview {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-4);
  overflow: auto;
}
.canvas-wrap {
  margin: auto;
  padding: 16px;
}
.canvas {
  display: block;
  max-width: 100%;
  max-height: 420px;
  border-radius: 8px;
  box-shadow: var(--shadow-1);
}
.err,
.msg,
.tip {
  flex: none;
  margin: 0;
  padding: 6px 12px;
  border-top: 1px solid var(--border);
  font-size: 9.5px;
  text-align: center;
}
.err {
  color: var(--danger);
  background: var(--danger-soft);
}
.msg {
  color: var(--success);
}
.tip {
  color: var(--text-faint);
}
</style>
