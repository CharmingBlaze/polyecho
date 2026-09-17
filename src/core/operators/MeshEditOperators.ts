import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { MeshEditOps } from '../mesh/operations/MeshEditOps'
import { LoopCutKernel } from '../mesh/operations/LoopCutKernel'
import {
  applyEdgeSlide,
  applyVertexSlide,
  edgeSlideRails,
  firstRingEdge,
  vertexSlideRails,
  type SlideRail
} from '../mesh/operations/SlideKernel'
import { TransformSolver } from '../transform/TransformSolver'
import { ScreenGeometry } from '../geometry/ScreenGeometry'

function mouseDelta(startX: number, curX: number, shift: boolean, numeric: number | null): number {
  if (numeric !== null) return numeric
  const f = (curX - startX) * 0.01
  return shift ? f * 0.2 : f
}

export class EdgeSlideOperator extends ModalOperator {
  readonly name = 'Edge Slide'
  private rails: SlideRail[] = []
  private factor = 0

  begin(ctx: Parameters<ModalOperator['begin']>[0], pointer: { x: number; y: number }) {
    super.begin(ctx, pointer)
    this.rails = edgeSlideRails(ctx.mesh, ctx.selectedEdgeIds)
    this.evaluate()
  }

  evaluate() {
    this.restoreSnapshot()
    this.rails = edgeSlideRails(this.ctx.mesh, this.ctx.selectedEdgeIds)
    this.factor = mouseDelta(this.startMouse.x, this.currentMouse.x, this.isShiftHeld, this.numericInput.getValue())
    applyEdgeSlide(this.ctx.mesh, this.rails, this.factor)
  }

  confirm() {
    if (!this.rails.length) { this.cancel(); return }
    super.confirm()
  }

  updateStatus() {
    this.statusText = `Edge Slide ${this.factor.toFixed(3)}  (LMB/Enter confirm · Esc cancel)`
  }
}

export class VertexSlideOperator extends ModalOperator {
  readonly name = 'Vertex Slide'
  private rail: SlideRail | null = null
  private factor = 0

  begin(ctx: Parameters<ModalOperator['begin']>[0], pointer: { x: number; y: number }) {
    super.begin(ctx, pointer)
    this.rail = vertexSlideRails(ctx.mesh, ctx.selectedVertIds[0]!, ctx.selectedEdgeIds[0])
    this.evaluate()
  }

  evaluate() {
    this.restoreSnapshot()
    this.rail = vertexSlideRails(this.ctx.mesh, this.ctx.selectedVertIds[0]!, this.ctx.selectedEdgeIds[0])
    this.factor = mouseDelta(this.startMouse.x, this.currentMouse.x, this.isShiftHeld, this.numericInput.getValue())
    if (this.rail) applyVertexSlide(this.ctx.mesh, this.rail, this.factor)
  }

  confirm() {
    if (!this.rail) { this.cancel(); return }
    super.confirm()
  }

  updateStatus() {
    this.statusText = `Vertex Slide ${this.factor.toFixed(3)}  (LMB/Enter confirm · Esc cancel)`
  }
}

export class OffsetEdgeLoopOperator extends ModalOperator {
  readonly name = 'Offset Edge Loop'
  private startEdge: number | null = null
  private factor = 0.25

  begin(ctx: Parameters<ModalOperator['begin']>[0], pointer: { x: number; y: number }) {
    super.begin(ctx, pointer)
    this.startEdge = firstRingEdge(ctx.mesh, ctx.selectedEdgeIds)
    this.evaluate()
  }

  evaluate() {
    this.restoreSnapshot()
    this.startEdge = firstRingEdge(this.ctx.mesh, this.ctx.selectedEdgeIds)
    this.factor = THREE.MathUtils.clamp(0.25 + mouseDelta(this.startMouse.x, this.currentMouse.x, this.isShiftHeld, this.numericInput.getValue()) * 0.2, 0.02, 0.48)
    if (this.startEdge != null && LoopCutKernel.ringEdges(this.ctx.mesh, this.startEdge).length) {
      MeshEditOps.offsetEdgeLoop(this.ctx.mesh, this.startEdge, this.factor)
    }
  }

  confirm() {
    if (this.startEdge == null) { this.cancel(); return }
    super.confirm()
  }

  updateStatus() {
    this.statusText = `Offset Edge Loop ${this.factor.toFixed(3)}  (LMB/Enter confirm · Esc cancel)`
  }
}

export class BisectOperator extends ModalOperator {
  readonly name = 'Bisect'
  private fill = true
  private offset = 0

  keyDown(event: KeyboardEvent): boolean {
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault()
      this.fill = !this.fill
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    return super.keyDown(event)
  }

