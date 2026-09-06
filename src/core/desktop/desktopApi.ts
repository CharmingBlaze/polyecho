export interface DesktopFileFilter {
  name: string
  extensions: string[]
}

export interface DesktopBridge {
  isDesktop: true
  platform: string
  setTitle(title: string): Promise<void>
  saveFile(payload: {
    defaultPath?: string
    filters?: DesktopFileFilter[]
    text?: string
    bytes?: ArrayBuffer
  }): Promise<{ canceled: boolean; path?: string }>
  writeFile(payload: { path: string; text?: string; bytes?: ArrayBuffer }): Promise<{ ok: boolean }>
  openFile(payload: {
    filters?: DesktopFileFilter[]
    binary?: boolean
  }): Promise<{ canceled: boolean; path?: string; name?: string; text?: string; bytes?: ArrayBuffer }>
  unsavedClose(): Promise<0 | 1 | 2>
  allowClose(): Promise<void>
  cancelClose(): Promise<void>
  onCloseRequest(callback: () => void): () => void
  listRecent(): Promise<string[]>
  addRecent(filePath: string): Promise<string[]>
  openPath(filePath: string): Promise<{ canceled: boolean; path?: string; name?: string; text?: string }>
  getLaunchPath(): Promise<string | null>
  logCrash(payload: { source: string; message: string; stack?: string }): Promise<void>
  revealCrashLog(): Promise<void>
  showAbout(): Promise<void>
  requestQuit(): Promise<void>
  onOpenExternal(callback: (filePath: string) => void): () => void
  revealInFolder(filePath: string): Promise<void>
}

declare global {
  interface Window {
    polyechoDesktop?: DesktopBridge
  }
}

let lastProjectPath: string | null = null

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && window.polyechoDesktop?.isDesktop === true
}

export function getLastProjectPath(): string | null {
  return lastProjectPath
}

export function setLastProjectPath(filePath: string | null): void {
  lastProjectPath = filePath
}

export async function setDesktopTitle(title: string): Promise<void> {
  if (isDesktopApp()) await window.polyechoDesktop!.setTitle(title)
  else if (typeof document !== 'undefined') document.title = title
}

function browserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function saveTextDocument(
  text: string,
  suggestedName: string,
  filters: DesktopFileFilter[],
  overwritePath?: string | null
): Promise<string | null> {
  const api = window.polyechoDesktop
  if (!api) {
    browserDownload(new Blob([text], { type: 'text/plain' }), suggestedName)
    return null
  }
  if (overwritePath) {
    await api.writeFile({ path: overwritePath, text })
    return overwritePath
  }
  const result = await api.saveFile({ defaultPath: suggestedName, filters, text })
  return result.canceled ? null : result.path ?? null
}

export async function saveBlobDocument(
  blob: Blob,
  suggestedName: string,
  filters: DesktopFileFilter[]
): Promise<string | null> {
  const api = window.polyechoDesktop
  if (!api) {
    browserDownload(blob, suggestedName)
    return null
  }
  const bytes = await blob.arrayBuffer()
  const result = await api.saveFile({ defaultPath: suggestedName, filters, bytes })
  return result.canceled ? null : result.path ?? null
}

export async function openTextFile(filters: DesktopFileFilter[]): Promise<{ path: string; name: string; text: string } | null> {
  const api = window.polyechoDesktop
  if (!api) return null
  const result = await api.openFile({ filters, binary: false })
  if (result.canceled || !result.text || !result.path) return null
  return { path: result.path, name: result.name || result.path, text: result.text }
}

export async function openBinaryFile(filters: DesktopFileFilter[]): Promise<{ path: string; name: string; bytes: ArrayBuffer } | null> {
  const api = window.polyechoDesktop
  if (!api) return null
  const result = await api.openFile({ filters, binary: true })
  if (result.canceled || !result.bytes || !result.path) return null
  return { path: result.path, name: result.name || result.path, bytes: result.bytes }
}

/** 0 = Save, 1 = Don't Save, 2 = Cancel */
export async function confirmUnsavedClose(): Promise<0 | 1 | 2> {
  const api = window.polyechoDesktop
  if (!api?.unsavedClose) return 2
  return api.unsavedClose()
}

export async function allowDesktopClose(): Promise<void> {
  await window.polyechoDesktop?.allowClose()
}

export async function cancelDesktopClose(): Promise<void> {
  await window.polyechoDesktop?.cancelClose()
}

export function onDesktopCloseRequest(callback: () => void): () => void {
  return window.polyechoDesktop?.onCloseRequest(callback) ?? (() => {})
}

export async function listRecentProjects(): Promise<string[]> {
  return window.polyechoDesktop?.listRecent() ?? []
}

export async function addRecentProject(filePath: string): Promise<void> {
  await window.polyechoDesktop?.addRecent(filePath)
}

export async function openProjectPath(filePath: string): Promise<{ path: string; name: string; text: string } | null> {
  const api = window.polyechoDesktop
  if (!api?.openPath) return null
  const result = await api.openPath(filePath)
  if (result.canceled || !result.text || !result.path) return null
  return { path: result.path, name: result.name || result.path, text: result.text }
}

export async function getLaunchProjectPath(): Promise<string | null> {
  return window.polyechoDesktop?.getLaunchPath() ?? null
}

export async function logDesktopCrash(source: string, message: string, err?: unknown): Promise<void> {
  const stack = err instanceof Error ? err.stack : undefined
  await window.polyechoDesktop?.logCrash({ source, message, stack })
}

export async function revealCrashLog(): Promise<void> {
  await window.polyechoDesktop?.revealCrashLog()
}

export async function showDesktopAbout(): Promise<void> {
  await window.polyechoDesktop?.showAbout()
}

export async function requestDesktopQuit(): Promise<void> {
  await window.polyechoDesktop?.requestQuit()
}

export function onOpenExternalProject(callback: (filePath: string) => void): () => void {
  return window.polyechoDesktop?.onOpenExternal(callback) ?? (() => {})
}

export async function revealInFolder(filePath: string): Promise<void> {
  await window.polyechoDesktop?.revealInFolder(filePath)
}
