/** Deterministic engine that executes typed AI actions. AI never computes; engine does. */

import { joinOrphanLog, leftJoin } from '../csv/join.ts'
import { computeKpi, formatMeasure, kpiSkippedWarning, type KpiSpec } from '../csv/kpi.ts'
import { parseNumber } from '../csv/numbers.ts'
import type { AiAction, CreateKpiAction } from './actions.ts'

export type EngineContext = {
  /** Targeted left/primary table. */
  cells: string[][]
  /** Optional right table for join. */
  rightCells?: string[][]
  rightSourceName?: string
}

export type EngineResult = {
  cells: string[][]
  affectedRows: number
  log: string
  /** Present when create_kpi ran — Board creates the KPI item. */
  kpi?: CreateKpiAction & { measure: string; skippedWarning?: string }
  orphanLog?: string
}

function compareOp(
  left: string | number,
  operator: '>' | '<' | '=' | '!=' | '>=' | '<=',
  right: string | number,
): boolean {
  switch (operator) {
    case '>':
      return typeof left === 'number' && typeof right === 'number' && left > right
    case '<':
      return typeof left === 'number' && typeof right === 'number' && left < right
    case '>=':
      return typeof left === 'number' && typeof right === 'number' && left >= right
    case '<=':
      return typeof left === 'number' && typeof right === 'number' && left <= right
    case '=':
      return left == right
    case '!=':
      return left != right
    default: {
      const _exhaustive: never = operator
      return _exhaustive
    }
  }
}

function cellCompareValue(cellValue: string, actionValue: string | number): string | number {
  const numValue = parseNumber(cellValue)
  if (numValue !== null) return numValue
  if (typeof actionValue === 'number') return NaN
  return cellValue
}

