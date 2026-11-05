<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { readJSON } from '../../lib/storage'

const STORAGE_KEY = 'toolbox:color'
const saved = readJSON(STORAGE_KEY)

const input = ref(saved.input ?? '#4F8EF7')
const copiedKey = ref('')
const recent = ref(Array.isArray(saved.recent) ? saved.recent : [])
const myColors = ref(Array.isArray(saved.myColors) ? saved.myColors : [])
const message = ref('')
const supportsDropper = typeof window !== 'undefined' && 'EyeDropper' in window

// 常用色板：macOS 系统色 + 几个常用品牌色
const PRESETS = [
  '#1D1D1F', '#48484A', '#8E8E93', '#C7C7CC', '#FFFFFF', '#F2F2F7',
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#32ADE6',
  '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#4F8EF7',
]

function hex2(n) {
  return n.toString(16).padStart(2, '0').toUpperCase()
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = l - c / 2
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

function rgbToHsl(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

const parsed = computed(() => {
  const s = input.value.trim().toLowerCase()
  if (!s) return null

  let m = /^#?([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    const h = m[1]
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = h.split('').map((c) => parseInt(c + c, 16))
      return { r, g, b, a: h.length === 4 ? a / 255 : 1 }
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      }
    }
  }

  m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number)
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
      return { r: Math.round(parts[0]), g: Math.round(parts[1]), b: Math.round(parts[2]), a: parts[3] ?? 1 }
    }
  }

  m = /^hsla?\(([^)]+)\)$/.exec(s)
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(parseFloat)
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      const rgb = hslToRgb(parts[0], parts[1] / 100, parts[2] / 100)
      return { ...rgb, a: parts[3] ?? 1 }
    }
  }

  return null
})

const hex6 = computed(() =>
  parsed.value ? `#${hex2(parsed.value.r)}${hex2(parsed.value.g)}${hex2(parsed.value.b)}` : '',
)

const hex8 = computed(() =>
  parsed.value
    ? `${hex6.value}${hex2(Math.round(parsed.value.a * 255))}`
    : '',
)

const colorCss = computed(() =>
  parsed.value
    ? `rgba(${parsed.value.r}, ${parsed.value.g}, ${parsed.value.b}, ${parsed.value.a})`
    : 'transparent',
)

const textColor = computed(() => {
  const c = parsed.value
  if (!c) return '#1d1d1f'
  const luminance = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255
  return luminance > 0.6 ? '#1d1d1f' : '#ffffff'
})

const formats = computed(() => {
  const c = parsed.value
  if (!c) return []
  const hsl = rgbToHsl(c.r, c.g, c.b)
  const max = Math.max(c.r, c.g, c.b) / 255
  const min = Math.min(c.r, c.g, c.b) / 255
  const v = Math.round(max * 100)
  const sat = max === 0 ? 0 : Math.round(((max - min) / max) * 100)
  const alpha = c.a < 1 ? `, ${Number(c.a.toFixed(2))}` : ''

  return [
    { key: 'hex', label: 'HEX', value: c.a < 1 ? hex8.value : hex6.value },
    {
      key: 'rgb',
      label: c.a < 1 ? 'RGBA' : 'RGB',
      value: c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${Number(c.a.toFixed(2))})` : `rgb(${c.r}, ${c.g}, ${c.b})`,
    },
    {
      key: 'hsl',
      label: c.a < 1 ? 'HSLA' : 'HSL',
      value: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%${alpha})`,
    },
    { key: 'hsv', label: 'HSV', value: `hsv(${hsl.h}, ${sat}%, ${v}%)` },
    { key: 'css', label: 'CSS 变量', value: `--color: ${hex6.value};` },
  ]
})

let saveTimer
let recentTimer = null

function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        input: input.value,
        recent: recent.value,
        myColors: myColors.value,
      }),
    )
  }, 300)
}

watch([input, recent, myColors], () => {
  persist()
  scheduleRecent()
}, { deep: true })

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(recentTimer)
})

function pick(e) {
  input.value = e.target.value.toUpperCase()
}

/* ---- 最近使用 / 我的色板 ---- */

function pushRecent(hex) {
  const value = String(hex).toUpperCase()
  recent.value = [value, ...recent.value.filter((c) => c !== value)].slice(0, 14)
}

// 手动输入也记一笔，但等停止输入后再记（已在首位时跳过，避免自我触发）
function scheduleRecent() {
  clearTimeout(recentTimer)
  recentTimer = setTimeout(() => {
    if (parsed.value && recent.value[0] !== hex6.value) pushRecent(hex6.value)
  }, 900)
}

function applyColor(hex) {
  input.value = String(hex).toUpperCase()
  pushRecent(hex)
  message.value = ''
}

function saveToPalette() {
  if (!parsed.value) return
  const value = hex6.value
  if (myColors.value.includes(value)) {
    message.value = '这个颜色已经在色板里了'
    return
  }
  myColors.value = [...myColors.value, value].slice(-30)
  message.value = `已保存 ${value}`
  setTimeout(() => {
    if (message.value.startsWith('已保存')) message.value = ''
  }, 1600)
}

function removeMyColor(color) {
  myColors.value = myColors.value.filter((c) => c !== color)
}

async function pickFromScreen() {
  if (!supportsDropper) return
  try {
    const dropper = new window.EyeDropper()
    const result = await dropper.open()
    applyColor(result.sRGBHex)
  } catch (e) {
    if (e.name !== 'AbortError') message.value = `取色失败：${e.message}`
  }
}

