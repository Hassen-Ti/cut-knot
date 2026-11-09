import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { executeAction } from '../src/ai/engine.ts'

describe('AI engine execution', () => {
  it('drops a column', () => {
    const cells = [
      ['ID', 'Name', 'Age'],
      ['1', 'Alice', '30'],
      ['2', 'Bob', '25'],
    ]
    const result = executeAction(cells, { type: 'drop_column', column: 'Age' })
    assert.equal(result.cells.length, 3)
    assert.equal(result.cells[0]?.length, 2)
    assert.deepEqual(result.cells[0], ['ID', 'Name'])
    assert.deepEqual(result.cells[1], ['1', 'Alice'])
    assert.equal(result.affectedRows, 2)
  })

  it('filters rows by numeric condition', () => {
    const cells = [
      ['ID', 'Km'],
      ['TRN001', '142'],
      ['TRN002', '98'],
      ['TRN003', '210'],
      ['TRN004', '45'],
    ]
    const result = executeAction(cells, {
      type: 'filter',
      column: 'Km',
      operator: '>',
      value: 50,
    })
    assert.equal(result.cells.length, 4)
    assert.equal(result.affectedRows, 1)
    assert.deepEqual(result.cells.map((r) => r[0]), ['ID', 'TRN001', 'TRN002', 'TRN003'])
  })

  it('deduplicates rows by key columns', () => {
    const cells = [
      ['ID', 'Name'],
      ['A', 'Alice'],
      ['B', 'Bob'],
      ['A', 'Alice2'],
      ['C', 'Carol'],
    ]
    const result = executeAction(cells, {
      type: 'deduplicate',
      keyColumns: ['ID'],
    })
    assert.equal(result.cells.length, 4)
    assert.equal(result.affectedRows, 1)
    assert.deepEqual(result.cells.map((r) => r[0]), ['ID', 'A', 'B', 'C'])
  })

  it('sorts rows by column ascending', () => {
    const cells = [
      ['ID', 'Value'],
      ['C', '30'],
      ['A', '10'],
      ['B', '20'],
    ]
    const result = executeAction(cells, {
      type: 'sort',
      column: 'Value',
      direction: 'asc',
    })
    assert.equal(result.cells.length, 4)
    assert.deepEqual(result.cells.map((r) => r[0]), ['ID', 'A', 'B', 'C'])
  })

  it('sorts rows by column descending', () => {
    const cells = [
      ['ID', 'Value'],
      ['C', '30'],
      ['A', '10'],
      ['B', '20'],
    ]
    const result = executeAction(cells, {
      type: 'sort',
      column: 'Value',
      direction: 'desc',
    })
    assert.equal(result.cells.length, 4)
    assert.deepEqual(result.cells.map((r) => r[0]), ['ID', 'C', 'B', 'A'])
  })

  it('cleans column by trimming whitespace', () => {
    const cells = [
      ['ID', 'Name'],
      ['1', '  Alice  '],
      ['2', 'Bob'],
      ['3', '  Carol'],
    ]
    const result = executeAction(cells, {
      type: 'clean_column',
      column: 'Name',
      operation: 'trim',
    })
    assert.equal(result.cells.length, 4)
    assert.equal(result.cells[1]?.[1], 'Alice')
    assert.equal(result.cells[3]?.[1], 'Carol')
    assert.equal(result.affectedRows, 2)
  })

  it('returns original cells when column not found', () => {
    const cells = [
      ['ID', 'Name'],
      ['1', 'Alice'],
    ]
    const result = executeAction(cells, {
      type: 'drop_column',
      column: 'NonExistent',
    })
    assert.deepEqual(result.cells, cells)
    assert.equal(result.affectedRows, 0)
  })

  it('counts affected rows correctly for filter', () => {
    const cells = [
      ['ID', 'Status'],
      ['1', 'active'],
      ['2', 'inactive'],
      ['3', 'active'],
      ['4', 'inactive'],
    ]
    const result = executeAction(cells, {
      type: 'filter',
      column: 'Status',
      operator: '=',
      value: 'active',
    })
    assert.equal(result.cells.length, 3)
    assert.equal(result.affectedRows, 2)
  })
})
