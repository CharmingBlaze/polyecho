import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '../../stores/projectStore'
import { useHistoryStore } from '../../stores/historyStore'
import { generateShape, geometrySignature, shapeSourceIsCurrent, type ShapeRecipe } from './ShapeRecipe'
import { ProjectSerializer } from '../project/ProjectSerializer'

beforeEach(() => setActivePinia(createPinia()))
describe('Shape Draw document persistence', () => {
  it('preserves recipes through creation undo/redo, conversion undo/redo and save/load', () => {
    const project = useProjectStore(), history = useHistoryStore()
    const recipe: ShapeRecipe = { version: 1, points: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }],
      origin: { x: 3, y: 2, z: 0 }, axisU: { x: 1, y: 0, z: 0 }, axisV: { x: 0, y: 1, z: 0 }, depth: 1, roundness: 0.8, density: 0, style: 'rounded' }
    const created = project.addEditableMesh(generateShape(recipe), 'Shape')
    recipe.origin.x -= created.position.x; recipe.origin.y -= created.position.y; recipe.origin.z -= created.position.z
    created.shapeSource = { recipe, evaluatedSignature: geometrySignature(created) }
    const id = created.id
    history.undo(); expect(project.meshes.some(m => m.id === id)).toBe(false)
    history.redo(); expect(shapeSourceIsCurrent(project.activeMesh!)).toBe(true)
    history.recordState('Make Editable Mesh')
    const baked = { ...project.activeMesh! }; delete baked.shapeSource; project.replaceMesh(baked)
    history.undo(); expect(shapeSourceIsCurrent(project.activeMesh!)).toBe(true)
    const shape = project.activeMesh!
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4
    const json = ProjectSerializer.serialize('Shape', [shape], canvas, { id: 'p', name: 'P', colors: ['#ffffff'] }, [],
      { id: 'a', name: 'A', bones: [], rootBoneIds: [], clips: [], activeClipId: null }, [], null, 0, {} as never)
    const restored = ProjectSerializer.deserialize(json)
    expect(restored.meshes[0].shapeSource).toEqual(shape.shapeSource)
    expect(shapeSourceIsCurrent(restored.meshes[0])).toBe(true)
    const rebuilt = generateShape(restored.meshes[0].shapeSource!.recipe)
    expect([...rebuilt.vertices.values()].map(v => v.position.x)).toEqual(shape.vertices.map(v => v.position.x))
    history.redo(); expect(project.activeMesh?.shapeSource).toBeUndefined()
  })
})
