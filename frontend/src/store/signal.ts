import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import axios from 'axios'
import type { AnalysisResult, CursorReading } from '@/types'

const CURSOR_FREQ_KEY = 'rf-analyzer:cursor-freq'

function loadSavedCursorFreq(): number | null {
  try {
    const raw = localStorage.getItem(CURSOR_FREQ_KEY)
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

  // ---- 频率游标 ----
  // 游标频率持久化到 localStorage，页面刷新后恢复
  const cursorFreq = ref<number | null>(loadSavedCursorFreq())
  const cursorReading = ref<CursorReading | null>(null)
  const cursorError = ref<string | null>(null)
  const cursorLoading = ref(false)

  const hasSpectrumData = computed(() => {
    const s = result.value?.spectrum
    return !!s && s.frequencies.length > 0 && s.magnitudes.length > 0
  })

  let fetchSeq = 0
  let fetchTimer: ReturnType<typeof setTimeout> | null = null

  async function fetchCursorReading() {
    if (cursorFreq.value === null) return
    const seq = ++fetchSeq
    cursorLoading.value = true
    cursorError.value = null
    try {
      const { data } = await axios.get<CursorReading>('/api/measure', {
        params: { freq: cursorFreq.value }
      })
      if (seq !== fetchSeq) return // 已有更新的请求，丢弃过期响应
      cursorReading.value = data
    } catch (e: any) {
      if (seq !== fetchSeq) return
      cursorReading.value = null
      cursorError.value = e?.response?.data?.detail ?? '游标读数读取失败'
    } finally {
      if (seq === fetchSeq) cursorLoading.value = false
    }
  }

  function scheduleFetch(delay = 150) {
    if (fetchTimer) clearTimeout(fetchTimer)
    fetchTimer = setTimeout(fetchCursorReading, delay)
  }

  function setCursorFreq(freq: number, immediate = false) {
    cursorFreq.value = freq
    try { localStorage.setItem(CURSOR_FREQ_KEY, String(freq)) } catch { /* 隐私模式等场景下忽略 */ }
    if (immediate) fetchCursorReading()
    else scheduleFetch()
  }

  function retryCursorReading() {
    return fetchCursorReading()
  }

  // 新分析结果到达：游标若无位置则放到正半频中心，并立即刷新读数
  watch(result, (r) => {
    if (!r || !hasSpectrumData.value) return
    if (cursorFreq.value === null) {
      const freqs = r.spectrum.frequencies
      const pos = freqs.filter(f => f >= 0)
      const def = pos.length ? pos[Math.floor(pos.length / 2)] : freqs[Math.floor(freqs.length / 2)]
      setCursorFreq(def, true)
    } else {
      fetchCursorReading()
    }
  })

  // 页面刷新后游标位置从 localStorage 恢复：立刻拉取读数，无需用户再次拖动
  if (cursorFreq.value !== null) fetchCursorReading()

  async function analyze(params: { modulation: string; samples: number; snr: number }) {
    loading.value = true
    try {
      const { data } = await axios.post('/api/generate', params)
      result.value = data
    } finally { loading.value = false }
  }

  async function importCSV(formData: FormData) {
    loading.value = true
    try {
      const { data } = await axios.post('/api/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      result.value = data
    } finally { loading.value = false }
  }

  return {
    loading, result, activeView, analyze, importCSV,
    cursorFreq, cursorReading, cursorError, cursorLoading, hasSpectrumData,
    setCursorFreq, retryCursorReading, fetchCursorReading
  }
})
