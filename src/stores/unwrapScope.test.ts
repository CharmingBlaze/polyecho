import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCube } from '../core/geometry/Primitives'
import { useProjectStore } from './projectStore'
import { useToolStore } from './toolStore'

function stampActive() {
  const project = useProjectStore()
  for (const face of project.activeMesh!.faces) {
    face.uvs = face.vertexIds.map(() => ({ u: 0.123, v: 0.456 }))
  }
}

function stamped(uvs: { u: number; v: number }[]) {
  return uvs.every(uv => uv.u === 0.123 && uv.v === 0.456)
}

describe('unwrap targets', () => {
  let pinia: ReturnType<typeof createPinia>
  beforeEach(() => { pinia = createPinia(); setActivePinia(pinia) })
  afterEach(() => disposePinia(pinia))

  it('unwraps the whole object in object mode even if a face id is left over', () => {
    const project = useProjectStore()
    const tools = useToolStore()
    tools.selectMode = 'object'
    tools.appMode = 'model'
    stampActive()
    project.selectedFaceIds = [project.activeMesh!.faces[0].id]
    project.performCylinderUnwrap()
    expect(project.activeMesh!.faces.every(face => !stamped(face.uvs))).toBe(true)
  })

  it('unwraps every selected face and no others in face mode', () => {
    const project = useProjectStore()
    const tools = useToolStore()
    tools.selectMode = 'face'
    stampActive()
    const faces = project.activeMesh!.faces
    project.selectedFaceIds = [faces[0].id, faces[3].id]
    project.performBoxUnwrap()
    const updated = project.activeMesh!.faces
    expect(stamped(updated[0].uvs)).toBe(false)
    expect(stamped(updated[3].uvs)).toBe(false)
    expect(stamped(updated[1].uvs)).toBe(true)
    expect(stamped(updated[2].uvs)).toBe(true)
  })

  it('unwraps every face touching the selected vertices', () => {
    const project = useProjectStore()
    const tools = useToolStore()
    tools.selectMode = 'vertex'
    stampActive()
    const mesh = project.activeMesh!
    const vertexId = mesh.vertices[0].id
    project.selectedVertexIds = [vertexId]
    project.performPlanarUnwrap('x')
    for (const face of project.activeMesh!.faces) {
      const incident = face.vertexIds.includes(vertexId)
      expect(stamped(face.uvs)).toBe(!incident)
    }
  })

  it('unwraps every selected object', () => {
    const project = useProjectStore()
    const tools = useToolStore()
    tools.selectMode = 'object'
    tools.appMode = 'model'
    const second = createCube('Cube_2')
    const third = createCube('Cube_3')
    for (const mesh of [project.activeMesh!, second, third]) {
      for (const face of mesh.faces) face.uvs = face.vertexIds.map(() => ({ u: 0.123, v: 0.456 }))
    }
    project.meshes.push(second, third)
    project.selectedMeshIds = [project.activeMeshId, second.id]
    project.performSphereUnwrap()
    const byId = new Map(project.meshes.map(mesh => [mesh.id, mesh]))
    expect(byId.get(project.activeMeshId)!.faces.every(face => !stamped(face.uvs))).toBe(true)
    expect(byId.get(second.id)!.faces.every(face => !stamped(face.uvs))).toBe(true)
    expect(byId.get(third.id)!.faces.every(face => stamped(face.uvs))).toBe(true)
  })

  it('an empty face list unwraps the whole active mesh', () => {
    const project = useProjectStore()
    const tools = useToolStore()
    tools.selectMode = 'face'
    stampActive()
    project.selectedFaceIds = [project.activeMesh!.faces[0].id]
    project.performConeUnwrap([])
    expect(project.activeMesh!.faces.every(face => !stamped(face.uvs))).toBe(true)
  })
})
