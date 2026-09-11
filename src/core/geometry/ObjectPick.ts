import * as THREE from 'three'
import type { MeshObject } from '../../types/mesh'
import { getMeshEdges } from './EdgeUtils'
import { meshObjectWorldMatrix } from './MeshTransform'
import { ScreenGeometry, type ViewQuadrant } from './ScreenGeometry'

export interface EditMeshPick {
  meshId: string
  kind: 'vertex' | 'edge' | 'face'
  overlayDistance: number
  rayDistance: number
}

const _world = new THREE.Matrix4()
const _inv = new THREE.Matrix4()
const _p0 = new THREE.Vector3()
const _p1 = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _localOrigin = new THREE.Vector3()
const _localDir = new THREE.Vector3()
const _hit = new THREE.Vector3()

function isEditableMesh(mesh: MeshObject): boolean {
  return mesh.visible && !mesh.locked && mesh.faces.length > 0
}

/**
 * Pick a visible unlocked mesh under the pointer: overlay verts/edges, then a world-ray face hit.
 * Used so Knife / Loop Cut can retarget any object, not only the selection.
 */
export function pickEditMesh(
  meshes: MeshObject[],
  args: {
    overlay: THREE.Vector2
    worldRay: THREE.Ray
    camera: THREE.Camera
    element: HTMLElement
    quadrant?: ViewQuadrant
    vertexPx?: number
    edgePx?: number
  }
): EditMeshPick | null {
  const vertexPx = args.vertexPx ?? 0
  const edgePx = args.edgePx ?? 28
  let best: EditMeshPick | null = null

  const consider = (hit: EditMeshPick) => {
    if (!best) {
      best = hit
      return
    }
    const rank = (h: EditMeshPick) => (h.kind === 'vertex' ? 0 : h.kind === 'edge' ? 1 : 2)
    const r = rank(hit) - rank(best)
    if (r < 0) {
      best = hit
      return
    }
    if (r > 0) return
    if (hit.kind === 'face') {
      if (hit.rayDistance < best.rayDistance) best = hit
      return
    }
    if (hit.overlayDistance < best.overlayDistance) best = hit
  }

  for (const mesh of meshes) {
    if (!isEditableMesh(mesh)) continue
    meshObjectWorldMatrix(mesh, _world)

    if (vertexPx > 0) {
      for (const v of mesh.vertices) {
        _p0.set(v.position.x, v.position.y, v.position.z).applyMatrix4(_world)
        const s = ScreenGeometry.worldToOverlay(_p0, args.camera, args.element, args.quadrant)
        const dist = args.overlay.distanceTo(s)
        if (dist <= vertexPx) {
          consider({ meshId: mesh.id, kind: 'vertex', overlayDistance: dist, rayDistance: Infinity })
        }
      }
    }

    if (edgePx > 0) {
      for (const edge of getMeshEdges(mesh)) {
        const a = mesh.vertices.find((v) => v.id === edge.v1)
        const b = mesh.vertices.find((v) => v.id === edge.v2)
        if (!a || !b) continue
        _p0.set(a.position.x, a.position.y, a.position.z).applyMatrix4(_world)
        _p1.set(b.position.x, b.position.y, b.position.z).applyMatrix4(_world)
        const s1 = ScreenGeometry.worldToOverlay(_p0, args.camera, args.element, args.quadrant)
        const s2 = ScreenGeometry.worldToOverlay(_p1, args.camera, args.element, args.quadrant)
        const { distance } = ScreenGeometry.distancePointToSegment2D(args.overlay, s1, s2)
        if (distance <= edgePx) {
          consider({ meshId: mesh.id, kind: 'edge', overlayDistance: distance, rayDistance: Infinity })
        }
      }
    }

    _inv.copy(_world).invert()
    _localOrigin.copy(args.worldRay.origin).applyMatrix4(_inv)
    _localDir.copy(args.worldRay.direction).transformDirection(_inv).normalize()
    const localRay = new THREE.Ray(_localOrigin.clone(), _localDir.clone())
    const cullBack = _world.determinant() >= 0

    for (const face of mesh.faces) {
      const ids = face.vertexIds
      if (ids.length < 3) continue
      const v0 = mesh.vertices.find((v) => v.id === ids[0])
      if (!v0) continue
      _p0.set(v0.position.x, v0.position.y, v0.position.z)
      for (let i = 1; i < ids.length - 1; i++) {
        const v1 = mesh.vertices.find((v) => v.id === ids[i])
        const v2 = mesh.vertices.find((v) => v.id === ids[i + 1])
        if (!v1 || !v2) continue
        _p1.set(v1.position.x, v1.position.y, v1.position.z)
        _p2.set(v2.position.x, v2.position.y, v2.position.z)
        const hit = localRay.intersectTriangle(_p0, _p1, _p2, cullBack, _hit)
        if (!hit) continue
        const worldHit = hit.clone().applyMatrix4(_world)
        const rayDistance = args.worldRay.origin.distanceTo(worldHit)
        consider({ meshId: mesh.id, kind: 'face', overlayDistance: Infinity, rayDistance })
      }
    }
  }

  return best
}
