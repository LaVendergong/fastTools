<script setup>
import { categories } from '../tools'
import AppIcon from '../components/AppIcon.vue'

const emit = defineEmits(['select'])
const extras = [
  { name: '系统设置', glyph: '⚙️', hue: 220 },
  { name: '废纸篓', glyph: '🗑️', hue: 200 },
]
</script>

<template>
  <footer class="dock-wrap">
    <div class="dock">
      <button
        v-for="c in categories"
        :key="c.id"
        class="item"
        :title="c.name"
        @click="emit('select', c.id)"
      >
        <AppIcon :glyph="c.glyph" :hue="c.hue" :size="44" />
        <span class="tip">{{ c.name }}</span>
      </button>

      <i class="divider" />

      <button v-for="e in extras" :key="e.name" class="item" :title="e.name">
        <AppIcon :glyph="e.glyph" :hue="e.hue" :size="44" />
        <span class="tip">{{ e.name }}</span>
      </button>
    </div>
  </footer>
</template>

<style scoped>
.dock-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10px;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.dock {
  pointer-events: auto;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(24px);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
}
.item {
  position: relative;
  transition: transform 0.16s ease;
}
.item:hover {
  transform: translateY(-8px) scale(1.18);
}
.item .tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.62);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
.item:hover .tip {
  opacity: 1;
}
.divider {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.4);
}
</style>
