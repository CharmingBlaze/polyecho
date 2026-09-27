import * as THREE from 'three'
import { ModalOperator } from './ModalOperator'
import { ScreenGeometry } from '../geometry/ScreenGeometry'
import { surfaceTriangles } from '../geometry/SurfaceGeometry'
import { PolyDrawKernel, type DrawPlane } from '../mesh/operations/PolyDrawKernel'
import { BlockoutSketchKernel } from '../mesh/operations/BlockoutSketchKernel'
import { ExtrudeKernel } from '../mesh/operations/ExtrudeKernel'
import { MeshEditOps } from '../mesh/operations/MeshEditOps'
import { TransformSolver } from '../transform/TransformSolver'
import type { MeshSnapshot } from '../mesh/MeshKernel'

export type BlockoutSketchMode = 'draw' | 'pull'

const SNAP_PX = 18

/**
 * SketchUp-style blockout. Draw a rectangle on a face to split it, or in
 * empty space to start a new face, then push/pull along the face normal.
 * Poly Draw is a separate tool and is not used here.
 */
export class BlockoutSketchOperator extends ModalOperator {
  readonly name = 'Blockout Sketch'

  public mode: BlockoutSketchMode = 'draw'
  public note = ''
  private changed = false
  private anchor: THREE.Vector3 | null = null
  private lockedFaceId: number | null = null
  private armedFace: number | null = null
  private hoverFaceId: number | null = null
  private hoverPoint: THREE.Vector3 | null = null
  private plane: DrawPlane = PolyDrawKernel.planeForView('top', new THREE.Vector3())
  private previewLine: THREE.Line | null = null
  private previewFill: THREE.Mesh | null = null

  private pulling = false
  private pullSnap: MeshSnapshot | null = null
  private pullFaceId: number | null = null
  private pullStart = new THREE.Ray()
  private pullDist = 0
  private willPunch = false
  private backFaceId: number | null = null
  private baseIds: number[] = []
  private newIds: number[] = []
  private capId: number | null = null
  private localNormal = new THREE.Vector3(0, 0, 1)
  private worldNormal = new THREE.Vector3(0, 0, 1)
  private restWorld = new Map<number, THREE.Vector3>()
  private pivotWorld = new THREE.Vector3()

  begin(ctx: Parameters<ModalOperator['begin']>[0], startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.mode = 'draw'
    this.changed = false
    this.anchor = null
    this.pulling = false
    this.refresh()
  }

  evaluate() {
    if (this.pulling) this.updatePull()
    else this.updateHover()
    this.updatePreview()
  }

  setMode(mode: BlockoutSketchMode) {
    if (this.pulling) this.endPull()
    this.mode = mode
    this.anchor = null
    this.lockedFaceId = null
    this.note = ''
    this.refresh()
  }

  finishFromHud() {
    if (this.pulling) this.endPull()
    this.confirm()
  }

  handlePointerDown(button: number): boolean {
    if (button === 2) {
      if (this.pulling) {
        this.abortPull()
        this.refresh()
        return true
      }
      if (this.anchor) {
        this.anchor = null
        this.lockedFaceId = null
        this.refresh()
        return true
      }
      return false
    }
    if (button !== 0) return false
    this.updateHover()
    if (this.mode === 'pull') {
      if (this.pulling) this.endPull()
      else this.beginPull(this.hoverFaceId ?? this.armedFace)
      this.refresh()
      return true
    }
    if (!this.anchor) {
      if (!this.hoverPoint) return true
      this.anchor = this.hoverPoint.clone()
      this.lockedFaceId = this.hoverFaceId
      this.note = ''
    } else {
      this.commitRectangle()
    }
    this.refresh()
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()
    if (key === 'escape') {
      event.preventDefault()
      this.cancel()
      return true
    }
    if (key === 'enter') {
      event.preventDefault()
      this.finishFromHud()
      return true
    }
    if (key === 'd' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      this.setMode('draw')
      return true
    }
    if (key === 'p' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      this.setMode('pull')
      return true
    }
    if (key === 'backspace') {
      event.preventDefault()
      if (this.pulling) this.abortPull()
      else {
        this.anchor = null
        this.lockedFaceId = null
      }
      this.refresh()
      return true
    }
    if (key === 'x' || key === 'y' || key === 'z') return true
    return false
  }

