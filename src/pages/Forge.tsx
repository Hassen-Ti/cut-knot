import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Footer, FORGE_TOOLS, Shell3, WhatIveDone } from '../components/Shell'

type Cell = { value: string | number; formula?: string }
type SheetRow = { id: string; cells: Cell[] }
type ColDef = { key: string; label: string; letter: string }
type SortDir = 'none' | 'asc' | 'desc'
type WidItem = { t: string; a: string }
type SheetFile = { id: string; name: string; cols: ColDef[]; rows: SheetRow[] }
type Sel = { id: string; r: number; c: number }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

let rowSeq = 0
function nextRowId(prefix = 'r') {
  rowSeq += 1
  return `${prefix}-${rowSeq}`
}

function colLetter(i: number) {
  return LETTERS[i] ?? `C${i}`
}

function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseNum(v: string | number): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v).replace(',', '.').replace(/\s/g, '').replace('€', '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function fmtNum(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return ''
  return Number.isInteger(n) && decimals === 0
    ? String(n)
    : n.toLocaleString('fr-FR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
}

/** True for bare arithmetic like 15+10 or 3*4-1 (not a plain number / text). */
function looksLikeArithmetic(text: string): boolean {
  const t = text.trim()
  if (!t || t.startsWith('=')) return false
  if (!/[+\-*/]/.test(t)) return false
  // digits, dots/commas, spaces, and + - * / ( ) only
  if (!/^[\d\s.,+\-*/()]+$/.test(t)) return false
  // must contain at least one operator between operands
  return /[\d.,]\s*[+\-*/]\s*[\d.,]/.test(t)
}

/** Normalize formula-bar input: =expr stays formula; bare 15+10 → =15+10. */
function normalizeBarInput(text: string): { kind: 'formula'; formula: string } | { kind: 'value'; value: string | number } {
  const t = text.trim()
  if (t.startsWith('=')) return { kind: 'formula', formula: t }
  if (looksLikeArithmetic(t)) return { kind: 'formula', formula: `=${t}` }
  const n = parseNum(t)
  if (n != null && t !== '' && /^-?\d/.test(t.replace(/\s/g, ''))) {
    return { kind: 'value', value: n }
  }
  return { kind: 'value', value: t }
}

/** Evaluate a simple formula like =E2/F2, =15+10 against sheet rows (1-indexed data rows). */
function evalFormula(formula: string, rows: SheetRow[]): string | number {
  const f = formula.trim()
  if (!f.startsWith('=')) return f
  const expr = f.slice(1).trim()

  const tokenRe = /([A-Z]+)(\d+)|([+\-*/()])|(\d+(?:[.,]\d+)?)/gi
  let rebuilt = ''
  let m: RegExpExecArray | null
  const src = expr
  let last = 0
  while ((m = tokenRe.exec(src))) {
    rebuilt += src.slice(last, m.index)
    last = m.index + m[0].length
    if (m[1] && m[2]) {
      const ci = LETTERS.indexOf(m[1].toUpperCase())
      const ri = Number(m[2]) - 1
      const cell = rows[ri]?.cells[ci]
      const n = cell != null ? parseNum(cell.value) : null
      rebuilt += n == null ? 'NaN' : String(n)
    } else if (m[3]) {
      rebuilt += m[3]
    } else if (m[4]) {
      rebuilt += m[4].replace(',', '.')
    }
  }
  rebuilt += src.slice(last)
  if (/[^0-9.+\-*/()eE\s]/.test(rebuilt) || rebuilt.includes('NaN')) return '—'
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${rebuilt})`)() as number
    if (!Number.isFinite(result)) return '—'
    return Math.round(result * 100) / 100
  } catch {
    return '—'
  }
}

function recompute(rows: SheetRow[]): SheetRow[] {
  // Multi-pass so dependents of dependents settle (small sheets).
  let next = rows
  for (let pass = 0; pass < 3; pass++) {
    next = next.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => {
        if (!cell.formula) return cell
        return { ...cell, value: evalFormula(cell.formula, next) }
      }),
    }))
  }
  return next
}

function cell(v: string | number, formula?: string): Cell {
  return formula ? { value: v, formula } : { value: v }
}

function sheetRow(cells: Cell[], id?: string): SheetRow {
  return { id: id ?? nextRowId(), cells }
}

function parsePrecedents(formula: string): Set<string> {
  const next = new Set<string>()
  const re = /([A-Z]+)(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(formula))) {
    const ci = LETTERS.indexOf(m[1].toUpperCase())
    const ri = Number(m[2]) - 1
    if (ci >= 0 && ri >= 0) next.add(`${ri}:${ci}`)
  }
  return next
}

function buildTournees(): SheetFile {
  const cols: ColDef[] = [
    { key: 'id', label: 'ID_tournée', letter: 'A' },
    { key: 'date', label: 'Date', letter: 'B' },
    { key: 'chauffeur', label: 'Chauffeur', letter: 'C' },
    { key: 'vehicule', label: 'Véhicule', letter: 'D' },
    { key: 'zone', label: 'Zone', letter: 'E' },
    { key: 'km', label: 'Km', letter: 'F' },
    { key: 'livraisons', label: 'Livraisons', letter: 'G' },
    { key: 'cout', label: 'Coût (€)', letter: 'H' },
    { key: 'cout_km', label: 'Coût_km', letter: 'I' },
  ]
  const raw: (string | number)[][] = [
    ['TRN001', '02/05/2024', 'Martin', 'VU-23', 'Nord', 142, 18, 186.4],
    ['TRN002', '02/05/2024', 'Dubois', 'VU-07', 'Sud', 98, 12, 112.0],
    ['TRN003', '03/05/2024', 'Bernard', 'VU-23', 'Est', 210, 24, 268.5],
    ['TRN004', '03/05/2024', 'Martin', 'VU-12', 'Ouest', 156, 16, 198.2],
    ['TRN005', '04/05/2024', 'Lefevre', 'VU-07', 'Nord', 87, 9, 94.5],
    ['TRN006', '04/05/2024', 'Dubois', 'VU-23', 'Centre', 134, 15, 171.0],
    ['TRN007', '05/05/2024', 'Petit', 'VU-15', 'Sud', 245, 28, 312.8],
    ['TRN008', '05/05/2024', 'Bernard', 'VU-12', 'Est', 118, 14, 145.6],
    ['TRN009', '06/05/2024', 'Martin', 'VU-23', 'Ouest', 176, 20, 221.0],
    ['TRN010', '06/05/2024', 'Lefevre', 'VU-07', 'Nord', 64, 7, 72.3],
    ['TRN011', '07/05/2024', 'Dubois', 'VU-15', 'Centre', 192, 22, 248.9],
    ['TRN012', '07/05/2024', 'Petit', 'VU-12', 'Sud', 155, 17, 189.4],
    ['TRN013', '08/05/2024', 'Bernard', 'VU-23', 'Est', 203, 25, 259.1],
    ['TRN014', '08/05/2024', 'Martin', 'VU-07', 'Ouest', 111, 13, 128.7],
    ['TRN015', '09/05/2024', 'Lefevre', 'VU-15', 'Nord', 168, 19, 205.5],
  ]
  const rows: SheetRow[] = raw.map((r, ri) => {
    const base = r.map((v) => cell(v))
    const rowIdx = ri + 1
    base.push(cell(0, `=H${rowIdx}/F${rowIdx}`))
    return sheetRow(base, `trn-${String(ri + 1).padStart(3, '0')}`)
  })
  return { id: 'tournees', name: 'tournées.csv', cols, rows: recompute(rows) }
}

function buildCouts(): SheetFile {
  const cols: ColDef[] = [
    { key: 'id', label: 'ID_coût', letter: 'A' },
    { key: 'vehicule', label: 'Véhicule', letter: 'B' },
    { key: 'type', label: 'Type', letter: 'C' },
    { key: 'montant', label: 'Montant (€)', letter: 'D' },
    { key: 'periode', label: 'Période', letter: 'E' },
    { key: 'budget', label: 'Budget (€)', letter: 'F' },
    { key: 'ecart', label: 'Écart', letter: 'G' },
  ]
  const raw: (string | number)[][] = [
    ['CST001', 'VU-23', 'Carburant', 420.5, 'Mai', 400],
    ['CST002', 'VU-07', 'Carburant', 310.0, 'Mai', 320],
    ['CST003', 'VU-12', 'Entretien', 180.0, 'Mai', 200],
    ['CST004', 'VU-15', 'Carburant', 355.2, 'Mai', 340],
    ['CST005', 'VU-23', 'Péage', 95.0, 'Mai', 80],
    ['CST006', 'VU-07', 'Entretien', 220.0, 'Mai', 200],
    ['CST007', 'VU-12', 'Carburant', 278.4, 'Mai', 280],
    ['CST008', 'VU-15', 'Péage', 62.5, 'Mai', 70],
    ['CST009', 'VU-23', 'Assurance', 150.0, 'Mai', 150],
    ['CST010', 'VU-07', 'Péage', 48.0, 'Mai', 55],
    ['CST011', 'VU-12', 'Assurance', 140.0, 'Mai', 150],
    ['CST012', 'VU-15', 'Entretien', 95.0, 'Mai', 100],
  ]
  const rows: SheetRow[] = raw.map((r, ri) => {
    const base = r.map((v) => cell(v))
    const rowIdx = ri + 1
    base.push(cell(0, `=D${rowIdx}-F${rowIdx}`))
    return sheetRow(base, `cst-${String(ri + 1).padStart(3, '0')}`)
  })
  return { id: 'couts', name: 'coûts.csv', cols, rows: recompute(rows) }
}

const INITIAL_WID: Record<string, WidItem[]> = {
  'tournées.csv': [
    { t: '14:06', a: 'Cleaning columns (date, zone, km, cout)' },
    { t: '14:07', a: 'Dropping column (notes)' },
    { t: '14:08', a: 'Duplicated values' },
    { t: '14:12', a: 'Join with coûts' },
    { t: '14:18', a: 'KPI crafting "écart_zone_critique"' },
  ],
  'coûts.csv': [
    { t: '14:20', a: 'Cleaning columns (type, montant, budget)' },
    { t: '14:22', a: 'Dropping column (commentaire)' },
    { t: '14:25', a: 'Join with tournées' },
    { t: '14:28', a: 'KPI crafting "écart_budget"' },
  ],
}

const MOCK_EXTRA = [
  'zones.csv',
  'chauffeurs.csv',
  'véhicules.csv',
  'livraisons.csv',
  'péages.csv',
  'carburant.csv',
  'écarts.csv',
  'synthèse.csv',
]

function emptySheet(name: string): SheetFile {
  const cols: ColDef[] = [
    { key: 'a', label: 'Col_A', letter: 'A' },
    { key: 'b', label: 'Col_B', letter: 'B' },
    { key: 'c', label: 'Col_C', letter: 'C' },
  ]
  const rows: SheetRow[] = Array.from({ length: 5 }, (_, i) =>
    sheetRow([cell(`${name.split('.')[0]}-${i + 1}`), cell(10 * (i + 1)), cell(0, `=B${i + 1}*2`)]),
  )
  return { id: name, name, cols, rows: recompute(rows) }
}

function colNumericCount(rows: { cells: Cell[] }[], ci: number): number {
  let n = 0
  for (const row of rows) {
    if (parseNum(row.cells[ci]?.value ?? '') != null) n++
  }
  return n
}


function liveSel(sel: Sel | null, rows: SheetRow[]): Sel | null {
  if (!sel) return null
  const r = rows.findIndex((row) => row.id === sel.id)
  if (r < 0) return sel
  if (r !== sel.r) return { ...sel, r }
  return sel
}

function rangeBounds(a: Sel, b: Sel) {
  return {
    r0: Math.min(a.r, b.r),
    r1: Math.max(a.r, b.r),
    c0: Math.min(a.c, b.c),
    c1: Math.max(a.c, b.c),
  }
}

function cellRef(r: number, c: number) {
  return `${colLetter(c)}${r + 1}`
}

function rangeRef(a: Sel, b: Sel) {
  const { r0, r1, c0, c1 } = rangeBounds(a, b)
  const start = cellRef(r0, c0)
  const end = cellRef(r1, c1)
  return start === end ? start : `${start}:${end}`
}

export default function Forge() {
  const [files, setFiles] = useState<SheetFile[]>(() => [buildTournees(), buildCouts()])
  const [activeId, setActiveId] = useState('tournees')
  const [widByScope, setWidByScope] = useState<Record<string, WidItem[]>>(() => ({ ...INITIAL_WID }))

  const initial = files[0]
  const [selected, setSelected] = useState<Sel | null>(() => {
    const row = initial.rows[0]
    return row ? { id: row.id, r: 0, c: 2 } : null
  })
  const [barText, setBarText] = useState(() => {
    const c = initial.rows[0]?.cells[2]
    return c?.formula ?? String(c?.value ?? 'Martin')
  })
  const committedBar = useRef(barText)
  const selectedRef = useRef<Sel | null>(selected)
  const barTextRef = useRef(barText)
  selectedRef.current = selected
  barTextRef.current = barText

  const [showFilter, setShowFilter] = useState(false)
  const [filters, setFilters] = useState<Record<number, string>>({})
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('none')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [precedents, setPrecedents] = useState<Set<string>>(new Set())
  const [extraIdx, setExtraIdx] = useState(0)
  /** Skip the blur commit that follows a cell mousedown (already committed there). */
  const skipBlurCommit = useRef(false)
  /** Other corner of the selection rectangle; null = single-cell (same as selected). */
  const [rangeEnd, setRangeEnd] = useState<Sel | null>(null)
  /** Stable selection anchor (one corner); used for Shift+click and drag. */
  const anchorRef = useRef<Sel | null>(selected)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  const active = files.find((f) => f.id === activeId) ?? files[0]
  const scope = active.name

  const log = useCallback(
    (action: string) => {
      const entry = { t: nowHHMM(), a: action }
      setWidByScope((prev) => {
        const list = prev[scope] ?? []
        return { ...prev, [scope]: [...list, entry] }
      })
    },
    [scope],
  )

  const updateActive = useCallback(
    (updater: (sheet: SheetFile) => SheetFile) => {
      setFiles((prev) => prev.map((f) => (f.id === activeId ? updater(f) : f)))
    },
    [activeId],
  )

  const displayRows = useMemo(() => {
    const indexed = active.rows.map((row, i) => ({ row, i }))
    let filtered = indexed
    const activeFilters = Object.entries(filters).filter(([, v]) => v.trim())
    if (activeFilters.length) {
      filtered = indexed.filter(({ row }) =>
        activeFilters.every(([ci, q]) => {
          const cellVal = row.cells[Number(ci)]
          return String(cellVal?.value ?? '')
            .toLowerCase()
            .includes(q.trim().toLowerCase())
        }),
      )
    }
    if (sortCol != null && sortDir !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        const va = a.row.cells[sortCol]?.value
        const vb = b.row.cells[sortCol]?.value
        const na = parseNum(va ?? '')
        const nb = parseNum(vb ?? '')
        let cmp = 0
        if (na != null && nb != null) cmp = na - nb
        else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'fr', { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return filtered
  }, [active.rows, filters, sortCol, sortDir])

  /** Resolve current data index for a stable row id (survives filter/sort). */
  const indexOfRowId = useCallback(
    (id: string) => active.rows.findIndex((r) => r.id === id),
    [active.rows],
  )

  const selectCell = useCallback(
    (rowId: string, dataIndex: number, c: number, opts?: { asAnchor?: boolean; updateBar?: boolean }) => {
      const asAnchor = opts?.asAnchor !== false
      const updateBar = opts?.updateBar !== false
      const cellData = active.rows[dataIndex]?.cells[c]
      const shown = cellData?.formula ?? String(cellData?.value ?? '')
      const nextSel: Sel = { id: rowId, r: dataIndex, c }
      if (updateBar) {
        selectedRef.current = nextSel
        setSelected(nextSel)
        setBarText(shown)
        barTextRef.current = shown
        committedBar.current = shown
        setPrecedents(cellData?.formula ? parsePrecedents(cellData.formula) : new Set())
      }
      if (asAnchor) {
        anchorRef.current = nextSel
        setRangeEnd(null)
      }
      return nextSel
    },
    [active.rows],
  )

  /** Commit formula bar into a specific cell (by stable id). */
  const commitToCell = useCallback(
    (sel: Sel, text: string) => {
      const trimmed = text.trim()
      if (trimmed === committedBar.current.trim()) return false

      // Prefer live index from id so filter/sort never edits the wrong row.
      let r = indexOfRowId(sel.id)
      if (r < 0) r = sel.r
      const c = sel.c

      committedBar.current = trimmed
      const parsed = normalizeBarInput(trimmed)

      updateActive((sheet) => {
        const rows = sheet.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => ({ ...cell })),
        }))
        if (r < 0 || r >= rows.length || c < 0 || c >= (rows[r]?.cells.length ?? 0)) {
          return sheet
        }
        if (parsed.kind === 'formula') {
          rows[r].cells[c] = {
            value: evalFormula(parsed.formula, rows),
            formula: parsed.formula,
          }
        } else {
          rows[r].cells[c] = { value: parsed.value }
        }
        return { ...sheet, rows: recompute(rows) }
      })

      log(`Edited ${colLetter(c)}${r + 1}`)

      if (parsed.kind === 'formula') {
        setPrecedents(parsePrecedents(parsed.formula))
        // Keep bar showing the normalized formula (e.g. =15+10)
        setBarText(parsed.formula)
        barTextRef.current = parsed.formula
        committedBar.current = parsed.formula
      } else {
        setPrecedents(new Set())
      }
      return true
    },
    [indexOfRowId, updateActive, log],
  )

  const applyBar = useCallback(() => {
    const sel = selectedRef.current
    if (!sel) return
    commitToCell(sel, barTextRef.current)
  }, [commitToCell])

  const onBarKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      applyBar()
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setBarText(committedBar.current)
      barTextRef.current = committedBar.current
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const onBarBlur = () => {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false
      return
    }
    applyBar()
  }

  /** Commit formula bar before changing selection from a mousedown (runs before input blur). */
  const prepareSelectionMouseDown = (cur: Sel | null) => {
    skipBlurCommit.current = true
    if (cur) commitToCell(cur, barTextRef.current)
  }

  /** mousedown runs before input blur — commit old cell, then select new / extend range. */
  const onCellMouseDown = (e: ReactMouseEvent, rowId: string, dataIndex: number, c: number) => {
    const cur = selectedRef.current
    const same = cur && cur.id === rowId && cur.c === c
    if (!same && cur) {
      prepareSelectionMouseDown(cur)
    } else {
      // Re-clicking same cell or shift-extend: skip blur commit
      skipBlurCommit.current = true
    }

    if (e.shiftKey && (anchorRef.current || cur)) {
      // Shift+click: keep anchor, move active to clicked cell, range = anchor → clicked
      if (!anchorRef.current && cur) anchorRef.current = cur
      selectCell(rowId, dataIndex, c, { asAnchor: false, updateBar: true })
      setRangeEnd(null)
      return
    }

    // Plain click: new single-cell selection + start potential drag
    selectCell(rowId, dataIndex, c, { asAnchor: true, updateBar: true })
    draggingRef.current = true
    setDragging(true)
  }

  /** Click column letter (A, B, …) or label → select that column over all visible/filtered rows. */
  const onColLetterMouseDown = (e: ReactMouseEvent, ci: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (displayRows.length === 0) return

    const cur = selectedRef.current
    prepareSelectionMouseDown(cur)

    // Use min/max data indices across all visible rows so sort order cannot shrink the range.
    let top = displayRows[0]
    let bot = displayRows[0]
    for (const d of displayRows) {
      if (d.i < top.i) top = d
      if (d.i > bot.i) bot = d
    }
    const multiRows = top.i !== bot.i || top.row.id !== bot.row.id

    if (e.shiftKey && (anchorRef.current || cur)) {
      // Extend to a multi-column block over visible rows (G:I style).
      if (!anchorRef.current && cur) anchorRef.current = cur
      const a = anchorRef.current!
      anchorRef.current = { id: top.row.id, r: top.i, c: a.c }
      selectCell(top.row.id, top.i, ci, { asAnchor: false, updateBar: true })
      if (multiRows || a.c !== ci) {
        setRangeEnd({ id: bot.row.id, r: bot.i, c: ci })
      } else {
        setRangeEnd(null)
      }
      return
    }

    selectCell(top.row.id, top.i, ci, { asAnchor: true, updateBar: true })
    if (multiRows) {
      setRangeEnd({ id: bot.row.id, r: bot.i, c: ci })
    }
  }

  /** Click row number gutter → select entire visible row across all columns. */
  const onRowNumMouseDown = (e: ReactMouseEvent, rowId: string, dataIndex: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const lastC = active.cols.length - 1
    if (lastC < 0) return

    const cur = selectedRef.current
    prepareSelectionMouseDown(cur)

    if (e.shiftKey && (anchorRef.current || cur)) {
      // Extend row range to a full-width rectangle between anchor row and clicked row.
      if (!anchorRef.current && cur) anchorRef.current = cur
      const a = anchorRef.current!
      anchorRef.current = { id: a.id, r: a.r, c: 0 }
      selectCell(rowId, dataIndex, 0, { asAnchor: false, updateBar: true })
      if (a.r !== dataIndex || lastC > 0) {
        setRangeEnd({ id: rowId, r: dataIndex, c: lastC })
      } else {
        setRangeEnd(null)
      }
      return
    }

    selectCell(rowId, dataIndex, 0, { asAnchor: true, updateBar: true })
    if (lastC > 0) {
      setRangeEnd({ id: rowId, r: dataIndex, c: lastC })
    }
  }

  const onCellMouseEnter = (rowId: string, dataIndex: number, c: number) => {
    if (!draggingRef.current) return
    const next: Sel = { id: rowId, r: dataIndex, c }
    setRangeEnd(next)
  }

  useEffect(() => {
    const endDrag = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragging(false)
    }
    window.addEventListener('mouseup', endDrag)
    return () => window.removeEventListener('mouseup', endDrag)
  }, [])

  const cycleSort = (colIndex: number) => {
    if (sortCol !== colIndex) {
      setSortCol(colIndex)
      setSortDir('asc')
      log(`Sorted ${active.cols[colIndex].label} ↑`)
      return
    }
    if (sortDir === 'asc') {
      setSortDir('desc')
      log(`Sorted ${active.cols[colIndex].label} ↓`)
    } else if (sortDir === 'desc') {
      setSortDir('none')
      setSortCol(null)
      log(`Sorted ${active.cols[colIndex].label} (cleared)`)
    } else {
      setSortDir('asc')
      log(`Sorted ${active.cols[colIndex].label} ↑`)
    }
  }

  const onSortBtn = () => {
    const col = selected?.c ?? 0
    cycleSort(col)
  }

  const applyFilters = () => {
    const parts = Object.entries(filters)
      .filter(([, v]) => v.trim())
      .map(([ci, v]) => `${active.cols[Number(ci)].label} ∋ "${v.trim()}"`)
    if (parts.length) log(`Filtered ${parts.join(', ')}`)
    else log('Filtered (cleared)')
    setShowFilter(false)
  }

  const clearFilters = () => {
    setFilters({})
    log('Filtered (cleared)')
    setShowFilter(false)
  }

  const doSum = () => {
    const selectedLiveNow = liveSel(selectedRef.current, active.rows)
    const rangeEndLiveNow = liveSel(rangeEnd, active.rows)
    const anchorNow = liveSel(anchorRef.current, active.rows) ?? selectedLiveNow

    // Multi-cell range SUM: only cells inside the rectangle
    if (selectedLiveNow && anchorNow) {
      const other = rangeEndLiveNow ?? selectedLiveNow
      const { r0, r1, c0, c1 } = rangeBounds(anchorNow, other)
      const isMulti = r0 !== r1 || c0 !== c1
      if (isMulti) {
        let sum = 0
        let count = 0
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const n = parseNum(active.rows[r]?.cells[c]?.value ?? '')
            if (n != null) {
              sum += n
              count++
            }
          }
        }
        const ref = rangeRef(anchorNow, other)
        if (count === 0) {
          setStatusMsg(`SUM(${ref}) — aucune valeur numérique`)
          return
        }
        setStatusMsg(`SUM(${ref}) = ${fmtNum(sum)} · ${count} numbers`)
        log(`SUM on ${ref} → ${fmtNum(sum)}`)
        return
      }
    }

    const visible = displayRows.map(({ row }) => row)
    const visibleCount = visible.length

    const pickNumericCol = (): number => {
      const preferKeys = [/coût_km|cout_km/i, /^km$/i, /coût|cout|montant|budget|livraison/i]
      for (const re of preferKeys) {
        const idx = active.cols.findIndex((c, i) => re.test(c.label) && colNumericCount(visible, i) > 0)
        if (idx >= 0) return idx
      }
      for (let i = active.cols.length - 1; i >= 0; i--) {
        if (colNumericCount(visible, i) > 0) return i
      }
      return -1
    }

    let ci = selected?.c ?? -1
    const selectedLabel = ci >= 0 ? active.cols[ci]?.label ?? colLetter(ci) : null
    const selectedNumeric = ci >= 0 ? colNumericCount(visible, ci) : 0

    if (ci < 0 || selectedNumeric === 0) {
      if (ci >= 0 && selectedNumeric === 0) {
        const auto = pickNumericCol()
        if (auto < 0) {
          setStatusMsg(
            visibleCount === 0
              ? `${selectedLabel} — aucune ligne visible`
              : `${selectedLabel} n’est pas numérique · ${visibleCount} rows visibles`,
          )
          return
        }
        // Auto-pick numeric column; report that selected col wasn't numeric.
        const autoLabel = active.cols[auto]?.label ?? colLetter(auto)
        let sum = 0
        let count = 0
        for (const row of visible) {
          const n = parseNum(row.cells[auto]?.value ?? '')
          if (n != null) {
            sum += n
            count++
          }
        }
        const msg = `${selectedLabel} n’est pas numérique · SUM(${autoLabel}) = ${fmtNum(sum)}  ·  ${count} rows`
        setStatusMsg(msg)
        log(`SUM on ${autoLabel} → ${fmtNum(sum)} (${count} rows; ${selectedLabel} non-numérique)`)
        return
      }
      ci = pickNumericCol()
      if (ci < 0) {
        setStatusMsg(
          visibleCount === 0 ? 'SUM — aucune ligne visible' : 'SUM — aucune colonne numérique',
        )
        return
      }
    }

    let sum = 0
    let count = 0
    for (const row of visible) {
      const n = parseNum(row.cells[ci]?.value ?? '')
      if (n != null) {
        sum += n
        count++
      }
    }
    const label = active.cols[ci]?.label ?? colLetter(ci)
    const msg = `SUM(${label}) = ${fmtNum(sum)}  ·  ${count} rows`
    setStatusMsg(msg)
    log(`SUM on ${label} → ${fmtNum(sum)}`)
  }

  const doIf = () => {
    const kmIdx = active.cols.findIndex((c) => /^km$/i.test(c.label))
    const targetCol = kmIdx >= 0 ? kmIdx : selected?.c ?? 0
    const helperLabel = 'Trajet'
    const existing = active.cols.findIndex((c) => c.key === 'trajet' || c.label === helperLabel)

    updateActive((sheet) => {
      let cols = sheet.cols
      let rows = sheet.rows.map((row) => ({
        ...row,
        cells: row.cells.map((c) => ({ ...c })),
      }))
      let helperIdx = existing
      if (helperIdx < 0) {
        helperIdx = cols.length
        cols = [...cols, { key: 'trajet', label: helperLabel, letter: colLetter(helperIdx) }]
        rows = rows.map((row) => ({ ...row, cells: [...row.cells, cell('')] }))
      }
      rows = rows.map((row) => {
        const n = parseNum(row.cells[targetCol]?.value ?? '')
        const v = n != null && n > 150 ? 'long' : 'short'
        const nextCells = [...row.cells]
        nextCells[helperIdx] = cell(v)
        return { ...row, cells: nextCells }
      })
      return { ...sheet, cols, rows: recompute(rows) }
    })
    const label = active.cols[targetCol]?.label ?? colLetter(targetCol)
    setStatusMsg(`IF: ${label} > 150 → "${helperLabel}" (long / short)`)
    log(`IF ${label} > 150 → column "${helperLabel}"`)
  }

  const syncBarFromSheet = (sheet: SheetFile, r: number, c: number) => {
    const cellData = sheet.rows[r]?.cells[c]
    const shown = cellData?.formula ?? String(cellData?.value ?? '')
    setBarText(shown)
    barTextRef.current = shown
    committedBar.current = shown
    setPrecedents(cellData?.formula ? parsePrecedents(cellData.formula) : new Set())
  }

  const switchFile = (id: string) => {
    setActiveId(id)
    setFilters({})
    setSortCol(null)
    setSortDir('none')
    setShowFilter(false)
    setStatusMsg(null)
    const f = files.find((x) => x.id === id)
    if (f && f.rows[0]) {
      const row = f.rows[0]
      const nextSel: Sel = { id: row.id, r: 0, c: 0 }
      selectedRef.current = nextSel
      anchorRef.current = nextSel
      setSelected(nextSel)
      setRangeEnd(null)
      syncBarFromSheet(f, 0, 0)
    } else {
      selectedRef.current = null
      anchorRef.current = null
      setSelected(null)
      setRangeEnd(null)
      setBarText('')
      barTextRef.current = ''
      committedBar.current = ''
      setPrecedents(new Set())
    }
  }

  const addFile = () => {
    if (files.length >= 10) {
      setStatusMsg('Max 10 files')
      return
    }
    let name = MOCK_EXTRA[extraIdx % MOCK_EXTRA.length] ?? `fichier-${files.length + 1}.csv`
    setExtraIdx((i) => i + 1)
    if (files.some((f) => f.name === name)) {
      name = `fichier-${files.length + 1}.csv`
    }
    const sheet = emptySheet(name)
    setFiles((prev) => [...prev, sheet])
    setWidByScope((prev) => ({
      ...prev,
      [name]: [{ t: nowHHMM(), a: `Opened ${name}` }],
    }))
    setActiveId(sheet.id)
    setFilters({})
    setSortCol(null)
    setSortDir('none')
    setShowFilter(false)
    setStatusMsg(null)
    const row = sheet.rows[0]
    if (row) {
      const nextSel: Sel = { id: row.id, r: 0, c: 0 }
      selectedRef.current = nextSel
      anchorRef.current = nextSel
      setSelected(nextSel)
      setRangeEnd(null)
      syncBarFromSheet(sheet, 0, 0)
    }
  }

  const widItems = widByScope[scope] ?? []
  const dayLabel = 'Sam 26'

  // Keep selected.r in sync if sheet rows shifted (id is source of truth).
  const selectedLive = liveSel(selected, active.rows)
  const rangeEndLive = liveSel(rangeEnd, active.rows)
  const anchorLive = liveSel(anchorRef.current, active.rows) ?? selectedLive
  const rangeOther = rangeEndLive ?? selectedLive
  const bounds =
    selectedLive && anchorLive && rangeOther
      ? rangeBounds(anchorLive, rangeOther)
      : null
  const isMultiRange = Boolean(
    bounds && (bounds.r0 !== bounds.r1 || bounds.c0 !== bounds.c1),
  )
  const rangeLabel =
    selectedLive && anchorLive && rangeOther ? rangeRef(anchorLive, rangeOther) : null
  const rangeDims = bounds
    ? `${bounds.r1 - bounds.r0 + 1}×${bounds.c1 - bounds.c0 + 1}`
    : null

  const onForgeTool = (t: string) => {
    if (t === 'Select') {
      // Back to select mode: close filter row if open.
      setShowFilter(false)
      return
    }
    if (t === 'Filter') {
      setShowFilter((v) => !v)
      return
    }
    if (t === 'Sort') {
      onSortBtn()
      return
    }
    if (t === 'SUM') {
      doSum()
      return
    }
    if (t === 'IF') {
      doIf()
      return
    }
  }

  /** Highlight lasting modes: Filter row open, or an active sort. */
  const forgeActiveTool =
    showFilter
      ? 'Filter'
      : sortCol != null && sortDir !== 'none'
        ? 'Sort'
        : 'Select'

  return (
    <Shell3
      toolProps={{
        variant: 'forge',
        tools: FORGE_TOOLS,
        active: forgeActiveTool,
        onSelect: onForgeTool,
      }}
      center={
        <section className="panel">
          <div className="panel-title">Forge</div>
          <div className="lab-toolbar">
            <div className="file-tabs">
              {files.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`file-tab${f.id === activeId ? ' active' : ''}`}
                  onClick={() => switchFile(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <button className="btn" type="button" onClick={addFile} title="Ajouter path/fichier">
              Ajouter path/fichier
            </button>
          </div>
          <div className="formula-bar">
            <span className="fx">fx</span>
            <span className="cell-ref">
              {selectedLive ? cellRef(selectedLive.r, selectedLive.c) : '—'}
            </span>
            {isMultiRange && rangeLabel && (
              <span className="range-ref" title={rangeLabel}>
                {rangeLabel}
                {rangeDims ? ` · ${rangeDims}` : ''}
              </span>
            )}
            <input
              value={barText}
              onChange={(e) => {
                setBarText(e.target.value)
                barTextRef.current = e.target.value
              }}
              onKeyDown={onBarKey}
              onBlur={onBarBlur}
              aria-label="Formula bar"
            />
          </div>
          {statusMsg && <div className="status-strip">{statusMsg}</div>}
          <div className="grid-wrap">
            <table className={`sheet${dragging ? ' is-dragging' : ''}`}>
              <thead>
                <tr>
                  <th className="corner" />
                  {active.cols.map((col, ci) => {
                    const letterInSel = Boolean(
                      bounds && ci >= bounds.c0 && ci <= bounds.c1,
                    )
                    return (
                      <th
                        key={col.key}
                        className={`col-letter${letterInSel ? ' in-sel' : ''}`}
                        title="Cliquer pour sélectionner la colonne"
                        onMouseDown={(e) => onColLetterMouseDown(e, ci)}
                      >
                        {col.letter}
                      </th>
                    )
                  })}
                </tr>
                <tr>
                  <th className="corner" />
                  {active.cols.map((col, ci) => {
                    const ind =
                      sortCol === ci && sortDir === 'asc'
                        ? ' ↑'
                        : sortCol === ci && sortDir === 'desc'
                          ? ' ↓'
                          : ''
                    const headInSel = Boolean(
                      bounds && ci >= bounds.c0 && ci <= bounds.c1,
                    )
                    return (
                      <th
                        key={col.key}
                        className={`col-head${headInSel ? ' in-sel' : ''}`}
                        title="Cliquer pour sélectionner · double-clic pour trier"
                        onMouseDown={(e) => onColLetterMouseDown(e, ci)}
                        onDoubleClick={(e) => {
                          e.preventDefault()
                          cycleSort(ci)
                        }}
                      >
                        {col.label}
                        {ind}
                      </th>
                    )
                  })}
                </tr>
                {showFilter && (
                  <tr className="filter-row">
                    <th className="corner" />
                    {active.cols.map((col, ci) => (
                      <th key={col.key}>
                        <input
                          className="filter-input"
                          placeholder="contains…"
                          value={filters[ci] ?? ''}
                          onChange={(e) =>
                            setFilters((prev) => ({ ...prev, [ci]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') applyFilters()
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {displayRows.map(({ row, i: dataIndex }) => {
                  const rowInSel = Boolean(
                    bounds && dataIndex >= bounds.r0 && dataIndex <= bounds.r1,
                  )
                  return (
                  <tr key={row.id}>
                    <td
                      className={`rownum${rowInSel ? ' in-sel' : ''}`}
                      title="Cliquer pour sélectionner la ligne"
                      onMouseDown={(e) => onRowNumMouseDown(e, row.id, dataIndex)}
                    >
                      {dataIndex + 1}
                    </td>
                    {row.cells.map((c, ci) => {
                      const isSel = selectedLive?.id === row.id && selectedLive?.c === ci
                      const inRange = Boolean(
                        bounds &&
                          dataIndex >= bounds.r0 &&
                          dataIndex <= bounds.r1 &&
                          ci >= bounds.c0 &&
                          ci <= bounds.c1 &&
                          isMultiRange,
                      )
                      const rangeShadow = inRange && bounds
                        ? [
                            dataIndex === bounds.r0 ? 'inset 0 2px 0 var(--accent)' : '',
                            dataIndex === bounds.r1 ? 'inset 0 -2px 0 var(--accent)' : '',
                            ci === bounds.c0 ? 'inset 2px 0 0 var(--accent)' : '',
                            ci === bounds.c1 ? 'inset -2px 0 0 var(--accent)' : '',
                          ]
                            .filter(Boolean)
                            .join(', ')
                        : undefined
                      const isPrec = precedents.has(`${dataIndex}:${ci}`)
                      const hasFx = Boolean(c.formula)
                      return (
                        <td
                          key={ci}
                          className={[
                            isSel ? 'selected' : '',
                            inRange ? 'in-range' : '',
                            hasFx ? 'has-formula' : '',
                            isPrec ? 'precedent' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={rangeShadow ? { boxShadow: rangeShadow } : undefined}
                          onMouseDown={(e) => {
                            // Only left button; prevent focus steal quirks
                            if (e.button !== 0) return
                            e.preventDefault()
                            onCellMouseDown(e, row.id, dataIndex, ci)
                          }}
                          onMouseEnter={() => onCellMouseEnter(row.id, dataIndex, ci)}
                        >
                          {typeof c.value === 'number' ? fmtNum(c.value) : String(c.value)}
                        </td>
                      )
                    })}
                  </tr>
                  )
                })}
                {displayRows.length === 0 && (
                  <tr>
                    <td className="rownum">—</td>
                    <td colSpan={active.cols.length} style={{ color: 'var(--muted)', padding: 12 }}>
                      No rows match filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {showFilter && (
            <div className="filter-actions">
              <button className="btn primary" type="button" onClick={applyFilters}>
                Apply
              </button>
              <button className="btn" type="button" onClick={clearFilters}>
                Clear
              </button>
            </div>
          )}
        </section>
      }
      wid={<WhatIveDone scope={scope} day={dayLabel} items={widItems} />}
      footer={
        <Footer
          placeholder="Demande à l'IA une action sur les données…"
          action={
            <Link className="btn primary" to="/golden">
              Vers Golden source
            </Link>
          }
        />
      }
    />
  )
}
