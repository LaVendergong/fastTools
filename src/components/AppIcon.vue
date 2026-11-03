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
      background: `linear-gradient(180deg, hsl(${props.hue} 85% 68%), hsl(${props.hue + 25} 72% 50%))`,
      boxShadow: `0 ${props.size * 0.04}px ${props.size * 0.12}px hsl(${props.hue} 60% 40% / 0.35)`,
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
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  flex: none;
  user-select: none;
}
</style>
