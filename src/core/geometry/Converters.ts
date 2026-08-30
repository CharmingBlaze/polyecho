import * as THREE from 'three'
import { MeshObject, Vertex } from '../../types/mesh'
import { Bone } from '../../types/animation'
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

export function computeBoneWorldMatrix(bone: Bone, allBones: Bone[]): THREE.Matrix4 {
  const pivot = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z)
  const translation = new THREE.Vector3(bone.position.x, bone.position.y, bone.position.z)
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(bone.rotation.x),
    THREE.MathUtils.degToRad(bone.rotation.y),
    THREE.MathUtils.degToRad(bone.rotation.z)
  )
  const scale = new THREE.Vector3(bone.scale.x, bone.scale.y, bone.scale.z)

  const toPivot = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)
  const trs = new THREE.Matrix4().compose(pivot.clone().add(translation), new THREE.Quaternion().setFromEuler(euler), scale)
  const localMat = new THREE.Matrix4().multiplyMatrices(trs, toPivot)

  if (bone.parentId) {
    const parent = allBones.find(b => b.id === bone.parentId)
    if (parent) {
      const parentMat = computeBoneWorldMatrix(parent, allBones)
      return new THREE.Matrix4().multiplyMatrices(parentMat, localMat)
    }
  }
  return localMat
}

export function evaluateSkinning(mesh: MeshObject, vertices: Vertex[], bones: Bone[]): Vertex[] {
  if (!bones || bones.length === 0) return vertices

  const boneMatrixMap = new Map<string, THREE.Matrix4>()
  for (const b of bones) {
    boneMatrixMap.set(b.id, computeBoneWorldMatrix(b, bones))
  }

  const deformed: Vertex[] = []
  const meshPos = new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z)

  for (const v of vertices) {
    if (!v.boneWeights || Object.keys(v.boneWeights).length === 0) {
      deformed.push(v)
      continue
    }

    const worldPos = new THREE.Vector3(meshPos.x + v.position.x, meshPos.y + v.position.y, meshPos.z + v.position.z)
    const accumPos = new THREE.Vector3(0, 0, 0)
    let totalWeight = 0

    for (const [bId, weight] of Object.entries(v.boneWeights)) {
      const mat = boneMatrixMap.get(bId)
      if (mat && weight > 0.001) {
        const transformed = worldPos.clone().applyMatrix4(mat)
        accumPos.addScaledVector(transformed, weight)
        totalWeight += weight
      }
    }

    if (totalWeight > 0) {
      if (totalWeight < 0.999) {
        accumPos.addScaledVector(worldPos, 1 - totalWeight)
      }
      const localPos = accumPos.sub(meshPos)
      deformed.push({
        ...v,
        position: { x: Number(localPos.x.toFixed(4)), y: Number(localPos.y.toFixed(4)), z: Number(localPos.z.toFixed(4)) }
      })
    } else {
      deformed.push(v)
    }
  }
  return deformed
}

export function meshToThreeGeometry(
  mesh: MeshObject, 
  selectedFaceIds: string[] = [],
  selectedEdgeIds: string[] = [],
  globalShadeMode: 'flat' | 'smooth' = 'flat',
  skeletalDeformContext?: { isPoseMode: boolean; bones: Bone[] }
): GeometryBundle {
  let { vertices: evalVertices, faces: evalFaces } = evaluateModifiers(mesh)

  if (skeletalDeformContext && skeletalDeformContext.isPoseMode && skeletalDeformContext.bones.length > 0) {
    evalVertices = evaluateSkinning(mesh, evalVertices, skeletalDeformContext.bones)
  }

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
