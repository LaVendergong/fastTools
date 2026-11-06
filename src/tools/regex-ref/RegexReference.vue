<script setup>
import { computed, ref } from 'vue'
import { requestTestRegex } from '../../lib/appBus'
import { useCopy } from '../../lib/useCopy'
import { CATEGORIES, PATTERNS, selfCheck } from './patterns.js'

const keyword = ref('')
const activeCat = ref('all')
const { copied, copy } = useCopy()

const broken = selfCheck()

const list = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  return PATTERNS.filter((p) => {
    if (activeCat.value !== 'all' && p.cat !== activeCat.value) return false
    if (!key) return true
    return (
      p.name.toLowerCase().includes(key) ||
      p.pattern.toLowerCase().includes(key) ||
      p.desc.toLowerCase().includes(key) ||
      p.example.toLowerCase().includes(key)
    )
  })
})

const total = PATTERNS.length

function copyPattern(item) {
  copy(item.pattern, item.id)
}

function testIt(item) {
  requestTestRegex(item.pattern, item.flags, item.example)
}

function catName(id) {
  return CATEGORIES.find((c) => c.id === id)?.name || ''
}
</script>

<template>
  <div class="ref">
    <div class="toolbar">
      <input v-model="keyword" class="search" placeholder="搜名称、正则或示例，如 手机 / 邮箱" spellcheck="false" />
      <div class="tabs">
        <button :class="{ on: activeCat === 'all' }" @click="activeCat = 'all'">全部 {{ total }}</button>
        <button
          v-for="cat in CATEGORIES"
          :key="cat.id"
          :class="{ on: activeCat === cat.id }"
          @click="activeCat = cat.id"
        >
          {{ cat.name }}
        </button>
      </div>
      <span class="spacer" />
      <span class="stat">{{ list.length }} 条</span>
    </div>

    <p v-if="broken.length" class="warn-bar">以下规则自检未通过：{{ broken.join('、') }}</p>

    <div class="list">
      <article v-for="item in list" :key="item.id" class="card">
        <div class="head">
          <span class="name">{{ item.name }}</span>
          <span class="tag">{{ catName(item.cat) }}</span>
          <span class="spacer" />
          <button class="mini" @click="copyPattern(item)">
            {{ copied === item.id ? '已复制' : '复制正则' }}
          </button>
          <button class="mini accent" @click="testIt(item)">去测试 →</button>
        </div>

        <code class="pattern">{{ item.pattern }}<i v-if="item.flags">/{{ item.flags }}</i></code>

        <div class="meta">
          <span class="desc">{{ item.desc }}</span>
        </div>

        <div class="samples">
          <span class="ok">✓ {{ item.example || '(空行)' }}</span>
          <span v-if="item.bad" class="no">✗ {{ item.bad }}</span>
        </div>
      </article>

      <p v-if="!list.length" class="empty">没有匹配的规则，换个关键词试试</p>
    </div>

    <p class="hint">
      点「去测试 →」会把正则与示例一起带进「正则测试」工具。示例与反例由 <code>selfCheck()</code> 在单测里逐条验证，
      改了规则跑一次 <code>npm test</code> 就能发现写错的。
    </p>
  </div>
</template>

<style scoped>
.ref {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.search {
  width: 260px;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 11.5px;
}
.search:focus {
  border-color: var(--accent);
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--fill-1);
}
.tabs button {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 10.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.tabs button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.spacer {
  margin-left: auto;
}
.stat {
  font-size: 10.5px;
  color: var(--text-faint);
}
.warn-bar {
  flex: none;
  margin: 0;
  padding: 5px 9px;
  border-radius: 7px;
  background: var(--danger-soft);
  font-size: 10.5px;
  color: var(--danger);
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 9px;
  align-content: start;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
}
.head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--fill-2);
  font-size: 9px;
  color: var(--text-faint);
}
.mini {
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  color: var(--text-dim);
  white-space: nowrap;
}
.mini:hover {
  background: var(--fill-1);
}
.mini.accent {
  color: var(--accent);
}
.pattern {
  display: block;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--fill-1);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--text);
  word-break: break-all;
}
.pattern i {
  color: var(--text-faint);
  font-style: normal;
}
.meta {
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
.samples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 9.5px;
}
.ok {
  color: var(--success);
}
.no {
  color: var(--danger);
}
.empty {
  grid-column: 1 / -1;
  margin: 20px 0;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-faint);
}
.hint {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--text-faint);
}
.hint code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--fill-2);
}
</style>
