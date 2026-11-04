<script setup>
import { ref } from 'vue'

const keyword = defineModel('keyword', { type: String, default: '' })
const view = defineModel('view', { type: String, default: 'grid' })

defineProps({ title: { type: String, default: '' }, canBack: { type: Boolean, default: false } })
const emit = defineEmits(['back'])

const searchEl = ref(null)

function focusSearch() {
  searchEl.value?.focus()
  searchEl.value?.select()
}

defineExpose({ focusSearch })
</script>

<template>
  <div class="toolbar">
    <div class="lights">
      <button
        class="light close"
        :disabled="!canBack"
        :title="canBack ? '关闭' : ''"
        @click="emit('back')"
      />
      <i class="light min" />
      <i class="light max" />
    </div>

    <h1 class="title">{{ title }}</h1>

    <div class="right">
      <div v-if="!canBack" class="search-wrap">
        <input
          ref="searchEl"
          v-model="keyword"
          class="search"
          placeholder="搜索工具"
          @keyup.esc="keyword = ''"
        />
        <kbd class="kbd">⌘K</kbd>
      </div>
      <div v-if="!canBack" class="segmented">
        <button :class="{ on: view === 'grid' }" title="图标视图" @click="view = 'grid'">▦</button>
        <button :class="{ on: view === 'list' }" title="列表视图" @click="view = 'list'">☰</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  height: 46px;
  flex: none;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--toolbar-bg);
  backdrop-filter: blur(30px);
}
.lights {
  display: flex;
  gap: 8px;
}
.lights .light {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.close {
  background: #ff5f57;
}
.close:not(:disabled):hover::after {
  content: '×';
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: rgba(80, 0, 0, 0.6);
}
.close:disabled {
  cursor: default;
}
.min {
  background: #febc2e;
}
.max {
  background: #28c840;
}
.title {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  text-align: center;
}
.right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.search {
  width: 168px;
  padding: 4px 42px 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
}
.search:focus {
  border-color: var(--accent);
  background: var(--panel-bg);
}
.kbd {
  position: absolute;
  right: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--fill-2);
  font-family: inherit;
  font-size: 10px;
  color: var(--text-dim);
  pointer-events: none;
}
.segmented {
  display: flex;
  padding: 1px;
  border-radius: 6px;
  background: var(--fill-2);
}
.segmented button {
  width: 28px;
  height: 22px;
  border-radius: 5px;
  line-height: 1;
  color: var(--text);
}
.segmented button.on {
  background: var(--panel-bg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
</style>
