import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useHistoryStore } from './historyStore'
import { useProjectStore } from './projectStore'

let pinia: ReturnType<typeof createPinia>

describe('material texture tiling workflow', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => disposePinia(pinia))

  it('updates independent repeats, clamps them, and bumps geometry revision', () => {
    const project = useProjectStore()
    const revision = project.geometryRevision

    project.setMaterialTextureTiling('default_material', 3, 100)

    expect(project.activeMaterial.tileX).toBe(3)
    expect(project.activeMaterial.tileY).toBe(64)
    expect(project.geometryRevision).toBeGreaterThan(revision)
  })

  it('records one undo entry unless live updates disable recording', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const historyCount = history.undoStack.length

    project.recordState('Texture Tiling')
    project.setMaterialTextureTiling('default_material', 2, 1, { record: false })
    project.setMaterialTextureTiling('default_material', 2.5, 1.5, { record: false })

    expect(history.undoStack).toHaveLength(historyCount + 1)
    expect(project.activeMaterial).toMatchObject({ tileX: 2.5, tileY: 1.5 })

    history.undo()
    expect(project.activeMaterial).toMatchObject({ tileX: 1, tileY: 1 })
  })
})
