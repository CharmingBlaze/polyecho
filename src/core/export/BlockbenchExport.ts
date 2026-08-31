import { MeshObject } from '../../types/mesh'
import { Armature } from '../../types/animation'
import { TextureMap } from '../../types/texture'

export interface BBModelExportOptions {
  projectName?: string
}

/**
 * Generates a standard Blockbench .bbmodel JSON project.
 */
export function exportToBlockbench(
  meshes: MeshObject[],
  textures: TextureMap[],
  armature?: Armature,
  options?: BBModelExportOptions
): string {
  const primaryTex = textures[0] || null
  const resWidth = primaryTex?.width || 64
  const resHeight = primaryTex?.height || 64

  // Textures array
  const bbTextures = textures.map((tex, index) => ({
    name: tex.name || `Texture_${index}`,
    folder: 'block',
    namespace: '',
    id: String(index),
    particle: false,
    render_mode: 'default',
    visible: true,
    mode: 'bitmap',
    saved: true,
    uuid: `tex_${tex.id || index}`,
    source: tex.dataUrl || (tex.pixelBuffer ? tex.pixelBuffer.toDataURL() : '')
  }))

  // Elements (Mesh cubes / geometry approximations)
  const elements = meshes.map((mesh, index) => {
    // Calculate bounding box in 16-unit Blockbench space
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

    for (const v of mesh.vertices) {
      minX = Math.min(minX, v.position.x * 16)
      minY = Math.min(minY, v.position.y * 16)
      minZ = Math.min(minZ, v.position.z * 16)
      maxX = Math.max(maxX, v.position.x * 16)
      maxY = Math.max(maxY, v.position.y * 16)
      maxZ = Math.max(maxZ, v.position.z * 16)
    }

    if (minX === Infinity) {
      minX = -8; minY = 0; minZ = -8; maxX = 8; maxY = 16; maxZ = 8
    }

    const posX = mesh.position.x * 16
    const posY = mesh.position.y * 16
    const posZ = mesh.position.z * 16

    return {
      name: mesh.name || `Cube_${index}`,
      box_uv: false,
      rescale: false,
      locked: mesh.locked || false,
      render_order: 'default',
      visibility: mesh.visible,
      from: [minX + posX, minY + posY, minZ + posZ],
      to: [maxX + posX, maxY + posY, maxZ + posZ],
      origin: [posX, posY, posZ],
      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
      color: 0,
      uuid: mesh.id,
      faces: {
        north: { uv: [0, 0, 16, 16], texture: 0 },
        east: { uv: [0, 0, 16, 16], texture: 0 },
        south: { uv: [0, 0, 16, 16], texture: 0 },
        west: { uv: [0, 0, 16, 16], texture: 0 },
        up: { uv: [0, 0, 16, 16], texture: 0 },
        down: { uv: [0, 0, 16, 16], texture: 0 }
      }
    }
  })

  // Outliner hierarchy
  const outliner: any[] = elements.map(el => el.uuid)

  // Armature bones outliner if present
  if (armature && armature.bones.length > 0) {
    for (const b of armature.bones) {
      outliner.push({
        name: b.name,
        origin: [b.head.x * 16, b.head.y * 16, b.head.z * 16],
        rotation: [b.rotation.x, b.rotation.y, b.rotation.z],
        uuid: b.id,
        export: true,
        isOpen: true,
        locked: false,
        visibility: true,
        children: []
      })
    }
  }

  // Animations array
  const animations = (armature?.clips || []).map(clip => ({
    name: clip.name,
    uuid: clip.id,
    loop: clip.loop ? 'loop' : 'once',
    override: false,
    length: (clip.durationFrames || 24) / (clip.fps || 12),
    snapping: clip.fps || 12,
    animators: {}
  }))

  const bbModel = {
    meta: {
      format_version: '4.10',
      creation_time: Math.floor(Date.now() / 1000),
      model_format: 'generic_model',
      box_uv: false
    },
    name: options?.projectName || 'PolyEcho_Model',
    geometry_name: options?.projectName || 'model',
    visible_box: [1, 1, 0],
    resolution: {
      width: resWidth,
      height: resHeight
    },
    elements,
    outliner,
    textures: bbTextures,
    animations
  }

  return JSON.stringify(bbModel, null, 2)
}

/**
 * Parses a Blockbench .bbmodel JSON string into PolyEcho data objects.
 */
export function importFromBlockbench(jsonString: string): {
  projectName: string
  elements: any[]
  textures: Array<{ name: string; dataUrl: string; width: number; height: number }>
  animations: any[]
} {
  const data = JSON.parse(jsonString)
  const projectName = data.name || 'Blockbench_Model'
  const width = data.resolution?.width || 64
  const height = data.resolution?.height || 64

  const textures = (data.textures || []).map((t: any, idx: number) => ({
    name: t.name || `Texture_${idx}`,
    dataUrl: t.source || '',
    width,
    height
  }))

  return {
    projectName,
    elements: data.elements || [],
    textures,
    animations: data.animations || []
  }
}
