<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  tables: { type: Array, default: () => [] },
  api: { type: Function, required: true },
  loading: { type: Boolean, default: false },
  activeTable: { type: Object, default: null },
})
const emit = defineEmits(['open', 'action'])

const expanded = ref({})
const columnCache = ref({})
const loadingKey = ref('')
const menu = ref(null) // { x, y, table }

const keyOf = (t) => `${t.schema}.${t.name}`

async function toggle(table) {
  const key = keyOf(table)
  if (expanded.value[key]) {
    expanded.value[key] = false
    return
  }
  expanded.value[key] = true
  if (columnCache.value[key]) return

  loadingKey.value = key
  try {
    const data = await props.api('columns', { schema: table.schema, table: table.name })
    columnCache.value[key] = data.columns
  } catch (e) {
    columnCache.value[key] = [{ name: e.message, type: '', error: true }]
  } finally {
    loadingKey.value = ''
  }
}

function isActive(table) {
  return (
    props.activeTable &&
    props.activeTable.name === table.name &&
    props.activeTable.schema === table.schema
  )
}

function openMenu(e, table) {
  e.preventDefault()
  e.stopPropagation()
  menu.value = { x: e.clientX, y: e.clientY, table }
}

function closeMenu() {
  menu.value = null
}

function trigger(type) {
  const current = menu.value
  menu.value = null
  emit('action', { type, table: current?.table || null })
}

// 表结构变化后让列缓存失效
function invalidate(table) {
  delete columnCache.value[keyOf(table)]
}

defineExpose({ invalidate })

onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))
</script>

<template>
  <div class="tree" @contextmenu.prevent.self="openMenu($event, null)">
    <p v-if="!tables.length" class="tip">
      {{ loading ? '加载中…' : '连接后显示表结构，右键可新建表' }}
    </p>

    <div v-for="t in tables" :key="keyOf(t)" class="group">
      <div
        class="row"
        :class="{ active: isActive(t) }"
        @contextmenu.prevent.stop="openMenu($event, t)"
      >
        <button class="caret" :class="{ open: expanded[keyOf(t)] }" @click.stop="toggle(t)">▸</button>
        <button class="label" @click="emit('open', t)">
          <span class="icon">{{ t.type === 'VIEW' ? '◫' : '▤' }}</span>
          <span class="name">{{ t.name }}</span>
          <span class="schema">{{ t.schema }}</span>
        </button>
      </div>

      <div v-if="expanded[keyOf(t)]" class="cols">
        <p v-if="loadingKey === keyOf(t)" class="tip small">读取列…</p>
        <p
          v-for="c in columnCache[keyOf(t)] || []"
          :key="c.name"
          class="col"
          :class="{ error: c.error }"
        >
          <span class="pk">{{ c.primary ? 'PK' : '' }}</span>
          <span class="col-name">{{ c.name }}</span>
          <span class="col-type">{{ c.type }}</span>
        </p>
      </div>
    </div>

    <ul
      v-if="menu"
      class="menu"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @click.stop
    >
      <template v-if="menu.table">
        <li class="menu-title">{{ menu.table.name }}</li>
        <li @click="trigger('open')">打开表</li>
        <li @click="trigger('add-column')">新增列…</li>
        <li @click="trigger('add-index')">新增索引…</li>
        <li class="divider" />
        <li class="danger" @click="trigger('drop-table')">删除表…</li>
      </template>
      <template v-else>
        <li @click="trigger('create-table')">新建表…</li>
      </template>
    </ul>
  </div>
</template>

<style scoped>
.tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 6px;
}
.tip {
  margin: 10px 6px;
  font-size: 11.5px;
  color: var(--text-dim);
  line-height: 1.6;
}
.tip.small {
  margin: 2px 0 2px 22px;
  font-size: 11px;
}
.row {
  display: flex;
  align-items: center;
  border-radius: 5px;
}
.row:hover {
  background: var(--hover);
}
.row.active {
  background: rgba(10, 132, 255, 0.1);
}
.caret {
  flex: none;
  width: 16px;
  font-size: 9px;
  color: var(--text-dim);
  transition: transform 0.12s ease;
}
.caret.open {
  transform: rotate(90deg);
}
.label {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 0;
  text-align: left;
  font-size: 12px;
}
.icon {
  flex: none;
  font-size: 10px;
  color: var(--text-dim);
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.schema {
  flex: none;
  font-size: 10px;
  color: var(--text-dim);
}
.cols {
  padding: 2px 0 4px 22px;
}
.col {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 1px 4px;
  font-size: 11px;
  color: var(--text-dim);
}
.col.error {
  color: #d70015;
}
.pk {
  flex: none;
  width: 16px;
  font-size: 9px;
  color: #b25000;
  font-weight: 700;
}
.col-name {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-type {
  margin-left: auto;
  flex: none;
  font-size: 10px;
  opacity: 0.8;
}
.menu {
  position: fixed;
  z-index: 200;
  min-width: 150px;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
}
.menu-title {
  padding: 4px 9px 5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-dim);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu li:not(.menu-title):not(.divider) {
  padding: 5px 9px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}
.menu li:not(.menu-title):not(.divider):hover {
  background: var(--hover);
}
.menu .divider {
  height: 1px;
  margin: 4px 2px;
  background: rgba(0, 0, 0, 0.06);
}
.menu .danger {
  color: #d70015;
}
</style>
