import * as THREE from 'three'
import { MeshObject, Vertex, Face, MeshShadeMode } from '../../types/mesh'
import { Bone } from '../../types/animation'
import { computeFaceNormal } from '../../utils/math'
import { getMeshEdges } from './EdgeUtils'
import { evaluateModifiers } from './Modifiers'
import { ensureMeshUVs } from './UVUnwrap'

export interface GeometryBundle {
  geometry: THREE.BufferGeometry
  wireframeGeometry: THREE.BufferGeometry
  vertexPointsGeometry: THREE.BufferGeometry
  selectedFacesGeometry: THREE.BufferGeometry
  selectedEdgesGeometry: THREE.BufferGeometry
  edgeLinesGeometry: THREE.BufferGeometry
  faceIndexMap: number[]
  paintFaceMap: Array<{ id: string; vertexIds: string[]; uvs: Array<{ u: number; v: number }> }>
  vertexIndexMap: string[]
}

export function computeBoneWorldMatrix(bone: Bone, allBones: Bone[], restPose = false): THREE.Matrix4 {
  const pivot = new THREE.Vector3(bone.head.x, bone.head.y, bone.head.z)
  const translation = restPose
    ? new THREE.Vector3(0, 0, 0)
    : new THREE.Vector3(bone.position.x, bone.position.y, bone.position.z)
  const euler = restPose
    ? new THREE.Euler(0, 0, 0)
    : new THREE.Euler(
        THREE.MathUtils.degToRad(bone.rotation.x),
        THREE.MathUtils.degToRad(bone.rotation.y),
        THREE.MathUtils.degToRad(bone.rotation.z)
      )
  const scale = restPose
    ? new THREE.Vector3(1, 1, 1)
    : new THREE.Vector3(bone.scale.x, bone.scale.y, bone.scale.z)

  const toPivot = new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)
  const trs = new THREE.Matrix4().compose(pivot.clone().add(translation), new THREE.Quaternion().setFromEuler(euler), scale)
  const localMat = new THREE.Matrix4().multiplyMatrices(trs, toPivot)

  if (bone.parentId) {
    const parent = allBones.find(b => b.id === bone.parentId)
    if (parent) {
      const parentMat = computeBoneWorldMatrix(parent, allBones, restPose)
      return new THREE.Matrix4().multiplyMatrices(parentMat, localMat)
    }
  }
  return localMat
}

/** Linear-blend skin matrix: posed world × inverse bind (rest). */
export function computeBoneSkinMatrix(bone: Bone, allBones: Bone[]): THREE.Matrix4 {
  const world = computeBoneWorldMatrix(bone, allBones, false)
  const rest = computeBoneWorldMatrix(bone, allBones, true)
  return world.multiply(rest.invert())
}