  confirm() {
    if (this.pulling) this.endPull()
    this.disposePreview()
    if (!this.changed || this.ctx.mesh.faces.size === 0) {
      this.cancel()
      return
    }
    if (this.armedFace != null && this.ctx.mesh.faces.has(this.armedFace)) {
      this.ctx.selectedFaceIds = [this.armedFace]
    }
    this.ctx.onCommit(this.name)
  }

  cancel() {
    this.disposePreview()
    this.restoreSnapshot()
    this.ctx.onCancel()
  }

  updateStatus() {
    const mode = this.mode === 'draw' ? 'Draw' : 'Push/Pull'
    if (this.note) {
      this.statusText = `${mode} · ${this.note}`
      return
    }
    if (this.pulling) {
      const punch = this.willPunch ? ' · release punches a hole' : ''
      this.statusText = `Push/Pull ${this.pullDist.toFixed(3)}${punch} · click to lock · hover a vert to match its depth`
      return
    }
    if (this.mode === 'pull') {
      this.statusText = 'Click a face, move to set depth, click to lock. D draws again.'
      return
    }
    if (this.anchor) {
      this.statusText = 'Click the opposite corner. A flat drag across a face splits it.'
      return
    }
    this.statusText = this.hoverFaceId != null
      ? 'Click a corner on this face. The rectangle cuts the face. P push/pulls.'
      : 'Click empty space to start a face on the ground, or click a face to draw on it.'
  }

  private refresh() {
    this.updateHover()
    this.updatePreview()
    this.updateStatus()
    this.ctx.onUpdatePreview()
  }

  private commitRectangle() {
    if (!this.anchor || !this.hoverPoint) return
    const corners = BlockoutSketchKernel.rectangle(this.anchor, this.hoverPoint, this.plane.origin, this.plane.axisU, this.plane.axisV)
    const width = corners[0].distanceTo(corners[1])
    const height = corners[1].distanceTo(corners[2])
    this.anchor = null
    if (width < 1e-4 || height < 1e-4) {
      this.note = 'Drag out a rectangle.'
      return
    }
    const local = corners.map(p => p.clone().applyMatrix4(this.worldToLocal))
    const faceId = this.lockedFaceId
    this.lockedFaceId = null
    const thin = Math.min(width, height) < Math.max(width, height) * 0.04
    if (faceId != null && thin) {
      const along = width < height ? [local[0], local[3]] : [local[0], local[1]]
      const split = BlockoutSketchKernel.splitFaceBySegment(this.ctx.mesh, faceId, along[0], along[1])
      if (split) {
        this.changed = true
        this.armedFace = split[0]
        this.mode = 'pull'
        this.note = ''
        return
      }
      this.note = 'Drag from one edge of the face to the opposite edge to split it.'
      return
    }
    if (faceId != null && !thin) {
      const embedded = BlockoutSketchKernel.embedLoop(this.ctx.mesh, faceId, local)
      if (!('error' in embedded)) {
        this.changed = true
        this.armedFace = embedded.innerFaceId
        this.mode = 'pull'
        this.note = ''
        return
      }
      this.note = embedded.error
      return
    }
    const ids = local.map(p => this.ctx.mesh.addVertex(p).id)
    const face = this.ctx.mesh.addFace(ids, PolyDrawKernel.planarUvs(local))
    if (!face) {
      this.note = 'The face could not be created.'
      return
    }
    this.ctx.mesh.recalculateNormals()
    this.changed = true
    this.armedFace = face.id
    this.mode = 'pull'
    this.note = ''
  }

  private beginPull(faceId: number | null) {
    if (faceId == null || !this.ctx.mesh.faces.has(faceId)) {
      this.note = 'Click a face to push or pull.'
      return
    }
    this.pullSnap = this.ctx.mesh.createSnapshot()
    this.pullFaceId = faceId
    this.pulling = true
    this.willPunch = false
    this.note = ''
    this.pullStart.copy(this.pointerRay(this.currentMouse))
    this.updatePull()
  }

