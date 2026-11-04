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
  padding: 10px 8px;
  border-right: 1px solid var(--border);
  background: var(--sidebar-bg);
  backdrop-filter: blur(30px);
  overflow-y: auto;
}
.section-title {
  margin: 12px 8px 5px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-faint);
}
.section-title:first-child {
  margin-top: 2px;
}
.row {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  text-align: left;
  color: var(--text);
}
.row:hover {
  background: var(--fill-1);
}
.row.on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}
.row.on .count {
  color: var(--accent);
  opacity: 0.75;
}
.name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.count {
  font-size: 11px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
</style>
