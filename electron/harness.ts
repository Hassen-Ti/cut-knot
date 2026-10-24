import { app, type BrowserWindow } from 'electron'
import fs from 'node:fs'

type SmokeResult = {
  picked: string
  text: string
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
  await fs.promises.appendFile(
    result.picked,
    `\n# smoke-touch ${Date.now()}\n`,
    'utf8',
  )

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

export async function runDesktopHarness(win: BrowserWindow) {
  try {
    await waitForSelector(win, '.header')
    if (process.env.CUT_KNOT_SMOKE === '1') {
      await runSmoke(win)
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
