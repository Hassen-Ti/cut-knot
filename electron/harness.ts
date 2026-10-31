import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

type SmokeResult = {
  picked: string
  text: string
}

type BoardIds = {
  s1: string
  s2: string
  s3: string
  g1: string
  kSum: string
  kRatio: string
  cCost: string
}

type BoardSnapshot = {
  rowCount: number
  trn005: string
  sum: string
  ratio: string
  sourceNames: string[]
  euroCell: string | null
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForSelector(win: BrowserWindow, selector: string, timeoutMs = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const found = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    )
    if (found) return
    await sleep(150)
  }
  throw new Error(`Timed out waiting for ${selector}`)
}

async function waitForBoardApi(win: BrowserWindow) {
  const started = Date.now()
  while (Date.now() - started < 15000) {
    const ready = await win.webContents.executeJavaScript('Boolean(window.__cutknotBoard)')
    if (ready) return
    await sleep(100)
  }
  throw new Error('Timed out waiting for window.__cutknotBoard')
}

async function runSmoke(win: BrowserWindow) {
  const resultPath = process.env.CUT_KNOT_SMOKE_OUT
  if (!resultPath) throw new Error('CUT_KNOT_SMOKE_OUT is required')

  const result = (await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.cutknot
      if (!api) throw new Error('window.cutknot is missing')

      const picked = await api.openFile()
      if (!picked) throw new Error('openFile returned null')

      const text = await api.readFile(picked)
      window.__cutknotSmokeEvents = []
      window.__cutknotSmokeStop = api.watchFile(picked, (event) => {
        window.__cutknotSmokeEvents.push(event)
      })
      return { picked, text }
    })()
  `)) as SmokeResult

  await sleep(200)
  await fs.promises.appendFile(result.picked, `\n# smoke-touch ${Date.now()}\n`, 'utf8')

  const started = Date.now()
  let events: string[] = []
  while (Date.now() - started < 8000) {
    events = (await win.webContents.executeJavaScript(
      `window.__cutknotSmokeEvents ? window.__cutknotSmokeEvents.slice() : []`,
    )) as string[]
    if (events.length > 0) break
    await sleep(100)
  }

  await win.webContents.executeJavaScript(`
    if (typeof window.__cutknotSmokeStop === 'function') window.__cutknotSmokeStop()
    delete window.__cutknotSmokeStop
    delete window.__cutknotSmokeEvents
  `)

  const payload = {
    ok: events.length > 0 && typeof result.text === 'string' && result.text.includes(','),
    picked: result.picked,
    textPreview: result.text.slice(0, 240),
    watchEvents: events,
  }

  await fs.promises.writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  if (!payload.ok) {
    throw new Error(`Smoke failed: ${JSON.stringify(payload)}`)
  }
}

