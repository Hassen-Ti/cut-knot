import { joinAggregateLog, joinOrphanLog, leftJoin } from '../csv/join.ts'
import { computeKpi, defaultKpiSpec, formatMeasure, kpiSkippedWarning, type KpiSpec } from '../csv/kpi.ts'
import {
  goldenChipLabel,
  goldenDims,
  inboundGolden,
  inboundSourceArrows,
  sourceDims,
  type BoardItem,
  type Connector,
} from './model.ts'

function sourceHasData(source: BoardItem): boolean {
  return Boolean(source.cells && source.cells.length > 0 && !source.error)
}

function kpiSpecOf(item: BoardItem, cells: string[][] | undefined): KpiSpec | null {
  if (!item.kpiReady) {
    return defaultKpiSpec(cells)
  }
  if (!item.kpiAgg) return defaultKpiSpec(cells)
  return {
    agg: item.kpiAgg,
    column: item.kpiColumn,
    numerator: item.kpiNumerator,
    denominator: item.kpiDenominator,
  }
}

export function applyCsvToSource(
  item: BoardItem,
  payload: { name: string; cells?: string[][]; error?: string; filePath?: string },
): BoardItem {
  const text = payload.name
  const view = item.view ?? 'chip'
  const dims = sourceDims(view === 'apercu' ? 'apercu' : 'chip', text)
  if (payload.error) {
    return {
      ...item,
      text,
      filePath: payload.filePath,
      error: payload.error,
      stale: false,
      w: dims.w,
      h: dims.h,
    }
  }
  return {
    ...item,
    text,
    cells: payload.cells,
    filePath: payload.filePath,
    error: undefined,
    stale: false,
    w: dims.w,
    h: dims.h,
  }
}

export function markSourceAndGoldensStale(
  items: BoardItem[],
  connectors: Connector[],
  sourceId: string,
): BoardItem[] {
  const goldenIds = new Set<string>()
  for (const item of items) {
    if (item.type !== 'golden') continue
    const inbound = inboundSourceArrows(item.id, items, connectors)
    if (inbound.some((source) => source.id === sourceId)) goldenIds.add(item.id)
  }
  return items.map((item) => {
    if (item.id === sourceId && item.type === 'source') return { ...item, stale: true }
    if (item.type === 'golden' && goldenIds.has(item.id)) return { ...item, stale: true }
    return item
  })
}

export function recomputeBoard(items: BoardItem[], connectors: Connector[]): BoardItem[] {
  const goldens = items.map((item) => {
    if (item.type !== 'golden') return item
    const inbound = inboundSourceArrows(item.id, items, connectors).filter(sourceHasData)
    const watchedStale = inboundSourceArrows(item.id, items, connectors).some((source) => source.stale)

    if (inbound.length === 0) {
      const dims = item.view === 'apercu' ? goldenDims('apercu', item.text) : goldenDims('chip', item.text)
      return {
        ...item,
        cells: undefined,
        joinStatus: undefined,
        joinNote: undefined,
        orphanWarning: undefined,
        stale: Boolean(item.cells) || Boolean(item.stale),
        w: dims.w,
        h: dims.h,
      }
    }

    if (inbound.length === 1) {
      const source = inbound[0]!
      const dims =
        item.view === 'apercu' ? goldenDims('apercu', item.text) : goldenDims('chip', goldenChipLabel(item))
      return {
        ...item,
        cells: source.cells,
        joinStatus: undefined,
        joinNote: undefined,
        orphanWarning: undefined,
        stale: watchedStale,
        w: dims.w,
        h: dims.h,
      }
    }

    if (inbound.length > 2) {
      const dims =
        item.view === 'apercu' ? goldenDims('apercu', item.text) : goldenDims('chip', item.text)
      return {
        ...item,
        cells: undefined,
        joinStatus: undefined,
        joinNote: undefined,
        orphanWarning: `Impossible de joindre plus de 2 Sources (${inbound.length} connectées)`,
        stale: watchedStale,
        w: dims.w,
        h: dims.h,
      }
    }

    const left = inbound[0]!
    const right = inbound[1]!
    const { cells, key, aggregatedRightRows, orphanRightRows } = leftJoin(left.cells ?? [], right.cells ?? [])
    const joinStatus = key ? undefined : ('no-key' as const)
    const label = joinStatus === 'no-key' ? 'no join key' : item.text
    const dims = item.view === 'apercu' ? goldenDims('apercu', item.text) : goldenDims('chip', label)
    return {
      ...item,
      cells,
      joinStatus,
      joinNote: joinAggregateLog(right.text, aggregatedRightRows),
      orphanWarning: joinOrphanLog(right.text, orphanRightRows),
      stale: watchedStale,
      w: dims.w,
      h: dims.h,
    }
  })

  return goldens.map((item) => {
    if (item.type !== 'kpi') return item
    const golden = inboundGolden(item.id, goldens, connectors)
    const cells = golden?.cells
    const spec = kpiSpecOf(item, cells)
    if (!spec) {
      return { ...item, measure: '—', kpiReady: item.kpiReady, kpiSkippedWarning: undefined }
    }
    const result = computeKpi(cells, spec)
    const columnName = spec.agg === 'ratio' ? spec.numerator : spec.column
    return {
      ...item,
      measure: formatMeasure(result.value, spec.agg),
      kpiAgg: spec.agg,
      kpiColumn: spec.column ?? item.kpiColumn,
      kpiNumerator: spec.numerator ?? item.kpiNumerator,
      kpiDenominator: spec.denominator ?? item.kpiDenominator,
      kpiReady: true,
      kpiSkippedWarning: kpiSkippedWarning(result.skippedCells, columnName),
    }
  })
}
