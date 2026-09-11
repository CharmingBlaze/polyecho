import * as THREE from 'three'
import { ModalOperator, OperatorContext } from '../ModalOperator'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'
import { KnifeKernel, type KnifePoint, type KnifeTargetType } from '../../mesh/operations/KnifeKernel'
import { adoptEditMeshUnderPointer, copyObjectMatrix } from '../adoptEditMesh'

export type { KnifePoint, KnifeTargetType }

export class KnifeOperator extends ModalOperator {
  readonly name = 'Knife'

  public points: KnifePoint[] = []
  public currentHoverPoint: KnifePoint | null = null
  /** Overlay-pixel cursor used for the rubber-band — stays on the pointer. */
  public cursorOverlay = new THREE.Vector2()
  public cutThrough = false
  public angleSnapping = false
  public snapAngleDegrees = 45

  private objectWorld = new THREE.Matrix4()
  private objectInv = new THREE.Matrix4()

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.points = []
    this.currentHoverPoint = null
    copyObjectMatrix(ctx, this.objectWorld, this.objectInv)
    this.cursorOverlay.set(0, 0)
    this.cutThrough = false
    this.angleSnapping = false

    this.resolveHoverTarget({ x: startPointer.x, y: startPointer.y }, false, false)
  }

  pointerMove(event: PointerEvent) {
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.resolveHoverTarget(this.currentMouse, event.shiftKey, event.ctrlKey)
    this.updateStatus()
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()

    if (key === 'c') {
      event.preventDefault()
      this.cutThrough = !this.cutThrough
      this.resolveHoverTarget(this.currentMouse, event.shiftKey, event.ctrlKey)
      this.updateStatus()
      return true
    }
    if (key === 'a') {
      event.preventDefault()
      this.angleSnapping = !this.angleSnapping
      this.resolveHoverTarget(this.currentMouse, event.shiftKey, event.ctrlKey)
      this.updateStatus()
      return true
    }
    if (event.ctrlKey && key === 'z') {
      event.preventDefault()
      if (this.points.length > 0) {
        this.points.pop()
        this.updateStatus()
      }
      return true
    }
    if (key === 'enter' || key === ' ') {
      event.preventDefault()
      this.confirm()
      return true
    }
    if (key === 'escape') {
      event.preventDefault()
      this.cancel()
      return true
    }

    return super.keyDown(event)
  }

  handlePointerDown(button: number): boolean {
    if (button === 0) {
      if (this.currentHoverPoint) {
        this.points.push({ ...this.currentHoverPoint, world: this.currentHoverPoint.world.clone(), screen: this.currentHoverPoint.screen.clone() })
        this.updateStatus()
        return true
      }
    } else if (button === 2) {
      if (this.points.length > 0) {
        this.points = []
        this.updateStatus()
        return true
      }
      this.cancel()
      return true
    }
    return false
  }

  private mappingEl() {
    return this.ctx.viewportElement
  }

  private overlayPointer(client: { x: number; y: number }) {
    const p = ScreenGeometry.pointerInView(client, this.mappingEl())
    return new THREE.Vector2(p.x, p.y)
  }

  private toWorld(local: THREE.Vector3) {
    return local.clone().applyMatrix4(this.objectWorld)
  }

  private toOverlay(local: THREE.Vector3) {
    return ScreenGeometry.worldToOverlay(
      this.toWorld(local),
      this.ctx.camera,
      this.mappingEl(),
      this.ctx.quadrant
    )
  }

  private localRayFromClient(client: { x: number; y: number }) {
    const worldRay = ScreenGeometry.rayFromClient(client, this.ctx.camera, this.mappingEl(), this.ctx.quadrant)
    const origin = worldRay.origin.clone().applyMatrix4(this.objectInv)
    const dir = worldRay.direction.clone().transformDirection(this.objectInv).normalize()
    return new THREE.Ray(origin, dir)
  }

  private viewportRect() {
    return ScreenGeometry.overlayRect(this.mappingEl())
  }

  private resolveHoverTarget(mousePos: { x: number; y: number }, shiftKey: boolean, ctrlKey: boolean) {
    if (this.points.length === 0) {
      if (adoptEditMeshUnderPointer(this.ctx, mousePos, { vertexPx: 8, edgePx: 28 })) {
        copyObjectMatrix(this.ctx, this.objectWorld, this.objectInv)
        this.initialSnapshot = this.ctx.mesh.createSnapshot()
      }
    }

    let overlay = this.overlayPointer(mousePos)
    const last = this.points[this.points.length - 1]
    if (this.angleSnapping && last) {
      overlay = KnifeKernel.snapScreenToAngle(last.screen, overlay, this.snapAngleDegrees)
    }
    this.cursorOverlay.copy(overlay)

    const VERTEX_PX = 6
    const EDGE_PX = 5

    if (!ctrlKey) {
      let bestVert: { id: number; dist: number; overlay: THREE.Vector2; world: THREE.Vector3 } | null = null
      for (const [vId, v] of this.ctx.mesh.vertices) {
        const s = this.toOverlay(v.position)
        const dist = overlay.distanceTo(s)
        if (dist <= VERTEX_PX && (!bestVert || dist < bestVert.dist)) {
          bestVert = { id: vId, dist, overlay: s, world: v.position.clone() }
        }
      }
      if (bestVert) {
        this.currentHoverPoint = {
          world: bestVert.world,
          screen: bestVert.overlay,
          targetType: 'VERTEX',
          vertexId: bestVert.id,
        }
        this.cursorOverlay.copy(bestVert.overlay)
        return
      }

      let bestEdge: {
        id: number
        dist: number
        t: number
        midpoint: boolean
        world: THREE.Vector3
        overlay: THREE.Vector2
      } | null = null
      for (const [eId, edge] of this.ctx.mesh.edges) {
        const p1 = this.ctx.mesh.vertices.get(edge.v1)?.position
        const p2 = this.ctx.mesh.vertices.get(edge.v2)?.position
        if (!p1 || !p2) continue
        const s1 = this.toOverlay(p1)
        const s2 = this.toOverlay(p2)
        const { distance, t } = ScreenGeometry.distancePointToSegment2D(overlay, s1, s2)
        if (distance > EDGE_PX) continue
        if (bestEdge && distance >= bestEdge.dist) continue
        const midpoint = shiftKey || Math.abs(t - 0.5) < 0.08
        const finalT = midpoint ? 0.5 : t
        const worldPos = p1.clone().lerp(p2, finalT)
        bestEdge = {
          id: eId,
          dist: distance,
          t: finalT,
          midpoint,
          world: worldPos,
          overlay: this.toOverlay(worldPos),
        }
      }
      if (bestEdge) {
        this.currentHoverPoint = {
          world: bestEdge.world,
          screen: bestEdge.overlay,
          targetType: bestEdge.midpoint ? 'MIDPOINT' : 'EDGE',
          edgeId: bestEdge.id,
          edgeT: bestEdge.t,
        }
        this.cursorOverlay.copy(bestEdge.overlay)
        return
      }
    }

    const ray = this.localRayFromClient(mousePos)
    if (this.angleSnapping && last) {
      const snappedClient = {
        x: mousePos.x,
        y: mousePos.y,
      }
      const el = this.mappingEl()
      const view = ScreenGeometry.viewSize(el)
      const r = el.getBoundingClientRect()
      if (r.width >= 1 && r.height >= 1) {
        snappedClient.x = r.left + (overlay.x / view.width) * r.width
        snappedClient.y = r.top + (overlay.y / view.height) * r.height
      }
      const snappedRay = this.localRayFromClient(snappedClient)
      ray.origin.copy(snappedRay.origin)
      ray.direction.copy(snappedRay.direction)
    }

    let closestDist = Infinity
    let hitFaceId: number | null = null
    let hitPoint: THREE.Vector3 | null = null
    const cull = !this.cutThrough && this.objectWorld.determinant() >= 0

    for (const [fId, face] of this.ctx.mesh.faces) {
      const ids = face.vertexIds
      if (ids.length < 3) continue
      const p0 = this.ctx.mesh.vertices.get(ids[0])?.position
      if (!p0) continue
      for (let i = 1; i < ids.length - 1; i++) {
        const p1 = this.ctx.mesh.vertices.get(ids[i])?.position
        const p2 = this.ctx.mesh.vertices.get(ids[i + 1])?.position
        if (!p1 || !p2) continue
        const hit = ray.intersectTriangle(p0, p1, p2, cull, new THREE.Vector3())
        if (!hit) continue
        const d = ray.origin.distanceTo(hit)
        if (d < closestDist) {
          closestDist = d
          hitFaceId = fId
          hitPoint = hit
        }
      }
    }

    if (hitPoint && hitFaceId !== null) {
      this.currentHoverPoint = {
        world: hitPoint,
        screen: overlay.clone(),
        targetType: 'FACE',
        faceId: hitFaceId,
      }
      return
    }

    const worldRay = ScreenGeometry.rayFromClient(mousePos, this.ctx.camera, this.mappingEl(), this.ctx.quadrant)
    const planeHit = worldRay.intersectPlane(
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        this.ctx.camera.getWorldDirection(new THREE.Vector3()).negate(),
        this.pivot
      ),
      new THREE.Vector3()
    )
    this.currentHoverPoint = planeHit
      ? {
          world: planeHit.clone().applyMatrix4(this.objectInv),
          screen: overlay.clone(),
          targetType: 'FACE',
        }
      : null
  }

  evaluate() {}

  confirm() {
    if (this.points.length < 2) {
      this.cancel()
      return
    }

    KnifeKernel.applyCuts(this.ctx.mesh, this.points, {
      cutThrough: this.cutThrough,
      camera: this.ctx.camera,
      viewportRect: this.viewportRect(),
      quadrant: this.ctx.quadrant,
      objectMatrix: this.objectWorld,
    })
    super.confirm()
  }

  cancel() {
    this.points = []
    this.currentHoverPoint = null
    super.cancel()
  }

  updateStatus() {
    const cut = this.cutThrough ? 'ON' : 'off'
    const ang = this.angleSnapping ? `${this.snapAngleDegrees}°` : 'off'
    this.statusText = `Knife | Points: ${this.points.length} | A Angle-snap: ${ang} | C Cut-through: ${cut} | LMB add · Enter confirm · Esc cancel`
  }
}
