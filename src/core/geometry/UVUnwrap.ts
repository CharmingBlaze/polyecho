import { MeshObject, UV, Vertex } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'

/**
 * Box unwrap along dominant normal axes (X, Y, Z) with auto-normalization.
 */
export function boxUnwrap(mesh: MeshObject): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of newMesh.faces) {
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
    const absX = Math.abs(normal.x)
    const absY = Math.abs(normal.y)
    const absZ = Math.abs(normal.z)

    const uvs: UV[] = []

    if (absX >= absY && absX >= absZ) {
      // Dominant X: map Z -> U, Y -> V
      const sign = normal.x >= 0 ? 1 : -1
      for (const v of faceVerts) {
        uvs.push({
          u: (v.position.z * sign + 1.0) / 2.0,
          v: (v.position.y + 1.0) / 2.0
        })
      }
    } else if (absY >= absX && absY >= absZ) {
      // Dominant Y: map X -> U, Z -> V
      const sign = normal.y >= 0 ? 1 : -1
      for (const v of faceVerts) {
        uvs.push({
          u: (v.position.x + 1.0) / 2.0,
          v: (v.position.z * sign + 1.0) / 2.0
        })
      }
    } else {
      // Dominant Z: map X -> U, Y -> V
      const sign = normal.z >= 0 ? 1 : -1
      for (const v of faceVerts) {
        uvs.push({
          u: (v.position.x * sign + 1.0) / 2.0,
          v: (v.position.y + 1.0) / 2.0
        })
      }
    }

    face.uvs = uvs
  }

  return newMesh
}

/**
 * Planar unwrap along specific axis (X, Y, or Z).
 */
export function planarUnwrap(mesh: MeshObject, axis: 'x' | 'y' | 'z' = 'z'): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of newMesh.faces) {
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    const uvs: UV[] = []

    for (const v of faceVerts) {
      if (axis === 'x') {
        uvs.push({ u: (v.position.z + 1) / 2, v: (v.position.y + 1) / 2 })
      } else if (axis === 'y') {
        uvs.push({ u: (v.position.x + 1) / 2, v: (v.position.z + 1) / 2 })
      } else {
        uvs.push({ u: (v.position.x + 1) / 2, v: (v.position.y + 1) / 2 })
      }
    }
    face.uvs = uvs
  }

  return newMesh
}

/**
 * Cylindrical Unwrap: Unrolls radial side faces + maps top/bottom caps into discs.
 */
export function cylinderUnwrap(mesh: MeshObject): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of newMesh.faces) {
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))

    // Top / Bottom Disc Caps (dominant Y)
    if (Math.abs(normal.y) > 0.7) {
      const uvs: UV[] = faceVerts.map(v => ({
        u: (v.position.x + 1) * 0.25 + (normal.y > 0 ? 0.75 : 0.75),
        v: (v.position.z + 1) * 0.25 + (normal.y > 0 ? 0.5 : 0.0)
      }))
      face.uvs = uvs
    } else {
      // Tube side faces: unroll angle around Y into U (0..0.7) and height into V
      const uvs: UV[] = faceVerts.map(v => {
        let angle = Math.atan2(v.position.z, v.position.x) // -PI to PI
        let u = (angle + Math.PI) / (2 * Math.PI) // 0 to 1
        let vPos = (v.position.y + 1) / 2
        return { u: u * 0.7, v: vPos }
      })
      face.uvs = uvs
    }
  }

  return newMesh
}

/**
 * Spherical Equirectangular Unwrap: Maps longitude & latitude.
 */
export function sphereUnwrap(mesh: MeshObject): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of newMesh.faces) {
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const uvs: UV[] = faceVerts.map(v => {
      const len = Math.hypot(v.position.x, v.position.y, v.position.z) || 1
      const nx = v.position.x / len
      const ny = v.position.y / len
      const nz = v.position.z / len

      const u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI)
      const vCoord = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI
      return { u, v: 1 - vCoord }
    })
    face.uvs = uvs
  }

  return newMesh
}

/**
 * Conical Unwrap: Base cap at bottom + radial fan unwrap for sloping cone sides.
 */
export function coneUnwrap(mesh: MeshObject): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of newMesh.faces) {
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))

    if (normal.y < -0.7) {
      // Bottom Base Cap
      face.uvs = faceVerts.map(v => ({
        u: (v.position.x + 1) * 0.25 + 0.75,
        v: (v.position.z + 1) * 0.25 + 0.5
      }))
    } else {
      // Slope fan: distance from apex as V, angle around apex as U
      face.uvs = faceVerts.map(v => {
        let angle = Math.atan2(v.position.z, v.position.x)
        let u = (angle + Math.PI) / (2 * Math.PI)
        let vCoord = (v.position.y + 1) / 2
        return { u: u * 0.75, v: vCoord }
      })
    }
  }

  return newMesh
}

/**
 * Blockbench Cubemap Cross Unwrap: Unwraps 6 faces of a cube into standard cross layout.
 */
export function cubemapCrossUnwrap(mesh: MeshObject): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  // Cross 4x3 grid cells (w = 1/4, h = 1/3)
  const cellW = 0.25
  const cellH = 0.3333

  for (const face of newMesh.faces) {
    const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (faceVerts.length < 3) continue

    const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
    let col = 1, row = 1

    if (normal.y > 0.5) { col = 1; row = 0 }      // Top
    else if (normal.y < -0.5) { col = 1; row = 2 } // Bottom
    else if (normal.z > 0.5) { col = 1; row = 1 }  // Front
    else if (normal.x > 0.5) { col = 2; row = 1 }  // Right
    else if (normal.z < -0.5) { col = 3; row = 1 } // Back
    else if (normal.x < -0.5) { col = 0; row = 1 } // Left

    const baseU = col * cellW
    const baseV = 1.0 - (row + 1) * cellH

    // Map quad vertices clockwise
    const uvs: UV[] = [
      { u: baseU, v: baseV + cellH },
      { u: baseU + cellW, v: baseV + cellH },
      { u: baseU + cellW, v: baseV },
      { u: baseU, v: baseV }
    ]

    face.uvs = faceVerts.map((_, i) => uvs[i % 4] || { u: baseU, v: baseV })
  }

  return newMesh
}

/**
 * Auto-pack all UV face islands into non-overlapping grid with margin padding.
 */
export function autoPackIslands(mesh: MeshObject, margin = 0.02): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const faceCount = newMesh.faces.length
  if (faceCount === 0) return newMesh

  const cols = Math.ceil(Math.sqrt(faceCount))
  const rows = Math.ceil(faceCount / cols)

  const cellW = (1.0 - margin * (cols + 1)) / cols
  const cellH = (1.0 - margin * (rows + 1)) / rows

  newMesh.faces.forEach((face, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)

    const u0 = margin + col * (cellW + margin)
    const v0 = 1.0 - (margin + (row + 1) * (cellH + margin))

    face.uvs = [
      { u: u0, v: v0 + cellH },
      { u: u0 + cellW, v: v0 + cellH },
      { u: u0 + cellW, v: v0 },
      { u: u0, v: v0 }
    ].slice(0, face.vertexIds.length)
  })

  return newMesh
}
