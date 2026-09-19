/**
 * 频率游标功能集成测试（jsdom + node-canvas + 真实后端）。
 *
 * 运行前提：后端已在 localhost:8000 启动且 _last_spectrum 为空（刚重启）。
 * 覆盖：
 *  1. 空数据 + 恢复游标 → 立即读取 → 404 错误态（说明原因）
 *  2. 生成数据后读数自动恢复；读取失败可重试
 *  3. 真实 DOM 鼠标事件拖动游标 → 频率更新、localStorage 持久化、读数与后端一致
 *  4. 刷新恢复（新 pinia 实例）→ 游标位置保留、读数立刻更新
 *  5. 点击图表移动游标
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.navigator = dom.window.navigator
globalThis.localStorage = dom.window.localStorage
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
  globalThis.cancelAnimationFrame = clearTimeout
}

async function main() {
const axios = (await import('axios')).default
axios.defaults.baseURL = 'http://localhost:8000'
const echarts = await import('echarts')
const { createPinia } = await import('pinia')
const { useSignalStore } = await import('../src/store/signal')
const { buildCursorGraphic } = await import('../src/utils/cursorGraphic')

const CURSOR_KEY = 'rf-analyzer:cursor-freq'
const GRID = { left: 50, right: 15, top: 15, bottom: 35 }
const CHART_W = 800, CHART_H = 280

let passed = 0, failed = 0
function assert(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✔ ${name}`) }
  else { failed++; console.error(`  ✘ ${name} ${extra}`) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, timeout = 3000, step = 30) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (fn()) return true
    await sleep(step)
  }
  return false
}

/** 与 SpectrumPlot 相同的接线方式构建图表（数据 + 游标 graphic） */
function makeChart(store) {
  const div = document.createElement('div')
  document.body.appendChild(div)
  const inst = echarts.init(div, null, { renderer: 'canvas', width: CHART_W, height: CHART_H })
  const { frequencies, magnitudes } = store.result.spectrum
  const half = Math.floor(frequencies.length / 2)
  const data = frequencies.slice(half).map((f, i) => [f, magnitudes[half + i]])
  inst.setOption({
    grid: { ...GRID },
    xAxis: { type: 'value', min: 0 },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data }],
    animation: false
  })
  const fMax = frequencies[frequencies.length - 1]
  let dragging = false
  let lastDragEnd = 0
  function renderCursor() {
    if (dragging) return
    const px = inst.convertToPixel({ gridIndex: 0 }, [store.cursorFreq, 0])[0]
    inst.setOption({
      graphic: [buildCursorGraphic({
        x: px, y: GRID.top, plotHeight: CHART_H - GRID.top - GRID.bottom, color: '#ff7043',
        handlers: {
          onDragStart: () => { dragging = true },
          onDragMove: (pixelX) => {
            const f = inst.convertFromPixel({ gridIndex: 0 }, [pixelX, 0])[0]
            store.setCursorFreq(Math.min(fMax, Math.max(0, f)))
          },
          onDragEnd: () => { dragging = false; lastDragEnd = Date.now(); renderCursor() }
        }
      })]
    })
  }
  renderCursor()
  // 与组件 onChartClick 相同的接线：点击图表移动游标
  inst.getZr().on('click', (e) => {
    if (Date.now() - lastDragEnd < 150) return
    if (!inst.containPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])) return
    const f = inst.convertFromPixel({ gridIndex: 0 }, [e.offsetX, 0])[0]
    if (!Number.isFinite(f)) return
    store.setCursorFreq(Math.min(fMax, Math.max(0, f)))
    renderCursor()
  })
  return { inst, renderCursor }
}

function mouse(el, type, x, y) {
  el.dispatchEvent(new dom.window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }))
}

async function backendMeasure(freq) {
  const { data } = await axios.get('/api/measure', { params: { freq } })
  return data
}

// ============ Case 1: 空数据 + 恢复游标 → 立即读取 → 404 错误态 ============
console.log('Case 1: 空数据时恢复游标 → 读取失败并说明原因')
localStorage.setItem(CURSOR_KEY, '250')
const store1 = useSignalStore(createPinia())
assert(store1.cursorFreq === 250, '游标位置从 localStorage 恢复', `got ${store1.cursorFreq}`)
await waitFor(() => store1.cursorError !== null)
assert(store1.cursorError !== null && store1.cursorError.includes('暂无'), '读取失败并给出原因', `error=${store1.cursorError}`)
assert(store1.cursorReading === null, '失败时无读数')

