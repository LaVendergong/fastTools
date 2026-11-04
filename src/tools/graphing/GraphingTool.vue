<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { evaluate } from '../calculator/expr'

const COLORS = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#000000', '#c7449a', '#0e8a8a']
const STORAGE_KEY = 'toolbox:graphing'
const DEFAULT_VIEW = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 }

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

let seq = 1
const expressions = ref(
  saved.expressions?.length
    ? saved.expressions.map((e) => ({ ...e, id: seq++, error: '' }))
    : [{ id: seq++, text: 'y = sin(x)', color: COLORS[0], visible: true, error: '' }],
)

const view = reactive({ ...DEFAULT_VIEW, ...(saved.view || {}) })
const params = ref([])
const hover = ref(null)
const wrapEl = ref(null)
const canvasEl = ref(null)
const size = reactive({ w: 900, h: 560 })

const toScreenX = (x) => ((x - view.xMin) / (view.xMax - view.xMin)) * size.w
const toScreenY = (y) => size.h - ((y - view.yMin) / (view.yMax - view.yMin)) * size.h
const toWorldX = (px) => view.xMin + (px / size.w) * (view.xMax - view.xMin)
const toWorldY = (py) => view.yMin + ((size.h - py) / size.h) * (view.yMax - view.yMin)

const viewLabel = computed(
  () => `x: ${fmt(view.xMin)} ~ ${fmt(view.xMax)}`,
)

// 去掉开头形如 "y =" / "r =" / "f = " 的左边（参数定义 a = 2 已被 isParamDef 提前排除）
const stripY = (text) => text.replace(/^\s*[a-zA-Zθ]\s*=\s*/, '').trim()
const isParamDef = (text) => /^\s*[a-zA-Z]\w*\s*=\s*-?\d*\.?\d+\s*$/.test(text)

function fmt(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 10000 || abs < 0.001)) return n.toExponential(2)
  return String(Number(n.toFixed(3)))
}

function niceStep(span, target) {
  const raw = span / target
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / pow
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return step * pow
}

function varsAt(x) {
  const vars = { x, theta: 0 }
  for (const p of params.value) vars[p.name] = p.value
  return vars
}

/* ---------------- 参数（a = 1 这类定义自动生成滑块） ---------------- */

function syncParams() {
  const found = []
  for (const e of expressions.value) {
    const m = /^\s*([a-zA-Z]\w*)\s*=\s*(-?\d*\.?\d+)\s*$/.exec(e.text)
    if (!m) continue
    found.push({ name: m[1], value: Number(m[2]) })
  }

  params.value = found.map((p) => {
    const old = params.value.find((x) => x.name === p.name)
    if (old) return { ...old, value: old.value }
    const span = Math.max(2, Math.abs(p.value) * 2 || 4)
    return { name: p.name, value: p.value, min: -span, max: span, step: 0.1 }
  })
}

/* ---------------- 绘制 ---------------- */

function draw() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(100, Math.round(size.w))
  const h = Math.max(100, Math.round(size.h))

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  drawGrid(ctx, w, h)
  drawCurves(ctx, w, h)
  drawHover(ctx, w, h)
}

function drawGrid(ctx, w, h) {
  const stepX = niceStep(view.xMax - view.xMin, 10)
  const stepY = niceStep(view.yMax - view.yMin, 8)

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
    const px = Math.round(toScreenX(x)) + 0.5
    ctx.moveTo(px, 0)
    ctx.lineTo(px, h)
  }
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    const py = Math.round(toScreenY(y)) + 0.5
    ctx.moveTo(0, py)
    ctx.lineTo(w, py)
  }
  ctx.stroke()

  // 坐标轴
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  const axisY = toScreenY(0)
  const axisX = toScreenX(0)
  if (axisY >= 0 && axisY <= h) {
    ctx.moveTo(0, Math.round(axisY) + 0.5)
    ctx.lineTo(w, Math.round(axisY) + 0.5)
  }
  if (axisX >= 0 && axisX <= w) {
    ctx.moveTo(Math.round(axisX) + 0.5, 0)
    ctx.lineTo(Math.round(axisX) + 0.5, h)
  }
  ctx.stroke()

  // 刻度数字
  ctx.fillStyle = 'rgba(0, 0, 0, 0.44)'
  ctx.font = '11px -apple-system, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const labelY = Math.min(h - 15, Math.max(2, axisY + 4))
  for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
    if (Math.abs(x) < stepX / 1000) continue
    ctx.fillText(fmt(x), toScreenX(x), labelY)
  }

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const labelX = Math.min(w - 42, Math.max(4, axisX + 6))
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    if (Math.abs(y) < stepY / 1000) continue
    ctx.fillText(fmt(y), labelX, toScreenY(y))
  }
}

