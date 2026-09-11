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

const _bPivot = new THREE.Vector3()
const _bTrans = new THREE.Vector3()
const _bEuler = new THREE.Euler()
const _bScale = new THREE.Vector3()
const _bQuat = new THREE.Quaternion()
const _bToPivot = new THREE.Matrix4()
const _bTrs = new THREE.Matrix4()
const _bRestInv = new THREE.Matrix4()

function boneWorldCacheKey(boneId: string, restPose: boolean) {
  return restPose ? `${boneId}\0r` : boneId
}

function writeLocalBoneMatrix(bone: Bone, restPose: boolean, out: THREE.Matrix4) {
  _bPivot.set(bone.head.x, bone.head.y, bone.head.z)
  if (restPose) {
    _bTrans.set(_bPivot.x, _bPivot.y, _bPivot.z)
    _bEuler.set(0, 0, 0)
    _bScale.set(1, 1, 1)
  } else {
    _bTrans.set(_bPivot.x + bone.position.x, _bPivot.y + bone.position.y, _bPivot.z + bone.position.z)
    _bEuler.set(
      THREE.MathUtils.degToRad(bone.rotation.x),
      THREE.MathUtils.degToRad(bone.rotation.y),
      THREE.MathUtils.degToRad(bone.rotation.z)
    )
    _bScale.set(bone.scale.x, bone.scale.y, bone.scale.z)
  }
  _bQuat.setFromEuler(_bEuler)
  _bToPivot.makeTranslation(-_bPivot.x, -_bPivot.y, -_bPivot.z)
  _bTrs.compose(_bTrans, _bQuat, _bScale)
  out.multiplyMatrices(_bTrs, _bToPivot)
}

export function computeBoneWorldMatrix(
  bone: Bone,
  allBones: Bone[],
  restPose = false,
  cache?: Map<string, THREE.Matrix4>
): THREE.Matrix4 {
  const key = boneWorldCacheKey(bone.id, restPose)
  const hit = cache?.get(key)
  if (hit) return hit

  return computeBoneWorldMatrixWalk(bone, allBones, restPose, cache, new Set())
}

function computeBoneWorldMatrixWalk(
  bone: Bone,
  allBones: Bone[],
  restPose: boolean,
  cache: Map<string, THREE.Matrix4> | undefined,
  seen: Set<string>
): THREE.Matrix4 {
  const key = boneWorldCacheKey(bone.id, restPose)
  const hit = cache?.get(key)
  if (hit) return hit
  if (seen.has(key)) return new THREE.Matrix4()
  seen.add(key)

  const localMat = new THREE.Matrix4()
  writeLocalBoneMatrix(bone, restPose, localMat)

  let result = localMat
  if (bone.parentId) {
    const parent = allBones.find(b => b.id === bone.parentId)
    if (parent && parent.id !== bone.id) {
      const parentMat = computeBoneWorldMatrixWalk(parent, allBones, restPose, cache, seen)
      result = new THREE.Matrix4().multiplyMatrices(parentMat, localMat)
    }
  }
  cache?.set(key, result)
  return result
}

/** Linear-blend skin matrix: posed world × inverse bind (rest). Does not mutate cached worlds. */
export function computeBoneSkinMatrix(
  bone: Bone,
  allBones: Bone[],
  worldCache?: Map<string, THREE.Matrix4>,
  restCache?: Map<string, THREE.Matrix4>
): THREE.Matrix4 {
  const world = computeBoneWorldMatrix(bone, allBones, false, worldCache)
  const rest = computeBoneWorldMatrix(bone, allBones, true, restCache)
  return new THREE.Matrix4().copy(world).multiply(_bRestInv.copy(rest).invert())
}

const _sharedRestCache = new Map<string, THREE.Matrix4>()
let _sharedRestBindSig = ''

function restBindSignature(bones: Bone[]) {
  let sig = ''
  for (const b of bones) {
    sig += `${b.id}:${b.parentId}:${b.head.x},${b.head.y},${b.head.z};`
  }
  return sig
}

export function buildBoneSkinMatrices(
  bones: Bone[],
  worldCache?: Map<string, THREE.Matrix4>
): Map<string, THREE.Matrix4> {
  const restSig = restBindSignature(bones)
  if (restSig !== _sharedRestBindSig) {
    _sharedRestCache.clear()
    _sharedRestBindSig = restSig
  }
  const worlds = worldCache ?? new Map<string, THREE.Matrix4>()
  const skin = new Map<string, THREE.Matrix4>()
  for (const b of bones) {
    skin.set(b.id, computeBoneSkinMatrix(b, bones, worlds, _sharedRestCache))
  }
  return skin
}

