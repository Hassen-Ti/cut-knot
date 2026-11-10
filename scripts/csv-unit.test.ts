import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyCsvToSource } from '../src/board/compute.ts'
import { sourceDims, type BoardItem } from '../src/board/model.ts'
import {
  computeKpi,
  decodeCsvBytes,
  formatMeasure,
  joinAggregateLog,
  joinOrphanLog,
  leftJoin,
  parseCsv,
  parseNumber,
  pickDelimiter,
} from '../src/csv/index.ts'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

function readBytes(name: string) {
  return new Uint8Array(fs.readFileSync(path.join(fixtures, name)))
}

function load(name: string) {
  return parseCsv(decodeCsvBytes(readBytes(name)))
}

describe('csv encoding', () => {
  it('keeps é and € from UTF-8 couts.csv', () => {
    const cells = load('couts.csv')
    assert.equal(cells[0]?.[0], 'ID_tournée')
    assert.equal(cells[1]?.[3], '186,4 €')
  })

  it('keeps é and € from Windows-1252 couts-1252.csv', () => {
    const raw = readBytes('couts-1252.csv')
    assert.equal(raw.includes(0x80), true)
    assert.equal(raw[0] !== 0xef, true)
    const cells = parseCsv(decodeCsvBytes(raw))
    assert.equal(cells[0]?.[0], 'ID_tournée')
    assert.equal(cells[1]?.[3], '186,4 €')
  })

  it('strips a UTF-8 BOM', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('A;B\n1;2\n')])
    const cells = parseCsv(decodeCsvBytes(bom))
    assert.deepEqual(cells[0], ['A', 'B'])
  })
})

describe('csv parse', () => {
  it('picks ; for tournees and , for couts-v2', () => {
    const tournees = fs.readFileSync(path.join(fixtures, 'tournees.csv'), 'utf8')
    const v2 = fs.readFileSync(path.join(fixtures, 'couts-v2.csv'), 'utf8')
    assert.equal(pickDelimiter(tournees), ';')
    assert.equal(pickDelimiter(v2), ',')
  })

  it('parses quoted fields and keeps the delimiter inside quotes', () => {
    const cells = parseCsv('Nom;"Ville, pays"\n"A ""B""";Paris\n')
    assert.deepEqual(cells, [
      ['Nom', 'Ville, pays'],
      ['A "B"', 'Paris'],
    ])
  })

  it('shows real tournees rows', () => {
    const cells = load('tournees.csv')
    assert.equal(cells.length, 6)
    assert.deepEqual(cells[0], ['ID_tournée', 'Date', 'Zone', 'Km', 'Stops'])
    assert.equal(cells[5]?.[0], 'TRN005')
  })
})

