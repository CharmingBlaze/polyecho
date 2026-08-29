import * as THREE from 'three'

/**
 * Architectural Render Passes:
 * Pass 1: Model geometry (Base mesh objects)
 * Pass 2: Shadows / AO (Shadow catcher plane)
 * Pass 3: Grid & Axes (Ground grid, origin axes)
 * Pass 4: Selection (Selected face overlays)
 * Pass 5: Vertices / Edges (Wireframe lines, selected edges, vertex points)
 * Pass 6: Gizmos (Transform gizmo, origin marker, bones)
 * Pass 7: Tool previews (Knife path, Loop cut rings, Bevel preview lines)
 */
export enum RenderPassOrder {
  MODEL_GEOMETRY = 10,
  SHADOWS_AO = 20,
  GRID_AXES = 30,
  SELECTION = 40,
  VERTICES_EDGES = 50,
  GIZMOS = 60,
  TOOL_PREVIEWS = 70,
  HOVER_OVERLAY = 80
}

export class ViewportLayerManager {
  public modelGroup: THREE.Group
  public shadowGroup: THREE.Group
  public gridGroup: THREE.Group
  public selectionGroup: THREE.Group
  public wireframeGroup: THREE.Group
  public gizmoGroup: THREE.Group
  public previewGroup: THREE.Group
  public hoverGroup: THREE.Group

  constructor(scene: THREE.Scene) {
    this.modelGroup = new THREE.Group()
    this.modelGroup.name = 'Pass1_ModelGeometry'
    this.modelGroup.renderOrder = RenderPassOrder.MODEL_GEOMETRY

    this.shadowGroup = new THREE.Group()
    this.shadowGroup.name = 'Pass2_ShadowsAO'
    this.shadowGroup.renderOrder = RenderPassOrder.SHADOWS_AO

    this.gridGroup = new THREE.Group()
    this.gridGroup.name = 'Pass3_GridAxes'
    this.gridGroup.renderOrder = RenderPassOrder.GRID_AXES

    this.selectionGroup = new THREE.Group()
    this.selectionGroup.name = 'Pass4_Selection'
    this.selectionGroup.renderOrder = RenderPassOrder.SELECTION

    this.wireframeGroup = new THREE.Group()
    this.wireframeGroup.name = 'Pass5_VerticesEdges'
    this.wireframeGroup.renderOrder = RenderPassOrder.VERTICES_EDGES

    this.gizmoGroup = new THREE.Group()
    this.gizmoGroup.name = 'Pass6_Gizmos'
    this.gizmoGroup.renderOrder = RenderPassOrder.GIZMOS

    this.previewGroup = new THREE.Group()
    this.previewGroup.name = 'Pass7_ToolPreviews'
    this.previewGroup.renderOrder = RenderPassOrder.TOOL_PREVIEWS

    this.hoverGroup = new THREE.Group()
    this.hoverGroup.name = 'Pass8_HoverOverlay'
    this.hoverGroup.renderOrder = RenderPassOrder.HOVER_OVERLAY

    scene.add(this.modelGroup)
    scene.add(this.shadowGroup)
    scene.add(this.gridGroup)
    scene.add(this.selectionGroup)
    scene.add(this.wireframeGroup)
    scene.add(this.gizmoGroup)
    scene.add(this.previewGroup)
    scene.add(this.hoverGroup)
  }

  clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      const obj = group.children[0]
      group.remove(obj)
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose()
      }
    }
  }

  clearPreviews() {
    this.clearGroup(this.previewGroup)
  }

  clearSelections() {
    this.clearGroup(this.selectionGroup)
  }

  clearWireframes() {
    this.clearGroup(this.wireframeGroup)
  }

  clearModels() {
    this.clearGroup(this.modelGroup)
  }

  dispose(scene: THREE.Scene) {
    this.clearModels()
    this.clearSelections()
    this.clearWireframes()
    this.clearPreviews()
    this.clearGroup(this.shadowGroup)
    this.clearGroup(this.gridGroup)
    this.clearGroup(this.gizmoGroup)
    this.clearGroup(this.hoverGroup)

    scene.remove(this.modelGroup)
    scene.remove(this.shadowGroup)
    scene.remove(this.gridGroup)
    scene.remove(this.selectionGroup)
    scene.remove(this.wireframeGroup)
    scene.remove(this.gizmoGroup)
    scene.remove(this.previewGroup)
    scene.remove(this.hoverGroup)
  }
}
