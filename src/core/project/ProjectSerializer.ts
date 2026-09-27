import { MeshObject } from '../../types/mesh'
import { Material, Palette, TextureMap } from '../../types/texture'
import { Armature, AnimationClip } from '../../types/animation'
import { ViewportSettings } from '../../types/tools'
import { ReferenceImage } from '../../types/reference'
import { serializePaintLayers, type SavedPaintLayer } from '../painting/PaintLayerStorage'
import { saveTextDocument, getLastProjectPath, setLastProjectPath } from '../desktop/desktopApi'

export interface PsxProjectFile {
  version: '1.0'
  appName: 'PSXModeller'
  projectName: string
  savedAt: string
  meshes: MeshObject[]
  textureDataUrl: string
  textures?: { id: string; name: string; width: number; height: number; dataUrl: string; atlas?: { cols: number; rows: number }; layers?: SavedPaintLayer[]; activeLayerId?: string }[]
  activePalette: Palette
  materials: Material[]
  armature: Armature
  animations: AnimationClip[]
  activeAnimationId: string | null
  currentFrame: number
  viewportSettings: ViewportSettings
  referenceImages?: ReferenceImage[]
}

export class ProjectSerializer {
  static readonly FORMAT_VERSION = '1.0'
  static readonly APP_NAME = 'PSXModeller'

  /** Coerce known older / incomplete 1.x payloads onto the frozen 1.0 shape. */
  static migrateRaw(obj: Record<string, unknown>): Record<string, unknown> {
    const next = { ...obj }
    if (next.version == null || next.version === 1 || next.version === '1') {
      next.version = this.FORMAT_VERSION
    }
    if (next.appName == null) {
      next.appName = this.APP_NAME
    }
    if (!Array.isArray(next.materials)) next.materials = []
    if (!Array.isArray(next.animations)) next.animations = []
    if (!next.armature || typeof next.armature !== 'object') {
      next.armature = {
        id: 'armature',
        name: 'Armature',
        bones: [],
        rootBoneIds: [],
        clips: [],
        activeClipId: null
      }
    }
    if (next.activeAnimationId === undefined) next.activeAnimationId = null
    if (typeof next.currentFrame !== 'number') next.currentFrame = 0
    if (!next.viewportSettings || typeof next.viewportSettings !== 'object') {
      next.viewportSettings = {}
    }
    if (!Array.isArray(next.referenceImages)) next.referenceImages = []
    if (!Array.isArray(next.textures)) next.textures = []
    return next
  }

  /**
   * Serializes current app state into a JSON string format.
   */
  static serialize(
    projectName: string,
    meshes: MeshObject[],
    pixelBufferCanvas: HTMLCanvasElement,
    activePalette: Palette,
    materials: Material[],
    armature: Armature,
    animations: AnimationClip[],
    activeAnimationId: string | null,
    currentFrame: number,
    viewportSettings: ViewportSettings,
    textures?: TextureMap[],
    referenceImages?: ReferenceImage[]
  ): string {
    const textureDataUrl = pixelBufferCanvas.toDataURL('image/png')

    const serializedTextures = (textures || []).map(t => ({
      id: t.id,
      name: t.name,
      width: t.width,
      height: t.height,
      dataUrl: t.pixelBuffer ? t.pixelBuffer.toDataURL() : (t.dataUrl || textureDataUrl),
      ...serializePaintLayers(t.pixelBuffer),
      atlas: t.atlas
    }))

    const projectData: PsxProjectFile = {
      version: '1.0',
      appName: 'PSXModeller',
      projectName: projectName || 'PSX_Model',
      savedAt: new Date().toISOString(),
      meshes: JSON.parse(JSON.stringify(meshes)),
      textureDataUrl,
      textures: serializedTextures,
      activePalette: JSON.parse(JSON.stringify(activePalette)),
      materials: JSON.parse(JSON.stringify(materials)),
      armature: JSON.parse(JSON.stringify(armature)),
      animations: JSON.parse(JSON.stringify(animations)),
      activeAnimationId,
      currentFrame,
      viewportSettings: JSON.parse(JSON.stringify(viewportSettings)),
      referenceImages: JSON.parse(JSON.stringify(referenceImages || []))
    }

    return JSON.stringify(projectData, null, 2)
  }

  /**
   * Writes a `.psxproj` via the desktop save dialog, or a browser download.
   */
  static async downloadProject(jsonString: string, filename: string) {
    const name = filename.endsWith('.psxproj') ? filename : `${filename}.psxproj`
    const saved = await saveTextDocument(
      jsonString,
      name,
      [{ name: 'PolyEcho Project', extensions: ['psxproj'] }],
      getLastProjectPath()
    )
    if (saved) setLastProjectPath(saved)
    return saved
  }

