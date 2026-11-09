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

export function defaultKpiSpec(cells: string[][] | undefined): KpiSpec | null {
  const cols = numericColumnNames(cells)
  if (cols.length === 0) return null
  return { agg: 'mean', column: cols[cols.length - 1] }
}

export type KpiResult = {
  value: number | null
  skippedCells: number
  skippedByColumn?: Record<string, number>
}

/**
 * Ratio = SUM(A)/SUM(B) over rows where A parses (the Coût / km story:
 * rows that have a Montant, no hardcoded names).
 */
export function computeKpi(cells: string[][] | undefined, spec: KpiSpec): KpiResult {
  if (!cells || cells.length < 2 || !cells[0]) return { value: null, skippedCells: 0 }
  const headers = cells[0]

  switch (spec.agg) {
    case 'sum': {
      const idx = columnIndex(headers, spec.column)
      if (idx < 0) return { value: null, skippedCells: 0 }
      let skippedCells = 0
      const vals: number[] = []
      for (const row of cells.slice(1)) {
        const raw = row[idx] ?? ''
        if (raw.trim() === '') continue
        const n = parseNumber(raw)
        if (n !== null) {
          vals.push(n)
        } else {
          skippedCells++
        }
      }
      if (vals.length === 0) return { value: null, skippedCells }
      return { value: vals.reduce((a, b) => a + b, 0), skippedCells }
    }
    case 'mean': {
      const idx = columnIndex(headers, spec.column)
      if (idx < 0) return { value: null, skippedCells: 0 }
      let skippedCells = 0
      const vals: number[] = []
      for (const row of cells.slice(1)) {
        const raw = row[idx] ?? ''
        if (raw.trim() === '') continue
        const n = parseNumber(raw)
        if (n !== null) {
          vals.push(n)
        } else {
          skippedCells++
        }
      }
      if (vals.length === 0) return { value: null, skippedCells }
      return { value: vals.reduce((a, b) => a + b, 0) / vals.length, skippedCells }
    }
    case 'count': {
      const idx = columnIndex(headers, spec.column)
      if (idx < 0) return { value: null, skippedCells: 0 }
      let skippedCells = 0
      const vals: number[] = []
      for (const row of cells.slice(1)) {
        const raw = row[idx] ?? ''
        if (raw.trim() === '') continue
        const n = parseNumber(raw)
        if (n !== null) {
          vals.push(n)
        } else {
          skippedCells++
        }
      }
      return { value: vals.length, skippedCells }
    }
    case 'ratio': {
      const idxA = columnIndex(headers, spec.numerator)
      const idxB = columnIndex(headers, spec.denominator)
      if (idxA < 0 || idxB < 0) return { value: null, skippedCells: 0 }
      let sumA = 0
      let sumB = 0
      let any = false
      let skippedA = 0
      let skippedB = 0
      for (const row of cells.slice(1)) {
        const rawA = row[idxA] ?? ''
        if (rawA.trim() === '') continue
        const a = parseNumber(rawA)
        if (a === null) {
          skippedA++
          continue
        }
        const rawB = row[idxB] ?? ''
        const b = rawB.trim() === '' ? null : parseNumber(rawB)
        if (b === null && rawB.trim() !== '') {
          skippedB++
        }
        sumA += a
        if (b !== null) sumB += b
        any = true
      }
      const skippedCells = skippedA + skippedB
      const skippedByColumn: Record<string, number> = {}
      if (skippedA > 0 && spec.numerator) skippedByColumn[spec.numerator] = skippedA
      if (skippedB > 0 && spec.denominator) skippedByColumn[spec.denominator] = skippedB
      if (!any || sumB === 0) return { value: null, skippedCells, skippedByColumn }
      return { value: sumA / sumB, skippedCells, skippedByColumn }
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
  return formatMeasure(computeKpi(cells, spec).value, spec.agg)
}

export function kpiSkippedWarning(
  result: KpiResult,
  spec: KpiSpec | null,
): string | undefined {
  if (result.skippedCells <= 0) return undefined
  
  if (result.skippedByColumn && Object.keys(result.skippedByColumn).length > 0) {
    const parts: string[] = []
    for (const [col, count] of Object.entries(result.skippedByColumn)) {
      const noun = count === 1 ? 'valeur non numérique ignorée' : 'valeurs non numériques ignorées'
      parts.push(`${count} ${noun} (${col})`)
    }
    return parts.join(', ')
  }
  
  const noun = result.skippedCells === 1 ? 'valeur non numérique ignorée' : 'valeurs non numériques ignorées'
  const columnName = spec?.agg === 'ratio' ? spec.numerator : spec?.column
  const col = columnName ? ` (${columnName})` : ''
  return `${result.skippedCells} ${noun}${col}`
}

export function isKpiAgg(value: string): value is KpiAgg {
  return (KPI_AGGS as readonly string[]).includes(value)
}
