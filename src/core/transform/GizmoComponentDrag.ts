import * as THREE from 'three'
import type { MeshBridgeData } from '../mesh/MeshRepository'
import { clipMirrorPosition, type MirrorSpace } from '../geometry/MirrorModifier'
import type { MirrorModifier } from '../../types/mesh'

/** Apply a world gizmo delta onto leased kernel vertex positions. */
export function applyGizmoComponentPositions(options: {
  bridge: MeshBridgeData
  targetVertIds: Set<string>
  startWorld: Map<string, THREE.Vector3>
  deltaMatrix: THREE.Matrix4
  worldInverse: THREE.Matrix4
  clipMirror?: {
    modifier: MirrorModifier
    space: MirrorSpace
  }
}): void {
  const { bridge, targetVertIds, startWorld, deltaMatrix, worldInverse, clipMirror } = options
  const tmp = new THREE.Vector3()
  const startLocal = new THREE.Vector3()
  for (const id of targetVertIds) {
    const numId = bridge.strToNumVertId.get(id)
    const vert = numId == null ? undefined : bridge.mesh.vertices.get(numId)
    const start = startWorld.get(id)
    if (!vert || !start) continue
    tmp.copy(start).applyMatrix4(deltaMatrix).applyMatrix4(worldInverse)
    startLocal.copy(start).applyMatrix4(worldInverse)
    const clipped = clipMirror
      ? clipMirrorPosition(
          { x: tmp.x, y: tmp.y, z: tmp.z },
          { x: startLocal.x, y: startLocal.y, z: startLocal.z },
          clipMirror.modifier,
          clipMirror.space
        )
      : { x: tmp.x, y: tmp.y, z: tmp.z }
    vert.position.set(clipped.x, clipped.y, clipped.z)
  }
}
