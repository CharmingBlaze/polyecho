import * as THREE from 'three'
import { ModalOperator, OperatorContext } from '../ModalOperator'
import { operatorManager } from '../OperatorManager'
import { PrimitiveType, PrimitiveParameters } from '../../primitives/PrimitiveTypes'
import { PrimitiveRegistry } from '../../primitives/PrimitiveRegistry'
import { ConstructionFrame, ConstructionFrameResolver } from '../../placement/ConstructionFrame'
import { PlacementHit, PlacementOrientation, SurfacePlacementSolver } from '../../placement/SurfacePlacementSolver'
import { PrimitiveGhost } from '../../placement/PrimitiveGhost'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'
import { meshPlacementMatrix, surfaceTriangles } from '../../geometry/SurfaceGeometry'
import { notifyPrimitiveCreated } from '../../commands/editorCommands'

export enum PrimitivePlacementMode {
  PLACE = 'PLACE',
  CAD_DRAW = 'CAD_DRAW'
}

export enum PrimitivePlacementState {
  INACTIVE = 'INACTIVE',
  PLACE_PREVIEW = 'PLACE_PREVIEW',
  WAITING_FOR_START = 'WAITING_FOR_START',
  DRAWING_PRIMARY = 'DRAWING_PRIMARY',
  DRAWING_SECONDARY = 'DRAWING_SECONDARY',
  READY_TO_CONFIRM = 'READY_TO_CONFIRM'
}

export interface PrimitivePlacementEventDetail {
  type: PrimitiveType
  mode?: PrimitivePlacementMode
  orientation?: PlacementOrientation
  parameters?: PrimitiveParameters
}

export class PrimitivePlacementOperator extends ModalOperator {
  readonly name = 'Add Primitive'

  public primitiveType: PrimitiveType = 'BOX'
  public mode: PrimitivePlacementMode = PrimitivePlacementMode.CAD_DRAW
  public state: PrimitivePlacementState = PrimitivePlacementState.WAITING_FOR_START
  public placementOrientation: PlacementOrientation = 'SURFACE'

  public currentParams: PrimitiveParameters = { width: 1, depth: 1, height: 1 }
  public frame: ConstructionFrame | null = null

  private ghost: PrimitiveGhost | null = null
  private placementHit: PlacementHit | null = null

  private startPoint = new THREE.Vector3()
  private primaryPoint = new THREE.Vector3()
  private secondaryPoint = new THREE.Vector3()
  private secondaryMouse = { x: 0, y: 0 }
  private signedHeight = 1

  public dimensionText = ''

  constructor(
    type: PrimitiveType = 'BOX',
    mode: PrimitivePlacementMode = PrimitivePlacementMode.CAD_DRAW,
    orientation: PlacementOrientation = 'SURFACE',
    params?: PrimitiveParameters
  ) {
    super()
    this.primitiveType = type
    this.mode = mode
    this.placementOrientation = orientation
    const def = PrimitiveRegistry.get(type)
    this.currentParams = { ...(def?.defaultParameters || {}), ...params }
  }

  public evaluate(): void {
    // Live evaluation handled in ghost preview
  }

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.ghost = new PrimitiveGhost(this.ctx.previewGroup)

    if (this.mode === PrimitivePlacementMode.PLACE) {
      this.state = PrimitivePlacementState.PLACE_PREVIEW
    } else {
      this.state = PrimitivePlacementState.WAITING_FOR_START
    }