export function executeAction(ctx: EngineContext, action: AiAction): EngineResult {
  const cells = ctx.cells
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

      if (action.operation === 'remove_blanks') {
        const kept = [headers]
        let removed = 0
        for (const row of cells.slice(1)) {
          const cell = (row[idx] ?? '').trim()
          if (cell === '') {
            removed++
          } else {
            kept.push(row)
          }
        }
        return {
          cells: kept,
          affectedRows: removed,
          log: `Cleaned ${action.column} (remove_blanks): ${removed} blank rows removed, ${kept.length - 1} rows kept`,
        }
      }

      if (action.operation === 'remove_duplicates') {
        const seen = new Set<string>()
        const kept = [headers]
        let removed = 0
        for (const row of cells.slice(1)) {
          const key = row[idx] ?? ''
          if (seen.has(key)) {
            removed++
          } else {
            seen.add(key)
            kept.push(row)
          }
        }
        return {
          cells: kept,
          affectedRows: removed,
          log: `Cleaned ${action.column} (remove_duplicates): ${removed} duplicates removed, ${kept.length - 1} rows kept`,
        }
      }

      let affected = 0
      const cleaned = cells.map((row, i) => {
        if (i === 0) return row
        const cell = row[idx] ?? ''
        const newCell = cell.trim()
        if (newCell !== cell) affected++
        return row.map((c, j) => (j === idx ? newCell : c))
      })
      return {
        cells: cleaned,
        affectedRows: affected,
        log: `Cleaned ${action.column} (trim): ${affected} cells modified`,
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

    case 'join': {
      const right = ctx.rightCells
      if (!right || right.length === 0) {
        return { cells, affectedRows: 0, log: 'Join requires a right-side Source' }
      }
      const before = Math.max(0, cells.length - 1)
      const joined = leftJoin(cells, right)
      const name = ctx.rightSourceName ?? action.rightSourceName ?? 'right'
      const orphanLog = joinOrphanLog(name, joined.orphanRightRows)
      const after = Math.max(0, joined.cells.length - 1)
      return {
        cells: joined.cells,
        affectedRows: Math.abs(after - before) + joined.orphanRightRows + joined.aggregatedRightRows,
        log: `Join with ${name}: ${before} → ${after} lignes${
          joined.aggregatedRightRows > 0 ? `, ${joined.aggregatedRightRows} doublons agrégés` : ''
        }${joined.orphanRightRows > 0 ? `, ${joined.orphanRightRows} sans correspondance` : ''}`,
        orphanLog,
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
        const compareValue = cellCompareValue(row[idx] ?? '', action.value)
        if (compareOp(compareValue, action.operator, action.value)) {
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
        return action.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      })
      return {
        cells: [headers, ...rows],
        affectedRows: rows.length,
        log: `Sorted ${action.column} ${action.direction}: ${rows.length} rows reordered`,
      }
    }

    case 'sum': {
      const idx = headers.indexOf(action.column)
      if (idx < 0) {
        return { cells, affectedRows: 0, log: `Column ${action.column} not found` }
      }

      if (action.groupBy) {
        const gIdx = headers.indexOf(action.groupBy)
        if (gIdx < 0) {
          return { cells, affectedRows: 0, log: `groupBy column ${action.groupBy} not found` }
        }
        const groups = new Map<string, number>()
        const order: string[] = []
        let skipped = 0
        for (const row of cells.slice(1)) {
          const key = row[gIdx] ?? ''
          const n = parseNumber(row[idx] ?? '')
          if (n === null) {
            if ((row[idx] ?? '').trim() !== '') skipped++
            continue
          }
          if (!groups.has(key)) {
            groups.set(key, 0)
            order.push(key)
          }
          groups.set(key, (groups.get(key) ?? 0) + n)
        }
        const outHeaders = [action.groupBy, `Somme_${action.column}`]
        const out: string[][] = [outHeaders]
        for (const key of order) {
          out.push([key, formatMeasure(groups.get(key) ?? 0, 'sum')])
        }
        return {
          cells: out,
          affectedRows: out.length - 1,
          log: `SUM ${action.column} by ${action.groupBy}: ${out.length - 1} groups${
            skipped > 0 ? `, ${skipped} valeurs non numériques ignorées` : ''
          }`,
        }
      }

      const result = computeKpi(cells, { agg: 'sum', column: action.column })
      const measure = formatMeasure(result.value, 'sum')
      const warn = kpiSkippedWarning(result, { agg: 'sum', column: action.column })
      return {
        cells,
        affectedRows: Math.max(0, cells.length - 1),
        log: `SUM ${action.column} = ${measure}${warn ? ` (${warn})` : ''}`,
        kpi: {
          type: 'create_kpi',
          title: `Somme ${action.column}`,
          agg: 'sum',
          column: action.column,
          measure,
          skippedWarning: warn,
        },
      }
    }

    case 'if': {
      const condIdx = headers.indexOf(action.condition.column)
      if (condIdx < 0) {
        return { cells, affectedRows: 0, log: `Column ${action.condition.column} not found` }
      }
      let targetIdx = headers.indexOf(action.targetColumn)
      const outHeaders =
        targetIdx < 0 ? [...headers, action.targetColumn] : headers.map((h) => h)
      if (targetIdx < 0) targetIdx = outHeaders.length - 1

      let changed = 0
      const out: string[][] = [outHeaders]
      for (const row of cells.slice(1)) {
        const compareValue = cellCompareValue(row[condIdx] ?? '', action.condition.value)
        const match = compareOp(compareValue, action.condition.operator, action.condition.value)
        const value = String(match ? action.thenValue : action.elseValue)
        const next = outHeaders.map((_, i) => {
          if (i === targetIdx) return value
          return row[i] ?? ''
        })
        if ((row[targetIdx] ?? '') !== value) changed++
        out.push(next)
      }
      return {
        cells: out,
        affectedRows: changed,
        log: `IF ${action.condition.column} ${action.condition.operator} ${action.condition.value} → ${action.targetColumn}: ${changed} cells set`,
      }
    }

    case 'create_kpi': {
      const spec: KpiSpec = {
        agg: action.agg,
        column: action.column,
        numerator: action.numerator,
        denominator: action.denominator,
      }
      const result = computeKpi(cells, spec)
      const measure = formatMeasure(result.value, action.agg)
      const warn = kpiSkippedWarning(result, spec)
      return {
        cells,
        affectedRows: Math.max(0, cells.length - 1),
        log: `KPI « ${action.title} » = ${measure}${warn ? ` (${warn})` : ''}`,
        kpi: {
          ...action,
          measure,
          skippedWarning: warn,
        },
      }
    }

    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

/** Convenience for single-table actions in unit tests. */
export function executeOnCells(cells: string[][], action: AiAction): EngineResult {
  return executeAction({ cells }, action)
}
