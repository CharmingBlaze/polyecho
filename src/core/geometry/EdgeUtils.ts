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