    this.resolvePlacementHit(startPointer)
    this.updateGhostAndStatus()
  }

  pointerMove(event: PointerEvent) {
    this.isShiftHeld = event.shiftKey; this.isCtrlHeld = event.ctrlKey
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.resolvePlacementHit(this.currentMouse)

    if (this.mode === PrimitivePlacementMode.PLACE) {
      this.updatePlaceGhost()
    } else {
      this.updateCadGhost()
    }

    this.ctx.onUpdatePreview?.()
    this.updateStatus()
  }

  handlePointerDown(button: number): boolean {
    if (button === 0) {
      this.resolvePlacementHit(this.currentMouse)
      if (this.mode === PrimitivePlacementMode.PLACE) this.updatePlaceGhost()
      else this.updateCadGhost()
      // LMB
      if (this.mode === PrimitivePlacementMode.PLACE) {
        operatorManager.confirm()
        return true
      }

      // CAD DRAW Mode State Machine
      const def = PrimitiveRegistry.get(this.primitiveType)
      const kind = def?.creationKind || 'RECTANGULAR'

      if (this.state === PrimitivePlacementState.WAITING_FOR_START) {
        if (this.placementHit) {
          this.startPoint.copy(this.placementHit.worldPosition)
          this.primaryPoint.copy(this.startPoint)

          // Lock construction frame from surface normal or active viewport kind
          const vpKind = this.ctx.viewportKind || 'persp'
          if (this.placementHit.type === 'FACE' && this.placementOrientation === 'SURFACE') {
            const normal = this.placementHit.worldNormal.clone().normalize()
            this.frame = ConstructionFrameResolver.getFrameFromSurfaceNormal(
              this.startPoint,
              normal.lengthSq() > 0.001 ? normal : new THREE.Vector3(0, 1, 0)
            )
          } else {
            this.frame = ConstructionFrameResolver.getFrameForViewport(
              vpKind,
              this.startPoint
            )
          }

          this.numericInput.reset()
          this.state = PrimitivePlacementState.DRAWING_PRIMARY
          this.updateCadGhost()
          this.updateStatus()
          return true
        }
      } else if (this.state === PrimitivePlacementState.DRAWING_PRIMARY) {
        if (this.primitiveType !== 'PLANE' && (kind === 'RECTANGULAR' || kind === 'RADIAL_HEIGHT' || kind === 'LINEAR_HEIGHT' || kind === 'TORUS')) {
          this.numericInput.reset()
          this.secondaryMouse = { ...this.currentMouse }
          this.state = PrimitivePlacementState.DRAWING_SECONDARY
          this.updateCadGhost()
          this.updateStatus()
          return true
        } else {
          // Flat 2D shape (Plane / Circle) or 1-step shape (Sphere / Icosphere)
          operatorManager.confirm()
          return true
        }
      } else if (this.state === PrimitivePlacementState.DRAWING_SECONDARY) {
        operatorManager.confirm()
        return true
      }
    } else if (button === 2) {
      // RMB: Step back or Cancel
      if (this.state === PrimitivePlacementState.DRAWING_SECONDARY) {
        this.state = PrimitivePlacementState.DRAWING_PRIMARY
        this.updateCadGhost()
        this.updateStatus()
        return true
      } else if (this.state === PrimitivePlacementState.DRAWING_PRIMARY) {
        this.state = PrimitivePlacementState.WAITING_FOR_START
        this.ghost?.hide()
        this.frame = null
        this.updateStatus()
        return true
      } else {
        operatorManager.cancel()
        return true
      }
    }
    return false
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()

    if (key === 'escape') {
      event.preventDefault()
      operatorManager.cancel()
      return true
    }

    if (key === 'enter' || key === ' ') {
      event.preventDefault()
      if (this.mode === PrimitivePlacementMode.PLACE) operatorManager.confirm()
      else this.handlePointerDown(0)
      return true
    }

    if (/^[0-9.\-]$/.test(key) || key === 'backspace') {
      event.preventDefault(); this.numericInput.handleKey(event.key)
      this.updateCadGhost(); this.ctx.onUpdatePreview(); this.updateStatus(); return true
    }

    if (key === 'o') {
      // Toggle Orientation between WORLD and SURFACE
      event.preventDefault()
      this.placementOrientation = this.placementOrientation === 'WORLD' ? 'SURFACE' : 'WORLD'
      if (this.mode === PrimitivePlacementMode.PLACE) {
        this.updatePlaceGhost()
      }
      this.updateStatus()
      return true
    }

    return super.keyDown(event)
  }

  private resolvePlacementHit(pointer: { x: number; y: number }) {
    const ray = ScreenGeometry.rayFromClient(pointer, this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant)

    // 1. In CAD Draw Primary Stage (2D footprint on surface): intersect the surface tangent plane
    if (this.state === PrimitivePlacementState.DRAWING_PRIMARY && this.frame) {
      const surfacePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.frame.axisW, this.startPoint)
      let hitPoint = ray.intersectPlane(surfacePlane, new THREE.Vector3())
      if (!hitPoint) {
        // Fallback to camera plane through start point if tangent angle is degenerate
        const camDir = new THREE.Vector3()
        this.ctx.camera.getWorldDirection(camDir)
        const fallbackPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, this.startPoint)
        hitPoint = ray.intersectPlane(fallbackPlane, new THREE.Vector3())
      }
      if (hitPoint) {
        this.placementHit = {
          type: 'FACE',
          objectId: null,
          faceId: null,
          worldPosition: hitPoint,
          worldNormal: this.frame.axisW.clone()
        }
        return
      }
    }

    // 2. In CAD Draw Secondary Stage (Extrusion Height): intersect camera-facing vertical billboard plane
    if (this.state === PrimitivePlacementState.DRAWING_SECONDARY && this.frame) {
      const cameraDir = new THREE.Vector3()
      this.ctx.camera.getWorldDirection(cameraDir)

      let planeNormal = cameraDir.clone().sub(
        this.frame.axisW.clone().multiplyScalar(cameraDir.dot(this.frame.axisW))
      ).normalize()

      if (planeNormal.lengthSq() < 0.001) {
        planeNormal = this.frame.axisU.clone()
      }

      const extrusionPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, this.primaryPoint)
      let hitPoint = ray.intersectPlane(extrusionPlane, new THREE.Vector3())
      if (!hitPoint) {
        const fallbackPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir, this.primaryPoint)
        hitPoint = ray.intersectPlane(fallbackPlane, new THREE.Vector3())
      }
      if (hitPoint) {
        this.placementHit = {
          type: 'GRID',
          objectId: null,
          faceId: null,
          worldPosition: hitPoint,
          worldNormal: this.frame.axisW.clone()
        }
        return
      }
    }

    let closestDist = Infinity
    let hit: PlacementHit | null = null

    // 3. Raycast all scene meshes
    const allMeshes = this.ctx.allMeshes || []

    for (const meshObj of allMeshes) {
      if (!meshObj.vertices || !meshObj.faces || meshObj.visible === false || meshObj.locked) continue
      const matrix = meshPlacementMatrix(meshObj)
      const vertMap = new Map<string, THREE.Vector3>(meshObj.vertices.map((v: any) => [v.id, new THREE.Vector3(v.position.x,v.position.y,v.position.z).applyMatrix4(matrix)]))
      for (const face of meshObj.faces) {
        const points: THREE.Vector3[] = face.vertexIds.map((id: string) => vertMap.get(id)).filter(Boolean)
        for (const [a,b,c] of surfaceTriangles(points)) {
          const intersect = ray.intersectTriangle(points[a],points[b],points[c],false,new THREE.Vector3())
          if (!intersect) continue
          const distance = ray.origin.distanceTo(intersect)
          if (distance < closestDist) {
            closestDist = distance
            const normal = points[b].clone().sub(points[a]).cross(points[c].clone().sub(points[a])).normalize()
            if (normal.dot(ray.direction) > 0) normal.negate()
            hit = { type: 'FACE', objectId: meshObj.id, faceId: face.id, worldPosition: intersect, worldNormal: normal }
          }
        }
      }
    }

    // 4. Viewport-Specific Grid fallback (Top/Persp -> Y=0, Front -> Z=0, Right -> X=0)
    if (!hit) {
      const vpKind = this.ctx.viewportKind || 'persp'
      let gridNormal = new THREE.Vector3(0, 1, 0)
      if (vpKind === 'front') {
        gridNormal = new THREE.Vector3(0, 0, 1)
      } else if (vpKind === 'right') {
        gridNormal = new THREE.Vector3(1, 0, 0)
      }

      const gridPlane = new THREE.Plane(gridNormal, 0)
      const gridHit = ray.intersectPlane(gridPlane, new THREE.Vector3())
      if (gridHit) {
        hit = {
          type: 'GRID',
          objectId: null,
          faceId: null,
          worldPosition: gridHit,
          worldNormal: gridNormal
        }
      }
    }

    this.placementHit = hit
  }

  private updatePlaceGhost() {
    if (!this.placementHit || !this.ghost) { this.ghost?.hide(); return }

    const rot = SurfacePlacementSolver.calculateRotation(this.placementHit, this.placementOrientation)
    this.ghost.update(this.primitiveType, this.currentParams, this.placementHit.worldPosition, rot)
    const pos = this.ghost.group.position
    this.dimensionText = `Surface: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`
  }

  private updateCadGhost() {
    if (!this.frame || !this.ghost || !this.placementHit) return

    const currentWorld = this.placementHit.worldPosition
    const def = PrimitiveRegistry.get(this.primitiveType)
    const kind = def?.creationKind || 'RECTANGULAR'

    // Compute surface basis rotation quaternion (X -> axisU, Y -> axisW normal, Z -> axisV)
    let Z = this.frame.axisV.clone().normalize()
    if (new THREE.Matrix4().makeBasis(this.frame.axisU, this.frame.axisW, Z).determinant() < 0) {
      Z.negate()
    }
    const rotMatrix = new THREE.Matrix4().makeBasis(this.frame.axisU, this.frame.axisW, Z)
    const rotation = new THREE.Quaternion().setFromRotationMatrix(rotMatrix)

    if (this.state === PrimitivePlacementState.DRAWING_PRIMARY) {
      this.primaryPoint.copy(currentWorld)
      const delta = currentWorld.clone().sub(this.startPoint)
      let { u, v } = ConstructionFrameResolver.projectToUVW(delta, this.frame)
      const typed = this.numericInput.getValue()
      if (typed !== null) { u = typed; v = typed }
      if (this.isShiftHeld && kind === 'RECTANGULAR') { const side = Math.max(Math.abs(u), Math.abs(v)); u = Math.sign(u || 1) * side; v = Math.sign(v || 1) * side }
      if (typed === null && (this.isCtrlHeld || this.ctx.snapGrid)) { const step = this.ctx.gridSize || 0.1; u = Math.round(u / step) * step; v = Math.round(v / step) * step }
      this.primaryPoint.copy(this.startPoint).addScaledVector(this.frame.axisU,u).addScaledVector(this.frame.axisV,v)

      const width = Math.max(0.05, Math.abs(u))
      const depth = Math.max(0.05, Math.abs(v))

      if (kind === 'RECTANGULAR' || kind === 'LINEAR_HEIGHT') {
        const height = 0.05
        this.currentParams = { 
          ...this.currentParams, 
          width, 
          depth, 
          length: width,
          thickness: depth,
          totalRun: depth,
          height,
          openingWidth: width * 0.55,
          openingHeight: Math.max(0.08, height * 0.75)
        }
        const rest = this.startPoint.clone()
          .addScaledVector(this.frame.axisU, u / 2)
          .addScaledVector(this.frame.axisV, v / 2)

        this.ghost.update(this.primitiveType, this.currentParams, rest, rotation)
        this.dimensionText = `Width: ${width.toFixed(2)}  |  Depth: ${depth.toFixed(2)}`
      } else if (kind === 'RADIAL' || kind === 'RADIAL_HEIGHT') {
        const radius = Math.max(0.05, typed !== null ? Math.abs(typed) : Math.hypot(u, v))
        const height = this.primitiveType === 'CAPSULE' ? Math.max(0.05, radius * 2) : 0.05
        this.currentParams = {
          ...this.currentParams,
          radius,
          height,
          outerRadius: radius,
          innerRadius: radius * 0.65,
          ...(this.primitiveType === 'CAPSULE' ? { length: height } : {})
        }
        this.ghost.update(this.primitiveType, this.currentParams, this.startPoint, rotation)
        this.dimensionText = `Radius: ${radius.toFixed(2)}`
      } else if (kind === 'TORUS') {
        const majorRadius = Math.max(0.1, typed !== null ? Math.abs(typed) : Math.hypot(u, v))
        const tubeRadius = Math.max(0.02, majorRadius * 0.25)
        this.currentParams = { ...this.currentParams, majorRadius, tubeRadius }
        this.ghost.update(this.primitiveType, this.currentParams, this.startPoint, rotation)
        this.dimensionText = `Radius: ${majorRadius.toFixed(2)}`
      }
    } else if (this.state === PrimitivePlacementState.DRAWING_SECONDARY) {
      this.secondaryPoint.copy(currentWorld)
      const delta = currentWorld.clone().sub(this.primaryPoint)
      let w = delta.dot(this.frame.axisW)
      const typed = this.numericInput.getValue()
      if (typed !== null) w = typed
      else if (Math.abs(w) < 1e-6) {
        const cam = this.ctx.camera as THREE.OrthographicCamera & THREE.PerspectiveCamera
        const span = cam.isOrthographicCamera ? (cam.top - cam.bottom) / cam.zoom : 2 * cam.position.distanceTo(this.primaryPoint) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
        w = (this.secondaryMouse.y - this.currentMouse.y) * span / (this.ctx.viewportElement.clientHeight || 600)
      }
      if (typed === null && (this.isCtrlHeld || this.ctx.snapGrid)) w = Math.round(w / (this.ctx.gridSize || 0.1)) * (this.ctx.gridSize || 0.1)
      this.signedHeight = Math.sign(w) || 1

      const dragged = Math.max(0.05, Math.abs(w))
      const rad = (this.currentParams as any).radius || (this.currentParams as any).outerRadius || 0.5
      const height = this.primitiveType === 'CAPSULE' ? Math.max(dragged, rad * 2) : dragged
      const width = (this.currentParams as any).width || 1
      this.currentParams = { 
        ...this.currentParams, 
        height, 
        totalHeight: height,
        openingHeight: Math.min(height * 0.78, height - 0.05),
        openingWidth: Math.min((this.currentParams as any).openingWidth || width * 0.55, width * 0.88),
        ...(this.primitiveType === 'CAPSULE' ? { length: height } : {})
      }

      if (kind === 'RECTANGULAR' || kind === 'LINEAR_HEIGHT') {
        const baseDelta = this.primaryPoint.clone().sub(this.startPoint)
        const { u: finalU, v: finalV } = ConstructionFrameResolver.projectToUVW(baseDelta, this.frame)
        const rest = this.startPoint.clone()
          .addScaledVector(this.frame.axisU, finalU / 2)
          .addScaledVector(this.frame.axisV, finalV / 2)

        if (this.signedHeight < 0) rest.addScaledVector(this.frame.axisW, -height)
        this.ghost.update(this.primitiveType, this.currentParams, rest, rotation)
        const u = (this.currentParams as any).width || (this.currentParams as any).length || 1
        const v = (this.currentParams as any).depth || (this.currentParams as any).totalRun || 1
        this.dimensionText = `Height: ${height.toFixed(2)}  |  Width: ${u.toFixed(2)}  |  Depth: ${v.toFixed(2)}`
      } else if (kind === 'TORUS') {
        const tubeRadius = Math.max(0.02, height)
        this.currentParams = { ...this.currentParams, tubeRadius }
        this.ghost.update(this.primitiveType, this.currentParams, this.startPoint, rotation)
        this.dimensionText = `Tube Radius: ${tubeRadius.toFixed(2)}`
      } else {
        const rest = this.startPoint.clone().addScaledVector(this.frame.axisW, this.signedHeight < 0 ? -height : 0)
        this.ghost.update(this.primitiveType, this.currentParams, rest, rotation)
        const shownR = (this.currentParams as any).outerRadius || (this.currentParams as any).radius || 0.5
        this.dimensionText = `Height: ${height.toFixed(2)}  |  Radius: ${shownR.toFixed(2)}`
      }
    }
  }

  public setParameters(params: PrimitiveParameters) {
    this.currentParams = { ...this.currentParams, ...params }
    if (this.mode === PrimitivePlacementMode.PLACE) this.updatePlaceGhost()
    else this.updateCadGhost()
    this.ctx.onUpdatePreview(); this.updateStatus()
  }

  wheel(event: WheelEvent): boolean {
    const keys = ['sides', 'segments', 'majorSegments', 'segmentsX']
    const key = keys.find(k => k in this.currentParams)
    if (!key) return false
    event.preventDefault()
    const value = Number((this.currentParams as any)[key]) || 1
    this.setParameters({ [key]: Math.max(key === 'segmentsX' ? 1 : 3, Math.min(64, value + (event.deltaY < 0 ? 1 : -1))) })
    return true
  }

  private updateGhostAndStatus() {
    if (this.mode === PrimitivePlacementMode.PLACE) {
      this.updatePlaceGhost()
    }
    this.updateStatus()
  }

  private commitPrimitive() {
    if (!this.ghost) return

    const pos = this.ghost.group.position.clone()
    const rot = new THREE.Euler().setFromQuaternion(this.ghost.group.quaternion)
    const rotDeg = {
      x: THREE.MathUtils.radToDeg(rot.x),
      y: THREE.MathUtils.radToDeg(rot.y),
      z: THREE.MathUtils.radToDeg(rot.z)
    }

    const type = this.primitiveType
    const params = { ...this.currentParams }
    const transform = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: rotDeg,
      scale: { x: 1, y: 1, z: 1 }
    }

    // Clean up ghost before dispatching
    this.ghost.dispose(this.ctx.previewGroup)
    this.ghost = null

    notifyPrimitiveCreated({ type, parameters: params, transform })
  }

  cancel() {
    this.ghost?.dispose(this.ctx.previewGroup)
    this.ghost = null
    this.ctx.onCancel()
  }

  confirm() {
    if (!this.placementHit || !this.ghost?.group.visible || !this.ghost.faceCount || this.state === PrimitivePlacementState.WAITING_FOR_START) { this.cancel(); return }
    this.commitPrimitive()
    this.ctx.onCommit(this.name)
  }

  updateStatus() {
    const modeLabel = this.mode === PrimitivePlacementMode.PLACE ? 'Place' : 'CAD Draw'
    const orientLabel = this.placementOrientation === 'WORLD' ? 'World' : 'Surface'

    if (this.mode === PrimitivePlacementMode.PLACE) {
      this.statusText = `${this.primitiveType} [${modeLabel}] (LMB: Place on Surface | O: Align [${orientLabel}] | Esc: Exit) | ${this.dimensionText}`
    } else {
      if (this.state === PrimitivePlacementState.WAITING_FOR_START) {
        this.statusText = `${this.primitiveType} [${modeLabel}] (LMB: Click Ground/Surface to Start Footprint | Esc: Exit)`
      } else if (this.state === PrimitivePlacementState.DRAWING_PRIMARY) {
        this.statusText = `${this.primitiveType} [${modeLabel}] (Type size · Shift: Square · Scroll: Detail | LMB: Lock Base | RMB: Back | Esc: Exit) | ${this.dimensionText}`
      } else {
        this.statusText = `${this.primitiveType} [${modeLabel}] (Type height | LMB: Finish | RMB: Back | Esc: Exit) | ${this.dimensionText}`
      }
    }
  }
}
