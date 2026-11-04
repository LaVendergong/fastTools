<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { BUILTIN_SITES, GROUPS } from './sites'

const STORAGE_KEY = 'toolbox:nav'

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
})()

const custom = ref(Array.isArray(saved.custom) ? saved.custom : [])
const group = ref('all')
const keyword = ref('')
const dialogVisible = ref(false)
const editing = ref(null)
const importEl = ref(null)
const importMessage = ref('')

const form = reactive({ name: '', url: '', group: 'custom', desc: '' })

const allSites = computed(() => [
  ...BUILTIN_SITES,
  ...custom.value.map((s) => ({ ...s, custom: true })),
])

const counts = computed(() => {
  const map = { all: allSites.value.length }
  for (const s of allSites.value) map[s.group] = (map[s.group] || 0) + 1
  return map
})

const visibleSites = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return allSites.value.filter((s) => {
    if (group.value !== 'all' && s.group !== group.value) return false
    if (!kw) return true
    return `${s.name}${s.desc || ''}${s.url}`.toLowerCase().includes(kw)
  })
})

function hueOf(text) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360
  return h
}

// 图标三级回退：站点自带 favicon → DuckDuckGo 图标服务 → 首字母色块
const iconLevel = reactive(new Map())

function iconSrc(site) {
  const host = hostOf(site.url)
  const level = iconLevel.get(site.url) ?? 0
  if (level === 0) return `https://${host}/favicon.ico`
  if (level === 1) return `https://icons.duckduckgo.com/ip3/${host}.ico`
  return ''
}

function onIconError(site) {
  iconLevel.set(site.url, (iconLevel.get(site.url) ?? 0) + 1)
}

function iconStyle(site) {
  const hue = hueOf(site.name)
  return {
    background: `linear-gradient(145deg, hsl(${hue} 70% 58%), hsl(${hue + 24} 62% 44%))`,
  }
}

function initialOf(site) {
  return site.name.trim().slice(0, 1).toUpperCase()
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function open(site) {
  window.open(site.url, '_blank', 'noopener,noreferrer')
}

/* ---------------- 自定义站点 ---------------- */

function normalizeUrl(url) {
  const value = url.trim()
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function openDialog(site) {
  editing.value = site || null
  if (site) {
    Object.assign(form, { name: site.name, url: site.url, group: site.group, desc: site.desc || '' })
  } else {
    Object.assign(form, { name: '', url: '', group: group.value === 'all' ? 'custom' : group.value, desc: '' })
  }
  dialogVisible.value = true
}

function saveSite() {
  const url = normalizeUrl(form.url)
  if (!form.name.trim() || !url) return
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) {
    importMessage.value = '请输入有效的网址'
    return
  }

  if (editing.value) {
    const target = custom.value.find((s) => s.url === editing.value.url && s.name === editing.value.name)
    if (target) Object.assign(target, { name: form.name.trim(), url, group: form.group, desc: form.desc.trim() })
  } else {
    custom.value.push({ name: form.name.trim(), url, group: form.group, desc: form.desc.trim() })
  }
  dialogVisible.value = false
  importMessage.value = ''
  persist()
}

function removeSite(site) {
  if (!window.confirm(`确定删除「${site.name}」？`)) return
  custom.value = custom.value.filter((s) => !(s.name === site.name && s.url === site.url))
  persist()
}

/* ---------------- 导入导出 ---------------- */

function exportSites() {
  const data = JSON.stringify(custom.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'bookmarks.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function pickImport() {
  importEl.value?.click()
}

async function onImportFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const list = JSON.parse(await file.text())
    if (!Array.isArray(list)) throw new Error('格式不正确，应为数组')
    let added = 0
    for (const item of list) {
      const url = normalizeUrl(String(item.url || ''))
      if (!item.name || !url) continue
      if (custom.value.some((s) => s.url === url)) continue
      custom.value.push({
        name: String(item.name).trim(),
        url,
        group: item.group || 'custom',
        desc: String(item.desc || '').trim(),
      })
      added += 1
    }
    persist()
    importMessage.value = `已导入 ${added} 条`
  } catch (err) {
    importMessage.value = `导入失败：${err.message}`
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ custom: custom.value }))
}

