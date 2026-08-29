import { MeshObject } from '../../types/mesh'

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Creates a parametric low-poly Cube mesh with UV mappings mapped across 
 * the 4 quadrants of the texture atlas:
 * - Front & Back: Weathered Wood (0.5..1.0, 0.5..1.0)
 * - Left & Right: Dungeon Stone (0.0..0.5, 0.5..1.0)
 * - Top: Sci-Fi Tech Core (0.5..1.0, 0.0..0.5)
 * - Bottom: Hazard Metal Plate (0.0..0.5, 0.0..0.5)
 */
export function createCube(name = 'Cube', size = 2): MeshObject {
  const h = size / 2
  const id = genId('mesh_cube')

  const v0 = { id: genId('v'), position: { x: -h, y: -h, z:  h }, color: '#ffffff' }
  const v1 = { id: genId('v'), position: { x:  h, y: -h, z:  h }, color: '#ffffff' }
  const v2 = { id: genId('v'), position: { x:  h, y:  h, z:  h }, color: '#ffffff' }
  const v3 = { id: genId('v'), position: { x: -h, y:  h, z:  h }, color: '#ffffff' }
  const v4 = { id: genId('v'), position: { x:  h, y: -h, z: -h }, color: '#ffffff' }
  const v5 = { id: genId('v'), position: { x: -h, y: -h, z: -h }, color: '#ffffff' }
  const v6 = { id: genId('v'), position: { x: -h, y:  h, z: -h }, color: '#ffffff' }
  const v7 = { id: genId('v'), position: { x:  h, y:  h, z: -h }, color: '#ffffff' }

  return {
    id,
    name,
    visible: true,
    locked: false,
    materialId: 'default_material',
    position: { x: 0, y: h, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    vertices: [v0, v1, v2, v3, v4, v5, v6, v7],
    faces: [
      // Front (Wood Crate: 0.5..1.0, 0.5..1.0)
      {
        id: genId('f'),
        vertexIds: [v0.id, v1.id, v2.id, v3.id],
        uvs: [{ u: 0.5, v: 0.5 }, { u: 1.0, v: 0.5 }, { u: 1.0, v: 1.0 }, { u: 0.5, v: 1.0 }],
        materialIndex: 0
      },
      // Back (Wood Crate: 0.5..1.0, 0.5..1.0)
      {
        id: genId('f'),
        vertexIds: [v4.id, v5.id, v6.id, v7.id],
        uvs: [{ u: 0.5, v: 0.5 }, { u: 1.0, v: 0.5 }, { u: 1.0, v: 1.0 }, { u: 0.5, v: 1.0 }],
        materialIndex: 0
      },
      // Top (Sci-Fi Neon: 0.5..1.0, 0.0..0.5)
      {
        id: genId('f'),
        vertexIds: [v3.id, v2.id, v7.id, v6.id],
        uvs: [{ u: 0.5, v: 0.0 }, { u: 1.0, v: 0.0 }, { u: 1.0, v: 0.5 }, { u: 0.5, v: 0.5 }],
        materialIndex: 0
      },
      // Bottom (Hazard Metal: 0.0..0.5, 0.0..0.5)
      {
        id: genId('f'),
        vertexIds: [v5.id, v4.id, v1.id, v0.id],
        uvs: [{ u: 0.0, v: 0.0 }, { u: 0.5, v: 0.0 }, { u: 0.5, v: 0.5 }, { u: 0.0, v: 0.5 }],
        materialIndex: 0
      },
      // Right (Stone Brick: 0.0..0.5, 0.5..1.0)
      {
        id: genId('f'),
        vertexIds: [v1.id, v4.id, v7.id, v2.id],
        uvs: [{ u: 0.0, v: 0.5 }, { u: 0.5, v: 0.5 }, { u: 0.5, v: 1.0 }, { u: 0.0, v: 1.0 }],
        materialIndex: 0
      },
      // Left (Stone Brick: 0.0..0.5, 0.5..1.0)
      {
        id: genId('f'),
        vertexIds: [v5.id, v0.id, v3.id, v6.id],
        uvs: [{ u: 0.0, v: 0.5 }, { u: 0.5, v: 0.5 }, { u: 0.5, v: 1.0 }, { u: 0.0, v: 1.0 }],
        materialIndex: 0
      }
    ]
  }
}

export function createPlane(name = 'Plane', size = 2): MeshObject {
  const h = size / 2
  const id = genId('mesh_plane')
  const v0 = { id: genId('v'), position: { x: -h, y: 0, z:  h }, color: '#ffffff' }
  const v1 = { id: genId('v'), position: { x:  h, y: 0, z:  h }, color: '#ffffff' }
  const v2 = { id: genId('v'), position: { x:  h, y: 0, z: -h }, color: '#ffffff' }
  const v3 = { id: genId('v'), position: { x: -h, y: 0, z: -h }, color: '#ffffff' }

  return {
    id,
    name,
    visible: true,
    locked: false,
    materialId: 'default_material',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    vertices: [v0, v1, v2, v3],
    faces: [
      {
        id: genId('f'),
        vertexIds: [v0.id, v1.id, v2.id, v3.id],
        uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }],
        materialIndex: 0
      }
    ]
  }
}