async function copy(value, key) {
  try {
    await navigator.clipboard.writeText(value)
    copiedKey.value = key
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
    }, 1200)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="color-tool">
    <div class="toolbar">
      <input
        v-model="input"
        class="input mono"
        placeholder="#4F8EF7 / rgb(79,142,247) / hsl(215,91%,64%)"
        spellcheck="false"
      />
      <input
        type="color"
        class="picker"
        :value="hex6 || '#000000'"
        title="打开系统取色面板"
        @input="pick"
      />
      <button
        class="screen-pick"
        :disabled="!supportsDropper"
        :title="supportsDropper ? '从屏幕任意位置取色' : '当前浏览器不支持屏幕取色（需 Chrome / Edge）'"
        @click="pickFromScreen"
      >
        <span class="drop-icon">💧</span> 屏幕取色
      </button>
      <button class="save-btn" :disabled="!parsed" @click="saveToPalette">＋ 存色板</button>
      <span v-if="!parsed" class="err">无法识别的颜色格式</span>
    </div>

    <div class="preview" :style="{ background: colorCss }">
      <div class="preview-inner" :style="{ color: textColor }">
        <span class="hex">{{ hex6 || '—' }}</span>
        <button v-if="parsed" class="copy-hex" @click="copy(hex6, 'preview')">
          {{ copiedKey === 'preview' ? '已复制' : '复制' }}
        </button>
      </div>
    </div>

    <div v-if="formats.length" class="formats">
      <button
        v-for="f in formats"
        :key="f.key"
        class="card"
        @click="copy(f.value, f.key)"
      >
        <span class="label">{{ f.label }}</span>
        <code>{{ f.value }}</code>
        <span class="copied" :class="{ show: copiedKey === f.key }">已复制</span>
      </button>
    </div>

    <div class="palette">
      <div class="pal-group">
        <span class="pal-title">常用</span>
        <div class="swatches">
          <button
            v-for="c in PRESETS"
            :key="c"
            class="swatch"
            :class="{ on: c.toUpperCase() === hex6 }"
            :style="{ background: c }"
            :title="c"
            @click="applyColor(c)"
          />
        </div>
      </div>

      <div v-if="recent.length" class="pal-group">
        <span class="pal-title">最近</span>
        <div class="swatches">
          <button
            v-for="c in recent"
            :key="c"
            class="swatch"
            :class="{ on: c === hex6 }"
            :style="{ background: c }"
            :title="c"
            @click="applyColor(c)"
          />
        </div>
      </div>

      <div class="pal-group">
        <span class="pal-title">我的</span>
        <div class="swatches">
          <button
            v-for="c in myColors"
            :key="c"
            class="swatch"
            :class="{ on: c === hex6 }"
            :style="{ background: c }"
            :title="`${c}（右键删除）`"
            @click="applyColor(c)"
            @contextmenu.prevent="removeMyColor(c)"
          />
          <span v-if="!myColors.length" class="pal-empty">点「＋ 存色板」收藏颜色</span>
        </div>
      </div>

      <p v-if="message" class="pal-msg">{{ message }}</p>
    </div>
  </div>
</template>

<style scoped>
.color-tool {
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
  gap: 8px;
  padding: 8px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
}
.input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  outline: none;
  font-size: 13px;
}
.mono {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}
.picker {
  flex: none;
  width: 38px;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  cursor: pointer;
}
.err {
  flex: none;
  font-size: 12px;
  color: var(--danger);
}
.preview {
  flex: 1;
  min-height: 120px;
  display: flex;
  align-items: flex-end;
  padding: 16px 18px;
  border-radius: 10px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-1);
  transition: background 0.15s ease;
}
.preview-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hex {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.copy-hex {
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 11.5px;
  border: 1px solid currentColor;
  opacity: 0.75;
}
.copy-hex:hover {
  opacity: 1;
}
.formats {
  flex: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: 10px;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  text-align: left;
  box-shadow: var(--shadow-1);
}
.card:hover {
  border-color: rgba(0, 122, 255, 0.4);
}
.label {
  font-size: 11px;
  color: var(--text-dim);
}
code {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copied {
  position: absolute;
  right: 10px;
  top: 10px;
  font-size: 11px;
  color: var(--success);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.copied.show {
  opacity: 1;
}
.screen-pick,
.save-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel-bg);
  font-size: 11.5px;
  color: var(--text);
  white-space: nowrap;
}
.screen-pick:hover:not(:disabled),
.save-btn:hover:not(:disabled) {
  background: var(--fill-1);
}
.screen-pick:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.screen-pick:disabled,
.save-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.drop-icon {
  font-size: 11px;
}

/* 色板 */
.palette {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-1);
}
.pal-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 24px;
}
.pal-title {
  flex: none;
  width: 30px;
  font-size: 10.5px;
  color: var(--text-faint);
}
.swatches {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.swatch:hover {
  transform: translateY(-2px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.22);
}
.swatch.on {
  box-shadow: 0 0 0 2px var(--panel-bg), 0 0 0 3.5px var(--accent);
}
.pal-empty {
  font-size: 10.5px;
  color: var(--text-faint);
}
.pal-msg {
  margin: 0;
  font-size: 10.5px;
  color: var(--accent);
}
</style>
