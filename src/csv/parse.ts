export type CsvDelimiter = ',' | ';'

function isQuote(ch: string): boolean {
  return ch === '"'
}

/** Count unquoted `,` vs `;` on the first record; `;` wins a tie (Excel FR). */
export function pickDelimiter(text: string): CsvDelimiter {
  let comma = 0
  let semi = 0
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (isQuote(ch)) {
      if (quoted && text[i + 1] === '"') {
        i += 1
        continue
      }
      quoted = !quoted
      continue
    }
    if (quoted) continue
    if (ch === '\n' || ch === '\r') break
    if (ch === ',') comma += 1
    if (ch === ';') semi += 1
  }
  if (semi > comma) return ';'
  if (comma > semi) return ','
  return ';'
}

function parseRecords(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (quoted) {
      if (isQuote(ch)) {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
        continue
      }
      field += ch
      continue
    }
    if (isQuote(ch) && field.length === 0) {
      quoted = true
      continue
    }
    if (ch === delimiter) {
      pushField()
      continue
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1
      pushRow()
      continue
    }
    if (ch === '\n') {
      pushRow()
      continue
    }
    field += ch
  }

  if (quoted) {
    throw new Error('Fichier illisible')
  }
  if (field.length > 0 || row.length > 0) {
    pushRow()
  }
  return rows
}

function trimTrailingEmpty(rows: string[][]): string[][] {
  const next = rows.slice()
  while (next.length > 0) {
    const last = next[next.length - 1]!
    if (last.length === 0 || last.every((cell) => cell.trim() === '')) {
      next.pop()
      continue
    }
    break
  }
  return next
}

/** First row = headers. Quoted fields, BOM, and `,` / `;` auto-detect. */
export function parseCsv(text: string): string[][] {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text
  if (body.trim() === '') {
    throw new Error('CSV vide')
  }
  const delimiter = pickDelimiter(body)
  const rows = trimTrailingEmpty(parseRecords(body, delimiter))
  if (rows.length === 0 || rows[0] == null || rows[0].every((cell) => cell.trim() === '')) {
    throw new Error('CSV vide')
  }
  return rows
}
