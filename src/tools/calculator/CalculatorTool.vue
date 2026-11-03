<script setup>
import { computed, ref } from 'vue'
import StandardCalculator from './StandardCalculator.vue'
import ScientificCalculator from './ScientificCalculator.vue'
import ProgrammerCalculator from './ProgrammerCalculator.vue'
import DateCalculator from './DateCalculator.vue'
import UnitConverter from './UnitConverter.vue'

const GROUPS = [
  {
    name: '计算器',
    items: [
      { id: 'standard', name: '标准', icon: '▦' },
      { id: 'scientific', name: '科学', icon: '🧪' },
      { id: 'programmer', name: '程序员', icon: '</>' },
      { id: 'date', name: '日期计算', icon: '📅' },
    ],
  },
  {
    name: '转换器',
    items: [
      { id: 'volume', name: '体积', icon: '🧊' },
      { id: 'length', name: '长度', icon: '📏' },
    ],
  },
]

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem('toolbox:calculator:mode')) || {}
  } catch {
    return {}
  }
})()

const mode = ref(saved.mode ?? 'standard')
const collapsed = ref(false)

const currentName = computed(() => {
  for (const group of GROUPS) {
    const hit = group.items.find((i) => i.id === mode.value)
    if (hit) return hit.name
  }
  return '标准'
})

function select(id) {
  mode.value = id
  localStorage.setItem('toolbox:calculator:mode', JSON.stringify({ mode: id }))
}
</script>

<template>
  <div class="calc-shell">
    <aside class="nav" :class="{ collapsed }">
      <button class="hamburger" @click="collapsed = !collapsed">
        <span />
        <span />
        <span />
      </button>

      <template v-if="!collapsed">
        <p class="nav-title">{{ currentName }}</p>
        <template v-for="group in GROUPS" :key="group.name">
          <p class="nav-group">{{ group.name }}</p>
          <button
            v-for="item in group.items"
            :key="item.id"
            class="nav-item"
            :class="{ on: mode === item.id }"
            @click="select(item.id)"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-name">{{ item.name }}</span>
          </button>
        </template>
      </template>
    </aside>

    <div class="stage">
      <StandardCalculator v-if="mode === 'standard'" />
      <ScientificCalculator v-else-if="mode === 'scientific'" />
      <ProgrammerCalculator v-else-if="mode === 'programmer'" />
      <DateCalculator v-else-if="mode === 'date'" />
      <UnitConverter v-else-if="mode === 'length'" category="length" />
      <UnitConverter v-else-if="mode === 'volume'" category="volume" />
    </div>
  </div>
</template>

<style scoped>
.calc-shell {
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
}
.nav {
  width: 168px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow-y: auto;
}
.nav.collapsed {
  width: 46px;
  align-items: center;
  padding: 10px 6px;
}
.hamburger {
  width: 26px;
  height: 22px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 0 4px;
  border-radius: 5px;
  margin-bottom: 8px;
}
.hamburger:hover {
  background: var(--hover);
}
.hamburger span {
  display: block;
  height: 1.6px;
  border-radius: 1px;
  background: var(--text-dim);
}
.nav-title {
  margin: 0 6px 6px;
  font-size: 14px;
  font-weight: 600;
}
.nav-group {
  margin: 10px 6px 4px;
  font-size: 11px;
  color: var(--text-dim);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  text-align: left;
  font-size: 12.5px;
  color: var(--text);
}
.nav-item:hover {
  background: var(--hover);
}
.nav-item.on {
  background: rgba(10, 132, 255, 0.12);
  color: var(--accent);
  font-weight: 500;
}
.nav-icon {
  flex: none;
  width: 18px;
  font-size: 12px;
  text-align: center;
  opacity: 0.9;
}
.nav-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage {
  min-width: 0;
  min-height: 0;
  display: flex;
  justify-content: center;
  align-items: stretch;
}
</style>
