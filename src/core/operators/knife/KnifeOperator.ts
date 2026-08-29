import * as THREE from 'three'
import { ModalOperator, OperatorContext } from '../ModalOperator'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'
import { TopologyOps } from '../../mesh/operations/TopologyOps'

export type KnifeTargetType = 'VERTEX' | 'EDGE' | 'FACE' | 'MIDPOINT'

export interface KnifePoint {
  world: THREE.Vector3
  screen: THREE.Vector2
  targetType: KnifeTargetType
  vertexId?: number
  edgeId?: number
  faceId?: number
  edgeT?: number
}

export class KnifeOperator extends ModalOperator {
  readonly name = 'Knife'

  public points: KnifePoint[] = []
  public currentHoverPoint: KnifePoint | null = null
  public cutThrough = false
  public angleSnapping = false
  public snapAngleDegrees = 45

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.points = []
    this.currentHoverPoint = null
    this.cutThrough = false
    this.angleSnapping = false

    this.resolveHoverTarget({ x: startPointer.x, y: startPointer.y }, false, false)
  }

  pointerMove(event: PointerEvent) {
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.resolveHoverTarget(this.currentMouse, event.shiftKey, event.ctrlKey)
    this.ctx.onUpdatePreview()
    this.updateStatus()
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()

    if (key === 'c') {
      event.preventDefault()
      this.cutThrough = !this.cutThrough
      this.updateStatus()
      return true
    } else if (key === 'a') {
      event.preventDefault()
      this.angleSnapping = !this.angleSnapping
      this.updateStatus()
      return true
    } else if (event.ctrlKey && key === 'z') {
      // Local undo: pop last knife point
      event.preventDefault()
      if (this.points.length > 0) {
        this.points.pop()
        this.ctx.onUpdatePreview()
        this.updateStatus()
      }
      return true
    } else if (key === 'enter' || key === ' ') {
      event.preventDefault()
      this.confirm()
      return true
    } else if (key === 'escape') {
      event.preventDefault()
      this.cancel()
      return true
    }

    return super.keyDown(event)
  }

  handlePointerDown(button: number): boolean {
    if (button === 0) {
      // LMB: add knife point
      if (this.currentHoverPoint) {
        this.points.push({ ...this.currentHoverPoint })
        this.ctx.onUpdatePreview()
        this.updateStatus()
        return true
      }
    } else if (button === 2) {
      // RMB: cancel or restart path
      if (this.points.length > 0) {
        this.points = []
        this.ctx.onUpdatePreview()
        this.updateStatus()
        return true
      } else {
        this.cancel()
        return true
      }
    }
    return false
  }

  private resolveHoverTarget(mousePos: { x: number; y: number }, shiftKey: boolean, ctrlKey: boolean) {
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const mousePt = new THREE.Vector2(mousePos.x, mousePos.y)

    // Ctrl key ignores snapping
    if (!ctrlKey) {
      // 1. Priority 1: Existing Vertex (10px tolerance)
      for (const [vId, v] of this.ctx.mesh.vertices) {
        const s = ScreenGeometry.worldToScreen(v.position, this.ctx.camera, rect)
        if (mousePt.distanceTo(s) <= 10) {
          this.currentHoverPoint = {
            world: v.position.clone(),
            screen: s,
            targetType: 'VERTEX',
            vertexId: vId
          }
          return
        }
      }

      // 2. Priority 2: Existing Edge & Midpoint (8px tolerance)
      for (const [eId, edge] of this.ctx.mesh.edges) {
        const p1 = this.ctx.mesh.vertices.get(edge.v1)?.position
        const p2 = this.ctx.mesh.vertices.get(edge.v2)?.position
        if (!p1 || !p2) continue

        const s1 = ScreenGeometry.worldToScreen(p1, this.ctx.camera, rect)
        const s2 = ScreenGeometry.worldToScreen(p2, this.ctx.camera, rect)

        const { distance, t } = ScreenGeometry.distancePointToSegment2D(mousePt, s1, s2)
        if (distance <= 8) {
          const isMidpoint = shiftKey || Math.abs(t - 0.5) < 0.08
          const finalT = isMidpoint ? 0.5 : t
          const worldPos = p1.clone().lerp(p2, finalT)
          const screenPos = ScreenGeometry.worldToScreen(worldPos, this.ctx.camera, rect)

          this.currentHoverPoint = {
            world: worldPos,
            screen: screenPos,
            targetType: isMidpoint ? 'MIDPOINT' : 'EDGE',
            edgeId: eId,
            edgeT: finalT
          }
          return
        }
      }
    }

    // 3. Priority 3: Face surface raycast
    const ray = ScreenGeometry.screenToRay(mousePos, this.ctx.camera, rect)
    let closestDist = Infinity
    let hitFaceId: number | null = null
    let hitPoint: THREE.Vector3 | null = null

    for (const [fId, face] of this.ctx.mesh.faces) {
      if (face.vertexIds.length < 3) continue
      const p0 = this.ctx.mesh.vertices.get(face.vertexIds[0])?.position
      const p1 = this.ctx.mesh.vertices.get(face.vertexIds[1])?.position
      const p2 = this.ctx.mesh.vertices.get(face.vertexIds[2])?.position
      if (!p0 || !p1 || !p2) continue

      const intersect = ray.intersectTriangle(p0, p1, p2, false, new THREE.Vector3())
      if (intersect) {
        const d = ray.origin.distanceTo(intersect)
        if (d < closestDist) {
          closestDist = d
          hitFaceId = fId
          hitPoint = intersect
        }
      }

      // If quad, test second triangle
      if (face.vertexIds.length === 4) {
        const p3 = this.ctx.mesh.vertices.get(face.vertexIds[3])?.position
        if (p3) {
          const intersectQuad = ray.intersectTriangle(p0, p2, p3, false, new THREE.Vector3())
          if (intersectQuad) {
            const d = ray.origin.distanceTo(intersectQuad)
            if (d < closestDist) {
              closestDist = d
              hitFaceId = fId
              hitPoint = intersectQuad
            }
          }
        }
      }
    }

    if (hitPoint && hitFaceId !== null) {
      this.currentHoverPoint = {
        world: hitPoint,
        screen: mousePt,
        targetType: 'FACE',
        faceId: hitFaceId
      }
    } else {
      // Free 3D plane projection
      const hit = ray.intersectPlane(
        new THREE.Plane().setFromNormalAndCoplanarPoint(
          this.ctx.camera.getWorldDirection(new THREE.Vector3()).negate(),
          this.pivot
        ),
        new THREE.Vector3()
      )
      if (hit) {
        this.currentHoverPoint = {
          world: hit,
          screen: mousePt,
          targetType: 'FACE'
        }
      }
    }
  }

  evaluate() {
    // Evaluates during interactive drawing
  }

  confirm() {
    if (this.points.length < 2) {
      this.cancel()
      return
    }

    // Step 1: Resolve and insert cut points
    const resolvedVertexIds: number[] = []

    for (const pt of this.points) {
      if (pt.targetType === 'VERTEX' && pt.vertexId !== undefined) {
        resolvedVertexIds.push(pt.vertexId)
      } else if ((pt.targetType === 'EDGE' || pt.targetType === 'MIDPOINT') && pt.edgeId !== undefined) {
        const split = TopologyOps.splitEdge(this.ctx.mesh, pt.edgeId, pt.edgeT || 0.5)
        if (split) {
          resolvedVertexIds.push(split.newVertexId)
        }
      } else {
        // Face interior vertex
        const newV = this.ctx.mesh.addVertex(pt.world)
        resolvedVertexIds.push(newV.id)
      }
    }

    // Step 2: Connect consecutive vertices across intersecting faces
    for (let i = 0; i < resolvedVertexIds.length - 1; i++) {
      const vA = resolvedVertexIds[i]
      const vB = resolvedVertexIds[i + 1]
      if (vA === vB) continue

      // Find face containing both vA and vB
      for (const [fId, face] of this.ctx.mesh.faces) {
        if (face.vertexIds.includes(vA) && face.vertexIds.includes(vB)) {
          TopologyOps.splitFace(this.ctx.mesh, fId, vA, vB)
          break
        }
      }
    }

    this.ctx.mesh.recalculateNormals()
    super.confirm()
  }

  cancel() {
    this.points = []
    this.currentHoverPoint = null
    super.cancel()
  }

  updateStatus() {
    const cutThroughMode = this.cutThrough ? ' [Cut-Through: ON]' : ''
    const ptCount = this.points.length
    this.statusText = `Knife (LMB: Cut | Enter: Confirm | Esc: Cancel | C: Cut-Through | Ctrl+Z: Undo Point) | Points: ${ptCount}${cutThroughMode}`
  }
}