function drawCurves(ctx, w, h) {
  const vars = varsAt(0)
  for (const e of expressions.value) {
    if (!e.visible || !e.text.trim() || isParamDef(e.text)) continue
    const body = stripY(e.text)
    if (!body) continue

    ctx.beginPath()
    ctx.strokeStyle = e.color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    let started = false
    let firstError = ''

    // 极坐标：r = f(theta)，转成 x = r·cosθ、y = r·sinθ
    if (e.polar) {
      const steps = 900
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 4
        Object.assign(vars, { x: 0, theta })
        let r
        try {
          r = evaluate(body, { vars })
        } catch (err) {
          firstError = err.message
          break
        }
        if (!Number.isFinite(r)) {
          started = false
          continue
        }
        const wx = r * Math.cos(theta)
        const wy = r * Math.sin(theta)
        const px = toScreenX(wx)
        const py = toScreenY(wy)
        if (!Number.isFinite(px) || !Number.isFinite(py) || py < -h || py > h * 2) {
          started = false
          continue
        }
        if (started) ctx.lineTo(px, py)
        else {
          ctx.moveTo(px, py)
          started = true
        }
      }
      ctx.stroke()
      if (e.error !== firstError) e.error = firstError
      continue
    }

    for (let px = 0; px <= w; px += 1) {
      const x = toWorldX(px)
      Object.assign(vars, { x })
      let y
      try {
        y = evaluate(body, { vars })
      } catch (err) {
        firstError = err.message
        break
      }
      if (!Number.isFinite(y)) {
        started = false
        continue
      }
      const py = toScreenY(y)
      if (py < -h || py > h * 2) {
        started = false
        continue
      }
      if (started) ctx.lineTo(px, py)
      else {
        ctx.moveTo(px, py)
        started = true
      }
    }
    ctx.stroke()

    if (e.error !== firstError) e.error = firstError
  }
}

function drawHover(ctx, w, h) {
  if (!hover.value) return
  const { px, py, x, y } = hover.value

  ctx.save()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(px, 0)
  ctx.lineTo(px, h)
  ctx.moveTo(0, py)
  ctx.lineTo(w, py)
  ctx.stroke()
  ctx.restore()

  for (const e of expressions.value) {
    if (!e.visible || !e.text.trim() || isParamDef(e.text)) continue
    try {
      const yv = evaluate(stripY(e.text), { vars: varsAt(x) })
      if (!Number.isFinite(yv)) continue
      const spy = toScreenY(yv)
      if (spy < -40 || spy > h + 40) continue
      ctx.beginPath()
      ctx.fillStyle = e.color
      ctx.arc(toScreenX(x), spy, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    } catch {
      /* 忽略 */
    }
  }

  const label = `(${fmt(x)}, ${fmt(y)})`
  ctx.font = '11px -apple-system, system-ui, sans-serif'
  const tw = ctx.measureText(label).width + 12
  let lx = px + 14
  let ly = py + 14
  if (lx + tw > w) lx = px - tw - 14
  if (ly + 20 > h) ly = py - 26

  ctx.fillStyle = 'rgba(0, 0, 0, 0.76)'
  ctx.beginPath()
  ctx.roundRect(lx, ly, tw, 20, 5)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, lx + 6, ly + 10)
}

/* ---------------- 交互 ---------------- */

let dragging = null

function onMouseDown(e) {
  dragging = { x: e.clientX, y: e.clientY, view: { ...view } }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e) {
  if (!dragging) return
  const dx = e.clientX - dragging.x
  const dy = e.clientY - dragging.y
  const spanX = dragging.view.xMax - dragging.view.xMin
  const spanY = dragging.view.yMax - dragging.view.yMin
  const wx = (dx / size.w) * spanX
  const wy = (dy / size.h) * spanY

  view.xMin = dragging.view.xMin - wx
  view.xMax = dragging.view.xMax - wx
  view.yMin = dragging.view.yMin + wy
  view.yMax = dragging.view.yMax + wy
  hover.value = null
  draw()
}

function onDragEnd() {
  dragging = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  persist()
}