describe('numbers and KPI', () => {
  it('parses French money', () => {
    assert.equal(parseNumber('1 234,5 €'), 1234.5)
    assert.equal(parseNumber('186,4 €'), 186.4)
    assert.equal(parseNumber('99.8'), 99.8)
    assert.equal(parseNumber('VU-07'), null)
  })

  it('sums Montant 765,1 then 899,6 and ratios 1,26 then 1,30', () => {
    const tournees = load('tournees.csv')
    const couts = load('couts.csv')
    const v2 = load('couts-v2.csv')
    const join1 = leftJoin(tournees, couts)
    const join2 = leftJoin(tournees, v2)
    const trn005a = join1.cells.find((row) => row[0] === 'TRN005')
    const trn005b = join2.cells.find((row) => row[0] === 'TRN005')
    assert.equal(join1.cells.length, 6)
    assert.equal(trn005a?.[7], '')
    assert.equal(trn005b?.[7], '99.8')
    assert.equal(join1.orphanRightRows, 0)
    assert.equal(join2.orphanRightRows, 0)

    const sum1 = computeKpi(join1.cells, { agg: 'sum', column: 'Montant' })
    const sum2 = computeKpi(join2.cells, { agg: 'sum', column: 'Montant' })
    const ratio1 = computeKpi(join1.cells, { agg: 'ratio', numerator: 'Montant', denominator: 'Km' })
    const ratio2 = computeKpi(join2.cells, { agg: 'ratio', numerator: 'Montant', denominator: 'Km' })
    assert.equal(formatMeasure(sum1.value, 'sum'), '765,1')
    assert.equal(formatMeasure(sum2.value, 'sum'), '899,6')
    assert.equal(formatMeasure(ratio1.value, 'ratio'), '1,26')
    assert.equal(formatMeasure(ratio2.value, 'ratio'), '1,30')
  })

  it('does not hardcode Montant / Km for the ratio', () => {
    const cells = [
      ['A', 'B'],
      ['10', '2'],
      ['20', '8'],
    ]
    const result = computeKpi(cells, { agg: 'ratio', numerator: 'A', denominator: 'B' })
    assert.equal(result.value, 3)
    assert.equal(result.skippedCells, 0)
  })

  it('counts skipped non-numeric values', () => {
    const cells = [
      ['Value', 'Name'],
      ['10', 'A'],
      ['N/A', 'B'],
      ['20', 'C'],
      ['ERROR', 'D'],
    ]
    const sum = computeKpi(cells, { agg: 'sum', column: 'Value' })
    assert.equal(sum.value, 30)
    assert.equal(sum.skippedCells, 2)
  })

  it('attributes skipped cells to correct column in ratio (bad Km)', () => {
    const cells = [
      ['Montant', 'Km'],
      ['100', '10'],
      ['200', 'N/A'],
      ['300', '30'],
    ]
    const result = computeKpi(cells, { agg: 'ratio', numerator: 'Montant', denominator: 'Km' })
    assert.equal(result.value, 15)
    assert.equal(result.skippedCells, 1)
    assert.deepEqual(result.skippedByColumn, { Km: 1 })
  })

  it('attributes skipped cells to both columns when both have bad data', () => {
    const cells = [
      ['Montant', 'Km'],
      ['100', '10'],
      ['BAD', '20'],
      ['300', 'ERROR'],
    ]
    const result = computeKpi(cells, { agg: 'ratio', numerator: 'Montant', denominator: 'Km' })
    assert.equal(result.value, 40)
    assert.equal(result.skippedCells, 2)
    assert.deepEqual(result.skippedByColumn, { Montant: 1, Km: 1 })
  })
})

