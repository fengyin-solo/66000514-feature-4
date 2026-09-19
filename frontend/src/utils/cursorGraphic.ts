/**
 * 频谱图可拖动频率游标的 ECharts graphic 配置构建。
 * 抽成独立模块以便组件与集成测试复用同一份实现。
 */

export interface CursorGraphicHandlers {
  onDragStart: () => void
  /** 拖动中回调，参数为游标组当前的像素 x 坐标 */
  onDragMove: (pixelX: number) => void
  onDragEnd: () => void
}

export function buildCursorGraphic(opts: {
  x: number
  y: number
  plotHeight: number
  color: string
  handlers: CursorGraphicHandlers
}): Record<string, any> {
  const { x, y, plotHeight, color, handlers } = opts
  return {
    id: 'freq-cursor',
    type: 'group',
    x,
    y,
    draggable: 'horizontal',
    cursor: 'ew-resize',
    children: [
      // 透明加宽热区，方便抓取游标；z:100 保证游标始终位于系列线之上
      { type: 'rect', z: 100, shape: { x: -10, y: 0, width: 20, height: plotHeight }, style: { fill: 'rgba(255,112,67,0)' } },
      { type: 'line', z: 100, shape: { x1: 0, y1: 0, x2: 0, y2: plotHeight }, style: { stroke: color, lineWidth: 2 } },
      { type: 'polygon', z: 100, shape: { points: [[-6, 0], [6, 0], [0, 9]] }, style: { fill: color } }
    ],
    ondragstart: handlers.onDragStart,
    // zrender 会以元素自身作为 this 调用 on* 处理器，this.x 即拖动后的像素位置
    ondrag: function (this: any) { handlers.onDragMove(this.x) },
    ondragend: handlers.onDragEnd
  }
}
