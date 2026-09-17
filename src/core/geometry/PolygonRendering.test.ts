import { describe, expect, it } from 'vitest'
import { Triangle, Vector3 } from 'three'
import { createCube } from './Primitives'
import { faceTriIndexSets, meshToThreeGeometry, updateThreeGeometryAttributes } from './Converters'
import { MeshBridge } from '../mesh/MeshBridge'

function polygon(points: number[][]) {
  const mesh = createCube('Polygon', 2)
  mesh.vertices = points.map((p, i) => ({ id: `v${i}`, position: { x:p[0], y:p[1], z:p[2] ?? 0 } }))
  mesh.faces = [{ id:'polygon', vertexIds:mesh.vertices.map(v => v.id), uvs:points.map(p => ({u:p[0],v:p[1]})), materialIndex:0 }]
  return mesh
}
const area = (geometry: ReturnType<typeof meshToThreeGeometry>['geometry']) => {
  const position = geometry.getAttribute('position')
  let area = 0
  for (let i = 0; i < position.count; i += 3) area += new Triangle(...[0,1,2].map(j => new Vector3().fromBufferAttribute(position,i+j)) as [Vector3,Vector3,Vector3]).getArea()
  return area
}

describe('polygon rendering', () => {
  it('renders a concave n-gon consistently in the surface, selection and kernel preview', () => {
    const mesh = polygon([[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]])
    const bundle = meshToThreeGeometry(mesh, ['polygon'])
    const kernel = MeshBridge.meshObjectToEditableMesh(mesh).mesh
    const preview = MeshBridge.editableMeshToThreeGeometry(kernel)
    expect(area(bundle.geometry)).toBeCloseTo(5)
    expect(area(bundle.selectedFacesGeometry)).toBeCloseTo(5)
    expect(area(preview)).toBeCloseTo(5)
    expect(bundle.faceIndexMap).toEqual([0,0,0,0])
    expect(preview.userData.renderMapping.triangleToFace).toEqual([1,1,1,1])
    expect(bundle.wireframeGeometry.getAttribute('position').count).toBe(12)
    expect(kernel.edges.size).toBe(6)
  })

  it('preserves winding for reversed polygons on all dominant projection planes', () => {
    for (const axis of [0,1,2]) for (const reversed of [false,true]) {
      const points = [[0,0],[3,0],[3,1],[1,1],[1,3],[0,3]].map(([a,b]) => axis === 0 ? [0,a,b] : axis === 1 ? [a,0,b] : [a,b,0])
      if (reversed) points.reverse()
      const mesh = polygon(points), bundle = meshToThreeGeometry(mesh)
      const position = bundle.geometry.getAttribute('position'), normal = bundle.geometry.getAttribute('normal')
      for (let i = 0; i < position.count; i += 3) {
        const ps = [0,1,2].map(j => new Vector3().fromBufferAttribute(position,i+j))
        expect(new Triangle(...ps as [Vector3,Vector3,Vector3]).getNormal(new Vector3()).dot(new Vector3().fromBufferAttribute(normal,i))).toBeGreaterThan(0.99)
      }
    }
  })

  it('keeps one quad and a stable diagonal through tiny movements', () => {
    const mesh = polygon([[0,0],[1,0],[1,1],[0,1]])
    const before = faceTriIndexSets(mesh.vertices)
    for (const z of [-0.0001,0.0001]) {
      mesh.vertices[2].position.z = z
      expect(faceTriIndexSets(mesh.vertices)).toEqual(before)
    }
    expect(mesh.faces).toHaveLength(1)
  })

  it('draws each real cube edge once, without triangle diagonals', () => {
    const bundle = meshToThreeGeometry(createCube('Cube',2))
    expect(bundle.wireframeGeometry.getAttribute('position').count).toBe(24)
  })

  it('updates flat polygon normals and bounds after positions move', () => {
    const mesh = polygon([[0,0],[1,0],[1,1],[0,1]])
    const { geometry } = meshToThreeGeometry(mesh)
    mesh.vertices[2].position.z = 1
    expect(updateThreeGeometryAttributes(mesh, geometry)).toBe(true)
    const normals = geometry.getAttribute('normal')
    const first = new Vector3().fromBufferAttribute(normals,0)
    expect(first.z).toBeLessThan(1)
    for (let i = 1; i < normals.count; i++) expect(new Vector3().fromBufferAttribute(normals,i).distanceTo(first)).toBeLessThan(1e-6)
    expect(geometry.boundingBox!.max.z).toBe(1)
  })

  it('rejects changed corner mappings before touching existing buffers', () => {
    const mesh = polygon([[0,0],[1,0],[1,1],[0,1]])
    const { geometry } = meshToThreeGeometry(mesh)
    const before = Array.from(geometry.getAttribute('position').array)
    mesh.faces[0].vertexIds.reverse()
    expect(updateThreeGeometryAttributes(mesh, geometry)).toBe(false)
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(before)
  })
})