export function createCylinder(name = 'Cylinder', radius = 1, height = 2, segments = 8): MeshObject {
  const id = genId('mesh_cyl')
  const vertices = []
  const faces = []
  const halfH = height / 2

  const topCenter = { id: genId('v'), position: { x: 0, y: halfH, z: 0 }, color: '#ffffff' }
  const bottomCenter = { id: genId('v'), position: { x: 0, y: -halfH, z: 0 }, color: '#ffffff' }
  vertices.push(topCenter, bottomCenter)

  const topRing = []
  const bottomRing = []

  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius

    const vTop = { id: genId('v'), position: { x, y: halfH, z }, color: '#ffffff' }
    const vBottom = { id: genId('v'), position: { x, y: -halfH, z }, color: '#ffffff' }
    vertices.push(vTop, vBottom)
    topRing.push(vTop)
    bottomRing.push(vBottom)
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments
    const u0 = i / segments
    const u1 = (i + 1) / segments

    faces.push({
      id: genId('f'),
      vertexIds: [bottomRing[i].id, bottomRing[next].id, topRing[next].id, topRing[i].id],
      uvs: [{ u: u0, v: 0 }, { u: u1, v: 0 }, { u: u1, v: 1 }, { u: u0, v: 1 }],
      materialIndex: 0
    })

    faces.push({
      id: genId('f'),
      vertexIds: [topCenter.id, topRing[i].id, topRing[next].id],
      uvs: [{ u: 0.5, v: 0.5 }, { u: 0.5 + 0.5 * Math.cos((i / segments) * Math.PI * 2), v: 0.5 + 0.5 * Math.sin((i / segments) * Math.PI * 2) }, { u: 0.5 + 0.5 * Math.cos((next / segments) * Math.PI * 2), v: 0.5 + 0.5 * Math.sin((next / segments) * Math.PI * 2) }],
      materialIndex: 0
    })

    faces.push({
      id: genId('f'),
      vertexIds: [bottomCenter.id, bottomRing[next].id, bottomRing[i].id],
      uvs: [{ u: 0.5, v: 0.5 }, { u: 0.5 + 0.5 * Math.cos((next / segments) * Math.PI * 2), v: 0.5 + 0.5 * Math.sin((next / segments) * Math.PI * 2) }, { u: 0.5 + 0.5 * Math.cos((next / segments) * Math.PI * 2), v: 0.5 + 0.5 * Math.sin((next / segments) * Math.PI * 2) }],
      materialIndex: 0
    })
  }

  return {
    id,
    name,
    visible: true,
    locked: false,
    materialId: 'default_material',
    position: { x: 0, y: halfH, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    vertices,
    faces
  }
}

