import { formatMeasure } from './kpi.ts'
import { isNumericColumn, parseNumber } from './numbers.ts'

export type JoinKey = {
  leftKey: string
  rightKey: string
}

export function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** Join-key VALUES: trim only. Case and accents stay significant. */
export function joinKeyValue(value: string): string {
  return value.trim()
}

/**
 * First header identical in both files (case- and accent-insensitive).
 * If none, first header matching `/id/i` in each file.
 */
export function findJoinKey(leftHeaders: string[], rightHeaders: string[]): JoinKey | null {
  const rightByNorm = new Map<string, string>()
  for (const header of rightHeaders) {
    const norm = normalizeHeader(header)
    if (!rightByNorm.has(norm)) rightByNorm.set(norm, header)
  }
  for (const header of leftHeaders) {
    const match = rightByNorm.get(normalizeHeader(header))
    if (match !== undefined) return { leftKey: header, rightKey: match }
  }

  const leftId = leftHeaders.find((header) => /id/i.test(header))
  const rightId = rightHeaders.find((header) => /id/i.test(header))
  if (leftId && rightId) return { leftKey: leftId, rightKey: rightId }
  return null
}

export type LeftJoinResult = {
  cells: string[][]
  key: JoinKey | null
  /** Right-side rows that shared a key with at least one other row. */
  aggregatedRightRows: number
}

function mergeNonNumeric(values: string[]): string {
  const distinct: string[] = []
  const seen = new Set<string>()
  for (const raw of values) {
    const trimmed = raw.trim()
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    distinct.push(raw)
  }
  if (distinct.length <= 1) return distinct[0] ?? ''
  return distinct.map((value) => value.trim()).join(' | ')
}

function mergeNumeric(values: string[]): string {
  const nums: number[] = []
  for (const raw of values) {
    if (raw.trim() === '') continue
    const n = parseNumber(raw)
    if (n !== null) nums.push(n)
  }
  if (nums.length === 0) return ''
  return formatMeasure(
    nums.reduce((a, b) => a + b, 0),
    'sum',
  )
}

/** One right row per join key. Numeric extras SUM; other extras stay or join with ` | `. */
export function aggregateRightByKey(right: string[][], keyIdx: number): {
  rows: string[][]
  aggregatedRightRows: number
} {
  const headers = right[0] ?? []
  if (headers.length === 0) return { rows: right, aggregatedRightRows: 0 }

  const numeric = headers.map((_, index) => index !== keyIdx && isNumericColumn(right, index))
  const groups = new Map<string, string[][]>()
  const order: string[] = []
  for (const row of right.slice(1)) {
    const key = joinKeyValue(row[keyIdx] ?? '')
    const group = groups.get(key)
    if (group) {
      group.push(row)
    } else {
      groups.set(key, [row])
      order.push(key)
    }
  }

  let aggregatedRightRows = 0
  const rows: string[][] = [headers]
  for (const key of order) {
    const group = groups.get(key) ?? []
    if (group.length > 1) aggregatedRightRows += group.length
    if (group.length === 1) {
      rows.push(headers.map((_, index) => group[0]?.[index] ?? ''))
      continue
    }
    rows.push(
      headers.map((_, index) => {
        if (index === keyIdx) return group[0]?.[index] ?? key
        const values = group.map((row) => row[index] ?? '')
        return numeric[index] ? mergeNumeric(values) : mergeNonNumeric(values)
      }),
    )
  }
  return { rows, aggregatedRightRows }
}

export function joinAggregateLog(sourceName: string, aggregatedRightRows: number): string | undefined {
  if (aggregatedRightRows <= 0) return undefined
  const noun = aggregatedRightRows === 1 ? 'doublon agrégé' : 'doublons agrégés'
  return `Join with ${sourceName}: ${aggregatedRightRows} ${noun}`
}

/**
 * Left-join on the shared key. Right-side duplicate keys are aggregated first
 * so Golden keeps exactly one row per left row.
 */
export function leftJoin(left: string[][], right: string[][]): LeftJoinResult {
  if (left.length === 0) return { cells: left, key: null, aggregatedRightRows: 0 }
  const leftHeaders = left[0] ?? []
  const rightHeaders = right[0] ?? []
  const key = findJoinKey(leftHeaders, rightHeaders)
  if (!key) return { cells: left, key: null, aggregatedRightRows: 0 }

  const leftKeyIdx = leftHeaders.indexOf(key.leftKey)
  const rightKeyIdx = rightHeaders.indexOf(key.rightKey)
  if (leftKeyIdx < 0 || rightKeyIdx < 0) {
    return { cells: left, key: null, aggregatedRightRows: 0 }
  }

  const { rows: rightRows, aggregatedRightRows } = aggregateRightByKey(right, rightKeyIdx)
  const rightExtra = rightHeaders
    .map((header, index) => ({ header, index }))
    .filter((col) => col.index !== rightKeyIdx)

  const outHeaders = [...leftHeaders, ...rightExtra.map((col) => col.header)]
  const rightIndex = new Map<string, string[]>()
  for (const row of rightRows.slice(1)) {
    const raw = joinKeyValue(row[rightKeyIdx] ?? '')
    if (!rightIndex.has(raw)) rightIndex.set(raw, row)
  }

  const out: string[][] = [outHeaders]
  for (const row of left.slice(1)) {
    const match = rightIndex.get(joinKeyValue(row[leftKeyIdx] ?? ''))
    const extra = rightExtra.map((col) => match?.[col.index] ?? '')
    const padded = leftHeaders.map((_, i) => row[i] ?? '')
    out.push([...padded, ...extra])
  }
  return { cells: out, key, aggregatedRightRows }
}
