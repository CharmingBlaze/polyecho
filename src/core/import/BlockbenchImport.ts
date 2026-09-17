import type { MeshObject, Vertex, Face } from '../../types/mesh'

export interface BlockbenchImportResult {
  projectName: string
  meshes: MeshObject[]
  textures: Array<{ name: string; dataUrl: string; width: number; height: number }>
}

const UNIT = 1 / 16

function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function boxFromCorners(from: number[], to: number[]): { vertices: Vertex[]; faces: Face[] } {
  const x0 = (from[0] ?? 0) * UNIT
  const y0 = (from[1] ?? 0) * UNIT
  const z0 = (from[2] ?? 0) * UNIT
  const x1 = (to[0] ?? 0) * UNIT
  const y1 = (to[1] ?? 0) * UNIT
  const z1 = (to[2] ?? 0) * UNIT
  const ids = Array.from({ length: 8 }, () => genId('v'))
  const p = [
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]
  ]
  const vertices: Vertex[] = p.map((pt, i) => ({
    id: ids[i],
    position: { x: pt[0], y: pt[1], z: pt[2] }
  }))
  const quad = (a: number, b: number, c: number, d: number, i: number): Face => ({
    id: genId('f'),
    vertexIds: [ids[a], ids[b], ids[c], ids[d]],
    uvs: [{ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 1, v: 1 }, { u: 0, v: 1 }],
    materialIndex: i
  })
  const faces = [
    quad(0, 1, 2, 3, 0),
    quad(4, 5, 6, 7, 0),
    quad(3, 2, 7, 6, 0),
    quad(5, 4, 1, 0, 0),
    quad(1, 4, 7, 2, 0),
    quad(5, 0, 3, 6, 0)
  ]
  return { vertices, faces }
}

export function importBlockbench(jsonString: string): BlockbenchImportResult {
  const data = JSON.parse(jsonString) as {
    name?: string
    resolution?: { width?: number; height?: number }
    elements?: Array<{
      name?: string
      from?: number[]
      to?: number[]
      origin?: number[]
      rotation?: number[]
      visibility?: boolean
      locked?: boolean
      uuid?: string
    }>
    textures?: Array<{ name?: string; source?: string }>
  }
  const width = data.resolution?.width || 64
  const height = data.resolution?.height || 64
  const textures = (data.textures || []).map((t, idx) => ({
    name: t.name || `Texture_${idx}`,
    dataUrl: t.source || '',
    width,
    height
  }))

  const meshes: MeshObject[] = (data.elements || []).map((el, index) => {
    const origin = el.origin || [0, 0, 0]
    const rot = el.rotation || [0, 0, 0]
    const { vertices, faces } = boxFromCorners(el.from || [-8, 0, -8], el.to || [8, 16, 8])
    const ox = origin[0] * UNIT
    const oy = origin[1] * UNIT
    const oz = origin[2] * UNIT
    // `from`/`to` are in model space; `origin` is the rotation pivot, stored as MeshObject TRS.
    for (const v of vertices) {
      v.position.x -= ox
      v.position.y -= oy
      v.position.z -= oz
    }
    return {
      id: el.uuid || genId('mesh_bb'),
      name: el.name || `Cube_${index + 1}`,
      visible: el.visibility !== false,
      locked: Boolean(el.locked),
      position: { x: ox, y: oy, z: oz },
      rotation: { x: rot[0] || 0, y: rot[1] || 0, z: rot[2] || 0 },
      scale: { x: 1, y: 1, z: 1 },
      materialId: 'default_material',
      shadeMode: 'flat',
      vertices,
      faces
    }
  })

  return {
    projectName: data.name || 'Blockbench_Model',
    meshes,
    textures
  }
}
