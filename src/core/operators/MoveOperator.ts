import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { TransformSolver } from '../transform/TransformSolver'
import { PivotManager } from '../transform/PivotManager'

export class MoveOperator extends ModalOperator {
  readonly name = 'Move'

  private startRay = new THREE.Ray()
  private currentRay = new THREE.Ray()
  private startHit = new THREE.Vector3()
  private currentHit = new THREE.Vector3()

  begin(ctx: any, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)

    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const cW = rect.width || window.innerWidth
    const cH = rect.height || window.innerHeight

    // Build start ray
    const ndcStart = new THREE.Vector2(
      ((this.startMouse.x - rect.left) / cW) * 2 - 1,
      -((this.startMouse.y - rect.top) / cH) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcStart, this.ctx.camera)
    this.startRay.copy(raycaster.ray)

    const hit = TransformSolver.rayPlaneIntersect(this.startRay, this.pivot, this.ctx.camera)
    if (hit) this.startHit.copy(hit)
  }

  evaluate() {
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const cW = rect.width || window.innerWidth
    const cH = rect.height || window.innerHeight

    // Build current ray
    const ndcCur = new THREE.Vector2(
      ((this.currentMouse.x - rect.left) / cW) * 2 - 1,
      -((this.currentMouse.y - rect.top) / cH) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(ndcCur, this.ctx.camera)
    this.currentRay.copy(raycaster.ray)

    const hit = TransformSolver.rayPlaneIntersect(this.currentRay, this.pivot, this.ctx.camera)
    if (hit) this.currentHit.copy(hit)

    const basis = PivotManager.getBasis(this.orientation, this.ctx.camera)
    const numVal = this.numericInput.getValue()

    let delta = TransformSolver.solveMoveDelta(
      this.startHit,
      this.currentHit,
      this.startRay,
      this.currentRay,
      this.pivot,
      basis,
      this.constraint,
      numVal
    )

    if (this.isShiftHeld && numVal === null) {
      delta.multiplyScalar(0.2)
    }

    if (this.isCtrlHeld && numVal === null) {
      const step = this.ctx.gridSize || 0.5
      delta.x = this.snapManager.snapLinear(delta.x, step)
      delta.y = this.snapManager.snapLinear(delta.y, step)
      delta.z = this.snapManager.snapLinear(delta.z, step)
    }

    const targetVertIds = this.collectTargetVertIds()
    const worldMat = this.ctx.objectMatrix ?? new THREE.Matrix4()
    const movingWorld: THREE.Vector3[] = []
    const movingIds: number[] = []

    for (const vId of targetVertIds) {
      const initPos = this.initialVertices.get(vId)
      if (!initPos) continue
      movingIds.push(vId)
      movingWorld.push(initPos.clone().add(delta))
    }

    let extra = new THREE.Vector3()
    if ((this.ctx.snapVertex || this.ctx.snapEdge) && movingWorld.length > 0) {
      const targets: THREE.Vector3[] = []
      if (this.ctx.snapVertex) {
        for (const [id, v] of this.ctx.mesh.vertices) {
          if (targetVertIds.has(id)) continue
          targets.push(v.position.clone().applyMatrix4(worldMat))
        }
      }
      if (this.ctx.snapEdge) {
        for (const e of this.ctx.mesh.edges.values()) {
          if (targetVertIds.has(e.v1) || targetVertIds.has(e.v2)) continue
          const a = this.ctx.mesh.vertices.get(e.v1)?.position
          const b = this.ctx.mesh.vertices.get(e.v2)?.position
          if (!a || !b) continue
          targets.push(a.clone().add(b).multiplyScalar(0.5).applyMatrix4(worldMat))
        }
      }
      const thresh = Math.max(0.06, (this.ctx.gridSize || 0.25) * 0.75)
      const snap = this.snapManager.findRigidSnapOffset(movingWorld, targets, thresh)
      if (snap) extra.copy(snap)
    }

    for (let i = 0; i < movingIds.length; i++) {
      this.writeWorldPos(movingIds[i], movingWorld[i].add(extra))
    }

    this.ctx.mesh.recalculateNormals()
  }

  updateStatus() {
    const constraintText = this.constraint !== 'FREE' ? ` ${this.constraint} (${this.orientation})` : ''
    const num = this.numericInput.text ? `: ${this.numericInput.text}` : ''
    this.statusText = `Move${constraintText}${num}`
  }
}
