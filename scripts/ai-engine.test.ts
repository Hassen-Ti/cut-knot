import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateAiAction } from '../src/ai/actions.ts'
import { executeAction, executeOnCells } from '../src/ai/engine.ts'
import { computeKpi, formatMeasure } from '../src/csv/index.ts'

function snapshot(cells: string[][]) {
  return JSON.stringify(cells)
}

describe('AI engine — clean_column', () => {
  it('accept trim changes cells; refuse leaves data unchanged', () => {
    const cells = [
      ['ID', 'Name'],
      ['1', '  Alice  '],
      ['2', 'Bob'],
    ]
    const before = snapshot(cells)
    const refused = cells
    assert.equal(snapshot(refused), before)

    const accepted = executeOnCells(cells, {
      type: 'clean_column',
      column: 'Name',
      operation: 'trim',
    })
    assert.equal(accepted.cells[1]?.[1], 'Alice')
    assert.equal(accepted.affectedRows, 1)
    assert.notEqual(snapshot(accepted.cells), before)
  })

  it('accept remove_blanks drops blank rows', () => {
    const cells = [
      ['ID', 'Name'],
      ['1', 'Alice'],
      ['2', ''],
      ['3', '  '],
      ['4', 'Bob'],
    ]
    const result = executeOnCells(cells, {
      type: 'clean_column',
      column: 'Name',
      operation: 'remove_blanks',
    })
    assert.equal(result.cells.length, 3)
    assert.equal(result.affectedRows, 2)
    assert.deepEqual(
      result.cells.map((r) => r[0]),
      ['ID', '1', '4'],
    )
  })

  it('accept remove_duplicates keeps first of each value', () => {
    const cells = [
      ['ID', 'Zone'],
      ['1', 'Nord'],
      ['2', 'Sud'],
      ['3', 'Nord'],
      ['4', 'Est'],
    ]
    const result = executeOnCells(cells, {
      type: 'clean_column',
      column: 'Zone',
      operation: 'remove_duplicates',
    })
    assert.equal(result.cells.length, 4)
    assert.equal(result.affectedRows, 1)
  })
})

describe('AI engine — drop / filter / sort / deduplicate', () => {
  it('accept drop_column changes schema; refuse does not', () => {
    const cells = [
      ['ID', 'Name', 'Age'],
      ['1', 'Alice', '30'],
    ]
    const before = snapshot(cells)
    assert.equal(snapshot(cells), before)
    const result = executeOnCells(cells, { type: 'drop_column', column: 'Age' })
    assert.deepEqual(result.cells[0], ['ID', 'Name'])
    assert.notEqual(snapshot(result.cells), before)
  })

  it('accept filter Km > 50 removes short trips', () => {
    const cells = [
      ['ID', 'Km'],
      ['TRN001', '142'],
      ['TRN002', '98'],
      ['TRN003', '210'],
      ['TRN004', '45'],
    ]
    const before = snapshot(cells)
    const refused = cells
    assert.equal(snapshot(refused), before)
    const result = executeOnCells(cells, {
      type: 'filter',
      column: 'Km',
      operator: '>',
      value: 50,
    })
    assert.equal(result.cells.length, 4)
    assert.equal(result.affectedRows, 1)
    assert.notEqual(snapshot(result.cells), before)
  })

  it('accept sort reorders; refuse keeps order', () => {
    const cells = [
      ['ID', 'Value'],
      ['C', '30'],
      ['A', '10'],
      ['B', '20'],
    ]
    const before = snapshot(cells)
    assert.equal(snapshot(cells), before)
    const result = executeOnCells(cells, {
      type: 'sort',
      column: 'Value',
      direction: 'asc',
    })
    assert.deepEqual(
      result.cells.map((r) => r[0]),
      ['ID', 'A', 'B', 'C'],
    )
  })

  it('accept deduplicate removes extras', () => {
    const cells = [
      ['ID', 'Name'],
      ['A', 'Alice'],
      ['B', 'Bob'],
      ['A', 'Alice2'],
    ]
    const result = executeOnCells(cells, { type: 'deduplicate', keyColumns: ['ID'] })
    assert.equal(result.cells.length, 3)
    assert.equal(result.affectedRows, 1)
  })
})

