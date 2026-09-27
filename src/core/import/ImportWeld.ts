import { MeshObject, Vertex, Face } from '../../types/mesh'
import { MeshBridge } from '../mesh/MeshBridge'
import { mergePlanarPairs } from '../shapeDraw/ShapeTopology'

/** File coordinates are float32 or 4–6 decimal text; exact coplanarity would reject most imported pairs. */
const IMPORT_PLANAR_TOLERANCE = 1e-4

function vertexKey(v: Vertex) {
  const p = v.position
  const weights = v.boneWeights
    ? Object.keys(v.boneWeights).sort().map(k => `${k}=${v.boneWeights![k].toFixed(4)}`).join(',')
    : ''
  return `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}|${v.color ?? ''}|${weights}`
}

/**
 * Files store triangles and split corners at UV and normal seams. The document stores
 * one vertex per corner position and per-corner UVs, so weld coincident corners, then
 * fold coplanar triangle pairs back into quads before the user edits the mesh.
 */
export function weldImportedMesh(mesh: MeshObject): MeshObject {
  const canonical = new Map<string, string>()
  const remap = new Map<string, string>()
  const vertices: Vertex[] = []
  for (const v of mesh.vertices) {
    const key = vertexKey(v)
    const existing = canonical.get(key)
    if (existing) { remap.set(v.id, existing); continue }
    canonical.set(key, v.id)
    remap.set(v.id, v.id)
    vertices.push(v)
  }

  const seenFaces = new Set<string>()
  const faces: Face[] = []
  for (const f of mesh.faces) {
    const vertexIds = f.vertexIds.map(id => remap.get(id) ?? id)
    if (new Set(vertexIds).size !== vertexIds.length) continue
    const faceKey = [...vertexIds].sort().join(',')
    if (seenFaces.has(faceKey)) continue
    seenFaces.add(faceKey)
    faces.push({ ...f, vertexIds })
  }

  const welded: MeshObject = { ...mesh, vertices, faces }
  if (!faces.some(f => f.vertexIds.length === 3)) return welded

  try {
    const bridge = MeshBridge.meshObjectToEditableMesh(welded)
    mergePlanarPairs(bridge.mesh, { planarTolerance: IMPORT_PLANAR_TOLERANCE })
    bridge.mesh.recalculateNormals()
    return MeshBridge.editableMeshToMeshObject(bridge.mesh, welded, bridge.numToStrVertId, bridge.numToStrFaceId)
  } catch {
    return welded
  }
}
