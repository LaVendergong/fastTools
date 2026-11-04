<script setup>
import { onUnmounted, ref } from 'vue'

const menus = ['文件', '编辑', '视图', '工具', '窗口', '帮助']
const emit = defineEmits(['open-tool'])

// 「文件」菜单直接打开文件管理器，其余菜单暂为占位
function onMenuClick(name) {
  if (name === '文件') emit('open-tool', 'files')
}

const THEME_KEY = 'toolbox:theme'
const dark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  localStorage.setItem(THEME_KEY, dark.value ? 'dark' : 'light')
}
const clock = ref('')
const tick = () => {
  const now = new Date()
  clock.value = `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}
tick()
const timer = setInterval(tick, 10000)
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <header class="menubar">
    <span class="apple" aria-label="Apple">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path
          d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
        />
      </svg>
    </span>
    <strong class="app-name">工具箱</strong>
    <nav>
      <button
        v-for="m in menus"
        :key="m"
        :class="{ actionable: m === '文件' }"
        :title="m === '文件' ? '打开文件管理器' : ''"
        @click="onMenuClick(m)"
      >
        {{ m }}
      </button>
    </nav>

    <div class="status">
      <button class="theme" :title="dark ? '切换到浅色' : '切换到深色'" @click="toggleTheme">
        {{ dark ? '☀' : '☾' }}
      </button>
      <span>🔋</span>
      <span>📶</span>
      <span>🔍</span>
      <span class="clock">{{ clock }}</span>
    </div>
  </header>
</template>

<style scoped>
.menubar {
  height: 28px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 14px;
  color: #fff;
  background: var(--menubar-bg);
  backdrop-filter: blur(24px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12.5px;
}
.apple {
  display: flex;
}
.app-name {
  font-size: 13px;
  font-weight: 600;
}
nav {
  display: flex;
  gap: 16px;
}
nav button {
  color: rgba(255, 255, 255, 0.92);
  padding: 1px 2px;
  border-radius: 4px;
}
nav button:hover {
  color: #fff;
}
nav button.actionable {
  cursor: pointer;
}
nav button.actionable:hover {
  background: rgba(255, 255, 255, 0.16);
}
.status {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.clock {
  font-variant-numeric: tabular-nums;
}
.theme {
  padding: 0 4px;
  font-size: 13px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.92);
  border-radius: 4px;
}
.theme:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
}
</style>
