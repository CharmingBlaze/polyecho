import * as THREE from 'three'
import { ModalOperator, OperatorContext } from '../ModalOperator'
import { LoopCutKernel } from '../../mesh/operations/LoopCutKernel'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'
import { adoptEditMeshUnderPointer, copyObjectMatrix } from '../adoptEditMesh'
import { operatorManager } from '../OperatorManager'

export enum LoopCutState {
  FINDING_RING = 'FINDING_RING',
  SLIDING = 'SLIDING',
  COMMITTING = 'COMMITTING'
}

export interface LoopCutPreviewSegment {
  p1: THREE.Vector3
  p2: THREE.Vector3
}

export class LoopCutOperator extends ModalOperator {
  readonly name = 'Loop Cut'

  public loopState: LoopCutState = LoopCutState.FINDING_RING
  public cutCount = 1
  public slideFactor = 0.5

  public hoveredEdgeId: number | null = null
  public ringEdgeIds: number[] = []
  /** Preview in world space for the viewport overlay. */
  public previewSegments: LoopCutPreviewSegment[] = []

  private objectWorld = new THREE.Matrix4()

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    copyObjectMatrix(ctx, this.objectWorld)
    this.loopState = LoopCutState.FINDING_RING
    this.cutCount = 1
    this.slideFactor = 0.5
    this.hoveredEdgeId = null
    this.ringEdgeIds = []
    this.previewSegments = []