function onMouseMove(e) {
  if (!canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  hover.value = { px, py, x: toWorldX(px), y: toWorldY(py) }
  draw()
}

function onMouseLeave() {
  hover.value = null
  draw()
}

function onWheel(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const wx = toWorldX(mx)
  const wy = toWorldY(my)
  const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15

  view.xMin = wx - (wx - view.xMin) * factor
  view.xMax = wx + (view.xMax - wx) * factor
  view.yMin = wy - (wy - view.yMin) * factor
  view.yMax = wy + (view.yMax - wy) * factor
  draw()
  persist()
}

function zoom(factor) {
  const cx = (view.xMin + view.xMax) / 2
  const cy = (view.yMin + view.yMax) / 2
  view.xMin = cx + (view.xMin - cx) * factor
  view.xMax = cx + (view.xMax - cx) * factor
  view.yMin = cy + (view.yMin - cy) * factor
  view.yMax = cy + (view.yMax - cy) * factor
  draw()
  persist()
}

function resetView() {
  Object.assign(view, DEFAULT_VIEW)
  hover.value = null
  draw()
  persist()
}

function exportPng() {
  if (!canvasEl.value) return
  const a = document.createElement('a')
  a.href = canvasEl.value.toDataURL('image/png')
  a.download = 'graph.png'
  a.click()
}

/* ---------------- 表达式管理 ---------------- */

function addExpression() {
  expressions.value.push({
    id: seq++,
    text: '',
    color: COLORS[expressions.value.length % COLORS.length],
    visible: true,
    polar: false,
    error: '',
  })
}

function removeExpression(id) {
  if (expressions.value.length === 1) {
    expressions.value[0].text = ''
    return
  }
  expressions.value = expressions.value.filter((e) => e.id !== id)
}

function setColor(e) {
  const index = COLORS.indexOf(e.color)
  e.color = COLORS[(index + 1) % COLORS.length]
}

/* ---------------- 持久化与生命周期 ---------------- */

let saveTimer
function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        expressions: expressions.value.map(({ id, ...rest }) => rest),
        view: { ...view },
      }),
    )
  }, 400)
}

watch(
  () => expressions.value.map((e) => `${e.id}|${e.text}|${e.visible}|${e.color}|${e.polar}`).join(';'),
  () => {
    syncParams()
    draw()
    persist()
  },
)

/* 参数动画：让滑块自动往复变化 */
const animating = ref({})
let rafId = null

