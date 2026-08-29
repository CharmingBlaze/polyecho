import * as THREE from 'three'
import { ModalOperator, OperatorContext } from '../ModalOperator'
import { PrimitiveType, PrimitiveParameters } from '../../primitives/PrimitiveTypes'
import { PrimitiveRegistry } from '../../primitives/PrimitiveRegistry'
import { ConstructionFrame, ConstructionFrameResolver } from '../../placement/ConstructionFrame'
import { PlacementHit, PlacementOrientation, SurfacePlacementSolver } from '../../placement/SurfacePlacementSolver'
import { PrimitiveGhost } from '../../placement/PrimitiveGhost'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'

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
    this.currentParams = params ? { ...params } : { ...(def?.defaultParameters || {}) }
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
      // LMB
      if (this.mode === PrimitivePlacementMode.PLACE) {
        this.commitPrimitive()
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
          if (this.placementHit.type === 'FACE') {
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

          this.state = PrimitivePlacementState.DRAWING_PRIMARY
          this.updateCadGhost()
          this.updateStatus()
          return true
        }
      } else if (this.state === PrimitivePlacementState.DRAWING_PRIMARY) {
        if (kind === 'RECTANGULAR' || kind === 'RADIAL_HEIGHT' || kind === 'LINEAR_HEIGHT') {
          this.state = PrimitivePlacementState.DRAWING_SECONDARY
          this.updateCadGhost()
          this.updateStatus()
          return true
        } else {
          // Flat 2D shape (Plane / Circle)
          this.commitPrimitive()
          return true
        }
      } else if (this.state === PrimitivePlacementState.DRAWING_SECONDARY) {
        this.commitPrimitive()
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
        this.updateStatus()
        return true
      } else {
        this.cancel()
        return true
      }
    }
    return false
  }

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase()

    if (key === 'escape') {
      event.preventDefault()
      this.cancel()
      return true
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
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const ray = ScreenGeometry.screenToRay(pointer, this.ctx.camera, rect, this.ctx.quadrant)

    // 1. In CAD Draw Primary Stage (2D footprint on surface): intersect the surface tangent plane
    if (this.state === PrimitivePlacementState.DRAWING_PRIMARY && this.frame) {
      const surfacePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.frame.axisW, this.startPoint)
      const hitPoint = ray.intersectPlane(surfacePlane, new THREE.Vector3())
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
      const hitPoint = ray.intersectPlane(extrusionPlane, new THREE.Vector3())
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
    const allMeshes = this.ctx.allMeshes || (this.ctx.mesh ? [{
      id: 'active',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      vertices: Array.from(this.ctx.mesh.vertices.values()).map(v => ({ id: String(v.id), position: v.position })),
      faces: Array.from(this.ctx.mesh.faces.values()).map(f => ({ id: String(f.id), vertexIds: f.vertexIds.map(String) }))
    }] : [])

    for (const meshObj of allMeshes) {
      const vertMap = new Map<string, THREE.Vector3>()
      for (const v of meshObj.vertices) {
        vertMap.set(v.id, new THREE.Vector3(
          meshObj.position.x + v.position.x,
          meshObj.position.y + v.position.y,
          meshObj.position.z + v.position.z
        ))
      }

      for (const face of meshObj.faces) {
        if (!face.vertexIds || face.vertexIds.length < 3) continue
        const p0 = vertMap.get(face.vertexIds[0])
        const p1 = vertMap.get(face.vertexIds[1])
        const p2 = vertMap.get(face.vertexIds[2])
        if (!p0 || !p1 || !p2) continue

        // Test first triangle
        let intersect = ray.intersectTriangle(p0, p1, p2, false, new THREE.Vector3())
        let triNormal = new THREE.Vector3().crossVectors(
          p1.clone().sub(p0),
          p2.clone().sub(p0)
        ).normalize()

        // Test second triangle if quad
        if (!intersect && face.vertexIds.length >= 4) {
          const p3 = vertMap.get(face.vertexIds[3])
          if (p3) {
            intersect = ray.intersectTriangle(p0, p2, p3, false, new THREE.Vector3())
            if (intersect) {
              triNormal = new THREE.Vector3().crossVectors(
                p2.clone().sub(p0),
                p3.clone().sub(p0)
              ).normalize()
            }
          }
        }

        if (intersect) {
          const d = ray.origin.distanceTo(intersect)
          if (d < closestDist) {
            closestDist = d
            hit = {
              type: 'FACE',
              objectId: meshObj.id,
              faceId: null,
              worldPosition: intersect,
              worldNormal: triNormal
            }
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
    if (!this.placementHit || !this.ghost) return

    const def = PrimitiveRegistry.get(this.primitiveType)
    if (!def) return

    const halfDims = this.getHalfDimensions(this.currentParams)
    const pos = SurfacePlacementSolver.calculateRestingPosition(
      this.placementHit,
      halfDims,
      this.placementOrientation
    )
    const rot = SurfacePlacementSolver.calculateRotation(this.placementHit, this.placementOrientation)

    this.ghost.update(this.primitiveType, this.currentParams, pos, rot)
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
      const { u, v } = ConstructionFrameResolver.projectToUVW(delta, this.frame)

      const width = Math.max(0.02, Math.abs(u))
      const depth = Math.max(0.02, Math.abs(v))

      if (kind === 'RECTANGULAR') {
        const height = 0.05
        this.currentParams = { width, depth, height }
        const center = this.startPoint.clone()
          .addScaledVector(this.frame.axisU, u / 2)
          .addScaledVector(this.frame.axisV, v / 2)
          .addScaledVector(this.frame.axisW, height / 2)

        this.ghost.update(this.primitiveType, this.currentParams, center, rotation)
        this.dimensionText = `Width: ${width.toFixed(2)}  |  Depth: ${depth.toFixed(2)}`
      } else if (kind === 'RADIAL' || kind === 'RADIAL_HEIGHT') {
        const radius = Math.max(0.02, Math.hypot(u, v))
        const height = 0.05
        this.currentParams = { radius, height }
        const center = this.startPoint.clone().addScaledVector(this.frame.axisW, height / 2)

        this.ghost.update(this.primitiveType, this.currentParams, center, rotation)
        this.dimensionText = `Radius: ${radius.toFixed(2)}`
      }
    } else if (this.state === PrimitivePlacementState.DRAWING_SECONDARY) {
      this.secondaryPoint.copy(currentWorld)
      const delta = currentWorld.clone().sub(this.primaryPoint)
      const w = delta.dot(this.frame.axisW)

      const height = Math.max(0.02, Math.abs(w))
      this.currentParams = { ...this.currentParams, height }

      const halfW = (w >= 0 ? 1 : -1) * (height / 2)

      if (kind === 'RECTANGULAR' || kind === 'LINEAR_HEIGHT') {
        const baseDelta = this.primaryPoint.clone().sub(this.startPoint)
        const { u: finalU, v: finalV } = ConstructionFrameResolver.projectToUVW(baseDelta, this.frame)
        const baseCenter = this.startPoint.clone()
          .addScaledVector(this.frame.axisU, finalU / 2)
          .addScaledVector(this.frame.axisV, finalV / 2)
        const center = baseCenter.clone().addScaledVector(this.frame.axisW, halfW)

        this.ghost.update(this.primitiveType, this.currentParams, center, rotation)
        const u = (this.currentParams as any).width || 1
        const v = (this.currentParams as any).depth || 1
        this.dimensionText = `Height: ${height.toFixed(2)}  |  Width: ${u.toFixed(2)}  |  Depth: ${v.toFixed(2)}`
      } else {
        // Radial with height (Cylinder, Cone, Capsule, Tube, Arch)
        const center = this.startPoint.clone().addScaledVector(this.frame.axisW, halfW)
        this.ghost.update(this.primitiveType, this.currentParams, center, rotation)
        const rad = (this.currentParams as any).radius || 0.5
        this.dimensionText = `Height: ${height.toFixed(2)}  |  Radius: ${rad.toFixed(2)}`
      }
    }
  }

  private getHalfDimensions(params: any): THREE.Vector3 {
    const w = (params.width || (params.radius ? params.radius * 2 : 1)) / 2
    const h = (params.height || (params.radius ? params.radius * 2 : 1)) / 2
    const d = (params.depth || (params.radius ? params.radius * 2 : 1)) / 2
    return new THREE.Vector3(w, h, d)
  }

  private updateGhostAndStatus() {
    if (this.mode === PrimitivePlacementMode.PLACE) {
      this.updatePlaceGhost()
    }
    this.updateStatus()
  }

  private commitPrimitive() {
    if (!this.ghost) {
      this.cancel()
      return
    }

    const pos = this.ghost.group.position.clone()
    const rot = new THREE.Euler().setFromQuaternion(this.ghost.group.quaternion)
    const rotDeg = {
      x: THREE.MathUtils.radToDeg(rot.x),
      y: THREE.MathUtils.radToDeg(rot.y),
      z: THREE.MathUtils.radToDeg(rot.z)
    }

    // Call store commit callback
    this.ctx.onCommit(`Create ${this.primitiveType}`)

    // Dispatch global event for projectStore to execute CreatePrimitiveCommand
    window.dispatchEvent(
      new CustomEvent('primitive-created', {
        detail: {
          type: this.primitiveType,
          parameters: { ...this.currentParams },
          transform: {
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: rotDeg,
            scale: { x: 1, y: 1, z: 1 }
          }
        }
      })
    )

    // Repeat creation workflow
    this.state = this.mode === PrimitivePlacementMode.PLACE
      ? PrimitivePlacementState.PLACE_PREVIEW
      : PrimitivePlacementState.WAITING_FOR_START
    this.frame = null
    this.updateStatus()
  }

  cancel() {
    this.ghost?.dispose(this.ctx.previewGroup)
    this.ghost = null
    this.ctx.onUpdatePreview?.()
    super.cancel()
  }

  confirm() {
    this.commitPrimitive()
    this.ghost?.dispose(this.ctx.previewGroup)
    this.ghost = null
    super.confirm()
  }

  updateStatus() {
    const modeLabel = this.mode === PrimitivePlacementMode.PLACE ? 'Place' : 'CAD Draw'
    const orientLabel = this.placementOrientation === 'WORLD' ? 'World' : 'Surface'

    if (this.mode === PrimitivePlacementMode.PLACE) {
      this.statusText = `${this.primitiveType} [${modeLabel}] (LMB: Place on Surface | O: Align [${orientLabel}] | Esc: Exit) | ${this.dimensionText}`
    } else {
      if (this.state === PrimitivePlacementState.WAITING_FOR_START) {
        this.statusText = `${this.primitiveType} [${modeLabel}] (LMB: Click Any Surface to Start Base | Esc: Exit)`
      } else if (this.state === PrimitivePlacementState.DRAWING_PRIMARY) {
        this.statusText = `${this.primitiveType} [${modeLabel}] (LMB: Lock Surface Footprint | RMB: Back | Esc: Exit) | ${this.dimensionText}`
      } else {
        this.statusText = `${this.primitiveType} [${modeLabel}] (LMB: Lock Surface Extrusion | RMB: Back | Esc: Exit) | ${this.dimensionText}`
      }
    }
  }
}
