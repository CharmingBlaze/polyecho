import * as THREE from 'three'
import { MeshObject, Vertex } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'
import { getMeshEdges } from './EdgeUtils'
import { evaluateModifiers } from './Modifiers'

export interface GeometryBundle {
  geometry: THREE.BufferGeometry
  wireframeGeometry: THREE.BufferGeometry
  vertexPointsGeometry: THREE.BufferGeometry
  selectedFacesGeometry: THREE.BufferGeometry
  selectedEdgesGeometry: THREE.BufferGeometry
  edgeLinesGeometry: THREE.BufferGeometry
  faceIndexMap: number[]
  vertexIndexMap: string[]
}

export function meshToThreeGeometry(
  mesh: MeshObject, 
  selectedFaceIds: string[] = [],
  selectedEdgeIds: string[] = [],
  globalShadeMode: 'flat' | 'smooth' = 'flat'
): GeometryBundle {
  const { vertices: evalVertices, faces: evalFaces } = evaluateModifiers(mesh)

  const vertMap = new Map<string, Vertex>()
  for (const v of evalVertices) {
    vertMap.set(v.id, v)
  }

  const isSmooth = globalShadeMode === 'smooth' || mesh.shadeMode === 'smooth'

  // Precompute angle-weighted smooth vertex normals if smooth shading is enabled
  const vertNormalMap = new Map<string, THREE.Vector3>()
  if (isSmooth) {
    for (const v of evalVertices) {
      vertNormalMap.set(v.id, new THREE.Vector3(0, 0, 0))
    }
    for (const face of evalFaces) {
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (faceVerts.length < 3) continue

      const fn = computeFaceNormal(faceVerts.map(v => v.position))

      const n = faceVerts.length
      for (let i = 0; i < n; i++) {
        const prev = faceVerts[(i - 1 + n) % n].position
        const curr = faceVerts[i].position
        const next = faceVerts[(i + 1) % n].position

        const e1 = new THREE.Vector3(prev.x - curr.x, prev.y - curr.y, prev.z - curr.z).normalize()
        const e2 = new THREE.Vector3(next.x - curr.x, next.y - curr.y, next.z - curr.z).normalize()
        const dot = Math.max(-1, Math.min(1, e1.dot(e2)))
        const angle = Math.acos(dot)

        const vNormal = vertNormalMap.get(faceVerts[i].id)
        if (vNormal) {
          const fnVec = new THREE.Vector3(fn.x, fn.y, fn.z)
          vNormal.addScaledVector(fnVec, angle)
        }
      }
    }
    for (const [, vn] of vertNormalMap) {
      if (vn.lengthSq() > 1e-6) vn.normalize()
      else vn.set(0, 1, 0)
    }
  }

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const faceIndexMap: number[] = []

  const wireframePositions: number[] = []
  const selectedFacesPositions: number[] = []
  const selectedFacesNormals: number[] = []

  for (let fIdx = 0; fIdx < evalFaces.length; fIdx++) {
    const face = evalFaces[fIdx]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const faceNormal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
    const isFaceSelected = selectedFaceIds.includes(face.id)

    // Build wireframe edges
    for (let i = 0; i < faceVerts.length; i++) {
      const next = (i + 1) % faceVerts.length
      const p1 = faceVerts[i].position
      const p2 = faceVerts[next].position
      wireframePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
    }

    // Triangulate polygon (Fan triangulation)
    for (let i = 1; i < faceVerts.length - 1; i++) {
      const v0 = faceVerts[0]
      const v1 = faceVerts[i]
      const v2 = faceVerts[i + 1]

      const uv0 = face.uvs[0] || { u: 0, v: 0 }
      const uv1 = face.uvs[i] || { u: 0, v: 0 }
      const uv2 = face.uvs[i + 1] || { u: 0, v: 0 }

      const triVerts = [v0, v1, v2]
      const triUVs = [uv0, uv1, uv2]

      for (let j = 0; j < 3; j++) {
        const v = triVerts[j]
        const uv = triUVs[j]

        positions.push(v.position.x, v.position.y, v.position.z)

        if (isSmooth && vertNormalMap.has(v.id)) {
          const vn = vertNormalMap.get(v.id)!
          normals.push(vn.x, vn.y, vn.z)
        } else {
          normals.push(faceNormal.x, faceNormal.y, faceNormal.z)
        }

        uvs.push(uv.u, uv.v)

        const c = new THREE.Color(v.color || '#ffffff')
        colors.push(c.r, c.g, c.b)

        if (isFaceSelected) {
          selectedFacesPositions.push(v.position.x, v.position.y, v.position.z)
          selectedFacesNormals.push(faceNormal.x, faceNormal.y, faceNormal.z)
        }
      }

      faceIndexMap.push(fIdx)
    }
  }

  // Selected Edges Highlight lines
  const selectedEdgesPositions: number[] = []
  if (selectedEdgeIds.length > 0) {
    const allEdges = getMeshEdges(mesh)
    for (const edge of allEdges) {
      if (selectedEdgeIds.includes(edge.id)) {
        const v1 = vertMap.get(edge.v1)
        const v2 = vertMap.get(edge.v2)
        if (v1 && v2) {
          selectedEdgesPositions.push(
            v1.position.x, v1.position.y, v1.position.z,
            v2.position.x, v2.position.y, v2.position.z
          )
        }
      }
    }
  }

  const selectedEdgesGeometry = new THREE.BufferGeometry()
  if (selectedEdgesPositions.length > 0) {
    selectedEdgesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedEdgesPositions, 3))
  }

  // Main mesh geometry
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  // Wireframe lines
  const wireframeGeometry = new THREE.BufferGeometry()
  wireframeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wireframePositions, 3))

  // Selected faces overlay
  const selectedFacesGeometry = new THREE.BufferGeometry()
  if (selectedFacesPositions.length > 0) {
    selectedFacesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedFacesPositions, 3))
    selectedFacesGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(selectedFacesNormals, 3))
  }

  // Vertex point handles
  const vertexPointsPositions: number[] = []
  const vertexPointsColors: number[] = []
  const vertexIndexMap: string[] = []

  for (const v of mesh.vertices) {
    vertexPointsPositions.push(v.position.x, v.position.y, v.position.z)
    vertexIndexMap.push(v.id)
    if (v.selected) {
      vertexPointsColors.push(1.0, 0.65, 0.0) // Bright Amber for selected
    } else {
      vertexPointsColors.push(0.2, 0.8, 1.0) // Cyan blue for unselected
    }
  }

  const vertexPointsGeometry = new THREE.BufferGeometry()
  vertexPointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertexPointsPositions, 3))
  vertexPointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexPointsColors, 3))

  const edgeLinesGeometry = wireframeGeometry.clone()

  return {
    geometry,
    wireframeGeometry,
    vertexPointsGeometry,
    selectedFacesGeometry,
    selectedEdgesGeometry,
    edgeLinesGeometry,
    faceIndexMap,
    vertexIndexMap
  }
}
