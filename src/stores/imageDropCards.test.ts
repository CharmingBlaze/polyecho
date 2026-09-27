import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectSerializer } from '../core/project/ProjectSerializer'
import { useAnimationStore } from './animationStore'
import { useHistoryStore } from './historyStore'
import { useProjectStore } from './projectStore'
import { useToolStore } from './toolStore'

let pinia: ReturnType<typeof createPinia>

function imageDataUrl() {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 2
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#00ff00'
    ctx.fillRect(0, 0, 4, 2)
  }
  return canvas.toDataURL('image/png')
}

describe('image drop cards', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => disposePinia(pinia))

  it('creates and selects a textured double-sided image card', () => {
    const project = useProjectStore()
    const geometryRevision = project.geometryRevision
    const textureRevision = project.textureRevision
    const mesh = project.createImageCard({
      kind: 'card',
      name: 'Tree.png',
      width: 400,
      height: 200,
      dataUrl: imageDataUrl(),
      cardHeight: 3,
      position: { x: 2, y: 0, z: -1 },
      rotationY: 35,
    })

    const material = project.materials.find(item => item.id === mesh.materialId)
    const texture = project.textures.find(item => item.id === material?.textureId)
    expect(project.activeMeshId).toBe(mesh.id)
    expect(project.selectedMeshIds).toEqual([mesh.id])
    expect(mesh.position).toEqual({ x: 2, y: 0, z: -1 })
    expect(mesh.rotation.y).toBe(35)
    expect(mesh.vertices).toHaveLength(4)
    expect(mesh.faces).toHaveLength(1)
    expect(material).toMatchObject({
      fill: 'image',
      shading: 'unlit',
      blendMode: 'mask',
      alphaTest: 0.05,
      doubleSided: true,
      opacity: 1,
    })
    expect(texture?.name).toBe('Tree.png')
    expect(project.geometryRevision).toBeGreaterThan(geometryRevision)
    expect(project.textureRevision).toBeGreaterThan(textureRevision)
  })

  it('creates crossed vegetation as one mesh with one material and texture', () => {
    const project = useProjectStore()
    const materialCount = project.materials.length
    const textureCount = project.textures.length
    const mesh = project.createImageCard({
      kind: 'vegetation',
      name: 'Grass.png',
      width: 128,
      height: 256,
      dataUrl: imageDataUrl(),
    })

    expect(mesh.vertices).toHaveLength(8)
    expect(mesh.faces).toHaveLength(2)
    expect(project.materials).toHaveLength(materialCount + 1)
    expect(project.textures).toHaveLength(textureCount + 1)
  })

  it('undoes and redoes mesh, material, and texture creation as one action', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const before = {
      meshes: project.meshes.length,
      materials: project.materials.length,
      textures: project.textures.length,
      history: history.undoStack.length,
    }
    const created = project.createImageCard({
      kind: 'reference',
      name: 'Reference.png',
      width: 320,
      height: 240,
      dataUrl: imageDataUrl(),
      opacity: 0.4,
    })

    expect(history.undoStack).toHaveLength(before.history + 1)
    const materialId = created.materialId
    const textureId = project.materials.find(item => item.id === materialId)?.textureId
    history.undo()
    expect(project.meshes).toHaveLength(before.meshes)
    expect(project.materials).toHaveLength(before.materials)
    expect(project.textures).toHaveLength(before.textures)
    expect(project.meshes.some(item => item.id === created.id)).toBe(false)
    expect(project.materials.some(item => item.id === materialId)).toBe(false)
    expect(project.textures.some(item => item.id === textureId)).toBe(false)

    history.redo()
    expect(project.meshes.some(item => item.id === created.id)).toBe(true)
    expect(project.materials.some(item => item.id === materialId)).toBe(true)
    expect(project.textures.some(item => item.id === textureId)).toBe(true)
  })

  it('applies a dropped image to an existing object in one undo step', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected starter mesh')
    const oldMaterialId = mesh.materialId
    const oldTextureId = project.materials.find(item => item.id === oldMaterialId)?.textureId
    const historyCount = history.undoStack.length

    const texture = project.applyDroppedImageToMesh(mesh.id, {
      name: 'Bark.png',
      width: 16,
      height: 32,
      dataUrl: imageDataUrl(),
    })
    expect(texture).not.toBeNull()
    expect(history.undoStack).toHaveLength(historyCount + 1)
    expect(project.materials.find(item => item.id === mesh.materialId)?.textureId).toBe(texture?.id)

    history.undo()
    expect(project.activeMesh?.materialId).toBe(oldMaterialId)
    expect(project.materials.find(item => item.id === oldMaterialId)?.textureId).toBe(oldTextureId)
    expect(project.textures.some(item => item.id === texture?.id)).toBe(false)
  })

  it('preserves image-card geometry, material settings, and texture through project serialization', () => {
    const project = useProjectStore()
    const animation = useAnimationStore()
    const tools = useToolStore()
    const mesh = project.createImageCard({
      kind: 'reference',
      name: 'Pose.png',
      width: 300,
      height: 600,
      dataUrl: imageDataUrl(),
      opacity: 0.35,
    })

    const json = ProjectSerializer.serialize(
      project.projectName,
      project.meshes,
      project.pixelBuffer.canvas,
      project.activePalette,
      project.materials,
      animation.armature,
      animation.armature.clips,
      animation.armature.activeClipId,
      animation.currentFrame,
      tools.viewport,
      project.textures,
      project.referenceImages
    )
    const restored = ProjectSerializer.deserialize(json)
    const restoredMesh = restored.meshes.find(item => item.id === mesh.id)
    const restoredMaterial = restored.materials.find(item => item.id === mesh.materialId)

    expect(restoredMesh?.faces).toHaveLength(1)
    expect(restoredMaterial).toMatchObject({
      shading: 'unlit',
      blendMode: 'blend',
      doubleSided: true,
      opacity: 0.35,
    })
    expect(restored.textures?.some(item => item.id === restoredMaterial?.textureId)).toBe(true)
  })
})
