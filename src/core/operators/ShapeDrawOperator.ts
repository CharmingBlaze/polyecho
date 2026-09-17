import * as THREE from 'three'
import { ModalOperator, type OperatorContext } from './ModalOperator'
import { operatorManager } from './OperatorManager'
import { ScreenGeometry } from '../geometry/ScreenGeometry'
import { PolyDrawKernel } from '../mesh/operations/PolyDrawKernel'
import { MeshBridge } from '../mesh/MeshBridge'
import { cloneRecipe, generateShape, vector, sampleOutline, mirroredOutline, type ShapeRecipe, type ShapePoint } from '../shapeDraw/ShapeRecipe'

/** Keeps recipe editing separate from the document mesh until Done. */
export class ShapeDrawOperator extends ModalOperator {
  readonly name = 'Shape Draw'
  recipe: ShapeRecipe = {
    version: 1, points: [], origin: { x: 0, y: 0, z: 0 },
    axisU: { x: 1, y: 0, z: 0 }, axisV: { x: 0, y: 1, z: 0 },
    depth: 0.5, roundness: 0.8, density: 0, style: 'rounded',
  }
  closed = false
  selected = -1
  selectedSection = 0
  selectedHole = -1
  editingSide = false
  drawingMode: 'points' | 'freehand' = 'points'
  private freehandDrawing = false
  private lastStrokePixel = new THREE.Vector2()
  error = ''
  bake = false
  hover: THREE.Vector3 | null = null
  private preview = new THREE.Group()
  private undoRecipes: { recipe: ShapeRecipe; closed: boolean; section: number; hole: number; side: boolean }[] = []
  private redoRecipes: { recipe: ShapeRecipe; closed: boolean; section: number; hole: number; side: boolean }[] = []
  private dragging = false
  private depthDragging = false
  private depthStart = 0
  private depthMouse = new THREE.Vector2()
  private depthDirection = new THREE.Vector2(0, -1)
  private parameterGesture = false
  private surfaceDirty = true
  private surface = new THREE.Group()
  private outlinePreview: THREE.Line | null = null
  private pendingFrame = 0
  private disposed = false
  private world = new THREE.Matrix4()
  private inverseWorld = new THREE.Matrix4()

  constructor(source?: ShapeRecipe) {
    super()
    if (source) { this.recipe = cloneRecipe(source); this.closed = true }
  }

  begin(ctx: OperatorContext, pointer: { x: number; y: number }) {
    super.begin(ctx, pointer)
    this.world.copy(ctx.objectMatrix ?? new THREE.Matrix4())
    this.inverseWorld.copy(this.world).invert()
    this.preview.matrixAutoUpdate = false
    this.preview.matrix.copy(this.world)
    this.preview.add(this.surface)
    ctx.previewGroup?.add(this.preview)
    window.addEventListener('pointerup', this.endDrag)
    window.addEventListener('pointercancel', this.endDrag)
    if (this.closed) this.evaluate()
    else this.refresh()
  }

  get canFinish() { return this.closed && !this.error && this.ctx.mesh.faces.size > 0 }
  get faceCount() { return this.ctx.mesh.faces.size }
  get triangleCount() { return [...this.ctx.mesh.faces.values()].reduce((sum, face) => sum + face.vertexIds.length - 2, 0) }
  get quadCount() { return [...this.ctx.mesh.faces.values()].filter(face => face.vertexIds.length === 4).length }
  get canUndo() { return this.undoRecipes.length > 0 }
  get canRedo() { return this.redoRecipes.length > 0 }
  get points(): ShapePoint[] {
    if (this.editingSide) return this.recipe.sideProfile ?? this.recipe.points
    if (this.selectedHole >= 0) return this.recipe.holes?.[this.selectedHole] ?? this.recipe.points
    return this.selectedSection > 0 ? this.recipe.sections?.[this.selectedSection - 1]?.points ?? this.recipe.points : this.recipe.points
  }
  get sectionOffset() { return this.selectedSection > 0 ? (this.recipe.sections?.[this.selectedSection - 1]?.at ?? 0) * this.recipe.depth : 0 }
  get isPath() { return this.recipe.kind === 'path' }

  sideProfile(enabled: boolean) {
    if (enabled && !this.recipe.sideProfile?.length) {
      this.checkpoint()
      const min = Math.min(...this.recipe.points.map(p => p.y)), max = Math.max(...this.recipe.points.map(p => p.y))
      this.recipe.sideProfile = [{ x: -0.5, y: min }, { x: 0.5, y: min }, { x: 0.5, y: max }, { x: -0.5, y: max }]
    }
    this.editingSide = enabled; this.selectedHole = -1; this.selected = -1; this.evaluate()
  }

