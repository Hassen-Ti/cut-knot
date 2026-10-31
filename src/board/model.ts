import type { KpiAgg } from '../csv/kpi.ts'

export type ItemType = 'arrow' | 'source' | 'golden' | 'kpi'
export type SourceView = 'chip' | 'apercu'
export type JoinStatus = 'no-key'

export type BoardItem = {
  id: string
  type: ItemType
  x: number
  y: number
  w: number
  h: number
  text: string
  cells?: string[][]
  view?: SourceView
  measure?: string
  spark?: number[]
  chartKind?: 'spark' | 'bars'
  filePath?: string
  stale?: boolean
  error?: string
  joinStatus?: JoinStatus
  kpiAgg?: KpiAgg
  kpiColumn?: string
  kpiNumerator?: string
  kpiDenominator?: string
  kpiReady?: boolean
}

export type Connector = {
  id: string
  type: 'connector'
  fromId: string
  toId: string
}

export const GRID = 8
export const CHIP_H = 36
export const APERCU_W = 400
export const APERCU_H = 184
export const GOLDEN_APERCU_W = 640
export const GOLDEN_APERCU_H = 204
export const KPI_W = 200
export const KPI_H = 168
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 2
export const ZOOM_STEP = 0.1
export const MAX_SOURCES = 10
export const EMPTY_SOURCE_LABEL = 'Choisir CSV'

export function chipWidth(text: string) {
  return Math.max(112, Math.min(280, 44 + text.length * 7.5))
}

export function sourceDims(view: SourceView, text: string) {
  if (view === 'apercu') return { w: APERCU_W, h: APERCU_H }
  return { w: chipWidth(text), h: CHIP_H }
}

export function goldenDims(view: SourceView, text: string) {
  if (view === 'apercu') return { w: GOLDEN_APERCU_W, h: GOLDEN_APERCU_H }
  const label = text.startsWith('Golden') ? text : `Golden · ${text}`
  return { w: chipWidth(label), h: CHIP_H }
}

export function goldenChipLabel(item: BoardItem) {
  if (item.joinStatus === 'no-key') return 'no join key'
  return item.text.startsWith('Golden') ? item.text : `Golden · ${item.text}`
}

export function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
}

export function snap(v: number, disable: boolean) {
  if (disable) return v
  return Math.round(v / GRID) * GRID
}

export function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function itemCenter(it: BoardItem) {
  return { x: it.x + it.w / 2, y: it.y + it.h / 2 }
}

export function edgePoint(from: BoardItem, to: BoardItem) {
  const fc = itemCenter(from)
  const tc = itemCenter(to)
  const dx = tc.x - fc.x
  const dy = tc.y - fc.y
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { x: from.x + from.w, y: fc.y } : { x: from.x, y: fc.y }
  }
  return dy > 0 ? { x: fc.x, y: from.y + from.h } : { x: fc.x, y: from.y }
}

export function canvasPoint(el: HTMLDivElement, clientX: number, clientY: number, zoom: number) {
  const rect = el.getBoundingClientRect()
  return {
    x: (clientX - rect.left + el.scrollLeft) / zoom,
    y: (clientY - rect.top + el.scrollTop) / zoom,
  }
}

export function isEditableType(type: ItemType) {
  return type === 'source' || type === 'golden' || type === 'kpi'
}

export function isToggleable(type: ItemType) {
  return type === 'source' || type === 'golden'
}

export function sourceCount(items: BoardItem[]) {
  return items.filter((it) => it.type === 'source').length
}

export function fileBaseName(filePath: string) {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

export function isCsvFileName(name: string) {
  return name.toLowerCase().endsWith('.csv')
}

export function inboundSourceArrows(
  goldenId: string,
  items: BoardItem[],
  connectors: Connector[],
): BoardItem[] {
  const byId = new Map(items.map((it) => [it.id, it]))
  const inbound: BoardItem[] = []
  for (const connector of connectors) {
    if (connector.toId !== goldenId) continue
    const from = byId.get(connector.fromId)
    if (from?.type === 'source') inbound.push(from)
  }
  return inbound
}

export function inboundGolden(
  kpiId: string,
  items: BoardItem[],
  connectors: Connector[],
): BoardItem | undefined {
  const byId = new Map(items.map((it) => [it.id, it]))
  for (const connector of connectors) {
    if (connector.toId !== kpiId) continue
    const from = byId.get(connector.fromId)
    if (from?.type === 'golden') return from
  }
  return undefined
}
