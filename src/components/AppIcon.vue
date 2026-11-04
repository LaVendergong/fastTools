<script setup>
const props = defineProps({
  glyph: { type: String, default: '🧩' },
  hue: { type: Number, default: 210 },
  size: { type: Number, default: 48 },
})
</script>

<template>
  <span
    class="icon"
    :style="{
      width: props.size + 'px',
      height: props.size + 'px',
      fontSize: props.size * (props.glyph.length > 2 ? 0.4 : 0.44) + 'px',
      borderRadius: props.size * 0.24 + 'px',
      background: `linear-gradient(180deg, hsl(${props.hue} 86% 66%), hsl(${props.hue + 22} 74% 48%))`,
    }"
    >{{ props.glyph }}</span
  >
</template>

<style scoped>
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 600;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
  flex: none;
  user-select: none;
  /* 顶部高光 + 柔和投影，浅/深色各有一套变量 */
  box-shadow: var(--icon-inset), var(--icon-shadow);
  filter: var(--icon-filter);
  transition: filter 0.2s ease, box-shadow 0.2s ease;
}
</style>
