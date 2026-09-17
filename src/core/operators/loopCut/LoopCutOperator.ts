import * as THREE from 'three'
import { ModalOperator, OperatorContext } from '../ModalOperator'
import { LoopCutKernel } from '../../mesh/operations/LoopCutKernel'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'
import { adoptEditMeshUnderPointer, copyObjectMatrix } from '../adoptEditMesh'
import { operatorManager } from '../OperatorManager'
import { surfaceTriangles, perspectiveEdgeParameter } from '../../geometry/SurfaceGeometry'
import { MeshValidator } from '../../mesh/MeshValidator'

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
  private slideStart = 0.5
  public error = ''

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
    this.isShiftHeld = event.shiftKey
    this.isCtrlHeld = event.ctrlKey
    this.updateHover(event.shiftKey, event.ctrlKey)
  }

  wheel(event: WheelEvent): boolean {
    event.preventDefault()
    if (this.loopState === LoopCutState.FINDING_RING) this.setCutCount(this.cutCount + (event.deltaY < 0 ? 1 : -1))
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') { event.preventDefault(); operatorManager.cancel(); return true }
    if (event.key === 'Enter') { event.preventDefault(); this.advance(); return true }
    if (!event.ctrlKey && !event.metaKey && this.numericInput.handleKey(event.key)) {
      event.preventDefault()
      const value = this.numericInput.getValue()
      if (this.loopState === LoopCutState.FINDING_RING && value !== null) this.setCutCount(value, false)
      else if (this.loopState === LoopCutState.SLIDING) {
        this.slideFactor = value === null ? 0.5 : 0.5 + Math.max(-0.998,Math.min(0.998,value)) / 2
        this.refresh()
      }
      return true
    }
    return false
  }

  public setCutCount(value: number, resetInput = true) {
    if (!Number.isFinite(value) || this.loopState !== LoopCutState.FINDING_RING) return
    this.cutCount = Math.max(1,Math.min(64,Math.round(value)))
    if (resetInput) this.numericInput.reset()
    this.refresh()
  }

  public advance() {
    if (this.hoveredEdgeId === null || !this.ringEdgeIds.length) return
    if (this.loopState === LoopCutState.FINDING_RING) {
      this.loopState = LoopCutState.SLIDING
      this.slideStart = this.pointerParameter()
      this.slideFactor = 0.5
      this.numericInput.reset()
      this.refresh()
    } else operatorManager.confirm()
  }

  public centerAndConfirm() {
    if (!this.ringEdgeIds.length) return
    this.slideFactor = 0.5
    operatorManager.confirm()
  }

  handlePointerDown(button: number): boolean {
    if (button === 0) {
      this.updateHover(this.isShiftHeld,this.isCtrlHeld)
      this.advance()
      return true
    }
    if (button === 2) {
      if (this.loopState === LoopCutState.SLIDING) this.centerAndConfirm()
      else operatorManager.cancel()
      return true
    }
    return false
  }

  private refresh() { this.updatePreviewSegments(); this.updateStatus(); this.ctx.onUpdatePreview() }
  public relayout() { this.refresh() }

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
    if (!ScreenGeometry.isInPane(this.currentMouse,this.ctx.viewportElement,this.ctx.quadrant)) return
    if (this.loopState === LoopCutState.FINDING_RING) {
      if (adoptEditMeshUnderPointer(this.ctx, this.currentMouse, { edgePx: 16, vertexPx: 0 })) {
        copyObjectMatrix(this.ctx, this.objectWorld)
        this.initialSnapshot = this.ctx.mesh.createSnapshot()
      }
      this.hoveredEdgeId = this.closestEdgeOnHitFace()
      this.ringEdgeIds = this.hoveredEdgeId === null ? [] : LoopCutKernel.ringEdges(this.ctx.mesh,this.hoveredEdgeId)
      this.slideFactor = 0.5
    } else this.updateSlideFromPointer(shiftKey,ctrlKey)
    this.refresh()
  }

  private closestEdgeOnHitFace(): number | null {
    const ray = this.localRayFromClient(this.currentMouse)
    let closestDist = Infinity
    let hitFaceId: number | null = null
    const tmp = new THREE.Vector3()

    for (const [fId, face] of this.ctx.mesh.faces) {
      const positions = face.vertexIds.map(id => this.ctx.mesh.vertices.get(id)!.position)
      for (const [a,b,c] of surfaceTriangles(positions)) {
        const hit = ray.intersectTriangle(positions[a],positions[b],positions[c],false,tmp)
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
    if (!face || face.vertexIds.length !== 4) return null

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

  private pointerParameter(): number {
    const edge = this.hoveredEdgeId === null ? null : this.ctx.mesh.edges.get(this.hoveredEdgeId)
    if (!edge) return 0.5
    const a = this.ctx.mesh.vertices.get(edge.v1)!.position
    const b = this.ctx.mesh.vertices.get(edge.v2)!.position
    const t = ScreenGeometry.closestPointParameterOnSegment2D(this.overlayPointer(this.currentMouse),this.toOverlay(a),this.toOverlay(b))
    return perspectiveEdgeParameter(t,this.toWorld(a),this.toWorld(b),this.ctx.camera)
  }

  private updateSlideFromPointer(shift: boolean, ctrl: boolean) {
    if (this.numericInput.active) return
    let offset = (this.pointerParameter() - this.slideStart) * (shift ? 0.2 : 1)
    if (ctrl) offset = Math.round(offset * 10) / 10
    this.slideFactor = Math.max(0.001,Math.min(0.999,0.5 + offset))
  }

  private getCutParameters(): number[] {
    const spacing = 1 / (this.cutCount + 1)
    // Translate the entire group within one spacing, never clamp cuts onto each other.
    const offset = Math.max(-spacing + 0.001, Math.min(spacing - 0.001, (this.slideFactor - 0.5) * 2 * spacing))
    return Array.from({length:this.cutCount},(_,i)=>(i+1)*spacing + offset)
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
    this.restoreSnapshot()
    const result = LoopCutKernel.cutLoop(this.ctx.mesh,this.hoveredEdgeId,this.getCutParameters())
    if (!result.newEdgeIds.length || !MeshValidator.validate(this.ctx.mesh).valid) {
      this.restoreSnapshot()
      this.ctx.onUpdatePreview()
      this.cancel()
      return
    }
    this.ctx.selectedVertIds = result.newVertexIds
    this.ctx.selectedEdgeIds = result.newEdgeIds
    this.ctx.selectedFaceIds = []
    super.confirm()
  }

  updateStatus() {
    this.statusText = this.loopState === LoopCutState.SLIDING
      ? `Slide ${(2*this.slideFactor-1).toFixed(3)} · move or type -1 to 1 · Shift precision · Ctrl snap · click/Enter apply · RMB center · Esc cancel`
      : this.ringEdgeIds.length
        ? `${this.cutCount} cuts · scroll or type count · click/Enter to slide · Esc cancel`
        : 'Hover a quad face · loops stop at triangles, n-gons, and boundaries · Esc cancel'
  }

}
