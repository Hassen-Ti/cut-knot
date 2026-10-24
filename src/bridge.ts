/** Renderer-facing desktop bridge. Present only inside Electron. */

export type FileWatchEvent = 'change' | 'rename'

export type OpenFileFilter = {
  name: string
  extensions: string[]
}

export type OpenFileOptions = {
  filters?: OpenFileFilter[]
}

export type CutKnotBridge = {
  /** Native file picker. CSV is the default filter. Returns an absolute path or null. */
  openFile: (options?: OpenFileOptions) => Promise<string | null>
  /** Read a file by absolute path (utf-8). Call on demand — nothing is preloaded. */
  readFile: (filePath: string) => Promise<string>
  /** Watch an absolute path; callback fires when the file changes on disk. Returns unwatch. */
  watchFile: (
    filePath: string,
    onEvent: (event: FileWatchEvent) => void,
  ) => () => void
}