describe('join key', () => {
  it('passes through a single table and reports no join key when headers differ', () => {
    const left = [
      ['Zone', 'Km'],
      ['Nord', '10'],
    ]
    const right = [
      ['Véhicule', 'Montant'],
      ['VU-23', '1'],
    ]
    const joined = leftJoin(left, right)
    assert.equal(joined.key, null)
    assert.deepEqual(joined.cells, left)
  })

  it('does not join AB12 with ab12', () => {
    const joined = leftJoin(
      [
        ['ID', 'Km'],
        ['AB12', '10'],
      ],
      [
        ['ID', 'Montant'],
        ['ab12', '99'],
      ],
    )
    assert.equal(joined.cells[1]?.[2], '')
    assert.equal(joined.aggregatedRightRows, 0)
    assert.equal(joined.orphanRightRows, 1)
  })

  it('does not join key values that differ only by case', () => {
    const tournees = load('tournees.csv')
    const cased = load('couts-case.csv')
    const joined = leftJoin(tournees, cased)
    const trn001 = joined.cells.find((row) => row[0] === 'TRN001')
    const trn002 = joined.cells.find((row) => row[0] === 'TRN002')
    assert.equal(trn001?.[7], '')
    assert.equal(trn002?.[7], '112,0 €')
    const sum = computeKpi(joined.cells, { agg: 'sum', column: 'Montant' })
    assert.equal(formatMeasure(sum.value, 'sum'), '578,7')
  })

  it('aggregates right-side duplicate keys and keeps every left row', () => {
    const tournees = load('tournees.csv')
    const dupes = load('couts-dupes.csv')
    const joined = leftJoin(tournees, dupes)
    const trn002 = joined.cells.find((row) => row[0] === 'TRN002')
    assert.equal(joined.cells.length, 6)
    assert.equal(joined.aggregatedRightRows, 2)
    assert.equal(trn002?.[5], 'VU-07')
    assert.equal(trn002?.[6], 'Carburant | Péage')
    assert.equal(trn002?.[7], '162')

    const sum = computeKpi(joined.cells, { agg: 'sum', column: 'Montant' })
    const ratio = computeKpi(joined.cells, { agg: 'ratio', numerator: 'Montant', denominator: 'Km' })
    assert.equal(formatMeasure(sum.value, 'sum'), '815,1')
    assert.equal(formatMeasure(ratio.value, 'ratio'), '1,35')
    assert.equal(joinAggregateLog('couts-dupes.csv', joined.aggregatedRightRows), 'Join with couts-dupes.csv: 2 doublons agrégés')

    const leftDupes = [
      ['ID_tournée', 'Km'],
      ['TRN002', '98'],
      ['TRN002', '10'],
    ]
    const bothLeft = leftJoin(leftDupes, dupes)
    assert.equal(bothLeft.cells.length, 3)
    assert.equal(bothLeft.cells[1]?.[1], '98')
    assert.equal(bothLeft.cells[2]?.[1], '10')
    assert.equal(bothLeft.cells[1]?.[bothLeft.cells[1].length - 1], '162')
    assert.equal(bothLeft.cells[2]?.[bothLeft.cells[2].length - 1], '162')
  })

  it('counts orphan right rows (TRN099)', () => {
    const tournees = load('tournees.csv')
    const orphan = load('couts-orphan.csv')
    const joined = leftJoin(tournees, orphan)
    assert.equal(joined.cells.length, 6)
    assert.equal(joined.orphanRightRows, 1)
    assert.equal(joined.key?.leftKey, 'ID_tournée')
    const trn005 = joined.cells.find((row) => row[0] === 'TRN005')
    assert.equal(trn005?.[trn005.length - 1], '')
  })

  it('never joins blank keys', () => {
    const left = [
      ['ID', 'Name'],
      ['', 'Alice'],
      ['B', 'Bob'],
    ]
    const right = [
      ['ID', 'Age'],
      ['', '30'],
      ['B', '25'],
    ]
    const joined = leftJoin(left, right)
    assert.equal(joined.cells.length, 3)
    assert.equal(joined.cells[1]?.[2], '')
    assert.equal(joined.cells[2]?.[2], '25')
    assert.equal(joined.orphanRightRows, 1)
  })

  it('counts repeated orphan keys against original rows (TRN099 x3)', () => {
    const tournees = load('tournees.csv')
    const orphanX3 = load('couts-orphan-x3.csv')
    const joined = leftJoin(tournees, orphanX3)
    assert.equal(joined.cells.length, 6)
    assert.equal(joined.orphanRightRows, 3)
    const log = joinOrphanLog('couts-orphan-x3.csv', joined.orphanRightRows)
    assert.equal(log, 'Join with couts-orphan-x3.csv: 3 lignes sans correspondance')
  })

  it('counts blank keys as orphans when left has no blanks', () => {
    const left = [
      ['ID', 'Name'],
      ['A', 'Alice'],
      ['B', 'Bob'],
    ]
    const right = [
      ['ID', 'Age'],
      ['', '30'],
      ['', '25'],
      ['C', '40'],
    ]
    const joined = leftJoin(left, right)
    assert.equal(joined.cells.length, 3)
    assert.equal(joined.orphanRightRows, 3)
  })
})

describe('source path', () => {
  it('replaces the watched path when a new CSV has no path (drop)', () => {
    const dims = sourceDims('chip', 'couts.csv')
    const source: BoardItem = {
      id: 's1',
      type: 'source',
      x: 0,
      y: 0,
      w: dims.w,
      h: dims.h,
      text: 'couts.csv',
      filePath: '/tmp/old/couts.csv',
      cells: [['A']],
    }
    const dropped = applyCsvToSource(source, {
      name: 'couts-dupes.csv',
      cells: [['A'], ['1']],
      filePath: undefined,
    })
    assert.equal(dropped.filePath, undefined)
    assert.equal(dropped.text, 'couts-dupes.csv')
  })
})
