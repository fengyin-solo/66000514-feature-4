<template>
  <div class="panel" style="margin-top:16px">
    <h3>🌊 瀑布图 (Spectrogram)</h3>
    <div class="chart-wrap">
      <canvas ref="cvs" width="800" height="200"
        class="waterfall-canvas"
        :class="{ 'no-cursor': !store.cursorAvailable }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="dragging = false"
      ></canvas>
      <div v-if="!store.cursorAvailable" class="empty-mask">
        <span>{{ store.cursorUnavailableReason }}</span>
      </div>
    </div>
    <div class="readout" :class="{ disabled: !store.cursorAvailable }">
      <template v-if="store.cursorAvailable && store.cursorReading">
        <span class="tag">同步游标</span>
        <span class="item">频率：<b>{{ formatFrequency(store.cursorReading.frequency) }}</b></span>
        <span class="item">幅度：<b>{{ formatMagnitude(store.cursorReading.magnitude) }}</b></span>
        <span class="hint">与频谱图游标联动，读数取自同一份数据</span>
      </template>
      <template v-else-if="store.cursorAvailable">
        <span class="tag">同步游标</span>
        <span class="item muted">尚未放置游标，可在频谱图或瀑布图上点击/拖动</span>
      </template>
      <template v-else>
        <span class="tag tag-off">频率游标不可用</span>
        <span class="item muted">{{ store.cursorUnavailableReason }}</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useSignalStore } from '../store/signal'
import { formatFrequency, formatMagnitude } from '../utils/format'

const store = useSignalStore()
const cvs = ref<HTMLCanvasElement>()
const dragging = ref(false)

function draw() {
  const c = cvs.value
  if (!c) return
  const ctx = c.getContext('2d')!
  const W = c.width, H = c.height
  const rows = store.result?.waterfall ?? []

  ctx.fillStyle = '#0d1520'
  ctx.fillRect(0, 0, W, H)
  if (!rows.length || !store.cursorAvailable) return

  const rowH = H / rows.length
  for (let r = 0; r < rows.length; r++) {
    const vals = rows[r].values, n = vals.length
    if (!n) continue
    const valsMin = Math.min(...vals), valsMax = Math.max(...vals)
    const vRange = valsMax - valsMin || 1
    for (let i = 0; i < n; i++) {
      const t = (vals[i] - valsMin) / vRange
      const rv = Math.round(t * 200)
      const gv = Math.round(t * 100 + (1 - t) * 50)
      const bv = Math.round((1 - t) * 200 + 30)
      ctx.fillStyle = `rgb(${rv},${gv},${bv})`
      ctx.fillRect(i * W / n, r * rowH, W / n + 1, rowH + 1)
    }
  }

  // 与频谱图同一频率的同步游标
  const reading = store.cursorReading
  if (reading) {
    const x = reading.fraction * W
    // 高亮该频率列
    ctx.fillStyle = 'rgba(255,202,40,0.18)'
    ctx.fillRect(x - 3, 0, 6, H)
    // 游标竖线
    ctx.strokeStyle = '#ffca28'
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    // 顶部拖动手柄
    ctx.fillStyle = '#ffca28'
    ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 6, 0); ctx.lineTo(x, 8); ctx.closePath(); ctx.fill()
  }
}

function fractionAtEvent(e: PointerEvent): number | null {
  const c = cvs.value
  if (!c || !store.cursorAvailable) return null
  const rect = c.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  if (ratio < 0 || ratio > 1) return null
  return ratio
}

function onPointerDown(e: PointerEvent) {
  const f = fractionAtEvent(e)
  if (f === null) return
  dragging.value = true
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
  moveToFraction(f)
}
function onPointerMove(e: PointerEvent) {
  const c = cvs.value
  if (!c) return
  if (dragging.value) {
    const f = fractionAtEvent(e)
    if (f !== null) moveToFraction(f)
  } else {
    c.style.cursor = store.cursorAvailable && fractionAtEvent(e) !== null ? 'col-resize' : 'default'
  }
}
function moveToFraction(fraction: number) {
  const freqs = store.posFrequencies
  if (!freqs.length) return
  const idx = Math.round(fraction * (freqs.length - 1))
  store.setCursorFreq(freqs[Math.min(freqs.length - 1, Math.max(0, idx))])
}

onMounted(draw)
watch(() => [store.result, store.cursorReading, store.cursorAvailable], draw)
onUnmounted(() => { dragging.value = false })
</script>

<style scoped>
.panel { background:#1a2332; border-radius:8px; padding:16px; border:1px solid #2a3a4a }
.panel h3 { margin-bottom:8px; color:#90caf9; font-size:14px }
.chart-wrap { position:relative }
.waterfall-canvas { display:block; width:100%; border-radius:4px; touch-action:none }
.waterfall-canvas.no-cursor { pointer-events:none }
.empty-mask {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(13,21,32,0.72); border-radius:4px; pointer-events:none;
}
.empty-mask span { color:#8899aa; font-size:13px; text-align:center; padding:0 24px; line-height:1.6 }
.readout {
  display:flex; align-items:center; gap:14px; flex-wrap:wrap;
  margin-top:6px; padding:8px 12px; background:#0d1520; border-radius:6px;
  font-size:13px; min-height:34px;
}
.tag {
  font-size:11px; padding:2px 8px; border-radius:10px;
  background:rgba(255,202,40,0.18); color:#ffca28; border:1px solid rgba(255,202,40,0.4);
}
.tag-off { background:rgba(136,153,170,0.15); color:#8899aa; border-color:#2a3a4a }
.item b { color:#ffca28 }
.item.muted { color:#8899aa }
.hint { color:#5a7085; font-size:11px; margin-left:auto }
</style>
