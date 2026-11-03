<script setup>
import { computed } from 'vue'
import { categories, tools } from '../tools'
import AppIcon from '../components/AppIcon.vue'

const active = defineModel({ type: String, required: true })

const counts = computed(() => {
  const map = { all: tools.length }
  for (const t of tools) map[t.category] = (map[t.category] || 0) + 1
  return map
})
</script>

<template>
  <aside class="sidebar">
    <p class="section-title">收藏夹</p>
    <button class="row" :class="{ on: active === 'all' }" @click="active = 'all'">
      <AppIcon glyph="🧰" :hue="200" :size="20" />
      <span class="name">全部工具</span>
      <span class="count">{{ counts.all }}</span>
    </button>

    <p class="section-title">分类</p>
    <button
      v-for="c in categories"
      :key="c.id"
      class="row"
      :class="{ on: active === c.id }"
      @click="active = c.id"
    >
      <AppIcon :glyph="c.glyph" :hue="c.hue" :size="20" />
      <span class="name">{{ c.name }}</span>
      <span class="count">{{ counts[c.id] || 0 }}</span>
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 208px;
  flex: none;
  padding: 12px 10px;
  border-right: 1px solid var(--border);
  background: rgba(246, 246, 246, 0.55);
  backdrop-filter: blur(30px);
  overflow-y: auto;
}
.section-title {
  margin: 10px 8px 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
}
.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  text-align: left;
}
.row:hover {
  background: var(--hover);
}
.row.on {
  background: var(--accent);
  color: #fff;
}
.row.on .count {
  color: rgba(255, 255, 255, 0.75);
}
.name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.count {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
</style>