function onDocClick() {
  /* 预留：点击外部关闭弹窗 */
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="nav">
    <div class="head">
      <div class="search-wrap">
        <input v-model="keyword" class="search" placeholder="搜索站点名称、描述或域名" />
        <button v-if="keyword" class="clear" @click="keyword = ''">✕</button>
      </div>
      <div class="actions">
        <button class="btn primary" @click="openDialog(null)">＋ 添加站点</button>
        <button class="btn" @click="pickImport">导入</button>
        <button class="btn" @click="exportSites">导出</button>
      </div>
    </div>

    <div class="tabs">
      <button :class="{ on: group === 'all' }" @click="group = 'all'">全部 {{ counts.all }}</button>
      <button
        v-for="g in GROUPS"
        :key="g.id"
        :class="{ on: group === g.id }"
        :disabled="!counts[g.id] && g.id === 'custom'"
        @click="group = g.id"
      >
        {{ g.name }} {{ counts[g.id] || 0 }}
      </button>
    </div>

    <p v-if="importMessage" class="msg">{{ importMessage }}</p>

    <div class="scroll">
      <p v-if="!visibleSites.length" class="empty">
        {{ keyword ? '没有匹配的站点' : '这个分组还没有站点' }}
      </p>

      <div v-else class="grid">
        <button
          v-for="site in visibleSites"
          :key="`${site.name}-${site.url}`"
          class="card"
          :title="site.url"
          @click="open(site)"
          @contextmenu.prevent="site.custom && openDialog(site)"
        >
          <span class="icon" :style="iconStyle(site)">
            <img
              v-if="iconSrc(site)"
              :src="iconSrc(site)"
              class="favicon"
              alt=""
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="onIconError(site)"
            />
            <span v-else class="letter">{{ initialOf(site) }}</span>
          </span>
          <span class="name">{{ site.name }}</span>
          <span class="host">{{ hostOf(site.url) }}</span>
          <span class="desc">{{ site.desc || '—' }}</span>
          <span v-if="site.custom" class="custom-tag">自定义</span>
          <span v-if="site.custom" class="del" title="删除" @click.stop="removeSite(site)">✕</span>
        </button>
      </div>
    </div>

    <div v-if="dialogVisible" class="mask" @click.self="dialogVisible = false">
      <div class="dialog">
        <div class="dialog-head">
          <span>{{ editing ? '编辑站点' : '添加站点' }}</span>
          <button class="close" @click="dialogVisible = false">✕</button>
        </div>

        <div class="field">
          <label>名称</label>
          <input v-model="form.name" placeholder="例如：GitHub" spellcheck="false" />
        </div>
        <div class="field">
          <label>网址</label>
          <input v-model="form.url" placeholder="github.com 或 https://github.com" spellcheck="false" />
        </div>
        <div class="field">
          <label>分组</label>
          <select v-model="form.group">
            <option v-for="g in GROUPS" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>描述</label>
          <input v-model="form.desc" placeholder="一句话说明（可选）" spellcheck="false" />
        </div>

        <div class="dialog-foot">
          <button class="btn" @click="dialogVisible = false">取消</button>
          <button class="btn primary" @click="saveSite">保存</button>
        </div>
      </div>
    </div>

    <input ref="importEl" type="file" accept="application/json,.json" hidden @change="onImportFile" />
  </div>
</template>

<style scoped>
.nav {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.search-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}
.search {
  width: 100%;
  padding: 7px 30px 7px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
  color: var(--text);
  outline: none;
}
.search:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.clear {
  position: absolute;
  right: 8px;
  font-size: 10px;
  color: var(--text-dim);
}
.actions {
  flex: none;
  display: flex;
  gap: 6px;
}
.btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel-bg);
  font-size: 12px;
  color: var(--text);
}
.btn:hover {
  background: var(--fill-1);
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.btn.primary:hover {
  background: var(--accent-strong);
}
.tabs {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  background: var(--fill-1);
}
.tabs button {
  padding: 3px 11px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.tabs button:hover:not(:disabled) {
  color: var(--text);
}
.tabs button.on {
  background: var(--panel-bg);
  color: var(--text);
  font-weight: 500;
  box-shadow: var(--shadow-1);
}
.tabs button:disabled {
  opacity: 0.4;
  cursor: default;
}
.msg {
  margin: 0;
  font-size: 11.5px;
  color: var(--accent);
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(146px, 1fr));
  gap: 10px;
  align-content: start;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 11px 12px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-1);
  text-align: left;
  color: var(--text);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}
.icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  box-shadow: var(--icon-inset);
  margin-bottom: 3px;
  overflow: hidden;
}
.favicon {
  width: 22px;
  height: 22px;
  padding: 3px;
  border-radius: 6px;
  background: #fff;
  object-fit: contain;
  box-sizing: content-box;
}
.name {
  font-size: 12.5px;
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.host {
  font-size: 10.5px;
  color: var(--text-faint);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.desc {
  font-size: 10.5px;
  color: var(--text-dim);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.custom-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--accent-soft);
  font-size: 9px;
  color: var(--accent);
}
.del {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 9px;
  color: var(--text-dim);
}
.card:hover .del {
  display: flex;
}
.del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
.empty {
  margin: 50px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-dim);
}

/* 弹窗 */
.mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
}
.dialog {
  width: 340px;
  padding: 14px 16px 16px;
  border-radius: 12px;
  background: var(--panel-bg);
  box-shadow: var(--shadow-2);
}
.dialog-head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}
.close {
  margin-left: auto;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-dim);
}
.close:hover {
  background: var(--fill-1);
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
}
.field label {
  flex: none;
  width: 40px;
  font-size: 12px;
  color: var(--text-dim);
}
.field input,
.field select {
  flex: 1;
  min-width: 0;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font-size: 12px;
}
.field input:focus,
.field select:focus {
  border-color: var(--accent);
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
</style>