// ============ Case 2: 生成数据 → 读数自动恢复；失败可重试 ============
console.log('Case 2: 生成数据后读数自动恢复；读取失败可重试')
await store1.analyze({ modulation: 'QPSK', samples: 1024, snr: 20 })
await waitFor(() => store1.cursorReading !== null)
assert(store1.cursorReading !== null, '数据到达后读数自动恢复')
assert(store1.cursorError === null, '错误态已清除')
const expected250 = await backendMeasure(250)
assert(store1.cursorReading.frequency === expected250.frequency
  && store1.cursorReading.magnitude === expected250.magnitude,
  '读数与后端测量一致', `store=${JSON.stringify(store1.cursorReading)} backend=${JSON.stringify(expected250)}`)

axios.defaults.baseURL = 'http://localhost:9999' // 模拟后端宕机
await store1.retryCursorReading()
assert(store1.cursorError !== null && store1.cursorReading === null, '后端不可用时读取失败', `error=${store1.cursorError}`)
axios.defaults.baseURL = 'http://localhost:8000'
await store1.retryCursorReading()
assert(store1.cursorError === null && store1.cursorReading !== null, '重试后读数恢复')

// ============ Case 3: 拖动游标 ============
console.log('Case 3: 拖动游标 → 频率/读数/持久化同步更新')
const { inst } = makeChart(store1)
const root = inst.getZr().painter.getViewportRoot()
const startPx = inst.convertToPixel({ gridIndex: 0 }, [store1.cursorFreq, 0])[0]
const targetPx = startPx + 100
mouse(root, 'mousedown', startPx, 100)
mouse(root, 'mousemove', targetPx, 100)
mouse(root, 'mouseup', targetPx, 100)
const expectedFreq = inst.convertFromPixel({ gridIndex: 0 }, [targetPx, 0])[0]
assert(store1.cursorFreq !== null && Math.abs(store1.cursorFreq - expectedFreq) < 0.01,
  '拖动后游标频率正确', `got ${store1.cursorFreq} want ${expectedFreq}`)
assert(Number(localStorage.getItem(CURSOR_KEY)) === store1.cursorFreq, '游标位置已持久化')
await waitFor(() => store1.cursorReading !== null
  && Math.abs(store1.cursorReading.frequency - expectedFreq) < 2, 3000)
const expectedDrag = await backendMeasure(store1.cursorFreq)
assert(store1.cursorReading.frequency === expectedDrag.frequency
  && store1.cursorReading.magnitude === expectedDrag.magnitude,
  '拖动后读数与后端一致', `store=${JSON.stringify(store1.cursorReading)} backend=${JSON.stringify(expectedDrag)}`)
// 拖动结束后游标吸附位置正确（游标 group 是 GraphicView 容器的子元素，需递归查找）
function findById(el, id) {
  if (el.id === id) return el
  if (el.children) {
    for (const c of el.children()) {
      const r = findById(c, id)
      if (r) return r
    }
  }
  return null
}
let group = null
for (const r of inst.getZr().storage.getRoots()) {
  group = findById(r, 'freq-cursor')
  if (group) break
}
const wantPx = inst.convertToPixel({ gridIndex: 0 }, [store1.cursorFreq, 0])[0]
assert(group && Math.abs(group.x - wantPx) < 0.01, '游标图形位置与频率一致',
  `group.x=${group && group.x} wantPx=${wantPx}`)

// ============ Case 4: 刷新恢复（新 pinia 实例）→ 读数立刻更新 ============
console.log('Case 4: 刷新后游标保留、读数立刻更新')
const savedFreq = store1.cursorFreq
const store2 = useSignalStore(createPinia()) // 模拟刷新后的全新 store
assert(store2.cursorFreq === savedFreq, '刷新后游标位置保留', `got ${store2.cursorFreq} want ${savedFreq}`)
const restored = await waitFor(() => store2.cursorReading !== null, 1500)
assert(restored, '恢复后读数立刻更新（无需再次拖动）')
const expectedRestore = await backendMeasure(savedFreq)
assert(store2.cursorReading.frequency === expectedRestore.frequency
  && store2.cursorReading.magnitude === expectedRestore.magnitude,
  '恢复的读数与后端一致')

// ============ Case 5: 点击图表移动游标 ============
console.log('Case 5: 点击图表移动游标')
await sleep(200) // 避开拖动结束后的 click 抑制窗口
const before = store1.cursorFreq
const clickPx = inst.convertToPixel({ gridIndex: 0 }, [120, 0])[0]
mouse(root, 'mousedown', clickPx, 150)
mouse(root, 'mouseup', clickPx, 150)
mouse(root, 'click', clickPx, 150)
assert(store1.cursorFreq !== null && Math.abs(store1.cursorFreq - 120) < 1 && store1.cursorFreq !== before,
  '点击后游标移动到点击位置', `got ${store1.cursorFreq}`)

console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error('测试执行异常:', e); process.exit(1) })
