import { MeshObject } from '../../types/mesh'

export function exportToOBJ(meshes: MeshObject[], mtlName = 'model.mtl'): string {
  let output = `# PSXModeller Low-Poly 3D OBJ Export\n`
  output += `mtllib ${mtlName}\n\n`

  let vOffset = 1
  let vtOffset = 1
  let vnOffset = 1

  for (const mesh of meshes) {
    if (!mesh.visible) continue
    output += `o ${mesh.name.replace(/\s+/g, '_')}\n`
    output += `usemtl ${mesh.materialId}\n`

    // Vertices
    for (const v of mesh.vertices) {
      output += `v ${v.position.x.toFixed(4)} ${v.position.y.toFixed(4)} ${v.position.z.toFixed(4)}\n`
    }

    // Vertex Normals
    for (const f of mesh.faces) {
      if (f.normal) {
        output += `vn ${f.normal.x.toFixed(4)} ${f.normal.y.toFixed(4)} ${f.normal.z.toFixed(4)}\n`
      } else {
        output += `vn 0.0000 1.0000 0.0000\n`
      }
    }

    // UVs
    for (const f of mesh.faces) {
      for (const uv of f.uvs) {
        output += `vt ${uv.u.toFixed(4)} ${uv.v.toFixed(4)}\n`
      }
    }

    // Faces (f v1/vt1/vn1 v2/vt2/vn2 ...)
    let uvCounter = vtOffset
    let normCounter = vnOffset

    for (const f of mesh.faces) {
      output += `f`
      for (let i = 0; i < f.vertexIds.length; i++) {
        const localVIdx = mesh.vertices.findIndex(v => v.id === f.vertexIds[i])
        const globalVIdx = vOffset + localVIdx
        const globalVtIdx = uvCounter + i
        const globalVnIdx = normCounter

        output += ` ${globalVIdx}/${globalVtIdx}/${globalVnIdx}`
      }
      output += `\n`
      uvCounter += f.uvs.length
      normCounter++
    }

    vOffset += mesh.vertices.length
    vtOffset += mesh.faces.reduce((acc, f) => acc + f.uvs.length, 0)
    vnOffset += mesh.faces.length
    output += `\n`
  }

  return output
}

export function exportToMTL(materialId: string, textureFileName = 'texture.png'): string {
  return `# PSXModeller Material Export
newmtl ${materialId}
Ka 1.000 1.000 1.000
Kd 1.000 1.000 1.000
Ks 0.000 0.000 0.000
d 1.0
illum 1
map_Kd ${textureFileName}
`
}
