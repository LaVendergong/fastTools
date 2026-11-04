<script setup>
import AppIcon from '../components/AppIcon.vue'

defineProps({
  tools: { type: Array, required: true },
  view: { type: String, default: 'grid' },
})
const emit = defineEmits(['open'])
</script>

<template>
  <div class="scroll" :class="view">
    <p v-if="!tools.length" class="empty">没有匹配的工具</p>

    <template v-else-if="view === 'grid'">
      <button v-for="t in tools" :key="t.id" class="card" @click="emit('open', t)">
        <AppIcon :glyph="t.glyph" :hue="t.hue" :size="56" />
        <span class="name">{{ t.name }}</span>
        <span class="desc">{{ t.desc }}</span>
      </button>
    </template>

    <template v-else>
      <button v-for="t in tools" :key="t.id" class="line" @click="emit('open', t)">
        <AppIcon :glyph="t.glyph" :hue="t.hue" :size="22" />
        <span class="name">{{ t.name }}</span>
        <span class="desc">{{ t.desc }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 22px 14px;
  align-content: start;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px;
  border-radius: 8px;
}
.card:hover {
  background: var(--fill-1);
}
.card .name {
  font-weight: 500;
  color: var(--text);
}
.card .desc {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-dim);
  text-align: center;
}
.list {
  display: flex;
  flex-direction: column;
}
.line {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 8px;
  border-radius: 6px;
  text-align: left;
}
.line:hover {
  background: var(--hover);
}
.line .name {
  width: 130px;
  flex: none;
  font-weight: 500;
}
.line .desc {
  color: var(--text-dim);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.empty {
  margin: 40px 0;
  text-align: center;
  color: var(--text-dim);
}
</style>
