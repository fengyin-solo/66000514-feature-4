/** 游标读数的统一格式化 —— 频谱图与瀑布图共用，保证显示文本一致 */
export function formatFrequency(freq: number): string {
  return `${freq.toFixed(2)} Hz`
}

export function formatMagnitude(mag: number): string {
  return `${mag.toFixed(2)} dB`
}
