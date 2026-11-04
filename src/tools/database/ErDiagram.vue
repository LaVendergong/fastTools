<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  api: { type: Function, required: true },
})

const NODE_W = 196
const MAX_TABLES = 12

const nodes = ref([])
const relations = ref([])
const loading = ref(false)
const error = ref('')
const canvasEl = ref(null)
const drag = ref(null)
const showInferred = ref(true)

// 依据 xxx_id 列名推断的逻辑关系（数据库未定义外键时用）
const inferred = computed(() => {
  const byName = new Map(nodes.value.map((n) => [n.name.toLowerCase(), n]))
  const singlePk = new Map()
  for (const node of nodes.value) {
    const pks = node.allColumns.filter((c) => c.primary)
    if (pks.length === 1) singlePk.set(node.name.toLowerCase(), pks[0].name)
  }

  const all = [...byName.values()]
  const out = []
  for (const node of nodes.value) {
    for (const col of node.allColumns) {
      if (col.primary) continue
      if (!/_id$/i.test(col.name)) continue
      const base = col.name.replace(/_id$/i, '').toLowerCase()

      // 依次尝试：完全同名 → 复数 → 以 _base / _bases 结尾（如 gen_table 对应 table_id）
      const target =
        byName.get(base) ||
        byName.get(`${base}s`) ||
        byName.get(`${base}es`) ||
        all.find((n) => {
          const name = n.name.toLowerCase()
          return (
            name !== node.name.toLowerCase() &&
            (name.endsWith(`_${base}`) || name.endsWith(`_${base}s`) || name.endsWith(`_${base}es`))
          )
        })

      if (!target || target.name === node.name) continue
      const pk = singlePk.get(target.name.toLowerCase())
      if (!pk) continue
      out.push({ tbl: node.name, col: col.name, ref_tbl: target.name, ref_col: pk, inferred: true })
    }
  }
  return out
})

const activeRelations = computed(() => {
  const real = relations.value.map((r) => ({ ...r, inferred: false }))
  if (!showInferred.value) return real
  const exists = new Set(real.map((r) => `${r.tbl}.${r.col}`))
  return [...real, ...inferred.value.filter((r) => !exists.has(`${r.tbl}.${r.col}`))]
})

