import path from 'node:path'

export function assertAbsolutePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Path is required')
  }
  if (filePath.includes('\0')) {
    throw new Error('Invalid path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('Path must be absolute')
  }
  return filePath
}
