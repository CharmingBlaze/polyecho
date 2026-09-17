import { ModalOperator } from './ModalOperator'
import { BevelResult, bevelProfileLabel, bevelProfileValue } from '../mesh/operations/BevelKernel'
import { bevelEdges } from '../mesh/operations/EdgeBevelKernel'
import { MeshEditOps } from '../mesh/operations/MeshEditOps'

export class BevelOperator extends ModalOperator {
  readonly name = 'Bevel'

  private segments = 1
  private profile = 0
  private lastResult: BevelResult | null = null

  wheel(event: WheelEvent): boolean {
    event.preventDefault()
    if (event.deltaY < 0) {
      this.segments = Math.min(8, this.segments + 1)
    } else {
      this.segments = Math.max(1, this.segments - 1)
    }
    this.evaluate()
    this.ctx.onUpdatePreview()
    this.updateStatus()
    return true
  }

  keyDown(event: KeyboardEvent): boolean {
    if (event.key.toLowerCase() === 'p') {
      event.preventDefault()
      this.cycleProfile()
      this.evaluate()
      this.ctx.onUpdatePreview()
      this.updateStatus()
      return true
    }
    return super.keyDown(event)
  }

  private cycleProfile() {
    const mode = bevelProfileLabel(this.profile)
    if (mode === 'chamfer') {
      this.profile = bevelProfileValue('convex')
      if (this.segments < 3) this.segments = 3
    } else if (mode === 'convex') {
      this.profile = bevelProfileValue('concave')
      if (this.segments < 3) this.segments = 3
    } else {
      this.profile = bevelProfileValue('chamfer')
    }
  }

  evaluate() {
    this.restoreSnapshot()

    const numWidth = this.numericInput.getValue()
    const startDist = Math.hypot(this.startMouse.x - this.pivotScreen.x, this.startMouse.y - this.pivotScreen.y) || 50
    const curDist = Math.hypot(this.currentMouse.x - this.pivotScreen.x, this.currentMouse.y - this.pivotScreen.y)

    let width = numWidth !== null
      ? numWidth
      : Math.abs(curDist - startDist) / (this.isShiftHeld ? 400 : 120)

    if (this.isCtrlHeld && numWidth === null) {
      width = this.snapManager.snapLinear(width, 0.05)
    }

    const between = [...this.ctx.mesh.edges.values()].filter(e => this.ctx.selectedVertIds.includes(e.v1) && this.ctx.selectedVertIds.includes(e.v2)).map(e => e.id)
    const incident = [...this.ctx.mesh.edges.values()].filter(e => this.ctx.selectedVertIds.includes(e.v1) || this.ctx.selectedVertIds.includes(e.v2)).map(e => e.id)
    const edgeIds = this.ctx.selectedEdgeIds.length ? this.ctx.selectedEdgeIds
      : this.ctx.selectedFaceIds.length ? [...new Set(this.ctx.selectedFaceIds.flatMap(id => this.ctx.mesh.faces.get(id)?.edgeIds ?? []))]
        : between.length ? between : incident
    const manifold = edgeIds.filter(id => (this.ctx.mesh.edges.get(id)?.faceIds.length ?? 0) === 2)
    const boundary = edgeIds.filter(id => (this.ctx.mesh.edges.get(id)?.faceIds.length ?? 0) === 1)
    this.lastResult = manifold.length
      ? bevelEdges(this.ctx.mesh, manifold, {
          width,
          segments: this.segments,
          profile: this.profile,
          clampOverlap: true,
        })
      : { mesh: this.ctx.mesh, beveledFaceIds: [], beveledVertexIds: [] }
    if (boundary.length && !this.lastResult.error) {
      const beforeFaces = new Set(this.ctx.mesh.faces.keys())
      const beforeVerts = new Set(this.ctx.mesh.vertices.keys())
      MeshEditOps.bevelBoundaryEdges(this.ctx.mesh, boundary, width)
      const addedFaces = [...this.ctx.mesh.faces.keys()].filter(id => !beforeFaces.has(id))
      const addedVerts = [...this.ctx.mesh.vertices.keys()].filter(id => !beforeVerts.has(id))
      this.lastResult.beveledFaceIds.push(...addedFaces)
      this.lastResult.beveledVertexIds.push(...addedVerts)
    }
  }

  confirm() {
    if (!this.lastResult || this.lastResult.error || (!this.lastResult.beveledFaceIds.length && this.lastResult.beveledVertexIds.length === 0)) {
      this.cancel()
      return
    }
    if (this.lastResult) {
      this.ctx.selectedFaceIds = [...this.lastResult.beveledFaceIds]
      this.ctx.selectedVertIds = [...this.lastResult.beveledVertexIds]
    }
    super.confirm()
  }

  updateStatus() {
    const num = this.numericInput.text ? ` Width: ${this.numericInput.text}` : ''
    const shape = bevelProfileLabel(this.profile)
    this.statusText = this.lastResult?.error ?? `Bevel${num} | Profile: ${shape} (P) | Segments: ${this.segments} (scroll)`
  }
}