const edges = computed(() =>
  activeRelations.value
    .map((r) => {
      const from = nodes.value.find((n) => n.name === r.tbl)
      const to = nodes.value.find((n) => n.name === r.ref_tbl)
      if (!from || !to || from.id === to.id) return null
      const x1 = from.x + NODE_W
      const y1 = from.y + 28
      const x2 = to.x
      const y2 = to.y + 28
      const mid = (x1 + x2) / 2
      return {
        id: `${r.tbl}.${r.col}-${r.ref_tbl}.${r.ref_col}`,
        inferred: r.inferred,
        d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
      }
    })
    .filter(Boolean),
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [tableData, relationData] = await Promise.all([props.api('tables'), props.api('relations')])
    const list = tableData.tables.slice(0, MAX_TABLES)
    const withColumns = await Promise.all(
      list.map(async (t) => {
        try {
          const data = await props.api('columns', { schema: t.schema, table: t.name })
          return { ...t, allColumns: data.columns }
        } catch {
          return { ...t, allColumns: [] }
        }
      }),
    )

    nodes.value = withColumns.map((t, i) => ({
      id: `${t.schema}.${t.name}`,
      name: t.name,
      schema: t.schema,
      allColumns: t.allColumns,
      columns: t.allColumns.slice(0, 8),
      more: Math.max(0, t.allColumns.length - 8),
      x: 24 + (i % 3) * (NODE_W + 44),
      y: 24 + Math.floor(i / 3) * 210,
    }))
    relations.value = relationData.relations
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function startDrag(e, node) {
  const rect = canvasEl.value.getBoundingClientRect()
  drag.value = { id: node.id, ox: e.clientX - rect.left - node.x, oy: e.clientY - rect.top - node.y }
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', endDrag)
}

function onDrag(e) {
  if (!drag.value || !canvasEl.value) return
  const node = nodes.value.find((n) => n.id === drag.value.id)
  if (!node) return
  const rect = canvasEl.value.getBoundingClientRect()
  node.x = Math.max(0, e.clientX - rect.left - drag.value.ox)
  node.y = Math.max(0, e.clientY - rect.top - drag.value.oy)
}

function endDrag() {
  drag.value = null
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
}

onMounted(load)
onBeforeUnmount(endDrag)
</script>

<template>
  <div class="er">
    <div class="bar">
      <span class="title">表关系图</span>
      <span class="mini">
        {{ nodes.length }} 张表 · {{ relations.length }} 条外键
        <template v-if="inferred.length">· {{ inferred.length }} 条推断</template>
      </span>
      <label class="switch" title="按 xxx_id 列名推断逻辑关系">
        <input v-model="showInferred" type="checkbox" />
        显示推断关系
      </label>
      <button class="link" @click="load">重新加载</button>
    </div>

    <div ref="canvasEl" class="canvas">
      <p v-if="loading" class="tip">生成关系图…</p>
      <p v-else-if="error" class="tip err">{{ error }}</p>
      <p v-else-if="!nodes.length" class="tip">没有可显示的表</p>
      <div v-else-if="!edges.length" class="notice">
        <p class="notice-title">这些表之间没有可显示的关系</p>
        <p class="notice-sub">
          数据库未定义外键约束{{ showInferred ? '，也没有匹配到 「xxx_id → 对应表主键」 的列名' : '' }}。
          关系图依据外键定义绘制，与 IDEA 的 ER 图一致。
        </p>
      </div>

      <svg v-if="edges.length" class="lines">
        <path
          v-for="e in edges"
          :key="e.id"
          :d="e.d"
          :class="{ inferred: e.inferred }"
        />
      </svg>

      <div
        v-for="n in nodes"
        :key="n.id"
        class="node"
        :style="{ left: `${n.x}px`, top: `${n.y}px`, width: `${NODE_W}px` }"
        @mousedown="startDrag($event, n)"
      >
        <div class="node-head">
          <span class="node-name">{{ n.name }}</span>
          <span class="node-schema">{{ n.schema }}</span>
        </div>
        <div class="node-cols">
          <div v-for="c in n.columns" :key="c.name" class="col">
            <span class="col-name" :class="{ pk: c.primary }">{{ c.name }}</span>
            <span class="col-type">{{ c.type }}</span>
          </div>
          <div v-if="n.more" class="more">+{{ n.more }} 列</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.er {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: var(--fill-1);
}
.title {
  font-size: 12px;
  font-weight: 600;
}
.mini {
  font-size: 11px;
  color: var(--text-dim);
}
.switch {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  font-size: 11px;
  color: var(--text-dim);
  cursor: pointer;
}
.link {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--accent);
}
.canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  background-image: radial-gradient(rgba(0, 0, 0, 0.07) 1px, transparent 1px);
  background-size: 16px 16px;
  background-color: #fbfbfd;
}
.tip {
  margin: 30px;
  font-size: 12px;
  color: var(--text-dim);
}
.tip.err {
  color: var(--danger);
}
.notice {
  position: absolute;
  left: 50%;
  top: 24px;
  transform: translateX(-50%);
  z-index: 2;
  max-width: 520px;
  padding: 10px 14px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: var(--fill-2);
  text-align: center;
}
.notice-title {
  margin: 0 0 4px;
  font-size: 12.5px;
  font-weight: 600;
}
.notice-sub {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-dim);
}
.lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.lines path {
  fill: none;
  stroke: rgba(10, 132, 255, 0.6);
  stroke-width: 1.5;
}
.lines path.inferred {
  stroke: rgba(180, 130, 40, 0.65);
  stroke-dasharray: 5 4;
}
.node {
  position: absolute;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: var(--panel-bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  cursor: grab;
  user-select: none;
  overflow: hidden;
}
.node:active {
  cursor: grabbing;
}
.node-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: rgba(10, 132, 255, 0.08);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.node-name {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-schema {
  font-size: 10px;
  color: var(--text-dim);
}
.node-cols {
  padding: 4px 0;
}
.col {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 8px;
  font-size: 11px;
  color: var(--text-dim);
}
.col-name {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-name.pk {
  color: var(--warn);
  font-weight: 600;
}
.col-type {
  margin-left: auto;
  flex: none;
  font-size: 10px;
  opacity: 0.75;
}
.more {
  padding: 1px 8px;
  font-size: 10.5px;
  color: var(--text-dim);
}
</style>
