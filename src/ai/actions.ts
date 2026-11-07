/** Typed actions proposed by AI, validated and executed by deterministic engine. */

export const AI_ACTION_TYPES = [
  'clean_column',
  'drop_column',
  'deduplicate',
  'filter',
  'sort',
  'sum',
  'if',
  'create_kpi',
] as const

export type AiActionType = (typeof AI_ACTION_TYPES)[number]

export type CleanColumnAction = {
  type: 'clean_column'
  column: string
  operation: 'trim' | 'remove_duplicates' | 'remove_blanks'
}

export type DropColumnAction = {
  type: 'drop_column'
  column: string
}

export type DeduplicateAction = {
  type: 'deduplicate'
  keyColumns: string[]
}

export type FilterAction = {
  type: 'filter'
  column: string
  operator: '>' | '<' | '=' | '!=' | '>=' | '<='
  value: string | number
}

export type SortAction = {
  type: 'sort'
  column: string
  direction: 'asc' | 'desc'
}

export type SumAction = {
  type: 'sum'
  column: string
  groupBy?: string
}

export type IfAction = {
  type: 'if'
  condition: {
    column: string
    operator: '>' | '<' | '=' | '!=' | '>=' | '<='
    value: string | number
  }
  thenValue: string | number
  elseValue: string | number
  targetColumn: string
}

export type CreateKpiAction = {
  type: 'create_kpi'
  title: string
  agg: 'sum' | 'mean' | 'count' | 'ratio'
  column?: string
  numerator?: string
  denominator?: string
}

export type AiAction =
  | CleanColumnAction
  | DropColumnAction
  | DeduplicateAction
  | FilterAction
  | SortAction
  | SumAction
  | IfAction
  | CreateKpiAction

export type AiProposal = {
  id: string
  action: AiAction
  reason: string
  affectedRows?: number
}

export type AiProposalResponse = {
  accepted: boolean
  proposalId: string
}

export type AiProposalResult = {
  proposalId: string
  success: boolean
  affectedRows: number
  error?: string
}

export function isAiActionType(value: unknown): value is AiActionType {
  return typeof value === 'string' && (AI_ACTION_TYPES as readonly string[]).includes(value)
}

export function validateAiAction(action: unknown, availableColumns: string[]): string | null {
  if (!action || typeof action !== 'object') {
    return 'Action must be an object'
  }

  const { type } = action as { type: unknown }
  if (!isAiActionType(type)) {
    return `Unknown action type: ${String(type)}`
  }

  const columnSet = new Set(availableColumns)

  switch (type) {
    case 'clean_column':
    case 'drop_column': {
      const { column } = action as { column: unknown }
      if (typeof column !== 'string') {
        return 'column must be a string'
      }
      if (!columnSet.has(column)) {
        return `Unknown column: ${column}. Available: ${availableColumns.join(', ')}`
      }
      return null
    }

    case 'deduplicate': {
      const { keyColumns } = action as { keyColumns: unknown }
      if (!Array.isArray(keyColumns)) {
        return 'keyColumns must be an array'
      }
      for (const col of keyColumns) {
        if (typeof col !== 'string') {
          return 'All keyColumns must be strings'
        }
        if (!columnSet.has(col)) {
          return `Unknown column: ${col}. Available: ${availableColumns.join(', ')}`
        }
      }
      return null
    }

    case 'filter':
    case 'sort': {
      const { column } = action as { column: unknown }
      if (typeof column !== 'string') {
        return 'column must be a string'
      }
      if (!columnSet.has(column)) {
        return `Unknown column: ${column}. Available: ${availableColumns.join(', ')}`
      }
      return null
    }

    case 'sum': {
      const { column, groupBy } = action as { column: unknown; groupBy?: unknown }
      if (typeof column !== 'string') {
        return 'column must be a string'
      }
      if (!columnSet.has(column)) {
        return `Unknown column: ${column}. Available: ${availableColumns.join(', ')}`
      }
      if (groupBy !== undefined && typeof groupBy !== 'string') {
        return 'groupBy must be a string'
      }
      if (groupBy && !columnSet.has(groupBy)) {
        return `Unknown groupBy column: ${groupBy}. Available: ${availableColumns.join(', ')}`
      }
      return null
    }

    case 'if': {
      const { condition, targetColumn } = action as {
        condition: unknown
        targetColumn: unknown
      }
      if (!condition || typeof condition !== 'object') {
        return 'condition must be an object'
      }
      const { column } = condition as { column: unknown }
      if (typeof column !== 'string') {
        return 'condition.column must be a string'
      }
      if (!columnSet.has(column)) {
        return `Unknown column: ${column}. Available: ${availableColumns.join(', ')}`
      }
      if (typeof targetColumn !== 'string') {
        return 'targetColumn must be a string'
      }
      return null
    }

    case 'create_kpi': {
      const { agg, column, numerator, denominator } = action as {
        agg: unknown
        column?: unknown
        numerator?: unknown
        denominator?: unknown
      }
      if (typeof agg !== 'string' || !['sum', 'mean', 'count', 'ratio'].includes(agg)) {
        return 'agg must be one of: sum, mean, count, ratio'
      }
      if (agg === 'ratio') {
        if (typeof numerator !== 'string' || typeof denominator !== 'string') {
          return 'ratio requires numerator and denominator'
        }
        if (!columnSet.has(numerator)) {
          return `Unknown numerator column: ${numerator}. Available: ${availableColumns.join(', ')}`
        }
        if (!columnSet.has(denominator)) {
          return `Unknown denominator column: ${denominator}. Available: ${availableColumns.join(', ')}`
        }
      } else {
        if (typeof column !== 'string') {
          return `${agg} requires a column`
        }
        if (!columnSet.has(column)) {
          return `Unknown column: ${column}. Available: ${availableColumns.join(', ')}`
        }
      }
      return null
    }

    default: {
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}