export function evaluateSkinning(mesh: MeshObject, vertices: Vertex[], bones: Bone[]): Vertex[] {
  if (!bones || bones.length === 0) return vertices

  const boneMatrixMap = new Map<string, THREE.Matrix4>()
  for (const b of bones) {
    boneMatrixMap.set(b.id, computeBoneSkinMatrix(b, bones))
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

export function weightToHeatmapColor(weight: number): THREE.Color {
  const w = Math.max(0, Math.min(1, weight))
  const color = new THREE.Color()
  if (w <= 0.0001) {
    // 0.0: Deep Navy/Blue (unweighted)
    color.setRGB(0.04, 0.12, 0.65)
  } else if (w <= 0.25) {
    // 0.0 -> 0.25: Deep Blue -> Cyan
    const t = w / 0.25
    color.setRGB(
      0.04 * (1 - t) + 0.0 * t,
      0.12 * (1 - t) + 0.9 * t,
      0.65 * (1 - t) + 0.95 * t
    )
  } else if (w <= 0.5) {
    // 0.25 -> 0.5: Cyan -> Green
    const t = (w - 0.25) / 0.25
    color.setRGB(
      0.0,
      0.9 * (1 - t) + 0.95 * t,
      0.95 * (1 - t) + 0.05 * t
    )
  } else if (w <= 0.75) {
    // 0.5 -> 0.75: Green -> Yellow
    const t = (w - 0.5) / 0.25
    color.setRGB(
      1.0 * t,
      0.95 * (1 - t) + 0.9 * t,
      0.05 * (1 - t) + 0.0 * t
    )
  } else {
    // 0.75 -> 1.0: Yellow -> Crimson Red
    const t = (w - 0.75) / 0.25
    color.setRGB(
      1.0,
      0.9 * (1 - t) + 0.05 * t,
      0.0
    )
  }
  return color
}

export const DEFAULT_AUTO_SMOOTH_ANGLE = 30

export function resolveMeshShadeMode(
  mesh: MeshObject,
  globalShadeMode: 'flat' | 'smooth' = 'flat'
): MeshShadeMode {
  if (mesh.shadeMode === 'auto' || mesh.shadeMode === 'smooth' || mesh.shadeMode === 'flat') {
    return mesh.shadeMode
  }
  return globalShadeMode
}

function shadeEdgeKey(a: string, b: string) {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

function addAngleWeightedNormal(
  faceVerts: Vertex[],
  faceNormal: THREE.Vector3,
  vertIndex: number,
  target: THREE.Vector3
) {
  const n = faceVerts.length
  const prev = faceVerts[(vertIndex - 1 + n) % n].position
  const curr = faceVerts[vertIndex].position
  const next = faceVerts[(vertIndex + 1) % n].position
  const e1 = new THREE.Vector3(prev.x - curr.x, prev.y - curr.y, prev.z - curr.z).normalize()
  const e2 = new THREE.Vector3(next.x - curr.x, next.y - curr.y, next.z - curr.z).normalize()
  const dot = Math.max(-1, Math.min(1, e1.dot(e2)))
  target.addScaledVector(faceNormal, Math.acos(dot))
}

/** Blender Auto Smooth: split vertex normals across edges sharper than `angleDeg`. */
function buildAutoSmoothCornerNormals(
  evalFaces: Face[],
  vertMap: Map<string, Vertex>,
  angleDeg: number
): Map<string, THREE.Vector3> {
  const faceNormals: THREE.Vector3[] = []
  const faceVertLists: Vertex[][] = []
  for (const face of evalFaces) {
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    faceVertLists.push(faceVerts)
    if (faceVerts.length < 3) {
      faceNormals.push(new THREE.Vector3(0, 1, 0))
      continue
    }
    const fn = computeFaceNormal(faceVerts.map(v => v.position))
    faceNormals.push(new THREE.Vector3(fn.x, fn.y, fn.z))
  }

  const edgeFaces = new Map<string, number[]>()
  for (let fi = 0; fi < evalFaces.length; fi++) {
    const ids = evalFaces[fi].vertexIds
    for (let i = 0; i < ids.length; i++) {
      const key = shadeEdgeKey(ids[i], ids[(i + 1) % ids.length])
      const arr = edgeFaces.get(key)
      if (arr) arr.push(fi)
      else edgeFaces.set(key, [fi])
    }
  }

  const sharp = new Set<string>()
  const cosLimit = Math.cos(THREE.MathUtils.degToRad(angleDeg))
  for (const [key, fis] of edgeFaces) {
    if (fis.length !== 2) continue
    const dot = Math.max(-1, Math.min(1, faceNormals[fis[0]].dot(faceNormals[fis[1]])))
    if (dot < cosLimit) sharp.add(key)
  }

  const result = new Map<string, THREE.Vector3>()
  for (let fi = 0; fi < evalFaces.length; fi++) {
    const face = evalFaces[fi]
    const faceVerts = faceVertLists[fi]
    if (faceVerts.length < 3) continue
    for (let vi = 0; vi < face.vertexIds.length; vi++) {
      const vid = face.vertexIds[vi]
      const cacheKey = `${face.id}:${vid}`
      if (result.has(cacheKey)) continue

      const acc = new THREE.Vector3()
      const visited = new Set<number>()
      const stack = [fi]
      while (stack.length) {
        const cur = stack.pop()!
        if (visited.has(cur)) continue
        visited.add(cur)
        const curFace = evalFaces[cur]
        const curVerts = faceVertLists[cur]
        const idx = curFace.vertexIds.indexOf(vid)
        if (idx === -1 || curVerts.length < 3) continue
        addAngleWeightedNormal(curVerts, faceNormals[cur], idx, acc)

        const n = curFace.vertexIds.length
        const prevId = curFace.vertexIds[(idx - 1 + n) % n]
        const nextId = curFace.vertexIds[(idx + 1) % n]
        for (const other of [prevId, nextId]) {
          const ek = shadeEdgeKey(vid, other)
          if (sharp.has(ek)) continue
          const adj = edgeFaces.get(ek)
          if (!adj) continue
          for (const afi of adj) {
            if (!visited.has(afi) && evalFaces[afi].vertexIds.includes(vid)) stack.push(afi)
          }
        }
      }
      if (acc.lengthSq() > 1e-6) acc.normalize()
      else acc.copy(faceNormals[fi])
      result.set(cacheKey, acc)
    }
  }
  return result
}

export function meshToThreeGeometry(
  mesh: MeshObject, 
  selectedFaceIds: string[] = [],
  selectedEdgeIds: string[] = [],
  globalShadeMode: 'flat' | 'smooth' = 'flat',
  skeletalDeformContext?: { isPoseMode: boolean; bones: Bone[] },
  weightPaintContext?: { isWeightPaint: boolean; activeBoneId?: string }
): GeometryBundle {
  ensureMeshUVs(mesh)
  let { vertices: evalVertices, faces: evalFaces } = evaluateModifiers(mesh)

  if (skeletalDeformContext && skeletalDeformContext.isPoseMode && skeletalDeformContext.bones.length > 0) {
    evalVertices = evaluateSkinning(mesh, evalVertices, skeletalDeformContext.bones)
  }

  const vertMap = new Map<string, Vertex>()
  for (const v of evalVertices) {
    vertMap.set(v.id, v)
  }

  const shade = resolveMeshShadeMode(mesh, globalShadeMode)

  const vertNormalMap = new Map<string, THREE.Vector3>()
  if (shade === 'smooth') {
    for (const v of evalVertices) {
      vertNormalMap.set(v.id, new THREE.Vector3(0, 0, 0))
    }
    for (const face of evalFaces) {
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (faceVerts.length < 3) continue

      const fn = computeFaceNormal(faceVerts.map(v => v.position))
      const fnVec = new THREE.Vector3(fn.x, fn.y, fn.z)
      for (let i = 0; i < faceVerts.length; i++) {
        const vNormal = vertNormalMap.get(faceVerts[i].id)
        if (vNormal) addAngleWeightedNormal(faceVerts, fnVec, i, vNormal)
      }
    }
    for (const [, vn] of vertNormalMap) {
      if (vn.lengthSq() > 1e-6) vn.normalize()
      else vn.set(0, 1, 0)
    }
  }

  const autoCornerNormals = shade === 'auto'
    ? buildAutoSmoothCornerNormals(
      evalFaces,
      vertMap,
      mesh.autoSmoothAngle ?? DEFAULT_AUTO_SMOOTH_ANGLE
    )
    : null

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const faceIndexMap: number[] = []
  const paintFaceMap: GeometryBundle['paintFaceMap'] = []

  const wireframePositions: number[] = []
  const selectedFacesPositions: number[] = []
  const selectedFacesNormals: number[] = []

  for (let fIdx = 0; fIdx < evalFaces.length; fIdx++) {
    const face = evalFaces[fIdx]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const faceNormal = computeFaceNormal(faceVerts.map(v => v.position))
    const isFaceSelected = selectedFaceIds.includes(face.id)

    // Build wireframe edges
    for (let i = 0; i < faceVerts.length; i++) {
      const next = (i + 1) % faceVerts.length
      const p1 = faceVerts[i].position
      const p2 = faceVerts[next].position
      wireframePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
    }

    // Triangulate polygon. Quads use the shorter diagonal so a pulled corner
    // does not shear UVs across the worse split (Blender-style).
    const triIndexSets: number[][] = []
    if (faceVerts.length === 4) {
      const d02 =
        (faceVerts[0].position.x - faceVerts[2].position.x) ** 2 +
        (faceVerts[0].position.y - faceVerts[2].position.y) ** 2 +
        (faceVerts[0].position.z - faceVerts[2].position.z) ** 2
      const d13 =
        (faceVerts[1].position.x - faceVerts[3].position.x) ** 2 +
        (faceVerts[1].position.y - faceVerts[3].position.y) ** 2 +
        (faceVerts[1].position.z - faceVerts[3].position.z) ** 2
      if (d13 < d02) {
        triIndexSets.push([0, 1, 3], [1, 2, 3])
      } else {
        triIndexSets.push([0, 1, 2], [0, 2, 3])
      }
    } else {
      for (let i = 1; i < faceVerts.length - 1; i++) {
        triIndexSets.push([0, i, i + 1])
      }
    }

    for (const tri of triIndexSets) {
      const v0 = faceVerts[tri[0]]
      const v1 = faceVerts[tri[1]]
      const v2 = faceVerts[tri[2]]

      const faceUvs = face.uvs || []
      const uv0 = faceUvs[tri[0]] || { u: 0, v: 0 }
      const uv1 = faceUvs[tri[1]] || { u: 0, v: 0 }
      const uv2 = faceUvs[tri[2]] || { u: 0, v: 0 }

      const triVerts = [v0, v1, v2]
      const triUVs = [uv0, uv1, uv2]

      for (let j = 0; j < 3; j++) {
        const v = triVerts[j]
        const uv = triUVs[j]

        positions.push(v.position.x, v.position.y, v.position.z)

        if (shade === 'smooth' && vertNormalMap.has(v.id)) {
          const vn = vertNormalMap.get(v.id)!
          normals.push(vn.x, vn.y, vn.z)
        } else if (shade === 'auto' && autoCornerNormals) {
          const vn = autoCornerNormals.get(`${face.id}:${v.id}`)
          if (vn) normals.push(vn.x, vn.y, vn.z)
          else normals.push(faceNormal.x, faceNormal.y, faceNormal.z)
        } else {
          normals.push(faceNormal.x, faceNormal.y, faceNormal.z)
        }

        const safeU = (uv && Number.isFinite(uv.u)) ? uv.u : 0
        const safeV = (uv && Number.isFinite(uv.v)) ? uv.v : 0
        uvs.push(safeU, safeV)

        let c: THREE.Color
        if (weightPaintContext?.isWeightPaint && weightPaintContext?.activeBoneId) {
          const w = v.boneWeights?.[weightPaintContext.activeBoneId] ?? 0.0
          c = weightToHeatmapColor(w)
        } else {
          c = new THREE.Color(v.color || '#ffffff')
        }
        colors.push(c.r, c.g, c.b)

        if (isFaceSelected) {
          selectedFacesPositions.push(v.position.x, v.position.y, v.position.z)
          selectedFacesNormals.push(faceNormal.x, faceNormal.y, faceNormal.z)
        }
      }

      faceIndexMap.push(fIdx)
      paintFaceMap.push({
        id: face.id,
        vertexIds: [...face.vertexIds],
        uvs: face.uvs.map(uv => ({ u: uv.u, v: uv.v }))
      })
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
    paintFaceMap,
    vertexIndexMap
  }
}

/**
 * High-performance in-place GPU BufferAttribute updater.
 * Mutates existing position/color buffer attributes directly for 60+ FPS animation scrubbing and weight painting.
 */
export function updateThreeGeometryAttributes(
  meshObj: MeshObject,
  geometry: THREE.BufferGeometry,
  skeletalContext?: { isPoseMode?: boolean; bones?: Bone[] },
  weightPaintContext?: { isWeightPaint?: boolean; activeBoneId?: string }
): boolean {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
  const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute | undefined
  if (!posAttr) return false

  let { vertices: evalVertices, faces: evalFaces } = evaluateModifiers(meshObj)

  if (skeletalContext?.isPoseMode && skeletalContext.bones && skeletalContext.bones.length > 0) {
    evalVertices = evaluateSkinning(meshObj, evalVertices, skeletalContext.bones)
  }

  const vertMap = new Map<string, Vertex>()
  for (const v of evalVertices) {
    vertMap.set(v.id, v)
  }

  const posArray = posAttr.array as Float32Array
  const colArray = colAttr ? (colAttr.array as Float32Array) : null
  let pIdx = 0
  let cIdx = 0

  for (let fIdx = 0; fIdx < evalFaces.length; fIdx++) {
    const face = evalFaces[fIdx]
    if (face.vertexIds.length < 3) continue

    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    for (let i = 1; i < faceVerts.length - 1; i++) {
      const v0 = faceVerts[0]
      const v1 = faceVerts[i]
      const v2 = faceVerts[i + 1]

      const tri = [v0, v1, v2]
      for (const v of tri) {
        if (pIdx + 2 < posArray.length) {
          posArray[pIdx] = v.position.x
          posArray[pIdx + 1] = v.position.y
          posArray[pIdx + 2] = v.position.z
          pIdx += 3
        }

        if (colArray && cIdx + 2 < colArray.length) {
          if (weightPaintContext?.isWeightPaint && weightPaintContext.activeBoneId) {
            const w = v.boneWeights?.[weightPaintContext.activeBoneId] || 0
            const c = weightToHeatmapColor(w)
            colArray[cIdx] = c.r
            colArray[cIdx + 1] = c.g
            colArray[cIdx + 2] = c.b
          } else {
            const c = new THREE.Color(v.color || '#ffffff')
            colArray[cIdx] = c.r
            colArray[cIdx + 1] = c.g
            colArray[cIdx + 2] = c.b
          }
          cIdx += 3
        }
      }
    }
  }

  posAttr.needsUpdate = true
  if (colAttr) colAttr.needsUpdate = true
  geometry.computeVertexNormals()
  return true
}