  private abortPull() {
    if (this.pullSnap) this.ctx.mesh.restoreSnapshot(this.pullSnap)
    this.pulling = false
    this.pullSnap = null
    this.willPunch = false
  }

  private endPull() {
    if (!this.pulling || this.pullFaceId == null) return
    if (Math.abs(this.pullDist) < 1e-4) {
      this.abortPull()
      return
    }
    if (this.willPunch && this.backFaceId != null && this.pullSnap) {
      this.ctx.mesh.restoreSnapshot(this.pullSnap)
      const ok = BlockoutSketchKernel.punchThrough(this.ctx.mesh, this.pullFaceId, this.backFaceId)
      this.pulling = false
      this.pullSnap = null
      this.note = ok ? '' : 'That push does not meet an opposite face.'
      if (ok) {
        this.changed = true
        this.armedFace = null
        this.mode = 'draw'
      }
      return
    }
    const move = this.localNormal.clone().multiplyScalar(Math.sign(this.pullDist) || 1)
    BlockoutSketchKernel.sealExtrudedBase(this.ctx.mesh, this.baseIds, move)
    if (this.capId != null) {
      MeshEditOps.cleanupManifoldExtrude(this.ctx.mesh, [this.capId], this.newIds)
      const around = [...this.ctx.mesh.faces.values()]
        .filter(face => face.vertexIds.some(id => this.newIds.includes(id)))
        .map(face => face.id)
      BlockoutSketchKernel.healCoplanar(this.ctx.mesh, around)
    }
    this.changed = true
    this.armedFace = this.capId
    this.pulling = false
    this.pullSnap = null
    this.mode = 'draw'
    this.note = ''
  }

  private updatePull() {
    if (!this.pullSnap || this.pullFaceId == null) return
    this.ctx.mesh.restoreSnapshot(this.pullSnap)
    const hostId = BlockoutSketchKernel.quadHost(this.ctx.mesh, this.pullFaceId)
    const limit = hostId != null ? BlockoutSketchKernel.inwardLimit(this.ctx.mesh, hostId) : null
    const face = hostId != null ? this.ctx.mesh.faces.get(hostId) : undefined
    if (!face) return
    this.baseIds = [...face.vertexIds]
    this.localNormal.copy(face.normal)
    const result = ExtrudeKernel.extrudeFaces(this.ctx.mesh, [face.id])
    this.capId = result.extrudedFaceIds[0] ?? null
    this.newIds = result.newVertexIds
    const worldMat = this.ctx.objectMatrix ?? new THREE.Matrix4()
    this.worldNormal.copy(this.localNormal).transformDirection(worldMat).normalize()
    this.restWorld.clear()
    this.pivotWorld.set(0, 0, 0)
    for (const id of this.newIds) {
      const v = this.ctx.mesh.vertices.get(id)
      if (!v) continue
      const world = v.position.clone().applyMatrix4(worldMat)
      this.restWorld.set(id, world)
      this.pivotWorld.add(world)
    }
    if (this.restWorld.size) this.pivotWorld.multiplyScalar(1 / this.restWorld.size)

    const current = this.pointerRay(this.currentMouse)
    let dist = TransformSolver.rayLineClosestPoint(current, this.pivotWorld, this.worldNormal)
      - TransformSolver.rayLineClosestPoint(this.pullStart, this.pivotWorld, this.worldNormal)
    if (!Number.isFinite(dist)) dist = 0
    const snapped = this.vertexSnapDistance()
    if (snapped != null) dist = snapped
    else if (this.isCtrlHeld) dist = this.snapManager.snapLinear(dist, this.ctx.gridSize || 0.1)
    if (this.isShiftHeld && snapped == null) dist *= 0.2

    this.willPunch = false
    this.backFaceId = null
    if (limit) {
      const center = new THREE.Vector3()
      for (const id of this.baseIds) center.add(this.ctx.mesh.vertices.get(id)!.position)
      center.multiplyScalar(1 / this.baseIds.length)
      const worldA = center.clone().applyMatrix4(worldMat)
      const worldB = center.clone().addScaledVector(this.localNormal, limit.distance).applyMatrix4(worldMat)
      const limitWorld = worldB.sub(worldA).dot(this.worldNormal)
      if (dist < limitWorld) {
        dist = limitWorld
        this.willPunch = true
        this.backFaceId = limit.faceId
      }
    }
    this.pullDist = dist
    for (const [id, rest] of this.restWorld) {
      this.writeWorldPos(id, rest.clone().addScaledVector(this.worldNormal, dist))
    }
    this.ctx.mesh.recalculateNormals()
  }

