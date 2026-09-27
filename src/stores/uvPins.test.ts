import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from './projectStore'
import { useHistoryStore } from './historyStore'
import { useToolStore } from './toolStore'

describe('UV pins in the store', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const tools = useToolStore()
    tools.appMode = 'uvpaint'
    tools.selectMode = 'face'
  })
  afterEach(() => disposePinia(pinia))

  function pinFirstCorner() {
    const project = useProjectStore()
    const face = project.activeMesh!.faces[0]
    face.uvs[0] = { u: 0.31, v: 0.27 }
    project.setUvPins([`${face.id}:${face.vertexIds[0]}`])
    return face.id
  }

  for (const [name, run] of [
    ['smart project', () => useProjectStore().performSmartUvProject()],
    ['seam unwrap', () => useProjectStore().performSeamUnwrap()],
    ['box projection', () => useProjectStore().performBoxUnwrap()],
    ['project from view', () => useProjectStore().performProjectFromView({
      position: { x: 0, y: 0, z: 10 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 },
      forward: { x: 0, y: 0, z: -1 }, perspective: false
    })]
  ] as const) {
    it(`${name} keeps the pinned corner`, () => {
      const project = useProjectStore()
      const faceId = pinFirstCorner()
      run()
      const face = project.activeMesh!.faces.find(f => f.id === faceId)!
      expect(face.uvs[0].u).toBeCloseTo(0.31, 9)
      expect(face.uvs[0].v).toBeCloseTo(0.27, 9)
    })
  }

  it('pinning is undoable and survives the unwrap document swap', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    pinFirstCorner()
    project.performSmartUvProject()
    expect(project.activeMesh!.uvPinKeys).toHaveLength(1)
    history.undo()
    expect(project.activeMesh!.uvPinKeys).toHaveLength(1)
    history.undo()
    expect(project.activeMesh!.uvPinKeys ?? []).toHaveLength(0)
  })

  it('smart project writes island borders as seams, and seams from islands adds none after', () => {
    const project = useProjectStore()
    project.performSmartUvProject()
    const seams = project.activeMesh!.seamEdgeIds ?? []
    expect(seams.length).toBeGreaterThan(0)
    project.performSeamsFromIslands()
    expect(project.activeMesh!.seamEdgeIds).toHaveLength(seams.length)
  })
})
