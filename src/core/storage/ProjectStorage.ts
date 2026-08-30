import { MeshObject } from '../../types/mesh'
import { Material, Palette } from '../../types/texture'
import { Armature } from '../../types/animation'

export interface TextureStorageData {
  id: string
  name: string
  width: number
  height: number
  dataUrl: string
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

  return dbPromise
}

export class ProjectStorage {
  static async saveProject(data: Omit<ProjectStorageData, 'id' | 'updatedAt'>, id = AUTOSAVE_KEY): Promise<void> {
    try {
      const db = await getDB()
      const record: ProjectStorageData = {
        ...data,
        id,
        updatedAt: Date.now()
      }

      return new Promise((resolve, reject) => {
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
          resolve(request.result || null)
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
