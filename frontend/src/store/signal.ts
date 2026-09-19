import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import axios from 'axios'
import type { AnalysisResult, CursorReading } from '@/types'

const CURSOR_STORAGE_KEY = 'rf-analyzer:cursor-freq'

function loadStoredCursorFreq(): number | null {
  try {
    const raw = localStorage.getItem(CURSOR_STORAGE_KEY)
    if (raw === null) return null
    const v = Number(raw)
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

export const useSignalStore = defineStore('signal', () => {
  const loading = ref(false)
  const result = ref<AnalysisResult | null>(null)
  const activeView = ref('spectrum')

  /** 最近一次读取失败的错误信息；为 null 表示当前读取正常 */
  const error = ref<string | null>(null)
  /** 最近一次请求参数，用于失败后重新发起 */
  const lastRequest = ref<{ kind: 'analyze'; params: { modulation: string; samples: number; snr: number } } | { kind: 'import'; formData: FormData } | null>(null)

  /** 游标频率 (Hz)，刷新后从 localStorage 恢复 */
  const cursorFreq = ref<number | null>(loadStoredCursorFreq())

  // 游标位置持久化：每次移动即写入，刷新后仍保留
  watch(cursorFreq, (v) => {
    try {
      if (v === null) localStorage.removeItem(CURSOR_STORAGE_KEY)
      else localStorage.setItem(CURSOR_STORAGE_KEY, String(v))
    } catch {
      /* localStorage 不可用时仅放弃持久化，不影响使用 */
    }
  })

  /**
   * 频谱图实际展示的频率轴（正频率半轴，与瀑布图频率轴一致）。
   * fftshift 输出布局为 [-fs/2 … 0 … +fs/2)，正半轴位于数组后半段。
   */
  const posFrequencies = computed<number[]>(() => {
    const freqs = result.value?.spectrum.frequencies ?? []
    return freqs.slice(Math.floor(freqs.length / 2))
  })
  const posMagnitudes = computed<number[]>(() => {
    const mags = result.value?.spectrum.magnitudes ?? []
    return mags.slice(Math.floor(mags.length / 2))
  })
  const binCount = computed(() => posFrequencies.value.length)

  // 新数据到达（含失败重试恢复）后：将恢复出的游标位置限制在当前频率范围内并吸附到频率点，读数立即更新
  watch(posFrequencies, (freqs) => {
    if (cursorFreq.value === null || freqs.length === 0) return
    const f = cursorFreq.value
    if (f < freqs[0] || f > freqs[freqs.length - 1]) {
      cursorFreq.value = nearestFreq(freqs, f)
    }
  })

  function nearestFreq(freqs: number[], target: number): number {
    let best = freqs[0], bestDist = Math.abs(best - target)
    for (let i = 1; i < freqs.length; i++) {
      const d = Math.abs(freqs[i] - target)
      if (d < bestDist) { best = freqs[i]; bestDist = d }
    }
    return best
  }

  /** 设置游标频率，自动吸附到最近的实际频率点；无数据时忽略 */
  function setCursorFreq(freq: number) {
    const freqs = posFrequencies.value
    if (!freqs.length || !Number.isFinite(freq)) return
    cursorFreq.value = nearestFreq(freqs, freq)
  }

  /**
   * 游标是否可用：仅当读取成功且存在非空频谱数据时可用。
   * 数据为空或最近一次读取失败（即使仍保留旧数据）时不可用。
   */
  const cursorAvailable = computed(() => binCount.value > 0 && error.value === null)

  /** 游标不可用的原因说明 */
  const cursorUnavailableReason = computed<string>(() => {
    if (loading.value && !result.value) return '正在读取数据…'
    if (error.value) return '数据读取失败，游标暂不可用，请重试'
    if (!result.value) return '暂无数据，请先生成信号，生成后即可拖动游标读数'
    if (binCount.value === 0) return '频谱数据为空，无法定位频率点'
    return ''
  })

  /** 当前游标读数 —— 两个图形面板都从这里取值，确保两处读数完全一致 */
  const cursorReading = computed<CursorReading | null>(() => {
    const freqs = posFrequencies.value
    const mags = posMagnitudes.value
    if (!freqs.length || freqs.length !== mags.length || cursorFreq.value === null) return null
    const target = cursorFreq.value
    let idx = 0, bestDist = Math.abs(freqs[0] - target)
    for (let i = 1; i < freqs.length; i++) {
      const d = Math.abs(freqs[i] - target)
      if (d < bestDist) { idx = i; bestDist = d }
    }
    return {
      frequency: freqs[idx],
      magnitude: mags[idx],
      index: idx,
      fraction: idx / (freqs.length - 1 || 1)
    }
  })

  async function runRequest(
    req: NonNullable<typeof lastRequest.value>,
  ): Promise<void> {
    loading.value = true
    error.value = null
    lastRequest.value = req
    try {
      if (req.kind === 'analyze') {
        const { data } = await axios.post('/api/generate', req.params)
        result.value = data
      } else {
        const { data } = await axios.post('/api/import', req.formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        result.value = data
      }
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e)
        ? e.response?.data?.detail || e.message || '网络请求失败'
        : '读取失败，请重试'
      error.value = String(msg)
      // 读取失败时保留上一次成功的数据（若有），不清空游标与读数
    } finally {
      loading.value = false
    }
  }

  function analyze(params: { modulation: string; samples: number; snr: number }) {
    return runRequest({ kind: 'analyze', params })
  }

  function importCSV(formData: FormData) {
    return runRequest({ kind: 'import', formData })
  }

  /** 读取失败后使用相同参数重新发起；恢复成功后游标读数立即更新 */
  function retry() {
    if (!lastRequest.value || loading.value) return Promise.resolve()
    return runRequest(lastRequest.value)
  }

  return {
    loading,
    result,
    activeView,
    error,
    cursorFreq,
    cursorAvailable,
    cursorUnavailableReason,
    cursorReading,
    posFrequencies,
    setCursorFreq,
    analyze,
    importCSV,
    retry
  }
})
