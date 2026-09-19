<template>
  <div class="panel" style="margin-top:16px">
    <div class="panel-head">
      <h3>🌊 瀑布图 (Spectrogram)</h3>
      <CursorReadout />
    </div>
    <canvas ref="cvs" width="800" height="200" class="waterfall-canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useSignalStore } from '../store/signal'
import CursorReadout from './CursorReadout.vue'
const store = useSignalStore()
const cvs = ref<HTMLCanvasElement>()

const CURSOR_COLOR = '#ff7043'

function draw() {
  const c = cvs.value; if (!c) return
  const ctx = c.getContext('2d')!; const W = c.width, H = c.height
  const rows = store.result?.waterfall || []
  if (!rows.length) return
  ctx.fillStyle = '#0d1520'; ctx.fillRect(0, 0, W, H)
  const rowH = H / rows.length
  for (let r = 0; r < rows.length; r++) {
    const vals = rows[r].values, n = vals.length
    if (!n) continue
    const valsMin = Math.min(...vals), valsMax = Math.max(...vals)
    const vRange = valsMax - valsMin || 1
    for (let i = 0; i < n; i++) {
      const t = (vals[i] - valsMin) / vRange
      const rv = Math.round(t * 200)
      const gv = Math.round(t * 100 + (1-t) * 50)
      const bv = Math.round((1-t) * 200 + 30)
      ctx.fillStyle = `rgb(${rv},${gv},${bv})`
      ctx.fillRect(i * W / n, r * rowH, W / n + 1, rowH + 1)
    }
  }
  drawCursor(ctx, W, H)
}

// 与频谱图同一频率轴 ([0, fs/2])，同步绘制游标位置
function drawCursor(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const freqs = store.result?.spectrum.frequencies
  const f = store.cursorFreq
  if (!freqs || !freqs.length || f === null) return
  const fMax = freqs[freqs.length - 1]
  if (f < 0 || f > fMax) return
  const x = (f / fMax) * W
  ctx.strokeStyle = CURSOR_COLOR
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  ctx.fillStyle = CURSOR_COLOR
  ctx.beginPath(); ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 8); ctx.closePath(); ctx.fill()
}

onMounted(draw)
watch(() => store.result, draw)
watch(() => store.cursorFreq, draw)
</script>

<style scoped>
.panel { background:#1a2332; border-radius:8px; padding:16px; border:1px solid #2a3a4a }
.panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:8px }
.panel-head h3 { color:#90caf9; font-size:14px }
.waterfall-canvas { display:block; width:100%; border-radius:4px }
</style>