  private vertexSnapDistance(): number | null {
    const skip = new Set([...this.baseIds, ...this.newIds])
    const local = ScreenGeometry.pointerInView(this.currentMouse, this.ctx.viewportElement)
    const worldMat = this.ctx.objectMatrix ?? new THREE.Matrix4()
    let best: number | null = null
    let bestPx = SNAP_PX
    for (const [id, v] of this.ctx.mesh.vertices) {
      if (skip.has(id)) continue
      const world = v.position.clone().applyMatrix4(worldMat)
      const screen = ScreenGeometry.worldToOverlay(world, this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant)
      const px = Math.hypot(screen.x - local.x, screen.y - local.y)
      if (px > bestPx) continue
      bestPx = px
      best = world.clone().sub(this.pivotWorld).dot(this.worldNormal)
    }
    return best
  }

  private updateHover() {
    if (this.pulling) return
    if (this.anchor) {
      const ray = this.pointerRay(this.currentMouse)
      let hit = PolyDrawKernel.intersectPlane(ray, this.plane)
      if (!hit) {
        this.hoverPoint = null
        return
      }
      if (this.ctx.snapGrid !== false) hit = PolyDrawKernel.snapOnPlane(hit, this.plane, this.ctx.gridSize || 0.5)
      this.hoverPoint = this.snapPointToVertex(hit)
      return
    }
    const face = this.pickFace(this.currentMouse)
    if (face) {
      this.hoverFaceId = face.faceId
      this.plane = PolyDrawKernel.planeFromHit(face.point, face.normal)
      this.hoverPoint = this.ctx.snapGrid === false ? face.point : PolyDrawKernel.snapOnPlane(face.point, this.plane, this.ctx.gridSize || 0.5)
      this.hoverPoint = this.snapPointToVertex(this.hoverPoint)
      return
    }
    this.hoverFaceId = null
    const origin = this.ctx.orbitTarget?.clone() ?? new THREE.Vector3()
    const kind = this.ctx.viewportKind || 'persp'
    this.plane = kind === 'persp'
      ? PolyDrawKernel.planeForView('top', new THREE.Vector3(origin.x, 0, origin.z))
      : PolyDrawKernel.planeForView(kind, origin)
    const ray = this.pointerRay(this.currentMouse)
    let hit = PolyDrawKernel.intersectPlane(ray, this.plane)
    if (hit && PolyDrawKernel.isUnreliableHit(ray, this.plane, this.ctx.camera)) hit = null
    if (hit && this.ctx.snapGrid !== false) hit = PolyDrawKernel.snapOnPlane(hit, this.plane, this.ctx.gridSize || 0.5)
    this.hoverPoint = hit ? this.snapPointToVertex(hit) : null
  }

  private snapPointToVertex(point: THREE.Vector3): THREE.Vector3 {
    const local = ScreenGeometry.pointerInView(this.currentMouse, this.ctx.viewportElement)
    const worldMat = this.ctx.objectMatrix ?? new THREE.Matrix4()
    let best = point
    let bestPx = SNAP_PX
    for (const v of this.ctx.mesh.vertices.values()) {
      const world = v.position.clone().applyMatrix4(worldMat)
      const screen = ScreenGeometry.worldToOverlay(world, this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant)
      const px = Math.hypot(screen.x - local.x, screen.y - local.y)
      if (px > bestPx) continue
      bestPx = px
      const rel = world.clone().sub(this.plane.origin)
      best = this.plane.origin.clone()
        .addScaledVector(this.plane.axisU, rel.dot(this.plane.axisU))
        .addScaledVector(this.plane.axisV, rel.dot(this.plane.axisV))
    }
    return best
  }

