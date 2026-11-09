/** Deterministic engine that executes typed AI actions. AI never computes; engine does. */

import { parseNumber } from '../csv/numbers.ts'
import type { AiAction } from './actions.ts'

export type EngineResult = {
  cells: string[][]
  affectedRows: number
  log: string
}

export function executeAction(cells: string[][], action: AiAction): EngineResult {
  if (cells.length === 0) {
    return { cells, affectedRows: 0, log: 'No data' }
  }

  const headers = cells[0] ?? []

  switch (action.type) {
    case 'clean_column': {
      const idx = headers.indexOf(action.column)
      if (idx < 0) {
        return { cells, affectedRows: 0, log: `Column ${action.column} not found` }
      }

      let affected = 0
      const cleaned = cells.map((row, i) => {
        if (i === 0) return row
        const cell = row[idx] ?? ''
        let newCell = cell

        switch (action.operation) {
          case 'trim':
            newCell = cell.trim()
            break
          case 'remove_blanks':
            newCell = cell.trim() === '' ? '' : cell
            break
          case 'remove_duplicates':
            newCell = cell
            break
        }

        if (newCell !== cell) affected++
        return row.map((c, j) => (j === idx ? newCell : c))
      })

      return {
        cells: cleaned,
        affectedRows: affected,
        log: `Cleaned ${action.column} (${action.operation}): ${affected} cells modified`,
      }
    }

    case 'drop_column': {
      const idx = headers.indexOf(action.column)
      if (idx < 0) {
        return { cells, affectedRows: 0, log: `Column ${action.column} not found` }
      }

      const dropped = cells.map((row) => row.filter((_, i) => i !== idx))
      return {
        cells: dropped,
        affectedRows: cells.length - 1,
        log: `Dropped column ${action.column}: ${cells.length - 1} rows affected`,
      }
    }

    case 'deduplicate': {
      const indices = action.keyColumns.map((col) => headers.indexOf(col))
      if (indices.some((i) => i < 0)) {
        return { cells, affectedRows: 0, log: 'Some key columns not found' }
      }

      const seen = new Set<string>()
      const deduped = [headers]
      let removed = 0

      for (const row of cells.slice(1)) {
        const key = indices.map((i) => row[i] ?? '').join('|')
        if (seen.has(key)) {
          removed++
        } else {
          seen.add(key)
          deduped.push(row)
        }
      }

      return {
        cells: deduped,
        affectedRows: removed,
        log: `Deduplicated on ${action.keyColumns.join(', ')}: ${removed} duplicates removed, ${deduped.length - 1} rows kept`,
      }
    }

    case 'filter': {
      const idx = headers.indexOf(action.column)
      if (idx < 0) {
        return { cells, affectedRows: 0, log: `Column ${action.column} not found` }
      }

      const filtered = [headers]
      let removed = 0

      for (const row of cells.slice(1)) {
        const cellValue = row[idx] ?? ''
        const numValue = parseNumber(cellValue)
        const compareValue =
          numValue !== null ? numValue : typeof action.value === 'number' ? NaN : cellValue

        let keep = false
        switch (action.operator) {
          case '>':
            keep =
              typeof compareValue === 'number' &&
              typeof action.value === 'number' &&
              compareValue > action.value
            break
          case '<':
            keep =
              typeof compareValue === 'number' &&
              typeof action.value === 'number' &&
              compareValue < action.value
            break
          case '>=':
            keep =
              typeof compareValue === 'number' &&
              typeof action.value === 'number' &&
              compareValue >= action.value
            break
          case '<=':
            keep =
              typeof compareValue === 'number' &&
              typeof action.value === 'number' &&
              compareValue <= action.value
            break
          case '=':
            keep = compareValue == action.value
            break
          case '!=':
            keep = compareValue != action.value
            break
        }

        if (keep) {
          filtered.push(row)
        } else {
          removed++
        }
      }

      return {
        cells: filtered,
        affectedRows: removed,
        log: `Filtered ${action.column} ${action.operator} ${action.value}: ${removed} rows removed, ${filtered.length - 1} rows kept`,
      }
    }

    case 'sort': {
      const idx = headers.indexOf(action.column)
      if (idx < 0) {
        return { cells, affectedRows: 0, log: `Column ${action.column} not found` }
      }

      const rows = cells.slice(1).map((row) => row)
      rows.sort((a, b) => {
        const aVal = a[idx] ?? ''
        const bVal = b[idx] ?? ''
        const aNum = parseNumber(aVal)
        const bNum = parseNumber(bVal)

        if (aNum !== null && bNum !== null) {
          return action.direction === 'asc' ? aNum - bNum : bNum - aNum
        }

        if (action.direction === 'asc') {
          return aVal.localeCompare(bVal)
        }
        return bVal.localeCompare(aVal)
      })

      return {
        cells: [headers, ...rows],
        affectedRows: rows.length,
        log: `Sorted ${action.column} ${action.direction}: ${rows.length} rows reordered`,
      }
    }

    case 'sum':
    case 'if':
    case 'create_kpi': {
      return {
        cells,
        affectedRows: 0,
        log: `${action.type} not yet implemented in engine`,
      }
    }

    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}
