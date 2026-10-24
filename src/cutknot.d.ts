import type { CutKnotBridge } from './bridge'

declare global {
  interface Window {
    /** Secure desktop bridge. Defined only in the Electron renderer. */
    readonly cutknot?: CutKnotBridge
  }
}

export {}
