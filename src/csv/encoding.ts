/** Map for Windows-1252 bytes 0x80–0x9F (the range that differs from Latin-1). */
const CP1252_80_9F = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
] as const

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const

export function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === UTF8_BOM[0] &&
    bytes[1] === UTF8_BOM[1] &&
    bytes[2] === UTF8_BOM[2]
  )
}

/** One Latin-1 code unit per byte — the form `readFile` returns from Electron. */
export function bytesFromBinaryString(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 0xff
  }
  return bytes
}

export function decodeWindows1252(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!
    if (b >= 0x80 && b <= 0x9f) {
      out += String.fromCharCode(CP1252_80_9F[b - 0x80]!)
    } else {
      out += String.fromCharCode(b)
    }
  }
  return out
}

/**
 * Source encoding: UTF-8 BOM → UTF-8; else strict UTF-8; else Windows-1252.
 * Keeps é and € from Excel FR CSVs.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (hasUtf8Bom(bytes)) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return decodeWindows1252(bytes)
  }
}
