<template>
  <div class="panel">
    <h3>⭐ 星座图 (IQ平面)</h3>
    <div class="canvas-wrap">
      <canvas ref="cvs" width="300" height="300" class="const-canvas"></canvas>
      <div v-if="!(store.result?.constellation?.length)" class="empty-mask">
        <span>{{ store.error ? '数据读取失败，星座图暂不可用，请重试' : '暂无数据，请先生成信号' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useSignalStore } from '../store/signal'
const store = useSignalStore()
const cvs = ref<HTMLCanvasElement>()

function draw() {
  const c = cvs.value!; const ctx = c.getContext('2d')!; const W = c.width, H = c.height
  ctx.fillStyle = '#0d1520'; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke()

  const pts = store.result?.constellation || []
  if (pts.length === 0) return
  const scale = W * 0.4
  for (const pt of pts) {
    const x = W/2 + pt.i * scale, y = H/2 - pt.q * scale
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2)
    ctx.fillStyle = '#42a5f5'; ctx.fill()
    ctx.strokeStyle = 'rgba(66,165,245,0.5)'; ctx.stroke()
  }
  ctx.fillStyle = '#8899aa'; ctx.font = '10px system-ui'
  ctx.fillText('I →', W-25, H/2-5); ctx.fillText('Q ↑', W/2+5, 14)
}

onMounted(draw)
watch(() => store.result, draw)
</script>

<style scoped>
.panel { background:#1a2332; border-radius:8px; padding:16px; border:1px solid #2a3a4a }
.panel h3 { margin-bottom:8px; color:#90caf9; font-size:14px }
.canvas-wrap { position:relative; width:300px; margin:0 auto }
.const-canvas { display:block; border-radius:4px }
.empty-mask {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:rgba(13,21,32,0.72); border-radius:4px;
}
.empty-mask span { color:#8899aa; font-size:13px; text-align:center; padding:0 24px; line-height:1.6 }
</style>