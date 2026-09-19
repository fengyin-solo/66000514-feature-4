<template>
  <div class="panel">
    <div class="panel-head">
      <h3>📊 FFT频谱图</h3>
      <CursorReadout />
    </div>
    <div class="chart-wrap">
      <div ref="chart" class="chart"></div>
      <div v-if="!store.hasSpectrumData" class="empty-mask">
        <div class="empty-icon">📭</div>
        <p class="empty-title">频率游标不可用</p>
        <p class="empty-reason">原因：暂无频谱数据 — 请先点击上方「🔍 生成信号并分析」</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { useSignalStore } from '../store/signal'
import { buildCursorGraphic } from '../utils/cursorGraphic'
import CursorReadout from './CursorReadout.vue'

const store = useSignalStore()
const chart = ref<HTMLDivElement>()
let instance: echarts.ECharts | null = null
let dragging = false
let lastDragEnd = 0

const GRID = { left: 50, right: 15, top: 15, bottom: 35 }
const CURSOR_COLOR = '#ff7043'

function freqRange(): [number, number] {
  const freqs = store.result?.spectrum.frequencies
  if (!freqs || !freqs.length) return [0, 1]
  return [0, freqs[freqs.length - 1]]
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function update() {
  if (!instance) return
  if (!store.hasSpectrumData) { instance.clear(); return }
  const { frequencies, magnitudes } = store.result!.spectrum
  const n = frequencies.length
  const halfN = Math.floor(n / 2)
  const data: number[][] = []
  // 与瀑布图保持同一频率轴，仅显示正半频 [0, fs/2]
  for (let i = halfN; i < n; i++) {
    data.push([frequencies[i], magnitudes[i]])
  }
  instance.setOption({
    backgroundColor: 'transparent',
    grid: { ...GRID },
    xAxis: { type: 'value', name: '频率 (Hz)', nameLocation: 'middle', nameGap: 25, min: 0, axisLabel: { color: '#8899aa' } },
    yAxis: { type: 'value', name: '幅度 (dB)', nameLocation: 'middle', nameGap: 40, axisLabel: { color: '#8899aa' } },
    series: [{
      type: 'line', data, symbol: 'none', lineStyle: { color: '#42a5f5', width: 1.5 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(66,165,245,0.4)' }, { offset: 1, color: 'rgba(66,165,245,0.02)' }]) }
    }],
    animation: false
  })
  renderCursor()
}

function renderCursor() {
  if (!instance) return
  if (dragging) return // 拖动中由 zrender 直接控制位置，避免回写抖动
  if (!store.hasSpectrumData || store.cursorFreq === null) {
    instance.setOption({ graphic: [] })
    return
  }
  const [lo, hi] = freqRange()
  const freq = clamp(store.cursorFreq, lo, hi)
  const px = instance.convertToPixel({ gridIndex: 0 }, [freq, 0])[0]
  const plotH = instance.getHeight() - GRID.top - GRID.bottom
  instance.setOption({
    graphic: [buildCursorGraphic({
      x: px,
      y: GRID.top,
      plotHeight: plotH,
      color: CURSOR_COLOR,
      handlers: {
        onDragStart: () => { dragging = true },
        onDragMove: (pixelX) => {
          if (!instance) return
          const f = instance.convertFromPixel({ gridIndex: 0 }, [pixelX, 0])[0]
          if (!Number.isFinite(f)) return
          const [lo2, hi2] = freqRange()
          store.setCursorFreq(clamp(f, lo2, hi2))
        },
        onDragEnd: () => {
          dragging = false
          lastDragEnd = Date.now()
          renderCursor() // 吸附到钳位后的频率位置
        }
      }
    })]
  })
}

function onChartClick(e: any) {
  if (!instance || !store.hasSpectrumData) return
  if (Date.now() - lastDragEnd < 150) return // 拖动结束触发的 click 不处理
  if (!instance.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return
  const f = instance.convertFromPixel({ gridIndex: 0 }, [e.offsetX, 0])[0]
  if (!Number.isFinite(f)) return
  const [lo, hi] = freqRange()
  store.setCursorFreq(clamp(f, lo, hi))
}

onMounted(() => {
  if (!chart.value) return
  instance = echarts.init(chart.value)
  instance.getZr().on('click', onChartClick)
  update()
})
watch(() => store.result, update)
watch(() => store.cursorFreq, () => { if (!dragging) renderCursor() })
onUnmounted(() => { instance?.dispose(); instance = null })
</script>

<style scoped>
.panel { background:#1a2332; border-radius:8px; padding:16px; border:1px solid #2a3a4a }
.panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:8px }
.panel-head h3 { color:#90caf9; font-size:14px }
.chart-wrap { position:relative }
.chart { width:100%; height:280px }
.empty-mask {
  position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  background:rgba(13,21,32,0.88); border-radius:4px; text-align:center; padding:0 16px
}
.empty-icon { font-size:28px }
.empty-title { margin-top:6px; color:#e0e0e0; font-size:14px; font-weight:600 }
.empty-reason { margin-top:4px; color:#8899aa; font-size:12px }
</style>
