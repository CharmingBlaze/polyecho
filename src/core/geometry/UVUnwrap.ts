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
 * Advanced Disconnected UV Island Segmentation & 2D Shelf Packing
 * Packs all UV islands inside [0..1] with customizable pixel padding.
 */
export function packUVIslands(mesh: MeshObject, marginPixels = 2, textureSize = 64): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  if (newMesh.faces.length === 0) return newMesh

  const margin = Math.max(0.001, marginPixels / textureSize)

  // 1. Group faces into connected 2D UV islands
  const faceCount = newMesh.faces.length
  const faceVisited = new Array(faceCount).fill(false)
  const islands: number[][] = []

  // Helper to check if two faces share a UV edge
  function shareUvEdge(fAIdx: number, fBIdx: number): boolean {
    const fA = newMesh.faces[fAIdx]
    const fB = newMesh.faces[fBIdx]
    if (!fA.uvs || !fB.uvs) return false

    let shared = 0
    for (const uvA of fA.uvs) {
      for (const uvB of fB.uvs) {
        if (Math.abs(uvA.u - uvB.u) < 0.002 && Math.abs(uvA.v - uvB.v) < 0.002) {
          shared++
          break
        }
      }
    }
    return shared >= 2
  }

  for (let i = 0; i < faceCount; i++) {
    if (faceVisited[i]) continue
    const island: number[] = [i]
    faceVisited[i] = true
    const queue = [i]

    while (queue.length > 0) {
      const curr = queue.shift()!
      for (let j = 0; j < faceCount; j++) {
        if (!faceVisited[j] && shareUvEdge(curr, j)) {
          faceVisited[j] = true
          island.push(j)
          queue.push(j)
        }
      }
    }
    islands.push(island)
  }

  // 2. Measure Island Bounding Boxes
  interface IslandBox {
    indices: number[]
    minU: number
    maxU: number
    minV: number
    maxV: number
    w: number
    h: number
  }

  const boxes: IslandBox[] = islands.map(island => {
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const fIdx of island) {
      for (const uv of newMesh.faces[fIdx].uvs) {
        if (uv.u < minU) minU = uv.u
        if (uv.u > maxU) maxU = uv.u
        if (uv.v < minV) minV = uv.v
        if (uv.v > maxV) maxV = uv.v
      }
    }
    return {
      indices: island,
      minU,
      maxU,
      minV,
      maxV,
      w: Math.max(0.001, maxU - minU),
      h: Math.max(0.001, maxV - minV)
    }
  })

  // Sort islands descending by height
  boxes.sort((a, b) => b.h - a.h)

  // 3. 2D Shelf Bin Packing
  let shelfX = margin
  let shelfY = margin
  let shelfHeight = 0
  let totalScale = 1.0

  // Calculate required area to estimate downscaling if needed
  let totalIslandArea = 0
  for (const b of boxes) {
    totalIslandArea += (b.w + margin * 2) * (b.h + margin * 2)
  }

  if (totalIslandArea > 0.85) {
    totalScale = Math.min(1.0, Math.sqrt(0.85 / totalIslandArea))
  }

  for (const b of boxes) {
    const bw = b.w * totalScale
    const bh = b.h * totalScale

    // If rectangle exceeds shelf width, start new shelf
    if (shelfX + bw + margin > 1.0) {
      shelfX = margin
      shelfY += shelfHeight + margin
      shelfHeight = 0
    }

    // If exceeds vertical space, apply uniform compression
    const targetU0 = shelfX
    const targetV0 = 1.0 - (shelfY + bh)

    for (const fIdx of b.indices) {
      for (const uv of newMesh.faces[fIdx].uvs) {
        const normU = (uv.u - b.minU) / b.w
        const normV = (uv.v - b.minV) / b.h
        uv.u = Math.max(0, Math.min(1, targetU0 + normU * bw))
        uv.v = Math.max(0, Math.min(1, targetV0 + normV * bh))
      }
    }

    shelfX += bw + margin
    shelfHeight = Math.max(shelfHeight, bh)
  }

  return newMesh
}

/**
 * Gridify / Straighten Quad UV Islands into an orthogonal grid.
 */