  removeSideProfile() { this.checkpoint(); delete this.recipe.sideProfile; this.editingSide = false; this.selected = -1; this.closed = true; this.evaluate() }

  setKind(kind: 'outline' | 'path' | 'loft') {
    if (this.recipe.points.length) return
    this.recipe.kind = kind; this.refresh()
  }

  setSymmetry(axis: 'none' | 'x' | 'y') {
    this.checkpoint(); this.recipe.symmetry = axis
    if (axis !== 'none' && this.recipe.points.length) {
      this.recipe.points[0][axis] = 0
      if (this.closed) this.recipe.points[this.recipe.points.length - 1][axis] = 0
    }
    this.evaluate()
  }

  reopen() { this.checkpoint(); this.closed = false; this.surfaceDirty = true; this.refresh() }

  setSection(index: number) { this.selectedSection = index; this.selected = -1; this.refresh() }

  addHole() {
    if (!this.canFinish || (this.recipe.holes?.length ?? 0) >= 8) return
    this.checkpoint()
    this.recipe.holes ??= []; this.recipe.holes.push([])
    this.editingSide = false; this.selectedHole = this.recipe.holes.length - 1; this.selected = -1
    this.closed = false; this.refresh()
  }
  setHole(index: number) { this.editingSide = false; this.selectedHole = index; this.selected = -1; this.refresh() }
  removeHole() {
    if (this.selectedHole < 0) return
    this.checkpoint(); this.recipe.holes?.splice(this.selectedHole, 1)
    this.selectedHole = -1; this.selected = -1; this.closed = true; this.evaluate()
  }

  addSection() {
    if ((this.recipe.sections?.length ?? 0) >= 15) return
    this.checkpoint()
    if (!this.recipe.sections?.length) this.recipe.sections = [{ at: 1, points: structuredClone(this.recipe.points) }]
    const index = Math.min(this.selectedSection, this.recipe.sections.length - 1)
    const prev = index === 0 ? { at: 0, points: this.recipe.points } : this.recipe.sections[index - 1]
    const next = this.recipe.sections[index]
    this.recipe.sections.splice(index, 0, { at: (prev.at + next.at) / 2, points: structuredClone(prev.points) })
    this.selectedSection = index + 1; this.evaluate()
  }

  scaleSection(factor: number) {
    this.checkpoint()
    const centre = this.points.reduce((sum, p) => ({ x: sum.x + p.x / this.points.length, y: sum.y + p.y / this.points.length }), { x: 0, y: 0 })
    this.points.forEach(p => { p.x = centre.x + (p.x - centre.x) * factor; p.y = centre.y + (p.y - centre.y) * factor })
    this.evaluate()
  }

  smoothPoint() {
    if (this.selected < 0 || this.isPath) return
    this.checkpoint(); this.points[this.selected].smooth = !this.points[this.selected].smooth; this.evaluate()
  }

