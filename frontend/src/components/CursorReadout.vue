<template>
  <div class="cursor-readout">
    <span v-if="store.cursorLoading" class="tag muted">⏳ 正在读取游标测量值…</span>
    <template v-else-if="store.cursorError">
      <span class="tag error">⚠️ 读取失败：{{ store.cursorError }}</span>
      <button class="retry-btn" @click="store.retryCursorReading()">↻ 重试</button>
    </template>
    <template v-else-if="store.cursorReading">
      <span class="tag freq">🎯 {{ store.cursorReading.frequency.toFixed(1) }} Hz</span>
      <span class="tag mag">{{ store.cursorReading.magnitude.toFixed(1) }} dB</span>
    </template>
    <span v-else-if="!store.hasSpectrumData" class="tag muted">
      🚫 游标不可用：暂无频谱数据，请先生成或导入信号
    </span>
    <span v-else class="tag muted">拖动频谱图上的游标查看频率 / 幅度读数</span>
  </div>
</template>

<script setup lang="ts">
import { useSignalStore } from '../store/signal'
const store = useSignalStore()
</script>

<style scoped>
.cursor-readout { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px }
.tag { padding:3px 10px; border-radius:10px; background:#0d1520; border:1px solid #2a3a4a; color:#8899aa; white-space:nowrap }
.tag.freq { color:#ffab91; border-color:#5d3a2a; font-weight:600 }
.tag.mag { color:#90caf9; border-color:#2a4a6a; font-weight:600 }
.tag.error { color:#ef9a9a; border-color:#6a2a2a }
.retry-btn {
  padding:3px 12px; border-radius:10px; border:1px solid #ef5350; background:rgba(239,83,80,0.12);
  color:#ef9a9a; font-size:12px; cursor:pointer
}
.retry-btn:hover { background:rgba(239,83,80,0.25) }
</style>