export function faceTriIndexSets(verts: Array<{ position: { x: number; y: number; z: number } }>): number[][] {
  if (verts.length === 4) {
    const a = verts[0].position
    const b = verts[1].position
    const c = verts[2].position
    const d = verts[3].position
    const d02 = (a.x - c.x) ** 2 + (a.y - c.y) ** 2 + (a.z - c.z) ** 2
    const d13 = (b.x - d.x) ** 2 + (b.y - d.y) ** 2 + (b.z - d.z) ** 2
    return d13 < d02 ? [[0, 1, 3], [1, 2, 3]] : [[0, 1, 2], [0, 2, 3]]
  }
  const out: number[][] = []
  for (let i = 1; i < verts.length - 1; i++) out.push([0, i, i + 1])
  return out
}

export function meshHasSkinWeights(mesh: MeshObject): boolean {
  for (const v of mesh.vertices) {
    const weights = v.boneWeights
    if (!weights) continue
    for (const bId in weights) {
      if (weights[bId] > 0.001) return true
    }
  }
  return false
}

const _skinMeshPos = new THREE.Vector3()
const _skinWorld = new THREE.Vector3()
const _skinAccum = new THREE.Vector3()
const _skinXform = new THREE.Vector3()
const _skinOut = new THREE.Vector3()

function skinVertexInto(
  meshPos: THREE.Vector3,
  v: Vertex,
  boneMatrixMap: Map<string, THREE.Matrix4>,
  out: THREE.Vector3
): boolean {
  if (!v.boneWeights) return false
  _skinWorld.set(meshPos.x + v.position.x, meshPos.y + v.position.y, meshPos.z + v.position.z)
  _skinAccum.set(0, 0, 0)
  let totalWeight = 0
  for (const bId in v.boneWeights) {
    const weight = v.boneWeights[bId]
    const mat = boneMatrixMap.get(bId)
    if (mat && weight > 0.001) {
      _skinXform.copy(_skinWorld).applyMatrix4(mat)
      _skinAccum.addScaledVector(_skinXform, weight)
      totalWeight += weight
    }
  }
  if (totalWeight <= 0) return false
  if (totalWeight < 0.999) {
    _skinAccum.addScaledVector(_skinWorld, 1 - totalWeight)
  }
  out.set(_skinAccum.x - meshPos.x, _skinAccum.y - meshPos.y, _skinAccum.z - meshPos.z)
  return true
}

export function evaluateSkinning(mesh: MeshObject, vertices: Vertex[], bones: Bone[]): Vertex[] {
  if (!bones || bones.length === 0) return vertices

  const boneMatrixMap = buildBoneSkinMatrices(bones)
  const deformed: Vertex[] = []
  _skinMeshPos.set(mesh.position.x, mesh.position.y, mesh.position.z)

  for (const v of vertices) {
    if (!skinVertexInto(_skinMeshPos, v, boneMatrixMap, _skinOut)) {
      deformed.push(v)
      continue
    }
    deformed.push({
      ...v,
      position: { x: _skinOut.x, y: _skinOut.y, z: _skinOut.z }
    })
  }
  return deformed
}

const scratchVertexColor = new THREE.Color()