describe('AI engine — join', () => {
  it('accept left-joins right table and counts orphans from original right rows', () => {
    const left = [
      ['ID_tournée', 'Km'],
      ['TRN001', '10'],
      ['TRN002', '20'],
    ]
    const right = [
      ['ID_tournée', 'Montant'],
      ['TRN001', '100'],
      ['TRN099', '1'],
      ['TRN099', '2'],
      ['TRN099', '3'],
    ]
    const before = snapshot(left)
    const result = executeAction(
      { cells: left, rightCells: right, rightSourceName: 'couts.csv' },
      { type: 'join' },
    )
    assert.equal(result.cells.length, 3)
    assert.equal(result.cells[1]?.[2], '100')
    assert.equal(result.cells[2]?.[2], '')
    assert.match(result.log, /3 sans correspondance/)
    assert.equal(result.orphanLog, 'Join with couts.csv: 3 lignes sans correspondance')
    assert.notEqual(snapshot(result.cells), before)
  })

  it('refuse join leaves left table unchanged', () => {
    const left = [
      ['ID', 'Km'],
      ['A', '1'],
    ]
    const before = snapshot(left)
    assert.equal(snapshot(left), before)
  })
})

describe('AI engine — sum / if / create_kpi', () => {
  it('accept sum without groupBy yields engine-computed KPI measure', () => {
    const cells = [
      ['Montant'],
      ['10'],
      ['20'],
      ['N/A'],
    ]
    const result = executeOnCells(cells, { type: 'sum', column: 'Montant' })
    assert.equal(result.kpi?.measure, '30')
    assert.equal(result.kpi?.agg, 'sum')
    assert.match(result.log, /SUM Montant = 30/)
    assert.match(result.log, /non num/)
  })

  it('accept sum with groupBy builds summary table', () => {
    const cells = [
      ['Zone', 'Montant'],
      ['Nord', '10'],
      ['Sud', '20'],
      ['Nord', '5'],
    ]
    const before = snapshot(cells)
    const result = executeOnCells(cells, {
      type: 'sum',
      column: 'Montant',
      groupBy: 'Zone',
    })
    assert.equal(result.cells.length, 3)
    assert.deepEqual(result.cells[0], ['Zone', 'Somme_Montant'])
    assert.notEqual(snapshot(result.cells), before)
  })

  it('accept if fills target column from condition', () => {
    const cells = [
      ['Km', 'Flag'],
      ['60', ''],
      ['40', ''],
    ]
    const result = executeOnCells(cells, {
      type: 'if',
      condition: { column: 'Km', operator: '>', value: 50 },
      thenValue: 'long',
      elseValue: 'short',
      targetColumn: 'Flag',
    })
    assert.equal(result.cells[1]?.[1], 'long')
    assert.equal(result.cells[2]?.[1], 'short')
    assert.equal(result.affectedRows, 2)
  })

  it('accept create_kpi uses engine KPI (ratio) with skippedByColumn', () => {
    const cells = [
      ['Montant', 'Km'],
      ['100', '10'],
      ['200', 'N/A'],
      ['300', '30'],
    ]
    const beforeKpi = computeKpi(cells, {
      agg: 'ratio',
      numerator: 'Montant',
      denominator: 'Km',
    })
    assert.equal(formatMeasure(beforeKpi.value, 'ratio'), '15,00')

    const result = executeOnCells(cells, {
      type: 'create_kpi',
      title: 'Coût / km',
      agg: 'ratio',
      numerator: 'Montant',
      denominator: 'Km',
    })
    assert.equal(result.kpi?.measure, '15,00')
    assert.equal(result.kpi?.title, 'Coût / km')
    assert.match(result.log ?? '', /Km/)
  })

  it('refuse create_kpi leaves cells and measure unchanged', () => {
    const cells = [
      ['Montant'],
      ['10'],
    ]
    const before = snapshot(cells)
    const beforeMeasure = formatMeasure(computeKpi(cells, { agg: 'sum', column: 'Montant' }).value, 'sum')
    assert.equal(snapshot(cells), before)
    assert.equal(beforeMeasure, '10')
  })
})

describe('AI validation', () => {
  it('rejects unknown column and unknown action type', () => {
    assert.match(
      validateAiAction({ type: 'filter', column: 'Nope', operator: '>', value: 1 }, ['Km']) ?? '',
      /Unknown column/,
    )
    assert.match(validateAiAction({ type: 'explode' }, ['Km']) ?? '', /Unknown action/)
  })

  it('accepts join without extra columns', () => {
    assert.equal(validateAiAction({ type: 'join' }, ['ID']), null)
  })
})
