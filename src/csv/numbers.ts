const SPACE_RE = /[\s\u00a0\u202f\u2007\u2009]/g
const JUNK_RE = /[€%]/g

/**
 * `"1 234,5 €"` → 1234.5. Accepts comma or dot decimals;
 * strips €, %, spaces and non-breaking spaces.
 */
export function parseNumber(raw: string): number | null {
  let s = raw.replace(SPACE_RE, '').replace(JUNK_RE, '').trim()
  if (s === '') return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (lastComma >= 0) {
    s = s.replace(',', '.')
  }

  s = s.replace(/[^0-9.+-]/g, '')
  if (s === '' || s === '+' || s === '-' || s === '.' || s === '+.' || s === '-.') {
    return null
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function isNumericColumn(cells: string[][], col: number): boolean {
  const values: string[] = []
  for (let r = 1; r < cells.length; r += 1) {
    const raw = cells[r]?.[col] ?? ''
    if (raw.trim() !== '') values.push(raw)
  }
  if (values.length === 0) return false
  let ok = 0
  for (const value of values) {
    if (parseNumber(value) !== null) ok += 1
  }
  return ok / values.length >= 0.8
}

export function numericColumnNames(cells: string[][] | undefined): string[] {
  const headers = cells?.[0]
  if (!headers || !cells) return []
  return headers.filter((_, i) => isNumericColumn(cells, i))
}
