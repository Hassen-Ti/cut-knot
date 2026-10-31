import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  computeKpi,
  decodeCsvBytes,
  formatMeasure,
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

    const sum1 = computeKpi(join1.cells, { agg: 'sum', column: 'Montant' })
    const sum2 = computeKpi(join2.cells, { agg: 'sum', column: 'Montant' })
    const ratio1 = computeKpi(join1.cells, { agg: 'ratio', numerator: 'Montant', denominator: 'Km' })
    const ratio2 = computeKpi(join2.cells, { agg: 'ratio', numerator: 'Montant', denominator: 'Km' })
    assert.equal(formatMeasure(sum1, 'sum'), '765,1')
    assert.equal(formatMeasure(sum2, 'sum'), '899,6')
    assert.equal(formatMeasure(ratio1, 'ratio'), '1,26')
    assert.equal(formatMeasure(ratio2, 'ratio'), '1,30')
  })

  it('does not hardcode Montant / Km for the ratio', () => {
    const cells = [
      ['A', 'B'],
      ['10', '2'],
      ['20', '8'],
    ]
    const value = computeKpi(cells, { agg: 'ratio', numerator: 'A', denominator: 'B' })
    assert.equal(value, 3)
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
})
