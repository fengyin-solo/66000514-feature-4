export interface SignalData {
  i: number[]
  q: number[]
  sampleRate: number
  centerFreq: number
}

export interface SpectrumData {
  frequencies: number[]
  magnitudes: number[]
}

/** 频率游标读数：频谱图与瀑布图共用同一份数据，保证两处读数一致 */
export interface CursorReading {
  /** 游标对应的实际频率 (Hz)，已吸附到最近的频率点 */
  frequency: number
  /** 该频率点的幅度 (dB) */
  magnitude: number
  /** 频率点在频谱数组中的下标 */
  index: number
  /** 在频率轴上的归一化位置 [0,1]，供瀑布图同步定位 */
  fraction: number
}

export interface WaterfallRow {
  time: number
  values: number[]
}

export interface ConstellationPoint {
  i: number
  q: number
}

export interface ModulationResult {
  type: string
  confidence: number
  candidates: { type: string; score: number }[]
  symbolRate: number | null
  frequencyOffset: number | null
}

export interface AnalysisResult {
  spectrum: SpectrumData
  waterfall: WaterfallRow[]
  constellation: ConstellationPoint[]
  modulation: ModulationResult
}

export const MODULATION_TYPES = ['AM', 'FM', 'BPSK', 'QPSK', '16QAM']