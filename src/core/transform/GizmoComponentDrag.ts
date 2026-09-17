import * as THREE from 'three'
import type { MeshBridgeData } from '../mesh/MeshRepository'

/** Apply a world gizmo delta onto leased kernel vertex positions. */
export function applyGizmoComponentPositions(options: {
  bridge: MeshBridgeData
  targetVertIds: Set<string>
  startWorld: Map<string, THREE.Vector3>
  deltaMatrix: THREE.Matrix4
  worldInverse: THREE.Matrix4
  clipMirror?: {
    enabled?: boolean
    clipping?: boolean
    axisX?: boolean
    axisY?: boolean
    axisZ?: boolean
  }
}): void {
  const { bridge, targetVertIds, startWorld, deltaMatrix, worldInverse, clipMirror } = options
  const clip = !!(clipMirror?.enabled && clipMirror.clipping)
  const tmp = new THREE.Vector3()
  for (const id of targetVertIds) {
    const numId = bridge.strToNumVertId.get(id)
    const vert = numId == null ? undefined : bridge.mesh.vertices.get(numId)
    const start = startWorld.get(id)
    if (!vert || !start) continue
    tmp.copy(start).applyMatrix4(deltaMatrix).applyMatrix4(worldInverse)
    let px = tmp.x
    let py = tmp.y
    let pz = tmp.z
    if (clip) {
      tmp.copy(start).applyMatrix4(worldInverse)
      if (clipMirror!.axisX) {
        if (tmp.x >= 0 && px < 0) px = 0
        if (tmp.x <= 0 && px > 0) px = 0
      }
      if (clipMirror!.axisY) {
        if (tmp.y >= 0 && py < 0) py = 0
        if (tmp.y <= 0 && py > 0) py = 0
      }
      if (clipMirror!.axisZ) {
        if (tmp.z >= 0 && pz < 0) pz = 0
        if (tmp.z <= 0 && pz > 0) pz = 0
      }
    }
    vert.position.set(px, py, pz)
  }
}
