<script setup>
import { onBeforeUnmount, ref } from 'vue'
import JSZip from 'jszip'

const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512]
const ICO_SIZES = [16, 32, 48]

const fileInputEl = ref(null)
const dragOver = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref('')
const source = ref(null) // { name, url, w, h, bitmap }
const roundMask = ref(false)
const bgColor = ref('') // 空 = 透明
const results = ref([]) // { size, url, blob }
const zipUrl = ref('')

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* 回退 */
    }
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })
  return img
}

function clearResults() {
  results.value.forEach((r) => URL.revokeObjectURL(r.url))
  results.value = []
  if (zipUrl.value) {
    URL.revokeObjectURL(zipUrl.value)
    zipUrl.value = ''
  }
}

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    error.value = '请选择图片文件'
    return
  }
  error.value = ''
  message.value = ''
  busy.value = true
  clearResults()
  if (source.value?.url) URL.revokeObjectURL(source.value.url)

  try {
    const bitmap = await loadBitmap(file)
    source.value = {
      name: file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(file),
      w: bitmap.width || bitmap.naturalWidth,
      h: bitmap.height || bitmap.naturalHeight,
      bitmap,
    }
    await render()
  } catch (e) {
    error.value = `读取失败：${e.message}`
  } finally {
    busy.value = false
  }
}

function onPick(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  loadFile(file)
}

function onDrop(e) {
  dragOver.value = false
  loadFile(e.dataTransfer?.files?.[0])
}

