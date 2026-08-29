import { EditableMesh } from '../mesh/MeshKernel'

export type SelectionMode = 'OBJECT' | 'VERTEX' | 'EDGE' | 'FACE'

export class SelectionManager {
  public mode: SelectionMode = 'FACE'

  public selectedObjects = new Set<string>()
  public selectedVertices = new Set<number>()
  public selectedEdges = new Set<number>()
  public selectedFaces = new Set<number>()

  public activeObject: string | null = null
  public activeVertex: number | null = null
  public activeEdge: number | null = null
  public activeFace: number | null = null

  clearAll() {
    this.selectedObjects.clear()
    this.selectedVertices.clear()
    this.selectedEdges.clear()
    this.selectedFaces.clear()
    this.activeObject = null
    this.activeVertex = null
    this.activeEdge = null
    this.activeFace = null
  }

  // ----------------------------------------------------
  // Derived Selection Queries
  // ----------------------------------------------------
  getVerticesOfSelectedFaces(mesh: EditableMesh): Set<number> {
    const vertSet = new Set<number>()
    for (const fId of this.selectedFaces) {
      const face = mesh.faces.get(fId)
      if (face) {
        face.vertexIds.forEach(vid => vertSet.add(vid))
      }
    }
    return vertSet
  }

  getEdgesOfSelectedFaces(mesh: EditableMesh): Set<number> {
    const edgeSet = new Set<number>()
    for (const fId of this.selectedFaces) {
      const face = mesh.faces.get(fId)
      if (face) {
        face.edgeIds.forEach(eid => edgeSet.add(eid))
      }
    }
    return edgeSet
  }

  getBoundaryEdgesOfSelectedFaces(mesh: EditableMesh): number[] {
    const boundaryEdges: number[] = []
    for (const edge of mesh.edges.values()) {
      let selectedAdjacentFaces = 0
      for (const fId of edge.faceIds) {
        if (this.selectedFaces.has(fId)) {
          selectedAdjacentFaces++
        }
      }
      if (selectedAdjacentFaces === 1) {
        boundaryEdges.push(edge.id)
      }
    }
    return boundaryEdges
  }

  getFullySelectedFacesFromVertices(mesh: EditableMesh): number[] {
    const fullySelectedFaces: number[] = []
    for (const [fId, face] of mesh.faces) {
      const allSelected = face.vertexIds.every(vid => this.selectedVertices.has(vid))
      if (allSelected) {
        fullySelectedFaces.push(fId)
      }
    }
    return fullySelectedFaces
  }
}

export const selectionManager = new SelectionManager()