export function gridifyQuadIslands(mesh: MeshObject, targetFaceIndices?: number[]): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const facesToProcess = targetFaceIndices && targetFaceIndices.length > 0 
    ? targetFaceIndices 
    : newMesh.faces.map((_, i) => i)

  for (const fIdx of facesToProcess) {
    const face = newMesh.faces[fIdx]
    if (!face || face.uvs.length !== 4) continue // Only quads

    // Bounding box of quad
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const uv of face.uvs) {
      if (uv.u < minU) minU = uv.u
      if (uv.u > maxU) maxU = uv.u
      if (uv.v < minV) minV = uv.v
      if (uv.v > maxV) maxV = uv.v
    }

    // Straighten 4 corners
    face.uvs = [
      { u: minU, v: maxV },
      { u: maxU, v: maxV },
      { u: maxU, v: minV },
      { u: minU, v: minV }
    ]
  }

  return newMesh
}

/**
 * Equalize Texel Density across all UV islands to ensure uniform pixels/meter.
 */
export function equalizeTexelDensity(mesh: MeshObject): MeshObject {
  const newMesh: MeshObject = JSON.parse(JSON.stringify(mesh))
  const vertMap = new Map<string, Vertex>()
  for (const v of newMesh.vertices) {
    vertMap.set(v.id, v)
  }

  // Calculate 3D area vs 2D UV area
  let totalWorldArea = 0
  let totalUvArea = 0

  interface FaceMetrics {
    face: any
    worldArea: number
    uvArea: number
  }

  const metrics: FaceMetrics[] = []

  for (const face of newMesh.faces) {
    if (face.uvs.length < 3) continue
    const verts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (verts.length < 3) continue

    // 3D Triangle Area (cross product)
    const p0 = verts[0].position, p1 = verts[1].position, p2 = verts[2].position
    const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
    const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z }
    const crossX = e1.y * e2.z - e1.z * e2.y
    const crossY = e1.z * e2.x - e1.x * e2.z
    const crossZ = e1.x * e2.y - e1.y * e2.x
    const wArea = 0.5 * Math.hypot(crossX, crossY, crossZ)

    // 2D UV Area
    const u0 = face.uvs[0], u1 = face.uvs[1], u2 = face.uvs[2]
    const uvArea = 0.5 * Math.abs((u1.u - u0.u) * (u2.v - u0.v) - (u2.u - u0.u) * (u1.v - u0.v))

    totalWorldArea += wArea
    totalUvArea += uvArea
    metrics.push({ face, worldArea: wArea, uvArea })
  }

  if (totalWorldArea === 0 || totalUvArea === 0) return newMesh

  const avgRatio = totalUvArea / totalWorldArea

  for (const m of metrics) {
    if (m.worldArea === 0 || m.uvArea === 0) continue
    const targetUvArea = m.worldArea * avgRatio
    const scale = Math.sqrt(targetUvArea / m.uvArea)

    // Center of face UVs
    let cU = 0, cV = 0
    for (const uv of m.face.uvs) {
      cU += uv.u; cV += uv.v
    }
    cU /= m.face.uvs.length
    cV /= m.face.uvs.length

    for (const uv of m.face.uvs) {
      uv.u = cU + (uv.u - cU) * Math.max(0.1, Math.min(3.0, scale))
      uv.v = cV + (uv.v - cV) * Math.max(0.1, Math.min(3.0, scale))
    }
  }

  return newMesh
}

/**
 * Calculate UV Stretch & Distortion heatmap per face.
 * Returns map of face ID -> { ratio, color }
 */
export function calculateUVDistortion(mesh: MeshObject): Map<string, { ratio: number; color: string }> {
  const result = new Map<string, { ratio: number; color: string }>()
  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) vertMap.set(v.id, v)

  let totalWorldArea = 0
  let totalUvArea = 0
  const faceData: { id: string; wArea: number; uvArea: number }[] = []

  for (const face of mesh.faces) {
    if (face.uvs.length < 3) continue
    const verts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
    if (verts.length < 3) continue

    const p0 = verts[0].position, p1 = verts[1].position, p2 = verts[2].position
    const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
    const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z }
    const wArea = 0.5 * Math.hypot(
      e1.y * e2.z - e1.z * e2.y,
      e1.z * e2.x - e1.x * e2.z,
      e1.x * e2.y - e1.y * e2.x
    )

    const u0 = face.uvs[0], u1 = face.uvs[1], u2 = face.uvs[2]
    const uvArea = 0.5 * Math.abs((u1.u - u0.u) * (u2.v - u0.v) - (u2.u - u0.u) * (u1.v - u0.v))

    totalWorldArea += wArea
    totalUvArea += uvArea
    faceData.push({ id: face.id, wArea, uvArea })
  }

  const meanDensity = totalWorldArea > 0 ? totalUvArea / totalWorldArea : 1.0

  for (const f of faceData) {
    const faceDensity = f.wArea > 0 ? f.uvArea / f.wArea : 1.0
    const ratio = meanDensity > 0 ? faceDensity / meanDensity : 1.0

    let color = 'rgba(34, 197, 94, 0.45)' // Optimal Green (1.0)
    if (ratio < 0.6) {
      color = 'rgba(59, 130, 246, 0.55)' // Compressed Blue (< 0.6)
    } else if (ratio > 1.5) {
      color = 'rgba(239, 68, 68, 0.55)' // Stretched Red (> 1.5)
    } else if (ratio > 1.2) {
      color = 'rgba(245, 158, 11, 0.45)' // Slight stretch Amber
    } else if (ratio < 0.8) {
      color = 'rgba(6, 182, 212, 0.45)' // Slight compression Cyan
    }

    result.set(f.id, { ratio, color })
  }

  return result
}

