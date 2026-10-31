import { numericColumnNames, parseNumber } from './numbers.ts'

export const KPI_AGGS = ['sum', 'mean', 'count', 'ratio'] as const
export type KpiAgg = (typeof KPI_AGGS)[number]

export const KPI_AGG_LABELS: Record<KpiAgg, string> = {
  sum: 'Somme',
  mean: 'Moyenne',
  count: 'Nombre',
  ratio: 'Ratio',
}

export type KpiSpec = {
  agg: KpiAgg
  column?: string
  numerator?: string
  denominator?: string
}

function columnIndex(headers: string[], name: string | undefined): number {
  if (!name) return -1
  return headers.indexOf(name)
}

function parsedCells(cells: string[][], col: number): number[] {
  const out: number[] = []
  for (const row of cells.slice(1)) {
    const raw = row[col] ?? ''
    if (raw.trim() === '') continue
    const n = parseNumber(raw)
    if (n !== null) out.push(n)
  }
  return out
}

export function defaultKpiSpec(cells: string[][] | undefined): KpiSpec | null {
  const cols = numericColumnNames(cells)
  if (cols.length === 0) return null
  return { agg: 'mean', column: cols[cols.length - 1] }
}

/**
 * Ratio = SUM(A)/SUM(B) over rows where A parses (the Coût / km story:
 * rows that have a Montant, no hardcoded names).
 */
export function computeKpi(cells: string[][] | undefined, spec: KpiSpec): number | null {
  if (!cells || cells.length < 2 || !cells[0]) return null
  const headers = cells[0]

  switch (spec.agg) {
    case 'sum': {
      const idx = columnIndex(headers, spec.column)
      if (idx < 0) return null
      const vals = parsedCells(cells, idx)
      if (vals.length === 0) return null
      return vals.reduce((a, b) => a + b, 0)
    }
    case 'mean': {
      const idx = columnIndex(headers, spec.column)
      if (idx < 0) return null
      const vals = parsedCells(cells, idx)
      if (vals.length === 0) return null
      return vals.reduce((a, b) => a + b, 0) / vals.length
    }
    case 'count': {
      const idx = columnIndex(headers, spec.column)
      if (idx < 0) return null
      return parsedCells(cells, idx).length
    }
    case 'ratio': {
      const idxA = columnIndex(headers, spec.numerator)
      const idxB = columnIndex(headers, spec.denominator)
      if (idxA < 0 || idxB < 0) return null
      let sumA = 0
      let sumB = 0
      let any = false
      for (const row of cells.slice(1)) {
        const rawA = row[idxA] ?? ''
        if (rawA.trim() === '') continue
        const a = parseNumber(rawA)
        if (a === null) continue
        const rawB = row[idxB] ?? ''
        const b = rawB.trim() === '' ? null : parseNumber(rawB)
        sumA += a
        if (b !== null) sumB += b
        any = true
      }
      if (!any || sumB === 0) return null
      return sumA / sumB
    }
    default: {
      const _exhaustive: never = spec.agg
      return _exhaustive
    }
  }
}

export function formatMeasure(value: number | null, agg: KpiAgg): string {
  if (value == null || !Number.isFinite(value)) return '—'
  switch (agg) {
    case 'count':
      return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)
    case 'ratio':
      return new Intl.NumberFormat('fr-FR', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(value)
    case 'sum':
    case 'mean':
      return new Intl.NumberFormat('fr-FR', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      }).format(value)
    default: {
      const _exhaustive: never = agg
      return _exhaustive
    }
  }
}

export function measureFromGolden(cells: string[][] | undefined, spec: KpiSpec | null): string {
  if (!spec) return '—'
  return formatMeasure(computeKpi(cells, spec), spec.agg)
}

export function isKpiAgg(value: string): value is KpiAgg {
  return (KPI_AGGS as readonly string[]).includes(value)
}
