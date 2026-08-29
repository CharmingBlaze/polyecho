import { MeshObject, Vertex, Face, MirrorModifier } from '../../types/mesh'

export function evaluateMirror(mesh: MeshObject): { vertices: Vertex[]; faces: Face[] } {
  if (!mesh.mirror || !mesh.mirror.enabled) {
    return { vertices: mesh.vertices, faces: mesh.faces }
  }

  const mod: MirrorModifier = mesh.mirror
  const hasAxis = mod.axisX || mod.axisY || mod.axisZ
  if (!hasAxis) {
    return { vertices: mesh.vertices, faces: mesh.faces }
  }

  const outVertices: Vertex[] = [...mesh.vertices.map(v => ({ ...v, position: { ...v.position } }))]
  const outFaces: Face[] = [...mesh.faces.map(f => ({ ...f, vertexIds: [...f.vertexIds], uvs: [...f.uvs] }))]

  // Generate mirror for each active axis
  const axes: Array<{ axis: 'x' | 'y' | 'z'; mult: { x: number; y: number; z: number } }> = []
  if (mod.axisX) axes.push({ axis: 'x', mult: { x: -1, y: 1, z: 1 } })
  if (mod.axisY) axes.push({ axis: 'y', mult: { x: 1, y: -1, z: 1 } })
  if (mod.axisZ) axes.push({ axis: 'z', mult: { x: 1, y: 1, z: -1 } })

  for (const { axis, mult } of axes) {
    const currentBaseVerts = [...outVertices]
    const currentBaseFaces = [...outFaces]

    const vertMap = new Map<string, string>() // originalId -> mirroredId

    for (const v of currentBaseVerts) {
      const coord = v.position[axis]

      // If merge is active and vertex is within mergeThreshold of mirror plane (0), snap and weld
      if (mod.merge && Math.abs(coord) <= mod.mergeThreshold) {
        v.position[axis] = 0
        vertMap.set(v.id, v.id)
      } else {
        const mirroredId = `mir_${axis}_${v.id}`
        const mirroredVert: Vertex = {
          id: mirroredId,
          position: {
            x: v.position.x * mult.x,
            y: v.position.y * mult.y,
            z: v.position.z * mult.z
          },
          normal: v.normal ? {
            x: v.normal.x * mult.x,
            y: v.normal.y * mult.y,
            z: v.normal.z * mult.z
          } : undefined,
          color: v.color,
          selected: false,
          boneWeights: v.boneWeights ? { ...v.boneWeights } : undefined
        }
        outVertices.push(mirroredVert)
        vertMap.set(v.id, mirroredId)
      }
    }

    for (const f of currentBaseFaces) {
      const mirroredVertexIds = f.vertexIds.map(vid => vertMap.get(vid) || vid)
      // Reverse vertex winding order for mirrored face so face normal points outward correctly
      mirroredVertexIds.reverse()

      const mirroredUVs = f.uvs.map(uv => ({
        u: mod.flipU ? 1 - uv.u : uv.u,
        v: mod.flipV ? 1 - uv.v : uv.v
      }))
      mirroredUVs.reverse()

      outFaces.push({
        id: `mir_${axis}_${f.id}`,
        vertexIds: mirroredVertexIds,
        uvs: mirroredUVs,
        materialIndex: f.materialIndex,
        selected: false
      })
    }
  }

  return { vertices: outVertices, faces: outFaces }
}

export function applyMirror(mesh: MeshObject): void {
  if (!mesh.mirror || !mesh.mirror.enabled) return

  const { vertices, faces } = evaluateMirror(mesh)
  mesh.vertices = vertices
  mesh.faces = faces
  mesh.mirror.enabled = false
}
