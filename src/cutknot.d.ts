import type { CutKnotBridge } from './bridge'
import type { BoardItem, Connector, SourceView } from './board/model'
import type { KpiAgg } from './csv/kpi'

export type CutKnotBoardTestApi = {
  getState: () => { items: BoardItem[]; connectors: Connector[] }
  loadFromPath: (id: string, filePath: string) => Promise<void>
  loadFromText: (id: string, fileName: string, text: string) => void
  createSource: (x: number, y: number) => string
  createGolden: (x: number, y: number) => string
  createKpi: (x: number, y: number) => string
  connect: (fromId: string, toId: string) => string
  retarget: (connectorId: string, fromId?: string, toId?: string) => void
  setKpiPicker: (
    id: string,
    spec: { agg: KpiAgg; column?: string; numerator?: string; denominator?: string; title?: string },
  ) => void
  setView: (id: string, view: SourceView) => void
}

declare global {
  interface Window {
    /** Secure desktop bridge. Defined only in the Electron renderer. */
    readonly cutknot?: CutKnotBridge
    /** Harness / smoke hook. Present on the Board route. */
    __cutknotBoard?: CutKnotBoardTestApi
  }
}

export {}
