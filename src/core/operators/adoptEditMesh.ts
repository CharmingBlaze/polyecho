import * as THREE from 'three'
import { pickEditMesh } from '../geometry/ObjectPick'
import { ScreenGeometry } from '../geometry/ScreenGeometry'
import type { OperatorContext } from './ModalOperator'

export function adoptEditMeshUnderPointer(
  ctx: OperatorContext,
  client: { x: number; y: number },
  opts?: { vertexPx?: number; edgePx?: number }
): boolean {
  if (!ctx.adoptMesh || !ctx.allMeshes?.length) return false
  const p = ScreenGeometry.pointerInView(client, ctx.viewportElement)
  const overlay = new THREE.Vector2(p.x, p.y)
  const worldRay = ScreenGeometry.rayFromClient(client, ctx.camera, ctx.viewportElement, ctx.quadrant)
  const hit = pickEditMesh(ctx.allMeshes, {
    overlay,
    worldRay,
    camera: ctx.camera,
    element: ctx.viewportElement,
    quadrant: ctx.quadrant,
    vertexPx: opts?.vertexPx ?? 0,
    edgePx: opts?.edgePx ?? 28,
  })
  if (!hit) return false
  if (hit.meshId === ctx.targetMeshId) return false
  return ctx.adoptMesh(hit.meshId)
}

export function copyObjectMatrix(ctx: OperatorContext, world: THREE.Matrix4, inv?: THREE.Matrix4) {
  world.copy(ctx.objectMatrix ?? new THREE.Matrix4())
  inv?.copy(world).invert()
}
