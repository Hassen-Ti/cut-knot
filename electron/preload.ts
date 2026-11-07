import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from './ipc.ts'

type FileWatchEvent = 'change' | 'rename'

type OpenFileOptions = {
  filters?: { name: string; extensions: string[] }[]
}

type AiHarnessRequest = {
  userMessage: string
  availableColumns: string[]
  context?: string
}

type AiHarnessResponse = {
  proposal: unknown
  raw?: unknown
  deterministic: boolean
}

const cutknot = {
  openFile: (options?: OpenFileOptions): Promise<string | null> => {
    return ipcRenderer.invoke(IPC.openFile, options) as Promise<string | null>
  },

  readFile: (filePath: string): Promise<string> => {
    return ipcRenderer.invoke(IPC.readFile, filePath) as Promise<string>
  },

  watchFile: (
    filePath: string,
    onEvent: (event: FileWatchEvent) => void,
  ): (() => void) => {
    const watchId = crypto.randomUUID()
    void ipcRenderer.invoke(IPC.watchFile, watchId, filePath)

    const handler = (
      _event: IpcRendererEvent,
      id: string,
      watchEvent: FileWatchEvent,
    ) => {
      if (id === watchId) onEvent(watchEvent)
    }

    ipcRenderer.on(IPC.fileChanged, handler)

    return () => {
      void ipcRenderer.invoke(IPC.unwatchFile, watchId)
      ipcRenderer.removeListener(IPC.fileChanged, handler)
    }
  },

  ai: {
    run: (request: AiHarnessRequest): Promise<AiHarnessResponse> => {
      return ipcRenderer.invoke(IPC.aiRun, request) as Promise<AiHarnessResponse>
    },
  },
}

contextBridge.exposeInMainWorld('cutknot', cutknot)