async function canvasFor(size) {
  const src = source.value
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  if (bgColor.value) {
    ctx.fillStyle = bgColor.value
    ctx.fillRect(0, 0, size, size)
  }

  // 居中裁剪成正方形后缩放（cover）
  const side = Math.min(src.w, src.h)
  const sx = (src.w - side) / 2
  const sy = (src.h - side) / 2

  ctx.imageSmoothingQuality = 'high'
  if (roundMask.value) {
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
  }
  ctx.drawImage(src.bitmap, sx, sy, side, side, 0, 0, size, size)
  return canvas
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

async function render() {
  if (!source.value) return
  clearResults()
  for (const size of SIZES) {
    const canvas = await canvasFor(size)
    const blob = await canvasToBlob(canvas)
    results.value.push({ size, blob, url: URL.createObjectURL(blob) })
  }
}

/* ---------------- ICO 打包 ---------------- */

async function buildIco() {
  const picked = []
  for (const size of ICO_SIZES) {
    const canvas = await canvasFor(size)
    const blob = await canvasToBlob(canvas)
    picked.push({ size, bytes: new Uint8Array(await blob.arrayBuffer()) })
  }

  const count = picked.length
  const headerSize = 6 + count * 16
  let offset = headerSize
  const header = new Uint8Array(headerSize)
  const view = new DataView(header.buffer)

  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // type: icon
  view.setUint16(4, count, true)

  picked.forEach((p, i) => {
    const base = 6 + i * 16
    header[base] = p.size >= 256 ? 0 : p.size
    header[base + 1] = p.size >= 256 ? 0 : p.size
    header[base + 2] = 0 // 调色板
    header[base + 3] = 0 // reserved
    view.setUint16(base + 4, 1, true) // planes
    view.setUint16(base + 6, 32, true) // bpp
    view.setUint32(base + 8, p.bytes.length, true)
    view.setUint32(base + 12, offset, true)
    offset += p.bytes.length
  })

  return new Blob([header, ...picked.map((p) => p.bytes)], { type: 'image/x-icon' })
}

const SNIPPET = `<link rel="icon" href="/icons/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180.png">
<link rel="manifest" href="/site.webmanifest">

<!-- site.webmanifest 里引用这两个尺寸 -->
<!-- icons/icon-192.png / icons/icon-512.png -->`

async function downloadZip() {
  if (!source.value || !results.value.length) return
  busy.value = true
  try {
    const zip = new JSZip()
    const folder = zip.folder('icons')

    for (const item of results.value) {
      folder.file(`icon-${item.size}.png`, item.blob)
    }

    const ico = await buildIco()
    folder.file('favicon.ico', ico)

    zip.file('snippet.html', SNIPPET)
    zip.file(
      'site.webmanifest',
      JSON.stringify(
        {
          name: source.value.name,
          short_name: source.value.name,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
          theme_color: bgColor.value || '#ffffff',
          background_color: bgColor.value || '#ffffff',
          display: 'standalone',
        },
        null,
        2,
      ),
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    if (zipUrl.value) URL.revokeObjectURL(zipUrl.value)
    zipUrl.value = URL.createObjectURL(blob)

    // 生成完直接触发下载（只剩 URL 不点一下等于没反应）
    const a = document.createElement('a')
    a.href = zipUrl.value
    a.download = `${source.value.name || 'icons'}-icons.zip`
    a.click()

    message.value = `已生成 ${results.value.length} 个 PNG + favicon.ico（${(blob.size / 1024).toFixed(1)} KB）`
  } catch (e) {
    error.value = `打包失败：${e.message}`
  } finally {
    busy.value = false
  }
}

function downloadSingle(item) {
  const a = document.createElement('a')
  a.href = item.url
  a.download = `icon-${item.size}.png`
  a.click()
}

function reset() {
  clearResults()
  if (source.value?.url) URL.revokeObjectURL(source.value.url)
  source.value = null
  message.value = ''
  error.value = ''
}

onBeforeUnmount(() => {
  clearResults()
  if (source.value?.url) URL.revokeObjectURL(source.value.url)
})
</script>

<template>
  <div
    class="fav"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <div class="toolbar">
      <button class="btn primary" @click="fileInputEl?.click()">选择图片</button>
      <span class="hint-inline">建议正方形、512px 以上；会居中裁剪</span>

      <span class="divider" />

      <label class="opt">
        背景
        <input v-model="bgColor" type="color" class="color" />
        <button class="mini" @click="bgColor = ''">透明</button>
      </label>
      <label class="chk">
        <input v-model="roundMask" type="checkbox" />
        圆形裁剪
      </label>

      <span class="spacer" />
      <button v-if="source" class="btn" :disabled="busy" @click="reset">清空</button>
      <button v-if="source" class="btn primary" :disabled="busy" @click="downloadZip">
        {{ busy ? '生成中…' : '下载全部（zip）' }}
      </button>
    </div>

    <p v-if="error" class="err-bar">{{ error }}</p>

    <div v-if="!source" class="empty">
      <p class="big">拖入一张图，生成全套图标</p>
      <p class="small">
        一次产出 16 / 32 / 48 / 64 / 128 / 180 / 192 / 256 / 512 共 9 个 PNG，
        外加一个多尺寸 <code>favicon.ico</code> 和可直接粘贴的 HTML 片段，打包成 zip 下载。
      </p>
    </div>

    <div v-else class="body">
      <aside class="side">
        <div class="src">
          <img :src="source.url" :alt="source.name" />
          <p class="src-meta">{{ source.name }} · {{ source.w }} × {{ source.h }}</p>
        </div>

        <label class="chk round">
          <input v-model="roundMask" type="checkbox" @change="render" />
          圆形裁剪
        </label>
        <label class="chk">
          背景色
          <input v-model="bgColor" type="color" class="color" @change="render" />
        </label>
        <button class="btn wide" :disabled="busy" @click="render">重新生成</button>
      </aside>

      <section class="grid-wrap">
        <div class="grid">
          <button v-for="item in results" :key="item.size" class="cell" @click="downloadSingle(item)">
            <span class="chip" :style="{ width: Math.min(88, Math.max(20, item.size / 3)) + 'px' }">
              <img :src="item.url" :alt="`${item.size}`" />
            </span>
            <span class="size">{{ item.size }}×{{ item.size }}</span>
          </button>
        </div>
        <p class="tip">点任意图标可单独下载；文件名已按 <code>icon-尺寸.png</code> 命名</p>
      </section>
    </div>

    <p v-if="message" class="msg">{{ message }}</p>

    <p class="hint">
      ICO 内含 16 / 32 / 48 三种尺寸，浏览器按需取用；
      <code>snippet.html</code> 是可直接粘进 <code>&lt;head&gt;</code> 的标签，
      <code>site.webmanifest</code> 已按 PWA 规范写好，把 <code>icons/</code> 整个目录放到 public 下即可。
    </p>

    <input ref="fileInputEl" type="file" accept="image/*" hidden @change="onPick" />
  </div>
</template>

<style scoped>
.fav {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.fav.dragging {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
  border-radius: 10px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
.btn.wide {
  width: 100%;
}
.hint-inline {
  font-size: 10.5px;
  color: var(--text-faint);
}
.divider {
  width: 1px;
  height: 15px;
  background: var(--border);
}
.opt,
.chk {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
  cursor: pointer;
}
.color {
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: none;
}
.mini {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--accent);
}
.mini:hover {
  background: var(--accent-soft);
}
.spacer {
  margin-left: auto;
}
.err-bar {
  flex: none;
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--danger-soft);
  font-size: 11px;
  color: var(--danger);
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  text-align: center;
}
.empty .big {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}
.empty .small {
  margin: 0;
  max-width: 480px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-faint);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
.side {
  flex: none;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.src img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 8px;
  background: var(--surface-4);
}
.src-meta {
  margin: 4px 0 0;
  font-size: 9.5px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chk.round {
  margin-top: 2px;
}
.grid-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: auto;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  padding: 12px;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 4px;
  border-radius: 8px;
  background: var(--fill-1);
}
.cell:hover {
  outline: 1px solid var(--accent);
}
.chip {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88px;
}
.chip img {
  max-width: 100%;
  max-height: 88px;
  image-rendering: -webkit-optimize-contrast;
}
.size {
  font-size: 9.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.tip {
  margin: auto 0 0;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 9.5px;
  color: var(--text-faint);
}
.tip code,
.hint code,
.empty code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
.msg {
  flex: none;
  margin: 0;
  font-size: 10.5px;
  color: var(--success);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
</style>
