import * as THREE from 'three'
import { MeshObject, Edge, Vertex } from '../../types/mesh'

/**
 * Extracts unique undirected edges from all faces of a MeshObject.
 */
export function getMeshEdges(mesh: MeshObject): Edge[] {
  const edgeMap = new Map<string, Edge>()
  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of mesh.faces) {
    const count = face.vertexIds.length
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count
      const idA = face.vertexIds[i]
      const idB = face.vertexIds[next]

      // Sort vertex IDs so edge key is order-independent
      const key = idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`

      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          id: key,
          v1: idA,
          v2: idB,
          selected: false
        })
      }
    }
  }

  return Array.from(edgeMap.values())
}

/**
 * Finds the closest edge segment in the mesh to a given 3D ray.
 * Uses distance between line segment (v1, v2) and ray in world space.
 */
export function findClosestEdge(
  mesh: MeshObject,
  ray: THREE.Ray,
  maxDistance = 0.35
): Edge | null {
  const edges = getMeshEdges(mesh)
  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) {
    vertMap.set(v.id, v)
  }

  let closestEdge: Edge | null = null
  let minDistance = maxDistance

  const meshPos = new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z)

  for (const edge of edges) {
    const v1 = vertMap.get(edge.v1)
    const v2 = vertMap.get(edge.v2)
    if (!v1 || !v2) continue

    const p1 = new THREE.Vector3(v1.position.x, v1.position.y, v1.position.z).add(meshPos)
    const p2 = new THREE.Vector3(v2.position.x, v2.position.y, v2.position.z).add(meshPos)

    // Distance between 3D line segment and Ray
    const segment = new THREE.LineCurve3(p1, p2)

    // Sample along segment
    for (let t = 0; t <= 1.0; t += 0.1) {
      const pt = segment.getPoint(t)
      const dist = ray.distanceToPoint(pt)
      if (dist < minDistance) {
        minDistance = dist
        closestEdge = edge
      }
    }
  }

  return closestEdge
}

/**
 * Traverses a topological edge loop starting from an edge.
 * Traverses through vertex junctions with valence 4 (continuing straight through).
 */
export function getEdgeLoop(mesh: MeshObject, startEdgeId: string): string[] {
  const edges = getMeshEdges(mesh)
  const edgeMap = new Map<string, Edge>()
  const vertToEdges = new Map<string, string[]>()

  for (const e of edges) {
    edgeMap.set(e.id, e)
    if (!vertToEdges.has(e.v1)) vertToEdges.set(e.v1, [])
    if (!vertToEdges.has(e.v2)) vertToEdges.set(e.v2, [])
    vertToEdges.get(e.v1)!.push(e.id)
    vertToEdges.get(e.v2)!.push(e.id)
  }

  const startEdge = edgeMap.get(startEdgeId)
  if (!startEdge) return []

  const loop = new Set<string>([startEdgeId])

  // Helper to walk in one direction from a vertex along the loop
  const walk = (startV: string, fromEdgeId: string) => {
    let currentV = startV
    let prevEdge = edgeMap.get(fromEdgeId)

    while (currentV && prevEdge) {
      const connectedEdges = (vertToEdges.get(currentV) || []).filter(id => id !== prevEdge!.id)
      // Standard quad valence at intersection is 4 (3 other edges remaining)
      if (connectedEdges.length === 3) {
        // Find opposite edge across faces
        const otherV = prevEdge.v1 === currentV ? prevEdge.v2 : prevEdge.v1
        let bestEdge: string | null = null

        // Find edge that does not share a face with prevEdge
        for (const eId of connectedEdges) {
          const cand = edgeMap.get(eId)
          if (!cand) continue
          const candOtherV = cand.v1 === currentV ? cand.v2 : cand.v1
          // Check face sharing
          const sharesFace = mesh.faces.some(f => 
            f.vertexIds.includes(currentV) && f.vertexIds.includes(otherV) && f.vertexIds.includes(candOtherV)
          )
          if (!sharesFace) {
            bestEdge = eId
            break
          }
        }

        if (bestEdge && !loop.has(bestEdge)) {
          loop.add(bestEdge)
          const nextEdge = edgeMap.get(bestEdge)!
          currentV = nextEdge.v1 === currentV ? nextEdge.v2 : nextEdge.v1
          prevEdge = nextEdge
        } else {
          break
        }
      } else if (connectedEdges.length === 1 && !loop.has(connectedEdges[0])) {
        // Boundary or line edge
        const nextId = connectedEdges[0]
        loop.add(nextId)
        const nextEdge = edgeMap.get(nextId)!
        currentV = nextEdge.v1 === currentV ? nextEdge.v2 : nextEdge.v1
        prevEdge = nextEdge
      } else {
        break
      }
    }
  }

  walk(startEdge.v1, startEdgeId)
  walk(startEdge.v2, startEdgeId)

  return Array.from(loop)
}

/**
 * Traverses a parallel topological edge ring starting from an edge across quad faces.
 */
export function getEdgeRing(mesh: MeshObject, startEdgeId: string): string[] {
  const edges = getMeshEdges(mesh)
  const edgeMap = new Map<string, Edge>()
  for (const e of edges) {
    edgeMap.set(e.id, e)
  }

  const startEdge = edgeMap.get(startEdgeId)
  if (!startEdge) return []

  const ring = new Set<string>([startEdgeId])

  // Find faces sharing this edge
  const getFacesForEdge = (e: Edge) => {
    return mesh.faces.filter(f => f.vertexIds.includes(e.v1) && f.vertexIds.includes(e.v2))
  }

  // Helper to walk across faces
  const walkFace = (face: any, fromEdge: Edge) => {
    if (face.vertexIds.length !== 4) return // Quad only
    const vIds = face.vertexIds
    const idx1 = vIds.indexOf(fromEdge.v1)
    const idx2 = vIds.indexOf(fromEdge.v2)
    if (idx1 === -1 || idx2 === -1) return

    // Opposite edge in a quad is the edge not sharing vertices with fromEdge
    const oppositeVerts = vIds.filter((id: string) => id !== fromEdge.v1 && id !== fromEdge.v2)
    if (oppositeVerts.length !== 2) return

    const key1 = `${oppositeVerts[0]}_${oppositeVerts[1]}`
    const key2 = `${oppositeVerts[1]}_${oppositeVerts[0]}`
    const oppEdge = edgeMap.get(key1) || edgeMap.get(key2)

    if (oppEdge && !ring.has(oppEdge.id)) {
      ring.add(oppEdge.id)
      const nextFaces = getFacesForEdge(oppEdge).filter(f => f.id !== face.id)
      for (const nf of nextFaces) {
        walkFace(nf, oppEdge)
      }
    }
  }

  const initialFaces = getFacesForEdge(startEdge)
  for (const f of initialFaces) {
    walkFace(f, startEdge)
  }

  return Array.from(ring)
}

