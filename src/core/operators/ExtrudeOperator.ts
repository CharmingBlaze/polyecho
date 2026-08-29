import * as THREE from 'three'
import { ModalOperator, OperatorContext } from './ModalOperator'
import { ExtrudeKernel, ExtrudeResult } from '../mesh/operations/ExtrudeKernel'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'

export class ExtrudeOperator extends ModalOperator {
  readonly name = 'Extrude'

  private extrudeResult!: ExtrudeResult
  private normal = new THREE.Vector3(0, 1, 0)
  private startRay = new THREE.Ray()
  private currentRay = new THREE.Ray()

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    // 1. Execute topological extrusion
    this.extrudeResult = ExtrudeKernel.extrudeFaces(ctx.mesh, ctx.selectedFaceIds)
    this.normal.copy(this.extrudeResult.regionNormal)

    // Update selected faces to point to the new cap faces
    ctx.selectedFaceIds = [...this.extrudeResult.extrudedFaceIds]
    ctx.selectedVertIds = [...this.extrudeResult.newVertexIds]

    // 2. Begin standard modal move on newly extruded geometry
    super.begin(ctx, startPointer)

    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const cW = rect.width || window.innerWidth
    const cH = rect.height || window.innerHeight

    const ndcStart = new THREE.Vector2(
      ((this.startMouse.x - rect.left) / cW) * 2 - 1,
      -((this.startMouse.y - rect.top) / cH) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcStart, this.ctx.camera)
    this.startRay.copy(raycaster.ray)
  }

  evaluate() {
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const cW = rect.width || window.innerWidth
    const cH = rect.height || window.innerHeight

    const ndcCur = new THREE.Vector2(
      ((this.currentMouse.x - rect.left) / cW) * 2 - 1,
      -((this.currentMouse.y - rect.top) / cH) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcCur, this.ctx.camera)
    this.currentRay.copy(raycaster.ray)

    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera, this.normal)
    const numVal = this.numericInput.getValue()

    let moveDir = this.normal.clone()
    if (this.constraint === 'X') moveDir = basis.x.clone()
    else if (this.constraint === 'Y') moveDir = basis.y.clone()
    else if (this.constraint === 'Z') moveDir = basis.z.clone()

    let dist = 0
    if (numVal !== null) {
      dist = numVal
    } else {
      const tStart = TransformSolver.rayLineClosestPoint(this.startRay, this.pivot, moveDir)
      const tCur = TransformSolver.rayLineClosestPoint(this.currentRay, this.pivot, moveDir)
      dist = tCur - tStart

      if (!isFinite(dist) || Math.abs(dist) < 0.00001) {
        const hitStart = TransformSolver.rayPlaneIntersect(this.startRay, this.pivot, this.ctx.camera)
        const hitCur = TransformSolver.rayPlaneIntersect(this.currentRay, this.pivot, this.ctx.camera)
        if (hitStart && hitCur) {
          const planeDelta = hitCur.sub(hitStart)
          dist = planeDelta.dot(moveDir)
        }
      }
    }

    if (this.isShiftHeld && numVal === null) {
      dist *= 0.2
    }

    if (this.isCtrlHeld && numVal === null) {
      dist = this.snapManager.snapLinear(dist, 0.5)
    }

    const delta = moveDir.multiplyScalar(dist)

    for (const vId of this.extrudeResult.newVertexIds) {
      const initPos = this.initialVertices.get(vId)
      const v = this.ctx.mesh.vertices.get(vId)
      if (initPos && v) {
        v.position.copy(initPos).add(delta)
      }
    }

    this.ctx.mesh.recalculateNormals()
  }

  cancel() {
    // Blender 5.2 behavior: cancelling extrude movement keeps 0-distance extrusion topology
    for (const vId of this.extrudeResult.newVertexIds) {
      const initPos = this.initialVertices.get(vId)
      const v = this.ctx.mesh.vertices.get(vId)
      if (initPos && v) {
        v.position.copy(initPos)
      }
    }
    this.ctx.mesh.recalculateNormals()
    this.ctx.onCancel()
  }

  updateStatus() {
    const constraintText = this.constraint !== 'FREE' ? ` ${this.constraint}` : ' Normal'
    const num = this.numericInput.text ? `: ${this.numericInput.text}m` : ''
    this.statusText = `Extrude Region${constraintText}${num}`
  }
}