  simplify(record = true) {
    if (this.points.length < 4) return
    if (record) this.checkpoint()
    const bounds = new THREE.Box2().setFromPoints(this.points.map(p => new THREE.Vector2(p.x, p.y)))
    const tolerance = bounds.getSize(new THREE.Vector2()).length() * 0.008
    // Remove nearly collinear samples, retaining corners and explicit curve anchors.
    for (let i = this.points.length - 2; i > 0; i--) {
      if (this.points[i].smooth) continue
      const a = new THREE.Vector2(this.points[i - 1].x, this.points[i - 1].y), b = new THREE.Vector2(this.points[i + 1].x, this.points[i + 1].y)
      const p = new THREE.Vector2(this.points[i].x, this.points[i].y), ab = b.clone().sub(a)
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-12), 0, 1)
      if (p.distanceTo(a.addScaledVector(ab, t)) < tolerance && this.points.length > (this.isPath ? 2 : 3)) this.points.splice(i, 1)
    }
    this.selected = -1; this.evaluate()
  }

  private checkpoint() {
    this.undoRecipes.push({ recipe: cloneRecipe(this.recipe), closed: this.closed, section: this.selectedSection, hole: this.selectedHole, side: this.editingSide })
    if (this.undoRecipes.length > 100) this.undoRecipes.shift()
    this.redoRecipes = []
  }

  history(redo = false) {
    const from = redo ? this.redoRecipes : this.undoRecipes
    const to = redo ? this.undoRecipes : this.redoRecipes
    const state = from.pop()
    if (!state) return
    to.push({ recipe: cloneRecipe(this.recipe), closed: this.closed, section: this.selectedSection, hole: this.selectedHole, side: this.editingSide })
    this.recipe = state.recipe; this.closed = state.closed; this.selected = -1; this.selectedSection = state.section; this.selectedHole = state.hole
    this.editingSide = state.side
    this.evaluate()
  }

  setParameter(key: 'depth' | 'roundness' | 'density' | 'style' | 'taper' | 'frontBias' | 'topology', value: number | string) {
    if (this.recipe[key] === value) return
    if (!this.parameterGesture) this.checkpoint()
    Object.assign(this.recipe, { [key]: value })
    this.evaluate()
  }

  beginParameterGesture() {
    if (!this.parameterGesture) this.checkpoint()
    this.parameterGesture = true
  }
  endParameterGesture() { this.parameterGesture = false }

  closeOutline() {
    if (this.closed) return
    this.checkpoint(); this.closed = true
    if (!this.editingSide && this.recipe.symmetry && this.recipe.symmetry !== 'none' && this.selectedHole < 0 && this.recipe.points.length) this.recipe.points[this.recipe.points.length - 1][this.recipe.symmetry] = 0
    if (this.recipe.kind === 'loft' && !this.recipe.sections?.length) this.recipe.sections = [{ at: 1, points: structuredClone(this.recipe.points) }]
    this.evaluate()
    if (this.error) this.closed = false
    this.refresh()
  }

  removePoint() {
    if (this.selected < 0) return
    this.checkpoint()
    this.points.splice(this.selected, 1); this.selected = -1
    if (this.points.length < (this.isPath ? 2 : 3)) this.closed = false
    this.evaluate()
  }

  insertPoint() {
    if (this.selected < 0 || this.points.length >= 256 || (this.isPath && this.selected === this.points.length - 1)) return
    const a = this.points[this.selected]
    const b = this.points[(this.selected + 1) % this.points.length]
    if (!b) return
    this.checkpoint()
    this.points.splice(this.selected + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    this.selected++; this.evaluate()
  }

  private localPoint(p: { x: number; y: number }) {
    if (this.editingSide) return vector(this.recipe.origin).addScaledVector(vector(this.recipe.axisU).cross(vector(this.recipe.axisV)), p.x * this.recipe.depth).addScaledVector(vector(this.recipe.axisV), p.y)
    return vector(this.recipe.origin).addScaledVector(vector(this.recipe.axisU), p.x).addScaledVector(vector(this.recipe.axisV), p.y)
      .addScaledVector(vector(this.recipe.axisU).cross(vector(this.recipe.axisV)), this.sectionOffset)
  }

  overlayPoints() {
    return this.points.map(p => ScreenGeometry.worldToOverlay(this.localPoint(p).applyMatrix4(this.world),
      this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant))
  }

  depthHandle() {
    const centre = this.recipe.points.reduce<THREE.Vector3>((sum, p) => sum.add(this.localPoint(p)), new THREE.Vector3())
      .divideScalar(Math.max(1, this.recipe.points.length))
    const normal = vector(this.recipe.axisU).cross(vector(this.recipe.axisV)).normalize()
    const project = (p: THREE.Vector3) => ScreenGeometry.worldToOverlay(p.applyMatrix4(this.world), this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant)
    const start = project(centre.clone()), end = project(centre.clone().addScaledVector(normal, this.recipe.depth / 2))
    if (start.distanceTo(end) < 30) end.copy(start).add(new THREE.Vector2(42, -28))
    return { start, end }
  }

  private pointerPoint(): THREE.Vector3 | null {
    if (!ScreenGeometry.isInPane(this.currentMouse, this.ctx.viewportElement, this.ctx.quadrant)) return null
    if (!this.recipe.points.length) {
      const plane = this.ctx.viewportKind === 'persp'
        ? PolyDrawKernel.viewPlane(this.ctx.camera, this.ctx.orbitTarget ?? new THREE.Vector3())
        : PolyDrawKernel.planeForView(this.ctx.viewportKind ?? 'front')
      this.recipe.origin = { ...plane.origin }; this.recipe.axisU = { ...plane.axisU }; this.recipe.axisV = { ...plane.axisV }
    }
    const ray = ScreenGeometry.rayFromClient(this.currentMouse, this.ctx.camera, this.ctx.viewportElement, this.ctx.quadrant)
    ray.applyMatrix4(this.inverseWorld)
    const plane = { origin: vector(this.recipe.origin), axisU: vector(this.recipe.axisU), axisV: vector(this.recipe.axisV),
      normal: vector(this.recipe.axisU).cross(vector(this.recipe.axisV)).normalize() }
    if (this.editingSide) { plane.axisU.copy(plane.normal); plane.normal.copy(plane.axisU).cross(plane.axisV).normalize() }
    plane.origin.addScaledVector(plane.normal, this.sectionOffset)
    let hit = PolyDrawKernel.intersectPlane(ray, plane)
    if (hit && (this.ctx.snapGrid || this.isCtrlHeld)) hit = PolyDrawKernel.snapOnPlane(hit, plane, (this.ctx.gridSize ?? 0.5) * (this.isCtrlHeld ? 0.5 : 1))
    if (hit && this.isShiftHeld && !this.closed && this.points.length) {
      hit = PolyDrawKernel.constrainFromLast(this.localPoint(this.points[this.points.length - 1]), hit, plane, this.ctx.gridSize ?? 0.5)
    }
    return hit
  }

  private pointAtHit(hit: THREE.Vector3) {
    const delta = hit.clone().sub(vector(this.recipe.origin))
    const u = this.editingSide ? vector(this.recipe.axisU).cross(vector(this.recipe.axisV)) : vector(this.recipe.axisU)
    return { x: delta.dot(u) / (this.editingSide ? this.recipe.depth : 1), y: delta.dot(vector(this.recipe.axisV)) }
  }

  pointerMove(event: PointerEvent) {
    if (!this.dragging && !this.depthDragging && (event.target as HTMLElement | null)?.closest?.('.hud-panel')) return
    this.currentMouse = { x: event.clientX, y: event.clientY }
    this.isShiftHeld = event.shiftKey; this.isCtrlHeld = event.ctrlKey
    if (this.depthDragging) {
      const delta = new THREE.Vector2(event.clientX, event.clientY).sub(this.depthMouse).dot(this.depthDirection)
      this.recipe.depth = THREE.MathUtils.clamp(this.depthStart * Math.exp(delta / 100), 0.001, 1000)
      if (!this.pendingFrame) this.pendingFrame = requestAnimationFrame(() => { this.pendingFrame = 0; this.evaluate() })
      return
    }
    this.hover = this.pointerPoint()
    if (this.freehandDrawing && this.hover && this.points.length < 256) {
      const pixel = new THREE.Vector2(event.clientX, event.clientY)
      if (pixel.distanceTo(this.lastStrokePixel) >= 8) {
        const next = this.pointAtHit(this.hover)
        const last = this.points[this.points.length - 1]
        if (!last || Math.hypot(next.x - last.x, next.y - last.y) > 1e-5) this.points.push(next)
        this.lastStrokePixel.copy(pixel)
      }
      this.refresh(); return
    }
    if (this.dragging && this.hover && this.selected >= 0) {
      this.points[this.selected] = { ...this.points[this.selected], ...this.pointAtHit(this.hover) }
      if (!this.editingSide && this.recipe.symmetry && this.recipe.symmetry !== 'none' && this.selectedHole < 0 && (this.selected === 0 || this.selected === this.points.length - 1)) this.points[this.selected][this.recipe.symmetry] = 0
      if (!this.pendingFrame) this.pendingFrame = requestAnimationFrame(() => { this.pendingFrame = 0; this.evaluate() })
    } else this.refresh()
  }

  handlePointerDown(button: number) {
    if (button === 2) { this.history(); return true }
    if (button !== 0) return true
    this.hover = this.pointerPoint()
    const rect = this.ctx.viewportElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(this.currentMouse.x - rect.left, this.currentMouse.y - rect.top)
    if (this.closed && !this.editingSide && mouse.distanceTo(this.depthHandle().end) < 12) {
      this.checkpoint(); this.depthDragging = true; this.depthStart = this.recipe.depth
      this.depthMouse.set(this.currentMouse.x, this.currentMouse.y)
      const handle = this.depthHandle()
      this.depthDirection.copy(handle.end).sub(handle.start).normalize()
      return true
    }
    const idx = this.overlayPoints().findIndex(p => p.distanceTo(mouse) < 12)
    if (!this.closed && !this.isPath && idx === 0 && this.points.length >= 3) { this.closeOutline(); return true }
    if (idx >= 0 && this.hover) {
      this.checkpoint(); this.selected = idx; this.dragging = true; this.refresh(); return true
    }
    if (this.closed || !this.hover || this.points.length >= 256) { this.selected = -1; this.refresh(); return true }
    this.checkpoint()
    this.points.push(this.pointAtHit(this.hover))
    if (!this.editingSide && this.recipe.symmetry && this.recipe.symmetry !== 'none' && this.selectedHole < 0 && this.points.length === 1) this.points[0][this.recipe.symmetry] = 0
    this.selected = this.points.length - 1
    if (this.drawingMode === 'freehand') { this.freehandDrawing = true; this.lastStrokePixel.set(this.currentMouse.x, this.currentMouse.y) }
    this.error = ''; this.refresh()
    return true
  }

  private endDrag = () => {
    if (this.freehandDrawing) { this.freehandDrawing = false; this.simplify(false); this.refresh(); return }
    if (!this.dragging && !this.depthDragging) return
    this.dragging = false; this.depthDragging = false
    if (this.pendingFrame) { cancelAnimationFrame(this.pendingFrame); this.pendingFrame = 0 }
    this.evaluate()
  }

  keyDown(event: KeyboardEvent) {
    const key = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
      this.history(key === 'y' || event.shiftKey); return true
    }
    if (key === 'enter') {
      if (!this.closed) this.closeOutline()
      else if (this.canFinish) operatorManager.confirm()
      return true
    }
    if (key === 'delete' || key === 'backspace') { this.removePoint(); return true }
    if (key === 'tab') { if (this.closed) this.reopen(); else this.closeOutline(); return true }
    // Consume modal shortcuts so unrelated component operations cannot run mid-recipe.
    return true
  }

  evaluate() {
    if (this.disposed) return
    this.error = ''
    if (this.closed) {
      try {
        const result = generateShape(this.recipe)
        this.ctx.mesh.restoreSnapshot(result.createSnapshot())
      } catch (error) { this.error = error instanceof Error ? error.message : 'Unable to generate this outline.' }
    }
    this.surfaceDirty = true
    this.refresh()
  }

  relayout() { this.refresh() }

  private clearSurface() {
    for (const child of [...this.surface.children]) {
      const drawable = child as THREE.Mesh
      drawable.geometry?.dispose()
      const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material]
      materials.forEach(m => m?.dispose())
      child.removeFromParent()
    }
  }

  private refresh() {
    if (this.disposed) return
    if (this.surfaceDirty) {
      this.clearSurface()
      if (this.closed && this.ctx.mesh.faces.size) {
        const geometry = MeshBridge.editableMeshToThreeGeometry(this.ctx.mesh)
        this.surface.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x67cbb8, roughness: 0.85, side: THREE.DoubleSide })))
        const edges: number[] = []
        for (const edge of this.ctx.mesh.edges.values()) {
          const a = this.ctx.mesh.vertices.get(edge.v1)!.position, b = this.ctx.mesh.vertices.get(edge.v2)!.position
          edges.push(a.x, a.y, a.z, b.x, b.y, b.z)
        }
        const wire = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(edges, 3))
        this.surface.add(new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: 0x23443e, transparent: true, opacity: 0.4 })))
      }
      this.surfaceDirty = false
    }
    this.outlinePreview?.geometry.dispose()
    ;(this.outlinePreview?.material as THREE.Material | undefined)?.dispose()
    this.outlinePreview?.removeFromParent()
    this.outlinePreview = null
    let contour = this.points
    if (this.closed && !this.editingSide && this.selectedHole < 0 && this.recipe.symmetry && this.recipe.symmetry !== 'none') {
      try { contour = mirroredOutline(this.recipe) } catch { /* keep invalid source visible */ }
    }
    const points = (this.closed && !this.isPath ? sampleOutline(contour) : contour).map(p => this.localPoint(p))
    if (this.closed && !this.isPath && points.length) points.push(points[0])
    else if (this.hover) points.push(this.hover)
    if (points.length > 1) {
      this.outlinePreview = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: this.error ? 0xfb7185 : 0x6ee7b7, depthTest: false }))
      this.preview.add(this.outlinePreview)
    }
    this.updateStatus(); this.ctx.onUpdatePreview()
  }

  updateStatus() {
    this.statusText = this.error || (this.closed ? 'Drag outline points · adjust volume · Done keeps the drawing editable'
      : this.isPath ? 'Draw a path · Enter to give it thickness · MMB orbit · Ctrl+Z undo'
      : 'Click points · click first point or Enter to close · MMB orbit · Ctrl+Z undo')
  }

  confirm() {
    if (!this.canFinish) { this.cancel(); return }
    this.dispose(); this.ctx.onCommit(this.name)
  }
  cancel() { this.dispose(); this.ctx.onCancel() }
  private dispose() {
    this.disposed = true
    cancelAnimationFrame(this.pendingFrame)
    window.removeEventListener('pointerup', this.endDrag)
    window.removeEventListener('pointercancel', this.endDrag)
    this.clearSurface()
    this.outlinePreview?.geometry.dispose()
    ;(this.outlinePreview?.material as THREE.Material | undefined)?.dispose()
    this.preview.removeFromParent()
  }
}
