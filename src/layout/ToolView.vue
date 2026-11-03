<script setup>
import AppIcon from '../components/AppIcon.vue'

defineProps({ tool: { type: Object, required: true } })
</script>

<template>
  <!-- 占位界面：给工具配置 component 后即被真实组件替换 -->
  <div class="tool-view">
    <header>
      <AppIcon :glyph="tool.glyph" :hue="tool.hue" :size="56" />
      <div>
        <h2>{{ tool.name }}</h2>
        <p>{{ tool.desc }}</p>
      </div>
    </header>

    <div class="stage">
      <p class="hint">这里是「{{ tool.name }}」的工作区</p>
      <p class="sub">在 src/tools/index.js 中给该工具加上 component 字段即可挂载真实界面</p>
    </div>
  </div>
</template>

<style scoped>
.tool-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  overflow-y: auto;
}
header {
  display: flex;
  align-items: center;
  gap: 14px;
}
h2 {
  margin: 0 0 3px;
  font-size: 16px;
}
header p {
  margin: 0;
  color: var(--text-dim);
}
.stage {
  flex: 1;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1.5px dashed rgba(0, 0, 0, 0.15);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.015);
}
.hint {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}
.sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-dim);
}
</style>