export function weightToHeatmapColor(weight: number, color = scratchVertexColor): THREE.Color {
  const w = Math.max(0, Math.min(1, weight))
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
  weightPaintContext?: { isWeightPaint: boolean; activeBoneId?: string },
  selectedVertexIds: string[] = []
): GeometryBundle {
  ensureMeshUVs(mesh)
  let { vertices: evalVertices, faces: evalFaces } = evaluateModifiers(mesh)

  const posedPos = new Map<string, { x: number; y: number; z: number }>()
  if (skeletalDeformContext && skeletalDeformContext.isPoseMode && skeletalDeformContext.bones.length > 0) {
    const boneMatrixMap = buildBoneSkinMatrices(skeletalDeformContext.bones)
    _skinMeshPos.set(mesh.position.x, mesh.position.y, mesh.position.z)
    for (const v of evalVertices) {
      if (skinVertexInto(_skinMeshPos, v, boneMatrixMap, _skinOut)) {
        posedPos.set(v.id, { x: _skinOut.x, y: _skinOut.y, z: _skinOut.z })
      }
    }
  }
  const posOf = (v: { id: string; position: { x: number; y: number; z: number } }) =>
    posedPos.get(v.id) ?? v.position

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

      const fn = computeFaceNormal(faceVerts.map(v => posOf(v)))
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
  const selectedFaceSet = selectedFaceIds.length > 0 ? new Set(selectedFaceIds) : null

  for (let fIdx = 0; fIdx < evalFaces.length; fIdx++) {
    const face = evalFaces[fIdx]
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const faceNormal = computeFaceNormal(faceVerts.map(v => posOf(v)))
    const isFaceSelected = Boolean(selectedFaceSet?.has(face.id))

    // Build wireframe edges
    for (let i = 0; i < faceVerts.length; i++) {
      const next = (i + 1) % faceVerts.length
      const p1 = posOf(faceVerts[i])
      const p2 = posOf(faceVerts[next])
      wireframePositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z)
    }

    const triIndexSets = faceTriIndexSets(faceVerts)

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

        const p = posOf(v)
        positions.push(p.x, p.y, p.z)

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
          c = weightToHeatmapColor(w, scratchVertexColor)
        } else {
          c = scratchVertexColor.set(v.color || '#ffffff')
        }
        colors.push(c.r, c.g, c.b)

        if (isFaceSelected) {
          selectedFacesPositions.push(p.x, p.y, p.z)
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
    const selectedEdgeSet = new Set(selectedEdgeIds)
    const allEdges = getMeshEdges(mesh)
    for (const edge of allEdges) {
      if (selectedEdgeSet.has(edge.id)) {
        const v1 = vertMap.get(edge.v1)
        const v2 = vertMap.get(edge.v2)
        if (v1 && v2) {
          const ep1 = posOf(v1)
          const ep2 = posOf(v2)
          selectedEdgesPositions.push(
            ep1.x, ep1.y, ep1.z,
            ep2.x, ep2.y, ep2.z
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

  const selectedVertSet = selectedVertexIds.length > 0 ? new Set(selectedVertexIds) : null
  for (const v of mesh.vertices) {
    const vp = posOf(v)
    vertexPointsPositions.push(vp.x, vp.y, vp.z)
    vertexIndexMap.push(v.id)
    if (v.selected || selectedVertSet?.has(v.id)) {
      vertexPointsColors.push(1.0, 0.62, 0.12)
    } else {
      vertexPointsColors.push(0.93, 0.93, 0.96)
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

/** Selection overlays only — avoids rebuilding the shaded mesh on face/edge pick. */
export function buildSelectionOverlayGeometries(
  mesh: MeshObject,
  selectedFaceIds: string[],
  selectedEdgeIds: string[]
): { selectedFacesGeometry: THREE.BufferGeometry; selectedEdgesGeometry: THREE.BufferGeometry } {
  const { vertices: evalVertices, faces: evalFaces } = evaluateModifiers(mesh)
  const vertMap = new Map<string, Vertex>()
  for (const v of evalVertices) vertMap.set(v.id, v)

  const selectedFacesPositions: number[] = []
  const selectedFacesNormals: number[] = []
  if (selectedFaceIds.length > 0) {
    const faceSet = new Set(selectedFaceIds)
    for (const face of evalFaces) {
      if (!faceSet.has(face.id)) continue
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      if (faceVerts.length < 3) continue
      const faceNormal = computeFaceNormal(faceVerts.map(v => v.position))
      for (const triIdx of faceTriIndexSets(faceVerts)) {
        const tri = [faceVerts[triIdx[0]], faceVerts[triIdx[1]], faceVerts[triIdx[2]]]
        for (const v of tri) {
          selectedFacesPositions.push(v.position.x, v.position.y, v.position.z)
          selectedFacesNormals.push(faceNormal.x, faceNormal.y, faceNormal.z)
        }
      }
    }
  }

  const selectedEdgesPositions: number[] = []
  if (selectedEdgeIds.length > 0) {
    const edgeSet = new Set(selectedEdgeIds)
    for (const edge of getMeshEdges(mesh)) {
      if (!edgeSet.has(edge.id)) continue
      const v1 = vertMap.get(edge.v1)
      const v2 = vertMap.get(edge.v2)
      if (!v1 || !v2) continue
      selectedEdgesPositions.push(
        v1.position.x, v1.position.y, v1.position.z,
        v2.position.x, v2.position.y, v2.position.z
      )
    }
  }

  const selectedFacesGeometry = new THREE.BufferGeometry()
  if (selectedFacesPositions.length > 0) {
    selectedFacesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedFacesPositions, 3))
    selectedFacesGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(selectedFacesNormals, 3))
  }
  const selectedEdgesGeometry = new THREE.BufferGeometry()
  if (selectedEdgesPositions.length > 0) {
    selectedEdgesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(selectedEdgesPositions, 3))
  }
  return { selectedFacesGeometry, selectedEdgesGeometry }
}

/**
 * High-performance in-place GPU BufferAttribute updater.
 * Mutates existing position/color buffer attributes directly for 60+ FPS animation scrubbing and weight painting.
 */
export function updateThreeGeometryAttributes(
  meshObj: MeshObject,
  geometry: THREE.BufferGeometry,
  skeletalContext?: { isPoseMode?: boolean; bones?: Bone[]; skinMatrices?: Map<string, THREE.Matrix4> },
  weightPaintContext?: { isWeightPaint?: boolean; activeBoneId?: string },
  shadeMode: MeshShadeMode = 'flat'
): boolean {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
  const colAttr = geometry.getAttribute('color') as THREE.BufferAttribute | undefined
  const nrmAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
  if (!posAttr) return false

  const { vertices: evalVertices, faces: evalFaces } = evaluateModifiers(meshObj)
  const skinMatrices =
    skeletalContext?.skinMatrices
    ?? (skeletalContext?.isPoseMode && skeletalContext.bones && skeletalContext.bones.length > 0
      ? buildBoneSkinMatrices(skeletalContext.bones)
      : null)
  if (skinMatrices) {
    _skinMeshPos.set(meshObj.position.x, meshObj.position.y, meshObj.position.z)
  }

  const vertMap = new Map<string, Vertex>()
  for (const v of evalVertices) {
    vertMap.set(v.id, v)
  }

  const posArray = posAttr.array as Float32Array
  const colArray = colAttr ? (colAttr.array as Float32Array) : null
  const nrmArray = nrmAttr ? (nrmAttr.array as Float32Array) : null
  const writeColors = Boolean(colArray && weightPaintContext?.isWeightPaint && weightPaintContext.activeBoneId)
  const writeFlatNormals = Boolean(nrmArray && skinMatrices && shadeMode === 'flat')
  let pIdx = 0
  let cIdx = 0
  let nIdx = 0

  for (let fIdx = 0; fIdx < evalFaces.length; fIdx++) {
    const face = evalFaces[fIdx]
    if (face.vertexIds.length < 3) continue

    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    for (const triIdx of faceTriIndexSets(faceVerts)) {
      const tri = [faceVerts[triIdx[0]], faceVerts[triIdx[1]], faceVerts[triIdx[2]]]
      const triStart = pIdx
      for (const v of tri) {
        if (pIdx + 2 < posArray.length) {
          if (skinMatrices && skinVertexInto(_skinMeshPos, v, skinMatrices, _skinOut)) {
            posArray[pIdx] = _skinOut.x
            posArray[pIdx + 1] = _skinOut.y
            posArray[pIdx + 2] = _skinOut.z
          } else {
            posArray[pIdx] = v.position.x
            posArray[pIdx + 1] = v.position.y
            posArray[pIdx + 2] = v.position.z
          }
          pIdx += 3
        }

        if (writeColors && colArray && cIdx + 2 < colArray.length) {
          const w = v.boneWeights?.[weightPaintContext!.activeBoneId!] || 0
          const c = weightToHeatmapColor(w, scratchVertexColor)
          colArray[cIdx] = c.r
          colArray[cIdx + 1] = c.g
          colArray[cIdx + 2] = c.b
          cIdx += 3
        }
      }

      if (writeFlatNormals && nrmArray && triStart + 8 < posArray.length && nIdx + 8 < nrmArray.length) {
        const ax = posArray[triStart + 3] - posArray[triStart]
        const ay = posArray[triStart + 4] - posArray[triStart + 1]
        const az = posArray[triStart + 5] - posArray[triStart + 2]
        const bx = posArray[triStart + 6] - posArray[triStart]
        const by = posArray[triStart + 7] - posArray[triStart + 1]
        const bz = posArray[triStart + 8] - posArray[triStart + 2]
        let nx = ay * bz - az * by
        let ny = az * bx - ax * bz
        let nz = ax * by - ay * bx
        const len = Math.hypot(nx, ny, nz) || 1
        nx /= len
        ny /= len
        nz /= len
        for (let k = 0; k < 3; k++) {
          nrmArray[nIdx] = nx
          nrmArray[nIdx + 1] = ny
          nrmArray[nIdx + 2] = nz
          nIdx += 3
        }
      }
    }
  }

  posAttr.needsUpdate = true
  if (writeColors && colAttr) colAttr.needsUpdate = true
  if (writeFlatNormals && nrmAttr) nrmAttr.needsUpdate = true
  else if (skinMatrices && (shadeMode === 'smooth' || shadeMode === 'auto')) {
    geometry.computeVertexNormals()
  }
  if (pIdx !== posArray.length) return false
  if (writeColors && colArray && cIdx !== colArray.length) return false
  return true
}
