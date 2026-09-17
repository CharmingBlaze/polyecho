import * as THREE from 'three'
import { ModalOperator, OperatorContext } from './ModalOperator'
import { ExtrudeKernel, ExtrudeResult } from '../mesh/operations/ExtrudeKernel'
import { MeshEditOps } from '../mesh/operations/MeshEditOps'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'
import { ScreenGeometry } from '../geometry/ScreenGeometry'

export class ExtrudeOperator extends ModalOperator {
  readonly name = 'Extrude'

  private individual = false
  private manifold = false
  private extrudeResult: ExtrudeResult | null = null
  private normal = new THREE.Vector3(0, 1, 0)
  private startRay = new THREE.Ray()
  private currentRay = new THREE.Ray()
  private startedAt = 0
  private lastDist = 0

  constructor(individual = false) {
    super()
    this.individual = individual
  }

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.startedAt = performance.now()
    this.startRay.copy(this.pointerRay(startPointer))
    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
  }

  keyDown(event: KeyboardEvent): boolean {
    const k = event.key.toLowerCase()
    if (k === 'i' && !event.altKey) {
      event.preventDefault()
      if (performance.now() - this.startedAt < 80) return true
      this.individual = !this.individual
      if (this.individual) this.manifold = false
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    if (k === 'm' && !event.altKey) {
      event.preventDefault()
      this.manifold = !this.manifold
      if (this.manifold) this.individual = false
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    return super.keyDown(event)
  }

  evaluate() {
    this.restoreSnapshot()

    this.extrudeResult = ExtrudeKernel.extrude(this.ctx.mesh, {
      individual: this.individual,
      faceIds: this.ctx.selectedFaceIds,
      edgeIds: this.ctx.selectedEdgeIds,
      vertexIds: this.ctx.selectedFaceIds.length || this.ctx.selectedEdgeIds.length
        ? []
        : this.ctx.selectedVertIds,
    })

    const worldMat = this.ctx.objectMatrix?.clone() ?? new THREE.Matrix4()
    this.worldToLocal.copy(worldMat).invert()
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMat)
    this.normal.copy(this.extrudeResult.regionNormal).applyMatrix3(normalMatrix).normalize()
    if (this.normal.lengthSq() < 1e-8) this.normal.set(0, 1, 0)

    this.pivot.set(0, 0, 0)
    let count = 0
    const restWorld = new Map<number, THREE.Vector3>()
    for (const vId of this.extrudeResult.newVertexIds) {
      const v = this.ctx.mesh.vertices.get(vId)
      if (!v) continue
      const w = v.position.clone().applyMatrix4(worldMat)
      restWorld.set(vId, w)
      this.pivot.add(w)
      count++
    }
    if (count > 0) this.pivot.divideScalar(count)

    this.currentRay.copy(this.pointerRay(this.currentMouse))
    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera, this.normal, this.ctx.objectEuler)
    const numVal = this.numericInput.getValue()

    let moveDir = this.normal.clone()
    if (this.constraint === 'X') moveDir = basis.x.clone()
    else if (this.constraint === 'Y') moveDir = basis.y.clone()
    else if (this.constraint === 'Z') moveDir = basis.z.clone()
    else if (this.constraint === 'XY' || this.constraint === 'XZ' || this.constraint === 'YZ') {
      moveDir = this.normal.clone()
    }

    let dist = 0
    if (numVal !== null) {
      dist = numVal
    } else {
      const tStart = TransformSolver.rayLineClosestPoint(this.startRay, this.pivot, moveDir)
      const tCur = TransformSolver.rayLineClosestPoint(this.currentRay, this.pivot, moveDir)
      dist = tCur - tStart
      if (!isFinite(dist)) dist = 0
      if (Math.abs(dist) < 1e-6) {
        const hitStart = TransformSolver.rayPlaneIntersect(this.startRay, this.pivot, this.ctx.camera)
        const hitCur = TransformSolver.rayPlaneIntersect(this.currentRay, this.pivot, this.ctx.camera)
        if (hitStart && hitCur) dist = hitCur.sub(hitStart).dot(moveDir)
        // In a face-on view the normal projects to a point. Vertical drag still
        // controls extrusion, scaled to the visible world size at the pivot.
        if (Math.abs(dist) < 1e-6) {
          const height = this.ctx.viewportElement.clientHeight || this.ctx.viewportElement.getBoundingClientRect().height || 600
          const cam = this.ctx.camera as THREE.OrthographicCamera & THREE.PerspectiveCamera
          const span = cam.isOrthographicCamera ? (cam.top - cam.bottom) / cam.zoom
            : 2 * this.pivot.distanceTo(cam.position) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
          dist = (this.startMouse.y - this.currentMouse.y) * span / height
        }
      }
    }

    if (this.isShiftHeld && numVal === null) dist *= 0.2
    if (this.isCtrlHeld && numVal === null) {
      dist = this.snapManager.snapLinear(dist, this.ctx.gridSize || 0.1)
    }
    this.lastDist = dist

    const delta = moveDir.multiplyScalar(dist)
    for (const vId of this.extrudeResult.newVertexIds) {
      const rest = restWorld.get(vId)
      if (!rest) continue
      const localNormal = this.individual && this.constraint === 'FREE' ? this.extrudeResult.vertexNormals?.get(vId) : undefined
      const movement = localNormal ? localNormal.clone().applyMatrix3(normalMatrix).normalize().multiplyScalar(dist) : delta
      this.writeWorldPos(vId, rest.clone().add(movement))
    }

    this.ctx.mesh.recalculateNormals()
    if (this.manifold && this.extrudeResult) {
      MeshEditOps.cleanupManifoldExtrude(
        this.ctx.mesh,
        this.extrudeResult.extrudedFaceIds,
        this.extrudeResult.newVertexIds
      )
    }
  }

  confirm() {
    const liveCaps = this.extrudeResult?.extrudedFaceIds.filter(id => this.ctx.mesh.faces.has(id)) ?? []
    const liveNew = this.extrudeResult?.newVertexIds.filter(id => this.ctx.mesh.vertices.has(id)) ?? []
    if (!this.extrudeResult || Math.abs(this.lastDist) < 1e-9 || (!liveNew.length && !liveCaps.length)) {
      this.cancel()
      return
    }
    this.ctx.selectedFaceIds = liveCaps
    this.ctx.selectedVertIds = liveNew.length
      ? liveNew
      : [...new Set(liveCaps.flatMap(id => this.ctx.mesh.faces.get(id)?.vertexIds ?? []))]
    super.confirm()
  }

  private pointerRay(pointer: { x: number; y: number }): THREE.Ray {
    return ScreenGeometry.rayFromClient(
      pointer,
      this.ctx.camera,
      this.ctx.viewportElement,
      this.ctx.quadrant
    )
  }

  updateStatus() {
    const kind = this.individual ? 'Individual' : this.manifold ? 'Manifold' : 'Region'
    const axis = this.constraint !== 'FREE' ? ` ${this.constraint}` : ' Normal'
    const num = this.numericInput.text ? `: ${this.numericInput.text}` : ` ${this.lastDist.toFixed(3)}`
    this.statusText = `Extrude ${kind}${axis}${num}  (I individual · M manifold · LMB confirm · Esc cancel)`
  }
}
