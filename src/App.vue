<script setup>
import { computed, ref } from 'vue'
import { categories, tools } from './tools'
import MenuBar from './layout/MenuBar.vue'
import Sidebar from './layout/Sidebar.vue'
import Toolbar from './layout/Toolbar.vue'
import ToolGrid from './layout/ToolGrid.vue'
import Dock from './layout/Dock.vue'

const category = ref('all')
const keyword = ref('')
const view = ref('grid')
const activeTool = ref(null)

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
}

function selectCategory(id) {
  category.value = id
  activeTool.value = null
  keyword.value = ''
}
</script>

<template>
  <div class="desktop">
    <MenuBar />

    <div class="window">
      <Sidebar v-model="category" />

      <div class="content">
        <Toolbar
          v-model:keyword="keyword"
          v-model:view="view"
          :title="title"
          :can-back="!!activeTool"
          @back="activeTool = null"
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
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 30px 70px rgba(20, 15, 60, 0.35), 0 0 0 0.5px rgba(255, 255, 255, 0.35);
}
.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>
