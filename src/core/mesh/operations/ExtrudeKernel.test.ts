import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube, createCylinder } from '../../geometry/Primitives'
import { EditableMesh } from '../MeshKernel'
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
      expect(f.vertexIds.length).toBe(4)
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

  it('keeps a triangle, a quad, and an n-gon, and adds only quad walls', () => {
    const mesh = new EditableMesh()
    const tri = [
      mesh.addVertex(new THREE.Vector3(0, 0, 0)).id,
      mesh.addVertex(new THREE.Vector3(1, 0, 0)).id,
      mesh.addVertex(new THREE.Vector3(0, 1, 0)).id,
    ]
    const triFace = mesh.addFace(tri)!.id
    const quad = [
      mesh.addVertex(new THREE.Vector3(0, 2, 0)).id,
      mesh.addVertex(new THREE.Vector3(1, 2, 0)).id,
      mesh.addVertex(new THREE.Vector3(1, 3, 0)).id,
      mesh.addVertex(new THREE.Vector3(0, 3, 0)).id,
    ]
    const quadFace = mesh.addFace(quad)!.id
    const hex = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2
      return mesh.addVertex(new THREE.Vector3(Math.cos(a), 5, Math.sin(a))).id
    })
    const hexFace = mesh.addFace(hex)!.id

    const result = ExtrudeKernel.extrudeFaces(mesh, [triFace, quadFace, hexFace])
    expect(mesh.faces.get(triFace)!.vertexIds).toHaveLength(3)
    expect(mesh.faces.get(quadFace)!.vertexIds).toHaveLength(4)
    expect(mesh.faces.get(hexFace)!.vertexIds).toHaveLength(6)
    const caps = new Set([triFace, quadFace, hexFace])
    for (const face of mesh.faces.values()) {
      if (!caps.has(face.id)) expect(face.vertexIds).toHaveLength(4)
    }
    expect(result.extrudedFaceIds).toEqual([triFace, quadFace, hexFace])
  })

  it('extrudes a triangulated flat patch as one outline, on a cube or any other mesh', () => {
    const mesh = new EditableMesh()
    const ids = [
      mesh.addVertex(new THREE.Vector3(0, 0, 0)).id,
      mesh.addVertex(new THREE.Vector3(2, 0, 0)).id,
      mesh.addVertex(new THREE.Vector3(2, 0, 2)).id,
      mesh.addVertex(new THREE.Vector3(0, 0, 2)).id,
      mesh.addVertex(new THREE.Vector3(1, 0, 1)).id,
    ]
    const fan = [
      mesh.addFace([ids[4]!, ids[0]!, ids[1]!])!.id,
      mesh.addFace([ids[4]!, ids[1]!, ids[2]!])!.id,
      mesh.addFace([ids[4]!, ids[2]!, ids[3]!])!.id,
      mesh.addFace([ids[4]!, ids[3]!, ids[0]!])!.id,
    ]
    const result = ExtrudeKernel.extrudeFaces(mesh, fan)
    expect(result.extrudedFaceIds).toHaveLength(1)
    const cap = mesh.faces.get(result.extrudedFaceIds[0]!)!
    expect(cap.vertexIds).toHaveLength(4)
    expect([...mesh.vertices.values()].some((v) => Math.abs(v.position.x - 1) < 1e-6 && Math.abs(v.position.z - 1) < 1e-6)).toBe(false)
    for (const face of mesh.faces.values()) {
      if (face.id === cap.id) continue
      expect(face.vertexIds).toHaveLength(4)
    }
    expect(mesh.faces.size).toBe(5)
  })

  it('extrudes a cylinder cap as one polygon and leaves the curved sides as quads', () => {
    const cyl = createCylinder('Cyl', 1, 2, 8)
    const br = MeshBridge.meshObjectToEditableMesh(cyl)
    const top = [...br.mesh.faces.values()].filter((face) =>
      face.vertexIds.every((id) => br.mesh.vertices.get(id)!.position.y > 0.5)
    ).map((face) => face.id)
    expect(top).toHaveLength(1)
    expect(br.mesh.faces.get(top[0]!)!.vertexIds).toHaveLength(8)

    const result = ExtrudeKernel.extrudeFaces(br.mesh, top)
    expect(result.extrudedFaceIds).toHaveLength(1)
    const cap = br.mesh.faces.get(result.extrudedFaceIds[0]!)!
    expect(cap.vertexIds).toHaveLength(8)
    expect(result.newVertexIds).toHaveLength(8)
    for (const face of br.mesh.faces.values()) {
      expect(face.vertexIds.length === 4 || face.vertexIds.length === 8).toBe(true)
    }
  })

  it('keeps a bent pair of faces instead of flattening them', () => {
    const src = createCube('Bent', 2)
    const br = MeshBridge.meshObjectToEditableMesh(src)
    const id0 = br.strToNumFaceId.get(src.faces[0].id)!
    const id1 = br.strToNumFaceId.get(src.faces[2].id)!
    const result = ExtrudeKernel.extrude(br.mesh, { faceIds: [id0, id1] })
    expect(result.extrudedFaceIds).toEqual(expect.arrayContaining([id0, id1]))
    expect(br.mesh.faces.get(id0)!.vertexIds).toHaveLength(4)
    expect(br.mesh.faces.get(id1)!.vertexIds).toHaveLength(4)
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