function toggleAnim(p) {
  if (animating.value[p.name]) {
    animating.value[p.name] = false
    return
  }
  animating.value[p.name] = true
  let dir = 1
  const stepSize = (p.max - p.min) / 240

  const step = () => {
    if (!animating.value[p.name]) return
    let next = p.value + dir * stepSize
    if (next >= p.max) {
      next = p.max
      dir = -1
    } else if (next <= p.min) {
      next = p.min
      dir = 1
    }
    p.value = Number(next.toFixed(4))
    draw()
    rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
}

watch(
  () => params.value.map((p) => `${p.name}|${p.value}`).join(';'),
  () => draw(),
)

let observer
onMounted(() => {
  syncParams()
  const wrap = wrapEl.value
  if (wrap) {
    observer = new ResizeObserver(() => {
      size.w = wrap.clientWidth
      size.h = wrap.clientHeight
      draw()
    })
    observer.observe(wrap)
  }
  draw()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(saveTimer)
  onDragEnd()
})
</script>

<template>
  <div class="graph-tool">
    <aside class="side">
      <div class="side-head">
        <span>函数</span>
        <span class="mini">{{ expressions.length }} 条</span>
      </div>

      <div class="exprs">
        <div v-for="e in expressions" :key="e.id" class="expr" :class="{ off: !e.visible }">
          <button
            class="dot"
            :style="{ background: e.color, borderColor: e.color }"
            :title="e.visible ? '隐藏' : '显示'"
            @click="e.visible = !e.visible"
            @contextmenu.prevent="setColor(e)"
          />
          <button
            class="mode-btn"
            :class="{ polar: e.polar }"
            :title="e.polar ? '极坐标：r = f(theta)' : '直角坐标：y = f(x)'"
            @click="e.polar = !e.polar"
          >
            {{ e.polar ? 'r' : 'y' }}
          </button>
          <div class="expr-main">
            <input
              v-model="e.text"
              class="input"
              spellcheck="false"
              :placeholder="e.polar ? 'r = 3*cos(2*theta)' : 'y = sin(x)'"
              @keydown.enter="addExpression"
            />
            <p v-if="e.error" class="err">{{ e.error }}</p>
          </div>
          <button class="del" title="删除" @click="removeExpression(e.id)">✕</button>
        </div>

        <button class="add" @click="addExpression">＋ 添加函数</button>
      </div>

      <div class="params">
        <p class="params-title">参数（输入 a = 2 自动生成滑块）</p>
        <div v-for="p in params" :key="p.name" class="param">
          <button
            class="anim"
            :class="{ on: animating[p.name] }"
            :title="animating[p.name] ? '暂停动画' : '播放动画'"
            @click="toggleAnim(p)"
          >
            {{ animating[p.name] ? '❚❚' : '▶' }}
          </button>
          <span class="pname">{{ p.name }}</span>
          <input
            v-model.number="p.value"
            type="range"
            :min="p.min"
            :max="p.max"
            :step="p.step"
          />
          <input
            v-model.number="p.value"
            class="pnum"
            type="number"
            :min="p.min"
            :max="p.max"
            :step="p.step"
          />
        </div>
        <p v-if="!params.length" class="empty-param">还没有参数</p>
      </div>

      <div class="tips">
        拖动平移 · 滚轮缩放 · 双击重置 · 点击圆点隐藏 · 右键圆点换色
        <br />
        支持 sin cos tan ln log sqrt abs exp、^、π、e、|x|
      </div>
    </aside>

    <section class="canvas-area">
      <div class="toolbar">
        <button @click="zoom(1 / 1.35)">＋</button>
        <button @click="zoom(1.35)">－</button>
        <button @click="resetView">重置</button>
        <button @click="exportPng">导出 PNG</button>
        <span class="range">{{ viewLabel }}</span>
      </div>
      <div ref="wrapEl" class="canvas-wrap">
        <canvas
          ref="canvasEl"
          @mousedown="onMouseDown"
          @mousemove="onMouseMove"
          @mouseleave="onMouseLeave"
          @wheel.prevent="onWheel"
          @dblclick="resetView"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.graph-tool {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: 292px 1fr;
  gap: 10px;
}
.side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.side-head {
  flex: none;
  display: flex;
  align-items: center;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
  font-size: 12px;
  font-weight: 600;
}
.mini {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 400;
}
.exprs {
  flex: none;
  max-height: 42%;
  overflow: auto;
  padding: 6px;
}
.expr {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px;
  border-radius: 6px;
}
.expr:hover {
  background: var(--hover);
}
.expr.off .input {
  opacity: 0.45;
}
.dot {
  flex: none;
  width: 13px;
  height: 13px;
  margin-top: 5px;
  border-radius: 50%;
  border: 1.5px solid;
}
.dot:hover {
  filter: brightness(1.1);
}
.expr-main {
  flex: 1;
  min-width: 0;
}
.input {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}
.err {
  margin: 3px 0 0;
  font-size: 10.5px;
  color: var(--danger);
  line-height: 1.4;
}
.del {
  flex: none;
  width: 18px;
  padding-top: 5px;
  font-size: 10px;
  color: var(--text-dim);
  opacity: 0;
}
.expr:hover .del {
  opacity: 1;
}
.del:hover {
  color: var(--danger);
}
.add {
  width: 100%;
  margin-top: 4px;
  padding: 5px 0;
  border-radius: 6px;
  border: 1px dashed rgba(0, 0, 0, 0.15);
  font-size: 11.5px;
  color: var(--text-dim);
}
.add:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.params {
  flex: none;
  padding: 8px 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  max-height: 30%;
  overflow: auto;
}
.params-title {
  margin: 0 0 6px;
  font-size: 10.5px;
  color: var(--text-dim);
}
.param {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}
.mode-btn {
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 2px;
  border-radius: 5px;
  background: var(--fill-2);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.mode-btn.polar {
  background: rgba(199, 68, 64, 0.14);
  color: #c74440;
}
.anim {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 8px;
  color: var(--text-dim);
  background: var(--fill-1);
}
.anim.on {
  background: var(--accent-soft);
  color: var(--accent);
}
.pname {
  flex: none;
  width: 16px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
}
.param input[type='range'] {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
.pnum {
  flex: none;
  width: 62px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  outline: none;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.empty-param {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-dim);
}
.tips {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--text-dim);
}
.canvas-area {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
}
.toolbar button {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-bg);
  font-size: 11.5px;
}
.toolbar button:hover {
  background: var(--hover);
}
.range {
  margin-left: auto;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: var(--text-dim);
}
.canvas-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}
.canvas-wrap canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
</style>
