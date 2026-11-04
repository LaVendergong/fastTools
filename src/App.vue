<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { categories, tools } from './tools'
import MenuBar from './layout/MenuBar.vue'
import Sidebar from './layout/Sidebar.vue'
import Toolbar from './layout/Toolbar.vue'
import ToolGrid from './layout/ToolGrid.vue'
import Dock from './layout/Dock.vue'
import { appBus } from './lib/appBus'

const LAST_TOOL_KEY = 'toolbox:lastTool'

const category = ref('all')
const keyword = ref('')
const view = ref('grid')
const activeTool = ref(null)
const toolbarRef = ref(null)

const currentCategory = computed(() => categories.find((c) => c.id === category.value))
const visibleTools = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return tools.filter(
    (t) => (category.value === 'all' || t.category === category.value) && (!kw || `${t.name}${t.desc}`.toLowerCase().includes(kw)),
  )
})
const title = computed(() => activeTool.value?.name || currentCategory.value?.name || '全部工具')

function openTool(tool) {
  activeTool.value = tool
  localStorage.setItem(LAST_TOOL_KEY, tool.id)
}

function openToolById(id) {
  const found = tools.find((t) => t.id === id)
  if (found) openTool(found)
}

function closeTool() {
  activeTool.value = null
  localStorage.removeItem(LAST_TOOL_KEY)
}

function selectCategory(id) {
  category.value = id
  activeTool.value = null
  keyword.value = ''
  localStorage.removeItem(LAST_TOOL_KEY)
}

function onGlobalKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (activeTool.value) {
      closeTool()
    }
    toolbarRef.value?.focusSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
  // 工具之间互相唤起（如文件管理器双击 txt → 文本编辑器）
  appBus.on('open-tool', openToolById)

  // 恢复上次打开的工具
  const lastId = localStorage.getItem(LAST_TOOL_KEY)
  if (!lastId) return
  const found = tools.find((t) => t.id === lastId)
  if (found) {
    activeTool.value = found
    category.value = found.category
  }
})

onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <div class="desktop">
    <MenuBar @open-tool="openToolById" />

    <div class="window">
      <Sidebar v-model="category" />

      <div class="content">
        <Toolbar
          ref="toolbarRef"
          v-model:keyword="keyword"
          v-model:view="view"
          :title="title"
          :can-back="!!activeTool"
          @back="closeTool"
        />
        <component :is="activeTool.component" v-if="activeTool" :tool="activeTool" />
        <ToolGrid v-else :tools="visibleTools" :view="view" @open="openTool" />
      </div>
    </div>

    <Dock @select="selectCategory" />
  </div>
</template>

<style scoped>
.desktop {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 78px;
}
.window {
  flex: 1;
  width: calc(100% - 24px);
  max-width: 1240px;
  margin: 6px auto 0;
  display: flex;
  border-radius: 12px;
  overflow: hidden;
  background: var(--window-bg);
  box-shadow: var(--window-shadow), 0 0 0 0.5px var(--border-strong);
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>
