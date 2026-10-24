import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronBin = require('electron')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cut-knot-smoke-'))
const csvPath = path.join(tmp, 'tournees.csv')
const outPath = path.join(tmp, 'smoke.json')
const boardShot = process.env.CUT_KNOT_SCREENSHOT ?? path.join(tmp, 'board.png')
const forgeShot = process.env.CUT_KNOT_SCREENSHOT_FORGE ?? path.join(tmp, 'forge.png')

const csv = [
  'ID_tournee,Date,Zone,Km,Cout',
  'TRN001,02/05/2024,Nord,142,186.4',
  'TRN002,02/05/2024,Sud,98,112.0',
  '',
].join('\n')

await fs.writeFile(csvPath, csv, 'utf8')

const chromiumTmp = path.join(root, '.chromium-tmp')
await fs.mkdir(chromiumTmp, { recursive: true })

const child = spawn(
  electronBin,
  [
    '.',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--in-process-gpu',
    '--disable-software-rasterizer',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      TMPDIR: chromiumTmp,
      ELECTRON_LOAD_FILE: '1',
      CUT_KNOT_SMOKE: '1',
      CUT_KNOT_SMOKE_FILE: csvPath,
      CUT_KNOT_SMOKE_OUT: outPath,
      CUT_KNOT_SCREENSHOT: boardShot,
      CUT_KNOT_SCREENSHOT_FORGE: forgeShot,
      CUT_KNOT_HARNESS_EXIT: '1',
      CUT_KNOT_NO_SANDBOX: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
    stdio: 'inherit',
  },
)

const code = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    child.kill('SIGKILL')
    resolve(1)
  }, 45000)
  child.on('exit', (exitCode, signal) => {
    clearTimeout(timer)
    resolve(exitCode ?? (signal ? 1 : 0))
  })
})

let report
try {
  report = JSON.parse(await fs.readFile(outPath, 'utf8'))
} catch {
  throw new Error(`Electron smoke did not write a report (exit ${code})`)
}

console.log(JSON.stringify({ exit: code, report, boardShot, forgeShot }, null, 2))

if (code !== 0 || !report.ok) {
  process.exit(1)
}