  evaluate() {
    this.restoreSnapshot()
    const cam = this.ctx.camera
    const origin = this.ctx.cursorWorld?.clone() ?? this.pivot.clone()
    const normal = new THREE.Vector3()
    cam.getWorldDirection(normal)
    this.offset = mouseDelta(this.startMouse.x, this.currentMouse.x, this.isShiftHeld, this.numericInput.getValue())
    origin.addScaledVector(normal, this.offset)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin)
    MeshEditOps.bisect(this.ctx.mesh, plane, this.fill, true)
  }

  updateStatus() {
    this.statusText = `Bisect offset ${this.offset.toFixed(3)}  fill ${this.fill ? 'on' : 'off'} (F) · Enter confirm`
  }
}

export class SpinOperator extends ModalOperator {
  readonly name = 'Spin'
  private steps = 8
  private angle = 90

  wheel(event: WheelEvent): boolean {
    event.preventDefault()
    this.steps = Math.max(2, Math.min(64, this.steps + (event.deltaY < 0 ? 1 : -1)))
    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
    return true
  }

  evaluate() {
    this.restoreSnapshot()
    const num = this.numericInput.getValue()
    this.angle = num !== null ? num : THREE.MathUtils.clamp(90 + (this.currentMouse.x - this.startMouse.x) * 0.5, -360, 360)
    const origin = this.ctx.cursorWorld?.clone() ?? this.pivot.clone()
    const axis = new THREE.Vector3(0, 1, 0)
    if (this.constraint === 'X') axis.set(1, 0, 0)
    else if (this.constraint === 'Z') axis.set(0, 0, 1)
    MeshEditOps.spin(this.ctx.mesh, this.ctx.selectedVertIds, origin, axis, this.steps, this.angle)
  }

  confirm() {
    if (this.ctx.selectedVertIds.length < 2) { this.cancel(); return }
    super.confirm()
  }

  updateStatus() {
    this.statusText = `Spin ${this.angle.toFixed(1)}° × ${this.steps}  (scroll steps · X/Y/Z axis · Enter confirm)`
  }
}

export class ShrinkFattenOperator extends ModalOperator {
  readonly name = 'Shrink/Fatten'
  private dist = 0

  evaluate() {
    this.restoreSnapshot()
    const num = this.numericInput.getValue()
    const ray = ScreenGeometry.rayFromClient(this.currentMouse, this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant)
    const start = ScreenGeometry.rayFromClient(this.startMouse, this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant)
    this.dist = num !== null
      ? num
      : TransformSolver.rayLineClosestPoint(ray, this.pivot, this.ctx.camera.getWorldDirection(new THREE.Vector3()))
        - TransformSolver.rayLineClosestPoint(start, this.pivot, this.ctx.camera.getWorldDirection(new THREE.Vector3()))
    if (!Number.isFinite(this.dist)) this.dist = (this.startMouse.y - this.currentMouse.y) * 0.01
    if (this.isShiftHeld && num === null) this.dist *= 0.2
    MeshEditOps.shrinkFatten(this.ctx.mesh, [...this.collectTargetVertIds()], this.dist)
  }

  updateStatus() {
    this.statusText = `Shrink/Fatten ${this.dist.toFixed(3)}  (Enter confirm · Esc cancel)`
  }
}

export class ShearOperator extends ModalOperator {
  readonly name = 'Shear'
  private factor = 0

  evaluate() {
    this.restoreSnapshot()
    this.factor = mouseDelta(this.startMouse.x, this.currentMouse.x, this.isShiftHeld, this.numericInput.getValue())
    const axis = this.constraint === 'Y' ? 'y' : this.constraint === 'Z' ? 'z' : 'x'
    const along = axis === 'x' ? 'y' : 'x'
    MeshEditOps.shear(this.ctx.mesh, [...this.collectTargetVertIds()], axis, along, this.factor, this.pivot)
  }

  updateStatus() {
    this.statusText = `Shear ${this.factor.toFixed(3)}  (X/Y/Z · Enter confirm)`
  }
}

export class ToSphereOperator extends ModalOperator {
  readonly name = 'To Sphere'
  private factor = 0

  evaluate() {
    this.restoreSnapshot()
    this.factor = THREE.MathUtils.clamp(mouseDelta(this.startMouse.x, this.currentMouse.x, this.isShiftHeld, this.numericInput.getValue()) + 0.5, 0, 1)
    MeshEditOps.toSphere(this.ctx.mesh, [...this.collectTargetVertIds()], this.factor, this.pivot)
  }

  updateStatus() {
    this.statusText = `To Sphere ${this.factor.toFixed(3)}  (Enter confirm · Esc cancel)`
  }
}
