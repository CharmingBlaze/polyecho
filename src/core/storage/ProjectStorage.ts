import { MeshObject } from '../../types/mesh'
import { Material, Palette } from '../../types/texture'
import { Armature } from '../../types/animation'

export interface TextureStorageData {
  id: string
  name: string
  width: number
  height: number
  dataUrl: string
  atlas?: { cols: number; rows: number }
}

export interface ProjectStorageData {
  id: string
  name: string
  updatedAt: number
  meshes: MeshObject[]
  materials: Material[]
  activePalette: Palette
  textures: TextureStorageData[]
  armature: Armature
}

const DB_NAME = 'polyecho_db'
const DB_VERSION = 1
const STORE_NAME = 'projects'
const AUTOSAVE_KEY = 'current_autosave'

let dbPromise: Promise<IDBDatabase> | null = null

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result)
    }

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error)
    }
  })

  dbPromise.catch(() => {
    dbPromise = null
  })

  return dbPromise
}

export class ProjectStorage {
  /** Reject autosave payloads that would fail `.psxproj` face/UV checks. */
  static isValidProjectData(data: unknown): data is ProjectStorageData {
    if (!data || typeof data !== 'object') return false
    const obj = data as Record<string, unknown>
    if (typeof obj.name !== 'string' || !Array.isArray(obj.meshes) || obj.meshes.length === 0) {
      return false
    }
    for (let i = 0; i < obj.meshes.length; i++) {
      const mesh = obj.meshes[i]
      if (!mesh || typeof mesh !== 'object') return false
      const m = mesh as Record<string, unknown>
      if (!Array.isArray(m.vertices) || !Array.isArray(m.faces)) return false
      for (const face of m.faces) {
        if (!face || typeof face !== 'object') return false
        const f = face as Record<string, unknown>
        if (!Array.isArray(f.vertexIds) || f.vertexIds.length < 3) return false
        if (Array.isArray(f.uvs) && f.uvs.length !== f.vertexIds.length) return false
      }
    }
    return true
  }

  static async saveProject(data: Omit<ProjectStorageData, 'id' | 'updatedAt'>, id = AUTOSAVE_KEY): Promise<void> {
    try {
      const db = await getDB()
      // IndexedDB rejects Vue proxies and other non-structured-clone values.
      // ProjectStorageData is intentionally JSON-only, so normalize it at the
      // persistence boundary instead of relying on every caller to unwrap state.
      const record = JSON.parse(JSON.stringify({
        ...data,
        id,
        updatedAt: Date.now()
      })) as ProjectStorageData

      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.put(record)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (err) {
      console.warn('Failed to save project to IndexedDB:', err)
    }
  }

  static async loadProject(id = AUTOSAVE_KEY): Promise<ProjectStorageData | null> {
    try {
      const db = await getDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(id)

        request.onsuccess = () => {
          const row = request.result
          resolve(row && ProjectStorage.isValidProjectData(row) ? row : null)
        }
        request.onerror = () => reject(request.error)
      })
    } catch (err) {
      console.warn('Failed to load project from IndexedDB:', err)
      return null
    }
  }

  static async hasAutosave(): Promise<boolean> {
    const data = await this.loadProject(AUTOSAVE_KEY)
    return data !== null && Array.isArray(data.meshes) && data.meshes.length > 0
  }

  static async clearAutosave(): Promise<void> {
    try {
      const db = await getDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.delete(AUTOSAVE_KEY)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (err) {
      console.warn('Failed to clear autosave:', err)
    }
  }
}
