import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../../geometry/Primitives'
import { meshObjectWorldMatrix } from '../../geometry/MeshTransform'
import { MeshBridge } from '../MeshBridge'
import { ExtrudeKernel } from './ExtrudeKernel'
import { ExtrudeOperator } from '../../operators/ExtrudeOperator'
import type { OperatorContext } from '../../operators/ModalOperator'

function frontFaceId(label: string) {
  const cube = createCube(label, 2)
  const br = MeshBridge.meshObjectToEditableMesh(cube)
  return { cube, br, faceId: br.strToNumFaceId.get(cube.faces[0].id)! }
}

describe('ExtrudeKernel', () => {
  it('extrudes a cube face along its normal with side walls and uvs', () => {
    const { br, faceId } = frontFaceId('Cube')
    const face = br.mesh.faces.get(faceId)!
    const beforeZ = face.vertexIds.map((id) => br.mesh.vertices.get(id)!.position.z)
    const beforeFaces = br.mesh.faces.size
    const beforeVerts = br.mesh.vertices.size

    const result = ExtrudeKernel.extrudeFaces(br.mesh, [faceId])
    expect(result.newVertexIds).toHaveLength(4)
    expect(br.mesh.vertices.size).toBe(beforeVerts + 4)
    expect(br.mesh.faces.size).toBe(beforeFaces + 4)

    const offset = result.regionNormal.clone().multiplyScalar(0.5)
    for (const id of result.newVertexIds) {
      br.mesh.vertices.get(id)!.position.add(offset)
    }
    const cap = br.mesh.faces.get(faceId)!
    const afterZ = cap.vertexIds.map((id) => br.mesh.vertices.get(id)!.position.z)
    const meanBefore = beforeZ.reduce((a, b) => a + b, 0) / beforeZ.length
    const meanAfter = afterZ.reduce((a, b) => a + b, 0) / afterZ.length
    expect(meanAfter).toBeGreaterThan(meanBefore + 0.2)

    for (const f of br.mesh.faces.values()) {
      expect(f.uvs.length).toBe(f.vertexIds.length)
      expect(f.vertexIds.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('individual extrude duplicates shared edges between two faces', () => {
    const src = createCube('S', 2)
    const br = MeshBridge.meshObjectToEditableMesh(src)
    const id0 = br.strToNumFaceId.get(src.faces[0].id)!
    const id1 = br.strToNumFaceId.get(src.faces[4].id)!
    const region = ExtrudeKernel.extrude(br.mesh, { faceIds: [id0, id1], individual: false })

    const src2 = createCube('S2', 2)
    const br2 = MeshBridge.meshObjectToEditableMesh(src2)
    const i0 = br2.strToNumFaceId.get(src2.faces[0].id)!
    const i1 = br2.strToNumFaceId.get(src2.faces[4].id)!
    const indiv = ExtrudeKernel.extrude(br2.mesh, { faceIds: [i0, i1], individual: true })
    expect(indiv.newVertexIds.length).toBeGreaterThan(region.newVertexIds.length)
  })

  it('extrudes an edge into a quad', () => {
    const { br } = frontFaceId('E')
    const edge = [...br.mesh.edges.values()][0]!
    const beforeFaces = br.mesh.faces.size
    const result = ExtrudeKernel.extrudeEdges(br.mesh, [edge.id])
    expect(result.newVertexIds).toHaveLength(2)
    expect(br.mesh.faces.size).toBe(beforeFaces + 1)
    expect(result.extrudedFaceIds).toHaveLength(1)
  })
})

describe('ExtrudeOperator', () => {
  it('keeps extruded verts in local space on a translated cube at zero pull', () => {
    const cube = createCube('Cube', 2)
    const br = MeshBridge.meshObjectToEditableMesh(cube)
    const faceId = br.strToNumFaceId.get(cube.faces[0].id)!
    const orig = br.mesh.faces.get(faceId)!.vertexIds.map((id) => br.mesh.vertices.get(id)!.position.clone())

    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 800 })
    Object.defineProperty(el, 'clientHeight', { value: 600 })
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) })

    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(6, 6, 6)
    camera.lookAt(0, 1, 0)
    camera.updateMatrixWorld()

    const op = new ExtrudeOperator()
    const ctx: OperatorContext = {
      mesh: br.mesh,
      selectedVertIds: [],
      selectedFaceIds: [faceId],
      selectedEdgeIds: [],
      selectedMeshIds: [cube.id],
      isObjectMode: false,
      camera,
      viewportElement: el,
      pivotMode: 'MEDIAN',
      objectMatrix: meshObjectWorldMatrix(cube),
      onUpdatePreview: () => {},
      onCommit: () => {},
      onCancel: () => {},
    }
    op.begin(ctx, { x: 400, y: 300 })

    const cap = br.mesh.faces.get(faceId)!
    for (const id of cap.vertexIds) {
      const p = br.mesh.vertices.get(id)!.position
      expect(orig.some((q) => q.distanceTo(p) < 0.05)).toBe(true)
    }
  })
})
