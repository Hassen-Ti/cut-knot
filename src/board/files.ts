import { bytesFromBinaryString, decodeCsvBytes, parseCsv } from '../csv/index.ts'
import { fileBaseName, isCsvFileName } from './model.ts'

export type LoadedCsv = {
  name: string
  cells?: string[][]
  error?: string
  filePath?: string
}

function parseOrError(name: string, text: string, filePath?: string): LoadedCsv {
  try {
    return { name, cells: parseCsv(text), filePath }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fichier illisible'
    return { name, error: message, filePath }
  }
}

export function decodeFileBytes(bytes: Uint8Array): string {
  return decodeCsvBytes(bytes)
}

export function loadedCsvFromBytes(name: string, bytes: Uint8Array, filePath?: string): LoadedCsv {
  if (!isCsvFileName(name)) {
    return { name, error: 'Fichier illisible', filePath }
  }
  return parseOrError(name, decodeCsvBytes(bytes), filePath)
}

export function loadedCsvFromBinaryString(name: string, binary: string, filePath?: string): LoadedCsv {
  return loadedCsvFromBytes(name, bytesFromBinaryString(binary), filePath)
}

export async function readCsvFromPath(filePath: string): Promise<LoadedCsv> {
  const api = window.cutknot
  if (!api) {
    return { name: fileBaseName(filePath), error: 'Fichier illisible', filePath }
  }
  try {
    const binary = await api.readFile(filePath)
    return loadedCsvFromBinaryString(fileBaseName(filePath), binary, filePath)
  } catch {
    return { name: fileBaseName(filePath), error: 'Fichier illisible', filePath }
  }
}

function pickBrowserFile(): Promise<LoadedCsv | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,text/csv'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      void file.arrayBuffer().then((buffer) => {
        resolve(loadedCsvFromBytes(file.name, new Uint8Array(buffer)))
      })
    })
    input.click()
  })
}

export async function pickCsvFile(): Promise<LoadedCsv | null> {
  const api = window.cutknot
  if (api) {
    const filePath = await api.openFile({
      filters: [
        { name: 'CSV', extensions: ['csv'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (!filePath) return null
    return readCsvFromPath(filePath)
  }
  return pickBrowserFile()
}

export async function loadedCsvFromFile(file: File): Promise<LoadedCsv> {
  const buffer = await file.arrayBuffer()
  const loaded = loadedCsvFromBytes(file.name, new Uint8Array(buffer))
  return { ...loaded, filePath: undefined }
}

export function droppedCsvFiles(list: FileList | File[] | null | undefined): File[] {
  if (!list) return []
  return [...list].filter((file) => isCsvFileName(file.name))
}
