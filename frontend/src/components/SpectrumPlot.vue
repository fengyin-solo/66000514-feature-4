<template>
  <div class="panel">
    <h3>📊 FFT频谱图</h3>
    <div class="chart-wrap">
      <div ref="chart" class="chart" :class="{ 'no-cursor': !store.cursorAvailable }"></div>
      <div v-if="!store.cursorAvailable" class="empty-mask">
        <span>{{ store.cursorUnavailableReason }}</span>
      </div>
    </div>
    <div class="readout" :class="{ disabled: !store.cursorAvailable }">
      <template v-if="store.cursorAvailable && store.cursorReading">
        <span class="tag">频率游标</span>
        <span class="item">频率：<b>{{ formatFrequency(store.cursorReading.frequency) }}</b></span>
        <span class="item">幅度：<b>{{ formatMagnitude(store.cursorReading.magnitude) }}</b></span>
        <span class="hint">在图上点击或按住拖动以移动游标，位置刷新后保留</span>
      </template>
      <template v-else-if="store.cursorAvailable">
        <span class="tag">频率游标</span>
        <span class="item muted">尚未放置游标，在图上点击或按住拖动即可读取该点频率与幅度</span>
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
import * as echarts from 'echarts'
import { useSignalStore } from '../store/signal'
import { formatFrequency, formatMagnitude } from '../utils/format'

const store = useSignalStore()
const chart = ref<HTMLDivElement>()
let instance: echarts.ECharts | null = null
let dragging = false

function update() {
  if (!instance) return
  const freqs = store.posFrequencies
  const mags = store.result?.spectrum.magnitudes.slice(0, freqs.length) ?? []
  const reading = store.cursorReading
  const hasData = freqs.length > 0

  const data: [number, number][] = []
  for (let i = 0; i < freqs.length; i++) data.push([freqs[i], mags[i]])

  instance.setOption({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 20, top: 30, bottom: 35 },
    xAxis: {
      type: 'value', name: '频率 (Hz)', nameLocation: 'middle', nameGap: 25,
      min: hasData ? freqs[0] : undefined,
      max: hasData ? freqs[freqs.length - 1] : undefined,
      axisLabel: { color: '#8899aa' }
    },
    yAxis: { type: 'value', name: '幅度 (dB)', nameLocation: 'middle', nameGap: 40, axisLabel: { color: '#8899aa' } },
    series: [{
      type: 'line', data, symbol: 'none', lineStyle: { color: '#42a5f5', width: 1.5 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(66,165,245,0.4)' }, { offset: 1, color: 'rgba(66,165,245,0.02)' }]) },
      markLine: reading ? {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#ffca28', width: 2, type: 'solid' },
        label: {
          formatter: formatFrequency(reading.frequency),
          color: '#1a2332', backgroundColor: '#ffca28',
          padding: [2, 5], borderRadius: 3, fontSize: 11, fontWeight: 'bold', position: 'insideEndTop'
        },
        data: [{ xAxis: reading.frequency }]
      } : undefined,
      markPoint: reading ? {
        symbol: 'circle', symbolSize: 9,
        itemStyle: { color: '#ffca28', borderColor: '#1a2332', borderWidth: 1 },
        label: {
          formatter: formatMagnitude(reading.magnitude),
          color: '#1a2332', backgroundColor: '#ffca28',
          padding: [2, 5], borderRadius: 3, fontSize: 11, fontWeight: 'bold', position: 'top'
        },
        data: [{ coord: [reading.frequency, reading.magnitude] }]
      } : undefined
    }],
    animation: false
  }, { notMerge: true })
}

/** 将指针位置换算为频率；仅当落在绘图区内时返回有效频率 */
function freqAtPointer(clientX: number, clientY: number): number | null {
  if (!instance || !store.cursorAvailable) return null
  const dom = instance.getDom()
  const rect = dom.getBoundingClientRect()
  // grid 配置：left 50, right 20, top 30, bottom 35
  const gx = 50, gy = 30
  const gw = dom.clientWidth - 50 - 20
  const gh = dom.clientHeight - 30 - 35
  const px = clientX - rect.left
  const py = clientY - rect.top
  if (px < gx || px > gx + gw || py < gy || py > gy + gh) return null
  const coord = instance.convertFromPixel({ seriesIndex: 0 }, [px, py])
  const f = Array.isArray(coord) ? Number(coord[0]) : NaN
  return Number.isFinite(f) ? f : null
}

function onPointerDown(e: PointerEvent) {
  if (!store.cursorAvailable) return
  const f = freqAtPointer(e.clientX, e.clientY)
  if (f === null) return
  dragging = true
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
  store.setCursorFreq(f)
}
function onPointerMove(e: PointerEvent) {
  if (!instance) return
  if (dragging) {
    if (!store.cursorAvailable) return
    const f = freqAtPointer(e.clientX, e.clientY)
    if (f !== null) store.setCursorFreq(f)
  } else if (store.cursorAvailable) {
    const f = freqAtPointer(e.clientX, e.clientY)
    instance.getDom().style.cursor = f !== null ? 'col-resize' : 'default'
  }
}
function onPointerUp() { dragging = false }

function onResize() { instance?.resize() }

onMounted(() => {
  if (chart.value) {
    instance = echarts.init(chart.value)
    const dom = instance.getDom()
    dom.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('resize', onResize)
    update()
  }
})
watch(() => [store.result, store.cursorReading, store.cursorAvailable], update)
onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('resize', onResize)
  instance?.dispose()
  instance = null
})
</script>

<style scoped>
.panel { background:#1a2332; border-radius:8px; padding:16px; border:1px solid #2a3a4a }
.panel h3 { margin-bottom:8px; color:#90caf9; font-size:14px }
.chart-wrap { position:relative }
.chart { width:100%; height:280px }
.chart.no-cursor { pointer-events:none }
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
.readout.disabled b { color:#8899aa }
.tag {
  font-size:11px; padding:2px 8px; border-radius:10px;
  background:rgba(255,202,40,0.18); color:#ffca28; border:1px solid rgba(255,202,40,0.4);
}
.tag-off { background:rgba(136,153,170,0.15); color:#8899aa; border-color:#2a3a4a }
.item b { color:#ffca28 }
.item.muted { color:#8899aa }
.hint { color:#5a7085; font-size:11px; margin-left:auto }
</style>