/**
 * Generate high-contrast numbered calibration UV test grid (A1..H8).
 */
export function generateUVCheckerboardDataURL(size = 512): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const cells = 8
  const cellSize = size / cells
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const isEven = (r + c) % 2 === 0
      ctx.fillStyle = isEven ? '#334155' : '#1e293b'
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize)

      // Inner border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.lineWidth = 1
      ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize)

      // Label (e.g. A1, D4)
      ctx.fillStyle = isEven ? '#94a3b8' : '#cbd5e1'
      ctx.font = `bold ${Math.round(cellSize * 0.28)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${cols[c]}${8 - r}`, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2)
    }
  }

  // Draw 2x2 colored quadrants divider
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(size / 2, 0)
  ctx.lineTo(size / 2, size)
  ctx.moveTo(0, size / 2)
  ctx.lineTo(size, size / 2)
  ctx.stroke()

  return canvas.toDataURL('image/png')
}

export function autoPackIslands(mesh: MeshObject, margin = 0.02): MeshObject {
  return packUVIslands(mesh, Math.round(margin * 64), 64)
}

/**
 * Validates and ensures complete, valid UV coordinates for all face vertices on any 3D object.
 */
export function ensureMeshUVs(mesh: MeshObject): boolean {
  if (!mesh || !mesh.faces || !mesh.vertices) return false
  let changed = false
  const vertMap = new Map<string, Vertex>()
  for (const v of mesh.vertices) {
    vertMap.set(v.id, v)
  }

  for (const face of mesh.faces) {
    if (!face.uvs || face.uvs.length !== face.vertexIds.length || face.uvs.some(uv => !uv || !Number.isFinite(uv.u) || !Number.isFinite(uv.v))) {
      changed = true
      const faceVerts = face.vertexIds.map(id => vertMap.get(id)!).filter(Boolean)
      const normal = face.normal || computeFaceNormal(faceVerts.map(v => v.position))
      const absX = Math.abs(normal.x)
      const absY = Math.abs(normal.y)
      const absZ = Math.abs(normal.z)

      face.uvs = faceVerts.map(v => {
        if (absX >= absY && absX >= absZ) {
          const sign = normal.x >= 0 ? 1 : -1
          return { u: (v.position.z * sign + 1.0) / 2.0, v: (v.position.y + 1.0) / 2.0 }
        } else if (absY >= absX && absY >= absZ) {
          const sign = normal.y >= 0 ? 1 : -1
          return { u: (v.position.x + 1.0) / 2.0, v: (v.position.z * sign + 1.0) / 2.0 }
        } else {
          const sign = normal.z >= 0 ? 1 : -1
          return { u: (v.position.x * sign + 1.0) / 2.0, v: (v.position.y + 1.0) / 2.0 }
        }
      })

      if (face.uvs.length < face.vertexIds.length) {
        face.uvs = face.vertexIds.map((_, i) => {
          if (face.vertexIds.length === 3) {
            return i === 0 ? { u: 0.5, v: 1 } : (i === 1 ? { u: 0, v: 0 } : { u: 1, v: 0 })
          }
          if (face.vertexIds.length === 4) {
            return i === 0 ? { u: 0, v: 0 } : (i === 1 ? { u: 1, v: 0 } : (i === 2 ? { u: 1, v: 1 } : { u: 0, v: 1 }))
          }
          const ang = (i / face.vertexIds.length) * Math.PI * 2
          return { u: 0.5 + 0.5 * Math.cos(ang), v: 0.5 + 0.5 * Math.sin(ang) }
        })
      }
    }
  }
  return changed
}
