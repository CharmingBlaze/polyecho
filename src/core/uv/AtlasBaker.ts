import { MeshObject } from '../../types/mesh'
import { TextureMap, Material } from '../../types/texture'
import { PixelBuffer } from '../painting/PixelCanvas'

export interface AtlasBakeResult {
  atlasTexture: TextureMap
  atlasMaterial: Material
  remappedMeshes: MeshObject[]
}

interface TextureRect {
  textureId: string
  x: number
  y: number
  width: number
  height: number
  uMin: number
  vMin: number
  uMax: number
  vMax: number
}

export class AtlasBaker {
  static bakeSceneAtlas(
    meshes: MeshObject[],
    textures: TextureMap[],
    materials: Material[],
    padding = 2
  ): AtlasBakeResult {
    const usedTextureIds = new Set<string>()
    for (const m of meshes) {
      const mat = materials.find(mat => mat.id === (m.materialId || 'default_material'))
      if (mat && mat.textureId) {
        usedTextureIds.add(mat.textureId)
      } else if (textures.length > 0) {
        usedTextureIds.add(textures[0].id)
      }
    }

    const targetTextures = textures.filter(t => usedTextureIds.has(t.id))
    const texList = targetTextures.length > 0 ? targetTextures : textures

    if (texList.length === 0) {
      throw new Error('No textures found to bake into an atlas.')
    }

    let totalArea = 0
    let maxDimension = 64
    for (const t of texList) {
      totalArea += (t.width + padding * 2) * (t.height + padding * 2)
      maxDimension = Math.max(maxDimension, t.width, t.height)
    }

    let atlasSize = 64
    while (atlasSize * atlasSize < totalArea * 1.3 || atlasSize < maxDimension) {
      atlasSize *= 2
      if (atlasSize >= 2048) break
    }

    const rects: TextureRect[] = []
    let currentX = padding
    let currentY = padding
    let rowHeight = 0

    const sortedTextures = [...texList].sort((a, b) => b.height - a.height)

    for (const tex of sortedTextures) {
      if (currentX + tex.width + padding > atlasSize) {
        currentX = padding
        currentY += rowHeight + padding
        rowHeight = 0
      }

      const placeX = currentX
      const placeY = currentY

      rects.push({
        textureId: tex.id,
        x: placeX,
        y: placeY,
        width: tex.width,
        height: tex.height,
        uMin: placeX / atlasSize,
        vMin: 1 - (placeY + tex.height) / atlasSize,
        uMax: (placeX + tex.width) / atlasSize,
        vMax: 1 - placeY / atlasSize
      })

      currentX += tex.width + padding
      rowHeight = Math.max(rowHeight, tex.height)
    }

    const masterBuffer = new PixelBuffer(atlasSize, atlasSize)
    masterBuffer.clear('#000000')

    for (const rect of rects) {
      const tex = texList.find(t => t.id === rect.textureId)
      if (tex && tex.pixelBuffer) {
        masterBuffer.ctx.drawImage(
          tex.pixelBuffer.canvas,
          rect.x,
          rect.y,
          rect.width,
          rect.height
        )
      }
    }

    const masterTextureId = `tex_master_atlas_${Date.now().toString(36)}`
    const masterTexture: TextureMap = {
      id: masterTextureId,
      name: `Master_Atlas_${atlasSize}x${atlasSize}`,
      width: atlasSize,
      height: atlasSize,
      dataUrl: masterBuffer.toDataURL(),
      pixelBuffer: masterBuffer
    }

    const masterMaterialId = `mat_master_atlas_${Date.now().toString(36)}`
    const masterMaterial: Material = {
      id: masterMaterialId,
      name: 'Master_Atlas_Material',
      textureId: masterTextureId,
      color: '#ffffff',
      shading: 'textured',
      psxJitter: false,
      psxJitterResolution: 240,
      psxAffine: false,
      dither: false,
      ditherLevel: 32,
      wireframe: false
    }

    const rectMap = new Map<string, TextureRect>()
    rects.forEach(r => rectMap.set(r.textureId, r))

    const remappedMeshes: MeshObject[] = meshes.map(mesh => {
      const clonedMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
      const mat = materials.find(m => m.id === (mesh.materialId || 'default_material'))
      const texId = mat?.textureId || texList[0]?.id

      const rect = rectMap.get(texId)
      if (rect) {
        for (const face of clonedMesh.faces) {
          face.uvs = face.uvs.map(uv => {
            const newU = rect.uMin + uv.u * (rect.uMax - rect.uMin)
            const newV = rect.vMin + uv.v * (rect.vMax - rect.vMin)
            return {
              u: Number(newU.toFixed(4)),
              v: Number(newV.toFixed(4))
            }
          })
        }
      }

      clonedMesh.materialId = masterMaterialId
      return clonedMesh
    })

    return {
      atlasTexture: masterTexture,
      atlasMaterial: masterMaterial,
      remappedMeshes
    }
  }
}
