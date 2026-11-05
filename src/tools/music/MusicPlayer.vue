<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BUILTIN_TRACKS } from './tracks'
import { readJSON } from '../../lib/storage'

const STORAGE_KEY = 'toolbox:music'

const saved = readJSON(STORAGE_KEY)

const tracks = ref(
  BUILTIN_TRACKS.map((t) => ({ ...t, local: false })),
)
const currentIndex = ref(Math.min(saved.index ?? 0, tracks.value.length - 1))
const playing = ref(false)
const mode = ref(saved.mode ?? 'order') // order | one | shuffle
const volume = ref(saved.volume ?? 0.7)
const progress = ref(0)
const currentTime = ref(0)
const duration = ref(0)
const liked = ref(new Set(saved.liked ?? []))
const filter = ref('all') // all | liked
const keyword = ref('')
const loading = ref(false)
const failed = ref('')

const audioEl = ref(null)
const canvasEl = ref(null)
const fileInputEl = ref(null)
const dragOver = ref(false)

const current = computed(() => tracks.value[currentIndex.value] || null)

const visibleTracks = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return tracks.value.filter((t) => {
    if (filter.value === 'liked' && !liked.value.has(t.id)) return false
    if (!kw) return true
    return `${t.songName}${t.singer}${t.album || ''}`.toLowerCase().includes(kw)
  })
})

const likedCount = computed(() => liked.value.size)

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ---------------- 播放控制 ---------------- */

function loadTrack(index, autoplay = true) {
  const track = tracks.value[index]
  if (!track || !audioEl.value) return
  currentIndex.value = index
  failed.value = ''
  loading.value = true
  const audio = audioEl.value
  audio.src = track.src
  audio.load()
  progress.value = 0
  currentTime.value = 0
  duration.value = track.duration || 0

  if (autoplay) {
    audio
      .play()
      .then(() => {
        playing.value = true
        resumeAudioContext()
      })
      .catch(() => {
        playing.value = false
      })
  }
}

function toggle() {
  const audio = audioEl.value
  if (!audio || !current.value) return
  if (audio.paused) {
    audio
      .play()
      .then(() => {
        playing.value = true
        resumeAudioContext()
      })
      .catch((e) => {
        failed.value = e.message
      })
  } else {
    audio.pause()
  }
}

function next(auto = false) {
  if (!tracks.value.length) return
  if (mode.value === 'shuffle') {
    if (tracks.value.length === 1) {
      loadTrack(0)
      return
    }
    let nextIndex = currentIndex.value
    while (nextIndex === currentIndex.value) {
      nextIndex = Math.floor(Math.random() * tracks.value.length)
    }
    loadTrack(nextIndex)
    return
  }
  const nextIndex = (currentIndex.value + 1) % tracks.value.length
  loadTrack(nextIndex)
  void auto
}

function prev() {
  if (!tracks.value.length) return
  const audio = audioEl.value
  // 播放超过 3 秒时先回到开头，符合常见播放器习惯
  if (audio && audio.currentTime > 3) {
    audio.currentTime = 0
    return
  }
  const prevIndex = (currentIndex.value - 1 + tracks.value.length) % tracks.value.length
  loadTrack(prevIndex)
}

function cycleMode() {
  mode.value = mode.value === 'order' ? 'one' : mode.value === 'one' ? 'shuffle' : 'order'
}

const modeLabel = computed(
  () => ({ order: '顺序', one: '单曲', shuffle: '随机' })[mode.value] || '顺序',
)

function onTimeUpdate() {
  const audio = audioEl.value
  if (!audio) return
  currentTime.value = audio.currentTime
  if (audio.duration && Number.isFinite(audio.duration)) duration.value = audio.duration
  progress.value = duration.value ? (audio.currentTime / duration.value) * 100 : 0
}

function onSeekInput(e) {
  const audio = audioEl.value
  if (!audio || !duration.value) return
  const pct = Number(e.target.value)
  progress.value = pct
  audio.currentTime = (pct / 100) * duration.value
}

function onEnded() {
  if (mode.value === 'one') {
    const audio = audioEl.value
    if (audio) {
      audio.currentTime = 0
      audio.play()
    }
    return
  }
  next(true)
}

function onVolumeInput(e) {
  const v = Number(e.target.value) / 100
  volume.value = v
  if (audioEl.value) audioEl.value.volume = v
}

function toggleLike(track) {
  const set = new Set(liked.value)
  if (set.has(track.id)) set.delete(track.id)
  else set.add(track.id)
  liked.value = set
}

/* ---------------- 本地音乐 ---------------- */

function pickFiles() {
  fileInputEl.value?.click()
}

function addFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/'))
  if (!files.length) return
  for (const file of files) {
    tracks.value.push({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      songName: file.name.replace(/\.[^.]+$/, ''),
      singer: '本地音乐',
      album: '本地上传',
      duration: 0,
      src: URL.createObjectURL(file),
      cover: '',
      local: true,
    })
  }
  if (!current.value || !playing.value) {
    const firstNew = tracks.value.length - files.length
    if (firstNew >= 0) loadTrack(firstNew, false)
  }
}

function onFileChange(e) {
  addFiles(e.target.files)
  e.target.value = ''
}

function onDrop(e) {
  dragOver.value = false
  addFiles(e.dataTransfer?.files)
}

/* ---------------- 频谱可视化 ---------------- */

let audioCtx = null
let analyser = null
let sourceNode = null
let raf = null
let freqData = null

function ensureAudioGraph() {
  if (!audioEl.value) return
  if (audioCtx) return
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return
  audioCtx = new Ctx()
  sourceNode = audioCtx.createMediaElementSource(audioEl.value)
  analyser = audioCtx.createAnalyser()
  analyser.fftSize = 128
  analyser.smoothingTimeConstant = 0.75
  sourceNode.connect(analyser)
  analyser.connect(audioCtx.destination)
  freqData = new Uint8Array(analyser.frequencyBinCount)
}

function resumeAudioContext() {
  ensureAudioGraph()
  if (audioCtx?.state === 'suspended') audioCtx.resume()
}

function drawSpectrum() {
  raf = requestAnimationFrame(drawSpectrum)
  const canvas = canvasEl.value
  if (!canvas || !analyser || !freqData) return

  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  analyser.getByteFrequencyData(freqData)
  const bars = 32
  const gap = 2
  const barW = Math.max(2, (w - gap * (bars - 1)) / bars)
  const gradient = ctx.createLinearGradient(0, h, 0, 0)
  gradient.addColorStop(0, 'rgba(0, 229, 255, 0.25)')
  gradient.addColorStop(0.6, 'rgba(0, 229, 255, 0.9)')
  gradient.addColorStop(1, 'rgba(185, 103, 255, 0.95)')
  ctx.fillStyle = gradient

  for (let i = 0; i < bars; i++) {
    const index = Math.floor((i / bars) * (freqData.length * 0.7))
    const value = freqData[index] / 255
    const barH = Math.max(2, value * h)
    const x = i * (barW + gap)
    ctx.beginPath()
    ctx.roundRect(x, h - barH, barW, barH, 2)
    ctx.fill()
  }
}

/* ---------------- 生命周期 ---------------- */

function syncMediaSession() {
  if (!('mediaSession' in navigator) || !current.value) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.value.songName,
    artist: current.value.singer,
    album: current.value.album || '',
    artwork: current.value.cover
      ? [{ src: current.value.cover, sizes: '512x512', type: 'image/jpeg' }]
      : [],
  })
  navigator.mediaSession.setActionHandler('play', () => toggle())
  navigator.mediaSession.setActionHandler('pause', () => toggle())
  navigator.mediaSession.setActionHandler('nexttrack', () => next())
  navigator.mediaSession.setActionHandler('previoustrack', () => prev())
}

let saveTimer = null
function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        index: currentIndex.value,
        mode: mode.value,
        volume: volume.value,
        liked: [...liked.value],
      }),
    )
  }, 300)
}

watch([currentIndex, mode, volume, liked], persist, { deep: true })

onMounted(() => {
  if (audioEl.value) {
    audioEl.value.volume = volume.value
    audioEl.value.src = current.value?.src || ''
  }
  drawSpectrum()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  audioEl.value?.pause()
  sourceNode?.disconnect()
  audioCtx?.close()
})
</script>