export function createCone(name = 'Cone', radius = 1, height = 2, segments = 8): MeshObject {
  const id = genId('mesh_cone')
  const vertices = []
  const faces = []
  const halfH = height / 2

  const tip = { id: genId('v'), position: { x: 0, y: halfH, z: 0 }, color: '#ffffff' }
  const bottomCenter = { id: genId('v'), position: { x: 0, y: -halfH, z: 0 }, color: '#ffffff' }
  vertices.push(tip, bottomCenter)

  const bottomRing = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    const v = { id: genId('v'), position: { x, y: -halfH, z }, color: '#ffffff' }
    vertices.push(v)
    bottomRing.push(v)
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments
    faces.push({
      id: genId('f'),
      vertexIds: [tip.id, bottomRing[i].id, bottomRing[next].id],
      uvs: [{ u: 0.5, v: 1 }, { u: i / segments, v: 0 }, { u: (i + 1) / segments, v: 0 }],
      materialIndex: 0
    })
    faces.push({
      id: genId('f'),
      vertexIds: [bottomCenter.id, bottomRing[next].id, bottomRing[i].id],
      uvs: [{ u: 0.5, v: 0.5 }, { u: 0.5 + 0.5 * Math.cos((next / segments) * Math.PI * 2), v: 0.5 + 0.5 * Math.sin((next / segments) * Math.PI * 2) }, { u: 0.5 + 0.5 * Math.cos((next / segments) * Math.PI * 2), v: 0.5 + 0.5 * Math.sin((next / segments) * Math.PI * 2) }],
      materialIndex: 0
    })
  }

  return {
    id,
    name,
    visible: true,
    locked: false,
    materialId: 'default_material',
    position: { x: 0, y: halfH, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    vertices,
    faces
  }
}

export function createSphere(name = 'Sphere', radius = 1, rings = 6, segments = 8): MeshObject {
  const id = genId('mesh_sphere')
  const vertices = []
  const faces = []

  const topPole = { id: genId('v'), position: { x: 0, y: radius, z: 0 }, color: '#ffffff' }
  const botPole = { id: genId('v'), position: { x: 0, y: -radius, z: 0 }, color: '#ffffff' }
  vertices.push(topPole, botPole)

  const ringVerts: any[][] = []

  for (let r = 1; r < rings; r++) {
    const phi = (r / rings) * Math.PI
    const y = Math.cos(phi) * radius
    const ringRadius = Math.sin(phi) * radius
    const currentRing = []

    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2
      const x = Math.cos(theta) * ringRadius
      const z = Math.sin(theta) * ringRadius
      const v = { id: genId('v'), position: { x, y, z }, color: '#ffffff' }
      vertices.push(v)
      currentRing.push(v)
    }
    ringVerts.push(currentRing)
  }

  // Top Cap Triangles
  for (let s = 0; s < segments; s++) {
    const next = (s + 1) % segments
    faces.push({
      id: genId('f'),
      vertexIds: [topPole.id, ringVerts[0][s].id, ringVerts[0][next].id],
      uvs: [{ u: 0.5, v: 1 }, { u: s / segments, v: 1 - 1 / rings }, { u: (s + 1) / segments, v: 1 - 1 / rings }],
      materialIndex: 0
    })
  }

  // Middle Quads
  for (let r = 0; r < rings - 2; r++) {
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments
      const v0 = ringVerts[r][s].id
      const v1 = ringVerts[r][next].id
      const v2 = ringVerts[r + 1][next].id
      const v3 = ringVerts[r + 1][s].id
      const u0 = s / segments
      const u1 = (s + 1) / segments
      const vTop = 1 - (r + 1) / rings
      const vBot = 1 - (r + 2) / rings

      faces.push({
        id: genId('f'),
        vertexIds: [v0, v1, v2, v3],
        uvs: [{ u: u0, v: vTop }, { u: u1, v: vTop }, { u: u1, v: vBot }, { u: u0, v: vBot }],
        materialIndex: 0
      })
    }
  }

  // Bottom Cap Triangles
  const lastRing = ringVerts[rings - 2]
  for (let s = 0; s < segments; s++) {
    const next = (s + 1) % segments
    faces.push({
      id: genId('f'),
      vertexIds: [botPole.id, lastRing[next].id, lastRing[s].id],
      uvs: [{ u: 0.5, v: 0 }, { u: (s + 1) / segments, v: 1 / rings }, { u: s / segments, v: 1 / rings }],
      materialIndex: 0
    })
  }

  return {
    id,
    name,
    visible: true,
    locked: false,
    materialId: 'default_material',
    position: { x: 0, y: radius, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    vertices,
    faces
  }
}
