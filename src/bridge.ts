/** Renderer-facing desktop bridge. Present only inside Electron. */

export type FileWatchEvent = 'change' | 'rename'

export type OpenFileFilter = {
  name: string
  extensions: string[]
}

export type OpenFileOptions = {
  filters?: OpenFileFilter[]
}

export type AiHarnessRequest = {
  userMessage: string
  availableColumns: string[]
  context?: string
}

export type AiHarnessResponse = {
  proposal: unknown
  raw?: unknown
  deterministic: boolean
}

export type CutKnotBridge = {
  /** Native file picker. CSV is the default filter. Returns an absolute path or null. */
  openFile: (options?: OpenFileOptions) => Promise<string | null>
  /**
   * Read a file by absolute path as a latin1 binary string (one char per byte).
   * The main process does not decode UTF-8; Source detects BOM / strict UTF-8
   * and falls back to Windows-1252.
   */
  readFile: (filePath: string) => Promise<string>
  /** Watch an absolute path; callback fires when the file changes on disk. Returns unwatch. */
  watchFile: (
    filePath: string,
    onEvent: (event: FileWatchEvent) => void,
  ) => () => void
  /** AI harness: propose typed actions validated by deterministic engine. */
  ai: {
    run: (request: AiHarnessRequest) => Promise<AiHarnessResponse>
  }
}