  /** Shared topology gate for project files and IndexedDB recovery records. */
  static assertValidMeshes(meshes: unknown): asserts meshes is MeshObject[] {
    if (!Array.isArray(meshes)) {
      throw new Error('Invalid project file: missing meshes.')
    }
    const meshIds = new Set<string>()
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i]
      if (!mesh || typeof mesh !== 'object') {
        throw new Error(`Invalid project file: mesh ${i} is not an object.`)
      }
      const m = mesh as Record<string, unknown>
      if (typeof m.id !== 'string' || typeof m.name !== 'string') {
        throw new Error(`Invalid project file: mesh ${i} is missing id or name.`)
      }
      if (meshIds.has(m.id)) {
        throw new Error(`Invalid project file: duplicate mesh id "${m.id}".`)
      }
      meshIds.add(m.id)
      if (!Array.isArray(m.vertices) || !Array.isArray(m.faces)) {
        throw new Error(`Invalid project file: mesh ${i} is missing vertices or faces.`)
      }
      const vertexIds = new Set<string>()
      for (let vi = 0; vi < m.vertices.length; vi++) {
        const vertex = m.vertices[vi] as Record<string, unknown> | undefined
        const position = vertex?.position as Record<string, unknown> | undefined
        if (!vertex || typeof vertex.id !== 'string' || !position ||
            ![position.x, position.y, position.z].every(value => typeof value === 'number' && Number.isFinite(value))) {
          throw new Error(`Invalid project file: mesh ${i} vertex ${vi} has an invalid id or position.`)
        }
        if (vertexIds.has(vertex.id)) {
          throw new Error(`Invalid project file: mesh ${i} has duplicate vertex id "${vertex.id}".`)
        }
        vertexIds.add(vertex.id)
      }
      const faceIds = new Set<string>()
      for (let fi = 0; fi < m.faces.length; fi++) {
        const face = m.faces[fi] as Record<string, unknown> | undefined
        if (!face || typeof face.id !== 'string' || !Array.isArray(face.vertexIds)) {
          throw new Error(`Invalid project file: mesh ${i} face ${fi} is missing id or vertexIds.`)
        }
        if (face.vertexIds.length < 3) {
          throw new Error(`Invalid project file: mesh ${i} face ${fi} has fewer than 3 vertices.`)
        }
        if (faceIds.has(face.id)) {
          throw new Error(`Invalid project file: mesh ${i} has duplicate face id "${face.id}".`)
        }
        faceIds.add(face.id)
        if (face.vertexIds.some(id => typeof id !== 'string' || !vertexIds.has(id))) {
          throw new Error(`Invalid project file: mesh ${i} face ${fi} references a missing vertex.`)
        }
        if (new Set(face.vertexIds).size !== face.vertexIds.length) {
          throw new Error(`Invalid project file: mesh ${i} face ${fi} repeats a vertex.`)
        }
        if (face.uvs == null) {
          face.uvs = face.vertexIds.map(() => ({ u: 0, v: 0 }))
        }
        if (!Array.isArray(face.uvs)) {
          throw new Error(`Invalid project file: mesh ${i} face ${fi} has invalid uvs.`)
        }
        if (face.uvs.length !== face.vertexIds.length) {
          throw new Error(`Invalid project file: mesh ${i} face ${fi} uvs length does not match vertexIds.`)
        }
        if (face.uvs.some(uv => {
          if (!uv || typeof uv !== 'object') return true
          const point = uv as Record<string, unknown>
          return typeof point.u !== 'number' || !Number.isFinite(point.u) ||
            typeof point.v !== 'number' || !Number.isFinite(point.v)
        })) {
          throw new Error(`Invalid project file: mesh ${i} face ${fi} has invalid uvs.`)
        }
      }
    }
  }

  /**
   * Parses and validates a project file.
   */
  static deserialize(jsonString: string): PsxProjectFile {
    let data: unknown
    try {
      data = JSON.parse(jsonString)
    } catch {
      throw new Error('Invalid project file: not valid JSON.')
    }
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid project file: expected a JSON object.')
    }
    const obj = this.migrateRaw(data as Record<string, unknown>)
    if (obj.version !== this.FORMAT_VERSION) {
      throw new Error(`Unsupported project version: ${String(obj.version)}`)
    }
    if (obj.appName !== this.APP_NAME) {
      throw new Error(`Unsupported project app: ${String(obj.appName)}`)
    }
    this.assertValidMeshes(obj.meshes)
    return obj as unknown as PsxProjectFile
  }
}
