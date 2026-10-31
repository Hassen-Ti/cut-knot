export type JoinKey = {
  leftKey: string
  rightKey: string
}

export function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
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
}

/** Left-join on the shared key. Unmatched right cells stay blank. */
export function leftJoin(left: string[][], right: string[][]): LeftJoinResult {
  if (left.length === 0) return { cells: left, key: null }
  const leftHeaders = left[0] ?? []
  const rightHeaders = right[0] ?? []
  const key = findJoinKey(leftHeaders, rightHeaders)
  if (!key) return { cells: left, key: null }

  const leftKeyIdx = leftHeaders.indexOf(key.leftKey)
  const rightKeyIdx = rightHeaders.indexOf(key.rightKey)
  if (leftKeyIdx < 0 || rightKeyIdx < 0) return { cells: left, key: null }

  const rightExtra = rightHeaders
    .map((header, index) => ({ header, index }))
    .filter((col) => col.index !== rightKeyIdx)

  const outHeaders = [...leftHeaders, ...rightExtra.map((col) => col.header)]
  const rightIndex = new Map<string, string[]>()
  for (const row of right.slice(1)) {
    const raw = row[rightKeyIdx] ?? ''
    const norm = normalizeHeader(raw)
    if (!rightIndex.has(norm)) rightIndex.set(norm, row)
  }

  const out: string[][] = [outHeaders]
  for (const row of left.slice(1)) {
    const raw = row[leftKeyIdx] ?? ''
    const match = rightIndex.get(normalizeHeader(raw))
    const extra = rightExtra.map((col) => match?.[col.index] ?? '')
    const padded = leftHeaders.map((_, i) => row[i] ?? '')
    out.push([...padded, ...extra])
  }
  return { cells: out, key }
}