async function go(win: BrowserWindow, hash: string, selector: string, outFile: string) {
  await win.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(hash)}`)
  await waitForSelector(win, selector)
  await sleep(500)
  const image = await win.webContents.capturePage()
  await fs.promises.writeFile(outFile, image.toPNG())
}

async function takeScreenshots(win: BrowserWindow) {
  const boardPath = process.env.CUT_KNOT_SCREENSHOT
  const forgePath = process.env.CUT_KNOT_SCREENSHOT_FORGE
  if (boardPath) {
    await go(win, '#/board', '.board-canvas', boardPath)
  }
  if (forgePath) {
    await go(win, '#/forge', '.sheet', forgePath)
  }
}

async function shot(win: BrowserWindow, fileName: string) {
  const dir = process.env.CUT_KNOT_SHOT_DIR
  if (!dir) return
  await fs.promises.mkdir(dir, { recursive: true })
  await sleep(350)
  const image = await win.webContents.capturePage()
  await fs.promises.writeFile(path.join(dir, fileName), image.toPNG())
}

function snapshotScript(ids: BoardIds) {
  return `
    (() => {
      const api = window.__cutknotBoard
      if (!api) throw new Error('board hook missing')
      const { items } = api.getState()
      const g = items.find((i) => i.id === ${JSON.stringify(ids.g1)})
      const kSum = items.find((i) => i.id === ${JSON.stringify(ids.kSum)})
      const kRatio = items.find((i) => i.id === ${JSON.stringify(ids.kRatio)})
      const cells = g?.cells ?? []
      const row = cells.find((r) => r[0] === 'TRN005')
      const euroSource = items.find((i) => i.text === 'couts-1252.csv')
      return {
        rowCount: Math.max(0, cells.length - 1),
        trn005: row ? String(row[row.length - 1] ?? '') : '',
        sum: kSum?.measure ?? '',
        ratio: kRatio?.measure ?? '',
        sourceNames: items.filter((i) => i.type === 'source').map((i) => i.text),
        euroCell: euroSource?.cells?.[1]?.[3] ?? null,
      }
    })()
  `
}

async function runBoardImport(win: BrowserWindow) {
  const tournees = process.env.CUT_KNOT_FIXTURE_TOURNEES
  const couts = process.env.CUT_KNOT_FIXTURE_COUTS
  const coutsV2 = process.env.CUT_KNOT_FIXTURE_COUTS_V2
  const couts1252 = process.env.CUT_KNOT_FIXTURE_COUTS_1252
  if (!tournees || !couts || !coutsV2 || !couts1252) {
    throw new Error('CSV fixtures are required for the board import harness')
  }

  await win.webContents.executeJavaScript(`window.location.hash = '#/board'`)
  await waitForSelector(win, '.board-canvas')
  await waitForBoardApi(win)

  const ids = (await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.__cutknotBoard
      if (!api) throw new Error('board hook missing')
      const s1 = api.createSource(16, 16)
      const s2 = api.createSource(16, 70)
      const g1 = api.createGolden(16, 130)
      const kSum = api.createKpi(16, 360)
      const kRatio = api.createKpi(230, 360)
      await api.loadFromPath(s1, ${JSON.stringify(tournees)})
      api.setView(s1, 'chip')
      api.connect(s1, g1)
      await api.loadFromPath(s2, ${JSON.stringify(couts)})
      api.setView(s2, 'chip')
      const cCost = api.connect(s2, g1)
      api.connect(g1, kSum)
      api.connect(g1, kRatio)
      api.setKpiPicker(kSum, { agg: 'sum', column: 'Montant', title: 'Somme Montant' })
      api.setKpiPicker(kRatio, {
        agg: 'ratio',
        numerator: 'Montant',
        denominator: 'Km',
        title: 'Coût / km',
      })
      api.setView(g1, 'apercu')
      const sEnc = api.createSource(800, 16)
      await api.loadFromPath(sEnc, ${JSON.stringify(couts1252)})
      api.setView(s1, 'chip')
      api.setView(s2, 'chip')
      api.setView(g1, 'apercu')
      return { s1, s2, s3: '', g1, kSum, kRatio, cCost }
    })()
  `)) as BoardIds

  await sleep(250)
  const before = (await win.webContents.executeJavaScript(snapshotScript(ids))) as BoardSnapshot
  if (before.rowCount !== 5) {
    throw new Error(`Expected 5 joined rows, got ${before.rowCount}`)
  }
  if (before.trn005 !== '') {
    throw new Error(`TRN005 should be blank with coûts, got ${JSON.stringify(before.trn005)}`)
  }
  if (before.sum !== '765,1') {
    throw new Error(`Expected Somme Montant 765,1 got ${before.sum}`)
  }
  if (before.ratio !== '1,26') {
    throw new Error(`Expected Coût / km 1,26 got ${before.ratio}`)
  }
  if (before.euroCell !== '186,4 €') {
    throw new Error(`Windows-1252 / UTF-8 decode failed: ${JSON.stringify(before.euroCell)}`)
  }

  await shot(win, 'step3-golden-join.png')
  await shot(win, 'step5a-sum-765.png')
  await shot(win, 'step6a-ratio-126.png')

  ids.s3 = (await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.__cutknotBoard
      const s3 = api.createSource(200, 70)
      await api.loadFromPath(s3, ${JSON.stringify(coutsV2)})
      api.setView(s3, 'chip')
      api.retarget(${JSON.stringify(ids.cCost)}, s3)
      api.setView(s3, 'chip')
      api.setView(${JSON.stringify(ids.g1)}, 'apercu')
      api.setView(${JSON.stringify(ids.s2)}, 'chip')
      return s3
    })()
  `)) as string

  await sleep(250)
  const after = (await win.webContents.executeJavaScript(snapshotScript(ids))) as BoardSnapshot
  if (after.trn005 !== '99.8' && after.trn005 !== '99,8') {
    throw new Error(`TRN005 should be 99.8 after coûts v2, got ${JSON.stringify(after.trn005)}`)
  }
  if (after.sum !== '899,6') {
    throw new Error(`Expected Somme Montant 899,6 got ${after.sum}`)
  }
  if (after.ratio !== '1,30') {
    throw new Error(`Expected Coût / km 1,30 got ${after.ratio}`)
  }
  if (!after.sourceNames.includes('couts.csv')) {
    throw new Error(`Old coûts Source should stay visible, got ${after.sourceNames.join(', ')}`)
  }

  await shot(win, 'step4-arrow-moved.png')
  await shot(win, 'step5-sum-899.png')
  await shot(win, 'step6-ratio-130.png')

  const resultPath = process.env.CUT_KNOT_SMOKE_OUT
  if (resultPath) {
    let previous: Record<string, unknown> = {}
    try {
      previous = JSON.parse(await fs.promises.readFile(resultPath, 'utf8')) as Record<string, unknown>
    } catch {
      previous = {}
    }
    await fs.promises.writeFile(
      resultPath,
      `${JSON.stringify(
        {
          ...previous,
          board: { before, after, ok: true },
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  }
}

export async function runDesktopHarness(win: BrowserWindow) {
  try {
    await waitForSelector(win, '.header')
    if (process.env.CUT_KNOT_SMOKE === '1') {
      await runSmoke(win)
      await runBoardImport(win)
    }
    if (process.env.CUT_KNOT_SCREENSHOT || process.env.CUT_KNOT_SCREENSHOT_FORGE) {
      await takeScreenshots(win)
    }
  } finally {
    if (process.env.CUT_KNOT_HARNESS_EXIT === '1') {
      app.quit()
    }
  }
}