<template>
  <div
    class="music"
    :class="{ dragging: dragOver }"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <!-- 左：正在播放 -->
    <section class="stage">
      <div class="cover-wrap" :class="{ spinning: playing }">
        <div class="vinyl" />
        <img v-if="current?.cover" :src="current.cover" class="cover" alt="专辑封面" />
        <div v-else class="cover cover-empty">♪</div>
      </div>

      <div class="meta">
        <h2 class="title" :title="current?.songName">{{ current?.songName || '未选择歌曲' }}</h2>
        <p class="artist">{{ current?.singer || '—' }}</p>
        <p class="album">{{ current?.album || '' }}</p>
      </div>

      <div class="visualizer">
        <canvas ref="canvasEl" />
      </div>

      <div class="progress">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          :value="progress"
          @input="onSeekInput"
        />
        <div class="time">
          <span>{{ formatTime(currentTime) }}</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
      </div>

      <div class="controls">
        <button class="mode" :title="`播放模式：${modeLabel}`" @click="cycleMode">
          {{ modeLabel }}
        </button>
        <button class="round" title="上一首" @click="prev">⏮</button>
        <button class="play" :title="playing ? '暂停' : '播放'" @click="toggle">
          {{ playing ? '❚❚' : '▶' }}
        </button>
        <button class="round" title="下一首" @click="next()">⏭</button>
        <button
          class="like"
          :class="{ on: current && liked.has(current.id) }"
          :title="current && liked.has(current.id) ? '取消收藏' : '收藏'"
          @click="current && toggleLike(current)"
        >
          {{ current && liked.has(current.id) ? '♥' : '♡' }}
        </button>
      </div>

      <div class="volume">
        <span class="v-icon">{{ volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊' }}</span>
        <input type="range" min="0" max="100" :value="Math.round(volume * 100)" @input="onVolumeInput" />
        <span class="v-num">{{ Math.round(volume * 100) }}</span>
      </div>

      <p v-if="failed" class="err">{{ failed }}</p>
      <p class="hint">拖入 mp3 文件即可加入歌单</p>
    </section>

    <!-- 右：歌单 -->
    <section class="list-panel">
      <div class="list-head">
        <div class="tabs">
          <button :class="{ on: filter === 'all' }" @click="filter = 'all'">
            歌单 {{ tracks.length }}
          </button>
          <button :class="{ on: filter === 'liked' }" @click="filter = 'liked'">
            收藏 {{ likedCount }}
          </button>
        </div>
        <button class="add-btn" title="添加本地音乐" @click="pickFiles">＋ 本地</button>
      </div>

      <input v-model="keyword" class="search" placeholder="搜索歌名 / 歌手 / 专辑" />

      <div class="list">
        <p v-if="!visibleTracks.length" class="empty">
          {{ filter === 'liked' ? '还没有收藏的歌曲' : '没有匹配的歌曲' }}
        </p>
        <button
          v-for="t in visibleTracks"
          :key="t.id"
          class="item"
          :class="{ on: current && t.id === current.id, playing: current && t.id === current.id && playing }"
          @click="loadTrack(tracks.findIndex((x) => x.id === t.id))"
        >
          <span class="idx">
            <span v-if="current && t.id === current.id && playing" class="bars">
              <i /><i /><i />
            </span>
            <span v-else>{{ tracks.findIndex((x) => x.id === t.id) + 1 }}</span>
          </span>
          <img v-if="t.cover" :src="t.cover" class="thumb" alt="" />
          <span v-else class="thumb thumb-empty">♪</span>
          <span class="text">
            <span class="name">{{ t.songName }}</span>
            <span class="sub">{{ t.singer }}</span>
          </span>
          <span class="dur">{{ t.duration ? formatTime(t.duration) : '--' }}</span>
          <span
            class="heart"
            :class="{ on: liked.has(t.id) }"
            :title="liked.has(t.id) ? '取消收藏' : '收藏'"
            @click.stop="toggleLike(t)"
          >
            {{ liked.has(t.id) ? '♥' : '♡' }}
          </span>
        </button>
      </div>
    </section>

    <audio
      ref="audioEl"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onTimeUpdate"
      @ended="onEnded"
      @play="playing = true; syncMediaSession()"
      @pause="playing = false"
      @waiting="loading = true"
      @canplay="loading = false"
      @error="failed = '音频加载失败，请检查文件'"
    />
    <input ref="fileInputEl" type="file" accept="audio/*" multiple hidden @change="onFileChange" />
  </div>
</template>

<style scoped>
.music {
  position: relative;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  color: #e8ecf7;
  background: radial-gradient(120% 90% at 20% 0%, #1a1a3a 0%, rgba(26, 26, 58, 0) 60%),
    radial-gradient(100% 80% at 90% 100%, #241436 0%, rgba(36, 20, 54, 0) 55%), #0b0b16;
  overflow: hidden;
}
.music.dragging {
  outline: 2px dashed rgba(0, 229, 255, 0.6);
  outline-offset: -6px;
}

/* ---- 左：播放区 ---- */
.stage {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}
.cover-wrap {
  position: relative;
  width: 170px;
  height: 170px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vinyl {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: repeating-radial-gradient(circle, #16161f 0 2px, #0c0c12 2px 4px);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 8px 28px rgba(0, 0, 0, 0.6);
}
.cover {
  position: relative;
  width: 128px;
  height: 128px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 24px rgba(0, 229, 255, 0.28), 0 0 0 4px rgba(0, 0, 0, 0.45);
}
.cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(140deg, #24304a, #1b1b2c);
  font-size: 42px;
  color: rgba(0, 229, 255, 0.7);
}
.cover-wrap.spinning .cover,
.cover-wrap.spinning .vinyl {
  animation: spin 14s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.meta {
  width: 100%;
  text-align: center;
}
.title {
  margin: 0 0 3px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.artist {
  margin: 0 0 2px;
  font-size: 12px;
  color: #00e5ff;
  letter-spacing: 0.02em;
}
.album {
  margin: 0;
  font-size: 10.5px;
  color: rgba(232, 236, 247, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.visualizer {
  width: 100%;
  height: 46px;
  flex: none;
}
.visualizer canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.progress {
  width: 100%;
}
.progress input,
.volume input {
  width: 100%;
  height: 4px;
  margin: 0;
  appearance: none;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.12);
  outline: none;
  cursor: pointer;
}
.progress input::-webkit-slider-thumb,
.volume input::-webkit-slider-thumb {
  appearance: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #00e5ff;
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.8);
}
.time {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: rgba(232, 236, 247, 0.5);
}
.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
}
.controls button {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e8ecf7;
}
.round {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  font-size: 13px;
}
.round:hover {
  background: rgba(0, 229, 255, 0.16);
  color: #00e5ff;
}
.play {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(140deg, #00e5ff, #6a5bff);
  color: #04121a;
  font-size: 15px;
  font-weight: 700;
  box-shadow: 0 0 22px rgba(0, 229, 255, 0.45);
}
.play:hover {
  filter: brightness(1.08);
}
.mode {
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid rgba(0, 229, 255, 0.28);
  font-size: 10.5px;
  color: #00e5ff;
}
.like {
  width: 30px;
  height: 30px;
  font-size: 15px;
  color: rgba(232, 236, 247, 0.5);
}
.like.on {
  color: #ff5c8a;
  text-shadow: 0 0 12px rgba(255, 92, 138, 0.6);
}
.volume {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}
.v-icon {
  font-size: 11px;
}
.v-num {
  width: 22px;
  font-size: 10px;
  text-align: right;
  color: rgba(232, 236, 247, 0.45);
}
.err {
  margin: 0;
  font-size: 10.5px;
  color: #ff6b6b;
}
.hint {
  margin: 0;
  font-size: 10px;
  color: rgba(232, 236, 247, 0.32);
}

/* ---- 右：歌单 ---- */
.list-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
}
.list-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
}
.tabs button {
  padding: 3px 10px;
  border-radius: 5px;
  font-size: 11.5px;
  color: rgba(232, 236, 247, 0.6);
}
.tabs button.on {
  background: rgba(0, 229, 255, 0.16);
  color: #00e5ff;
}
.add-btn {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(0, 229, 255, 0.25);
  font-size: 11.5px;
  color: #00e5ff;
}
.add-btn:hover {
  background: rgba(0, 229, 255, 0.12);
}
.search {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.04);
  color: #e8ecf7;
  outline: none;
  font-size: 12px;
}
.search:focus {
  border-color: rgba(0, 229, 255, 0.5);
}
.search::placeholder {
  color: rgba(232, 236, 247, 0.3);
}
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -4px;
  padding: 0 4px;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px;
  border-radius: 7px;
  text-align: left;
  color: #e8ecf7;
}
.item:hover {
  background: rgba(255, 255, 255, 0.05);
}
.item.on {
  background: rgba(0, 229, 255, 0.1);
}
.idx {
  flex: none;
  width: 20px;
  font-size: 10.5px;
  text-align: center;
  color: rgba(232, 236, 247, 0.4);
  font-variant-numeric: tabular-nums;
}
.bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 1.5px;
  height: 11px;
}
.bars i {
  width: 2px;
  background: #00e5ff;
  animation: bounce 0.9s ease-in-out infinite;
}
.bars i:nth-child(2) {
  animation-delay: 0.2s;
}
.bars i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes bounce {
  0%,
  100% {
    height: 3px;
  }
  50% {
    height: 11px;
  }
}
.thumb {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  object-fit: cover;
}
.thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  font-size: 13px;
  color: rgba(0, 229, 255, 0.6);
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.name {
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item.on .name {
  color: #00e5ff;
}
.sub {
  font-size: 10.5px;
  color: rgba(232, 236, 247, 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dur {
  flex: none;
  font-size: 10.5px;
  color: rgba(232, 236, 247, 0.4);
  font-variant-numeric: tabular-nums;
}
.heart {
  flex: none;
  width: 20px;
  text-align: center;
  font-size: 13px;
  color: rgba(232, 236, 247, 0.3);
}
.heart:hover {
  color: #ff5c8a;
}
.heart.on {
  color: #ff5c8a;
}
.empty {
  margin: 30px 0;
  text-align: center;
  font-size: 11.5px;
  color: rgba(232, 236, 247, 0.35);
}
</style>
