import { MeshObject } from '../../types/mesh'
import { Material, Palette, TextureMap } from '../../types/texture'
import { Armature, AnimationClip } from '../../types/animation'
import { ViewportSettings } from '../../types/tools'
import { ReferenceImage } from '../../types/reference'

export interface PsxProjectFile {
  version: '1.0'
  appName: 'PSXModeller'
  projectName: string
  savedAt: string
  meshes: MeshObject[]
  textureDataUrl: string
  textures?: { id: string; name: string; width: number; height: number; dataUrl: string; atlas?: { cols: number; rows: number } }[]
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
   * Triggers a browser file download of the project.
   */
  static downloadProject(jsonString: string, filename: string) {
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.psxproj') ? filename : `${filename}.psxproj`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Parses and validates a project file.
   */
  static deserialize(jsonString: string): PsxProjectFile {
    const data = JSON.parse(jsonString)
    if (!data.meshes || !Array.isArray(data.meshes)) {
      throw new Error('Invalid project file: missing meshes.')
    }
    return data as PsxProjectFile
  }
}