  private pickFace(pointer: { x: number; y: number }): { faceId: number; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    if (!this.ctx.sceneGroup) return null
    const raycaster = new THREE.Raycaster()
    raycaster.ray.copy(this.pointerRay(pointer))
    for (const hit of raycaster.intersectObject(this.ctx.sceneGroup, true)) {
      if (!hit.face || hit.faceIndex == null) continue
      let skip = false
      let obj: THREE.Object3D | null = hit.object
      while (obj) {
        if (obj.userData?.ignorePick || obj === this.ctx.previewGroup) {
          skip = true
          break
        }
        obj = obj.parent
      }
      if (skip) continue
      const meshId = hit.object.userData?.meshId as string | undefined
      if (this.ctx.targetMeshId && meshId && meshId !== this.ctx.targetMeshId) continue
      const map = (hit.object.userData?.faceIndexMap || []) as number[]
      const doc = this.ctx.allMeshes?.find(item => item.id === meshId)
      const docFace = doc?.faces[map[hit.faceIndex]]
      if (!docFace) continue
      const kernel = [...this.ctx.mesh.faces.values()].find(face => face.documentId === docFace.id)
      if (!kernel) continue
      return {
        faceId: kernel.id,
        point: hit.point.clone(),
        normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      }
    }
    return null
  }

  private pointerRay(pointer: { x: number; y: number }): THREE.Ray {
    return ScreenGeometry.rayFromClient(pointer, this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant)
  }

  private updatePreview() {
    if (!this.ctx.previewGroup) return
    this.disposePreview()
    const segments: number[] = []
    const push = (a: THREE.Vector3, b: THREE.Vector3) => segments.push(a.x, a.y, a.z, b.x, b.y, b.z)
    if (this.anchor && this.hoverPoint && !this.pulling) {
      const corners = BlockoutSketchKernel.rectangle(this.anchor, this.hoverPoint, this.plane.origin, this.plane.axisU, this.plane.axisV)
      for (let i = 0; i < corners.length; i++) push(corners[i], corners[(i + 1) % corners.length])
      this.fillPolygon(corners, 0xf59e0b)
    } else if (!this.pulling) {
      const faceId = this.hoverFaceId ?? (this.mode === 'pull' ? this.armedFace : null)
      const face = faceId != null ? this.ctx.mesh.faces.get(faceId) : null
      if (face) {
        const worldMat = this.ctx.objectMatrix ?? new THREE.Matrix4()
        const loop = face.vertexIds.map(id => this.ctx.mesh.vertices.get(id)!.position.clone().applyMatrix4(worldMat))
        for (let i = 0; i < loop.length; i++) push(loop[i], loop[(i + 1) % loop.length])
        this.fillPolygon(loop, 0x38bdf8)
      }
    }
    if (segments.length) {
      this.previewLine = ScreenGeometry.dashedPreviewLine(segments, this.willPunch ? 0x34d399 : 0x38bdf8)
      this.ctx.previewGroup.add(this.previewLine)
    }
  }

  private fillPolygon(points: THREE.Vector3[], color: number) {
    if (!this.ctx.previewGroup || points.length < 3) return
    const positions: number[] = []
    for (const tri of surfaceTriangles(points)) {
      for (const i of tri) positions.push(points[i].x, points[i].y, points[i].z)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    })
    this.previewFill = new THREE.Mesh(geo, mat)
    this.previewFill.userData.ignorePick = true
    this.previewFill.renderOrder = 40
    this.ctx.previewGroup.add(this.previewFill)
  }

  private disposePreview() {
    if (this.previewLine) {
      this.previewLine.geometry.dispose()
      ;(this.previewLine.material as THREE.Material).dispose()
      this.previewLine.removeFromParent()
      this.previewLine = null
    }
    if (this.previewFill) {
      this.previewFill.geometry.dispose()
      ;(this.previewFill.material as THREE.Material).dispose()
      this.previewFill.removeFromParent()
      this.previewFill = null
    }
  }
}