    this.updateHover(false, false)
  }

  pointerMove(event: PointerEvent) {
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.updateHover(event.shiftKey, event.ctrlKey)
  }

  wheel(event: WheelEvent): boolean {
    event.preventDefault()
    this.cutCount = event.deltaY < 0
      ? Math.min(16, this.cutCount + 1)
      : Math.max(1, this.cutCount - 1)
    this.updatePreviewSegments()
    this.updateStatus()
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key
    if (key === 'Enter') {
      event.preventDefault()
      if (this.hoveredEdgeId !== null) operatorManager.confirm()
      return true
    }
    if (key === 'Escape') {
      event.preventDefault()
      operatorManager.cancel()
      return true
    }
    return false
  }

  handlePointerDown(button: number): boolean {
    if (button === 0) {
      this.updateHover(this.isShiftHeld, this.isCtrlHeld)
      if (this.hoveredEdgeId !== null) operatorManager.confirm()
      return true
    }
    if (button === 2) {
      operatorManager.cancel()
      return true
    }
    return false
  }

  private overlayPointer(client: { x: number; y: number }) {
    const p = ScreenGeometry.pointerInView(client, this.ctx.viewportElement)
    return new THREE.Vector2(p.x, p.y)
  }

  private toWorld(local: THREE.Vector3) {
    return local.clone().applyMatrix4(this.objectWorld)
  }

  private toOverlay(local: THREE.Vector3) {
    return ScreenGeometry.worldToOverlay(
      this.toWorld(local),
      this.ctx.camera,
      this.ctx.viewportElement,
      this.ctx.quadrant
    )
  }

  private localRayFromClient(client: { x: number; y: number }) {
    const worldRay = ScreenGeometry.rayFromClient(
      client,
      this.ctx.camera,
      this.ctx.viewportElement,
      this.ctx.quadrant
    )
    const inv = this.objectWorld.clone().invert()
    const origin = worldRay.origin.clone().applyMatrix4(inv)
    const dir = worldRay.direction.clone().transformDirection(inv).normalize()
    return new THREE.Ray(origin, dir)
  }

  private updateHover(shiftKey: boolean, ctrlKey: boolean) {
    if (adoptEditMeshUnderPointer(this.ctx, this.currentMouse, { edgePx: 48, vertexPx: 0 })) {
      copyObjectMatrix(this.ctx, this.objectWorld)
      this.initialSnapshot = this.ctx.mesh.createSnapshot()
      this.hoveredEdgeId = null
    }

    this.findHoveredEdgeAndRing()
    this.updateSlideFromPointer(shiftKey, ctrlKey)
    this.updatePreviewSegments()
    this.updateStatus()
  }

  private findHoveredEdgeAndRing() {
    const overlay = this.overlayPointer(this.currentMouse)
    let closestEdgeId: number | null = null
    let minScreenDist = 64

    for (const [eId, edge] of this.ctx.mesh.edges) {
      const p1 = this.ctx.mesh.vertices.get(edge.v1)?.position
      const p2 = this.ctx.mesh.vertices.get(edge.v2)?.position
      if (!p1 || !p2) continue
      const { distance } = ScreenGeometry.distancePointToSegment2D(
        overlay,
        this.toOverlay(p1),
        this.toOverlay(p2)
      )
      if (distance < minScreenDist) {
        minScreenDist = distance
        closestEdgeId = eId
      }
    }

    if (closestEdgeId === null) {
      closestEdgeId = this.closestEdgeOnHitFace()
    }

    this.hoveredEdgeId = closestEdgeId
    this.ringEdgeIds = closestEdgeId !== null
      ? LoopCutKernel.ringEdges(this.ctx.mesh, closestEdgeId)
      : []
  }

  private closestEdgeOnHitFace(): number | null {
    const ray = this.localRayFromClient(this.currentMouse)
    const cull = this.objectWorld.determinant() >= 0
    let closestDist = Infinity
    let hitFaceId: number | null = null
    const tmp = new THREE.Vector3()

    for (const [fId, face] of this.ctx.mesh.faces) {
      const ids = face.vertexIds
      if (ids.length < 3) continue
      const p0 = this.ctx.mesh.vertices.get(ids[0]!)?.position
      if (!p0) continue
      for (let i = 1; i < ids.length - 1; i++) {
        const p1 = this.ctx.mesh.vertices.get(ids[i]!)?.position
        const p2 = this.ctx.mesh.vertices.get(ids[i + 1]!)?.position
        if (!p1 || !p2) continue
        const hit = ray.intersectTriangle(p0, p1, p2, cull, tmp)
        if (!hit) continue
        const d = ray.origin.distanceTo(hit)
        if (d < closestDist) {
          closestDist = d
          hitFaceId = fId
        }
      }
    }

    if (hitFaceId === null) return null
    const face = this.ctx.mesh.faces.get(hitFaceId)
    if (!face) return null

    const overlay = this.overlayPointer(this.currentMouse)
    let bestId: number | null = null
    let bestDist = Infinity
    const n = face.vertexIds.length
    for (let i = 0; i < n; i++) {
      const a = this.ctx.mesh.vertices.get(face.vertexIds[i]!)?.position
      const b = this.ctx.mesh.vertices.get(face.vertexIds[(i + 1) % n]!)?.position
      if (!a || !b) continue
      const edgeId = this.edgeIdBetween(face.vertexIds[i]!, face.vertexIds[(i + 1) % n]!)
      if (edgeId === null) continue
      const { distance } = ScreenGeometry.distancePointToSegment2D(
        overlay,
        this.toOverlay(a),
        this.toOverlay(b)
      )
      if (distance < bestDist) {
        bestDist = distance
        bestId = edgeId
      }
    }
    return bestId
  }

  private edgeIdBetween(a: number, b: number): number | null {
    const minV = Math.min(a, b)
    const maxV = Math.max(a, b)
    for (const edge of this.ctx.mesh.edges.values()) {
      if (edge.v1 === minV && edge.v2 === maxV) return edge.id
    }
    return null
  }

  private updateSlideFromPointer(shiftKey: boolean, ctrlKey: boolean) {
    if (this.hoveredEdgeId === null) return
    const edge = this.ctx.mesh.edges.get(this.hoveredEdgeId)
    if (!edge) return
    const p1 = this.ctx.mesh.vertices.get(edge.v1)?.position
    const p2 = this.ctx.mesh.vertices.get(edge.v2)?.position
    if (!p1 || !p2) return
    const overlay = this.overlayPointer(this.currentMouse)
    let t = ScreenGeometry.closestPointParameterOnSegment2D(
      overlay,
      this.toOverlay(p1),
      this.toOverlay(p2)
    )
    if (shiftKey) t = 0.5 + (t - 0.5) * 0.2
    if (ctrlKey) t = Math.round(t * 10) / 10
    this.slideFactor = Math.max(0.01, Math.min(0.99, t))
  }

  private getCutParameters(): number[] {
    if (this.cutCount === 1) return [this.slideFactor]
    const params: number[] = []
    const baseSpacing = 1 / (this.cutCount + 1)
    const offset = (this.slideFactor - 0.5) * 0.5
    for (let i = 1; i <= this.cutCount; i++) {
      params.push(Math.max(0.01, Math.min(0.99, i * baseSpacing + offset)))
    }
    return params
  }

  private updatePreviewSegments() {
    if (this.hoveredEdgeId === null) {
      this.previewSegments = []
      return
    }
    const local = LoopCutKernel.previewSegments(
      this.ctx.mesh,
      this.hoveredEdgeId,
      this.getCutParameters()
    )
    this.previewSegments = local.map((seg) => ({
      p1: this.toWorld(seg.p1),
      p2: this.toWorld(seg.p2),
    }))
  }

  evaluate() {}

  confirm() {
    if (this.hoveredEdgeId === null || this.ringEdgeIds.length === 0) {
      this.cancel()
      return
    }
    LoopCutKernel.cutLoop(this.ctx.mesh, this.hoveredEdgeId, this.getCutParameters())
    super.confirm()
  }

  updateStatus() {
    const n = this.ringEdgeIds.length
    this.statusText = n > 0
      ? `Loop Cut · ${n} edges · Cuts ${this.cutCount} (scroll) · click to cut · Esc cancel`
      : `Loop Cut · hover a face or edge · click to cut · Esc cancel`
  }
}
