import * as THREE from 'three'
import { ModalOperator, OperatorContext } from '../ModalOperator'
import { HalfEdgeTopology } from '../../mesh/HalfEdgeTopology'
import { TopologyOps } from '../../mesh/operations/TopologyOps'
import { ScreenGeometry } from '../../geometry/ScreenGeometry'

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
  public previewSegments: LoopCutPreviewSegment[] = []

  private refEdgeScreenA = new THREE.Vector2()
  private refEdgeScreenB = new THREE.Vector2()

  begin(ctx: OperatorContext, startPointer: { x: number; y: number }) {
    super.begin(ctx, startPointer)
    this.loopState = LoopCutState.FINDING_RING
    this.cutCount = 1
    this.slideFactor = 0.5
    this.hoveredEdgeId = null
    this.ringEdgeIds = []
    this.previewSegments = []

    this.findHoveredEdgeAndRing()
    this.updatePreviewSegments()
  }

  pointerMove(event: PointerEvent) {
    this.currentMouse = { x: event.clientX, y: event.clientY }

    if (this.loopState === LoopCutState.FINDING_RING) {
      this.findHoveredEdgeAndRing()
      this.updatePreviewSegments()
    } else if (this.loopState === LoopCutState.SLIDING) {
      // Solve slide parameter along representative screen edge
      const mousePt = new THREE.Vector2(event.clientX, event.clientY)
      let t = ScreenGeometry.closestPointParameterOnSegment2D(
        mousePt,
        this.refEdgeScreenA,
        this.refEdgeScreenB
      )

      if (event.shiftKey) {
        t = 0.5 + (t - 0.5) * 0.2
      }
      if (event.ctrlKey) {
        t = Math.round(t * 10) / 10
      }

      this.slideFactor = Math.max(0.01, Math.min(0.99, t))
      this.updatePreviewSegments()
    }

    this.ctx.onUpdatePreview()
    this.updateStatus()
  }

  wheel(event: WheelEvent): boolean {
    event.preventDefault()
    if (this.loopState === LoopCutState.FINDING_RING) {
      if (event.deltaY < 0) {
        this.cutCount = Math.min(16, this.cutCount + 1)
      } else {
        this.cutCount = Math.max(1, this.cutCount - 1)
      }
      this.updatePreviewSegments()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    return false
  }

  handlePointerDown(button: number): boolean {
    if (button === 0) {
      // LMB
      if (this.loopState === LoopCutState.FINDING_RING) {
        if (this.ringEdgeIds.length > 0) {
          this.loopState = LoopCutState.SLIDING
          this.initSlideReferenceEdge()
          this.updateStatus()
          return true
        }
      } else if (this.loopState === LoopCutState.SLIDING) {
        this.confirm()
        return true
      }
    } else if (button === 2) {
      // RMB
      if (this.loopState === LoopCutState.SLIDING) {
        // Blender RMB behavior: snap cut back to center (0.5) and commit
        this.slideFactor = 0.5
        this.confirm()
        return true
      } else {
        this.cancel()
        return true
      }
    }
    return false
  }

  private findHoveredEdgeAndRing() {
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const mousePt = new THREE.Vector2(this.currentMouse.x, this.currentMouse.y)

    let closestEdgeId: number | null = null
    let minScreenDist = 24 // 24px pick tolerance

    for (const [eId, edge] of this.ctx.mesh.edges) {
      const p1 = this.ctx.mesh.vertices.get(edge.v1)?.position
      const p2 = this.ctx.mesh.vertices.get(edge.v2)?.position
      if (!p1 || !p2) continue

      const s1 = ScreenGeometry.worldToScreen(p1, this.ctx.camera, rect)
      const s2 = ScreenGeometry.worldToScreen(p2, this.ctx.camera, rect)

      const { distance } = ScreenGeometry.distancePointToSegment2D(mousePt, s1, s2)
      if (distance < minScreenDist) {
        minScreenDist = distance
        closestEdgeId = eId
      }
    }

    if (closestEdgeId !== this.hoveredEdgeId) {
      this.hoveredEdgeId = closestEdgeId
      if (closestEdgeId !== null) {
        this.ringEdgeIds = HalfEdgeTopology.findEdgeRing(this.ctx.mesh, closestEdgeId)
      } else {
        this.ringEdgeIds = []
      }
    }
  }

  private initSlideReferenceEdge() {
    if (!this.hoveredEdgeId) return
    const edge = this.ctx.mesh.edges.get(this.hoveredEdgeId)
    if (!edge) return

    const p1 = this.ctx.mesh.vertices.get(edge.v1)?.position
    const p2 = this.ctx.mesh.vertices.get(edge.v2)?.position
    if (!p1 || !p2) return

    const rect = this.ctx.viewportElement.getBoundingClientRect()
    this.refEdgeScreenA = ScreenGeometry.worldToScreen(p1, this.ctx.camera, rect)
    this.refEdgeScreenB = ScreenGeometry.worldToScreen(p2, this.ctx.camera, rect)
  }

  private getCutParameters(): number[] {
    if (this.cutCount === 1) {
      return [this.slideFactor]
    }

    const params: number[] = []
    const baseSpacing = 1 / (this.cutCount + 1)
    const offset = (this.slideFactor - 0.5) * 0.5

    for (let i = 1; i <= this.cutCount; i++) {
      const t = Math.max(0.01, Math.min(0.99, i * baseSpacing + offset))
      params.push(t)
    }
    return params
  }

  private updatePreviewSegments() {
    this.previewSegments = []
    if (this.ringEdgeIds.length === 0) return

    const cutParams = this.getCutParameters()
    const visitedFaces = new Set<number>()

    for (const eId of this.ringEdgeIds) {
      const edge = this.ctx.mesh.edges.get(eId)
      if (!edge) continue

      for (const fId of edge.faceIds) {
        if (visitedFaces.has(fId)) continue
        const face = this.ctx.mesh.faces.get(fId)
        if (!face || face.vertexIds.length !== 4) continue

        // Find opposite edge in this quad
        const oppEdgesInQuad = face.edgeIds.filter(id => this.ringEdgeIds.includes(id))
        if (oppEdgesInQuad.length === 2) {
          visitedFaces.add(fId)

          const e1 = this.ctx.mesh.edges.get(oppEdgesInQuad[0])!
          const e2 = this.ctx.mesh.edges.get(oppEdgesInQuad[1])!

          const p1A = this.ctx.mesh.vertices.get(e1.v1)?.position
          const p1B = this.ctx.mesh.vertices.get(e1.v2)?.position
          const p2A = this.ctx.mesh.vertices.get(e2.v1)?.position
          const p2B = this.ctx.mesh.vertices.get(e2.v2)?.position

          if (p1A && p1B && p2A && p2B) {
            for (const t of cutParams) {
              const pt1 = p1A.clone().lerp(p1B, t)
              const pt2 = p2A.clone().lerp(p2B, t)
              this.previewSegments.push({ p1: pt1, p2: pt2 })
            }
          }
        }
      }
    }
  }

  evaluate() {
    // Evaluates during interactive move
  }

  confirm() {
    if (this.ringEdgeIds.length === 0) {
      this.cancel()
      return
    }

    const cutParams = this.getCutParameters()
    const visitedFaces = new Set<number>()

    // Apply topological subdivision to all crossed quads
    for (const eId of this.ringEdgeIds) {
      const edge = this.ctx.mesh.edges.get(eId)
      if (!edge) continue

      for (const fId of edge.faceIds) {
        if (visitedFaces.has(fId)) continue
        const face = this.ctx.mesh.faces.get(fId)
        if (!face || face.vertexIds.length !== 4) continue

        const oppEdgesInQuad = face.edgeIds.filter(id => this.ringEdgeIds.includes(id))
        if (oppEdgesInQuad.length === 2) {
          visitedFaces.add(fId)
          TopologyOps.subdivideQuadWithParallelCuts(
            this.ctx.mesh,
            fId,
            oppEdgesInQuad[0],
            oppEdgesInQuad[1],
            cutParams
          )
        }
      }
    }

    super.confirm()
  }

  updateStatus() {
    if (this.loopState === LoopCutState.FINDING_RING) {
      this.statusText = `Loop Cut | Cuts: ${this.cutCount} (Scroll Wheel to change | LMB to Slide)`
    } else {
      this.statusText = `Loop Slide: ${(this.slideFactor * 100).toFixed(1)}% (LMB Confirm | RMB Center | Esc Cancel)`
    }
  }
}
