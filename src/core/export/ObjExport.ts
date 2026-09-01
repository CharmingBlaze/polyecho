import * as THREE from 'three'
import { MeshObject } from '../../types/mesh'
import { evaluateModifiers } from '../geometry/Modifiers'

export function exportToOBJ(meshes: MeshObject[], mtlName = 'model.mtl'): string {
  let output = `# PolyEcho Low-Poly 3D OBJ Export\n`
  output += `mtllib ${mtlName}\n\n`

  let vOffset = 1
  let vtOffset = 1
  let vnOffset = 1

  for (const rawMesh of meshes) {
    if (!rawMesh.visible) continue

    const evaluated = evaluateModifiers(rawMesh)
    output += `o ${rawMesh.name.replace(/\s+/g, '_')}\n`
    output += `usemtl ${rawMesh.materialId}\n`

    // World transform matrix
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(rawMesh.rotation?.x || 0),
      THREE.MathUtils.degToRad(rawMesh.rotation?.y || 0),
      THREE.MathUtils.degToRad(rawMesh.rotation?.z || 0)
    )
    const quat = new THREE.Quaternion().setFromEuler(euler)
    const pos = new THREE.Vector3(rawMesh.position?.x || 0, rawMesh.position?.y || 0, rawMesh.position?.z || 0)
    const scale = new THREE.Vector3(rawMesh.scale?.x ?? 1, rawMesh.scale?.y ?? 1, rawMesh.scale?.z ?? 1)
    const matrix = new THREE.Matrix4().compose(pos, quat, scale)
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)

    // Vertices (with standard Blender RGB vertex colors if present)
    for (const v of evaluated.vertices) {
      const vPos = new THREE.Vector3(v.position.x, v.position.y, v.position.z).applyMatrix4(matrix)
      if (v.color) {
        const hex = v.color.replace('#', '')
        const r = (parseInt(hex.substring(0, 2), 16) || 255) / 255
        const g = (parseInt(hex.substring(2, 4), 16) || 255) / 255
        const b = (parseInt(hex.substring(4, 6), 16) || 255) / 255
        output += `v ${vPos.x.toFixed(4)} ${vPos.y.toFixed(4)} ${vPos.z.toFixed(4)} ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\n`
      } else {
        output += `v ${vPos.x.toFixed(4)} ${vPos.y.toFixed(4)} ${vPos.z.toFixed(4)}\n`
      }
    }

    // Vertex Normals
    for (const f of evaluated.faces) {
      if (f.normal) {
        const vNorm = new THREE.Vector3(f.normal.x, f.normal.y, f.normal.z).applyMatrix3(normalMatrix).normalize()
        output += `vn ${vNorm.x.toFixed(4)} ${vNorm.y.toFixed(4)} ${vNorm.z.toFixed(4)}\n`
      } else {
        output += `vn 0.0000 1.0000 0.0000\n`
      }
    }

    // UVs
    for (const f of evaluated.faces) {
      for (const uv of f.uvs) {
        output += `vt ${uv.u.toFixed(4)} ${uv.v.toFixed(4)}\n`
      }
    }

    // Faces (f v1/vt1/vn1 v2/vt2/vn2 ...)
    let uvCounter = vtOffset
    let normCounter = vnOffset

    for (const f of evaluated.faces) {
      output += `f`
      for (let i = 0; i < f.vertexIds.length; i++) {
        const localVIdx = evaluated.vertices.findIndex(v => v.id === f.vertexIds[i])
        const globalVIdx = vOffset + (localVIdx >= 0 ? localVIdx : 0)
        const globalVtIdx = uvCounter + i
        const globalVnIdx = normCounter

        output += ` ${globalVIdx}/${globalVtIdx}/${globalVnIdx}`
      }
      output += `\n`
      uvCounter += f.uvs.length
      normCounter++
    }

    vOffset += evaluated.vertices.length
    vtOffset += evaluated.faces.reduce((acc, f) => acc + f.uvs.length, 0)
    vnOffset += evaluated.faces.length
    output += `\n`
  }

  return output
}

export interface MtlMaterialDef {
  id: string
  name?: string
  color?: string
  textureFileName?: string
}

export function exportToMTL(materialIdOrList: string | MtlMaterialDef[], textureFileName = 'texture.png'): string {
  let output = `# PolyEcho Low-Poly Material Export\n\n`
  const list: MtlMaterialDef[] = Array.isArray(materialIdOrList)
    ? materialIdOrList
    : [{ id: materialIdOrList, textureFileName }]

  for (const mat of list) {
    output += `newmtl ${mat.id}\n`
    output += `Ka 1.000 1.000 1.000\n`
    const c = mat.color ? new THREE.Color(mat.color) : new THREE.Color(1, 1, 1)
    output += `Kd ${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}\n`
    output += `Ks 0.000 0.000 0.000\n`
    output += `d 1.0\n`
    output += `illum 1\n`
    if (mat.textureFileName) {
      output += `map_Kd ${mat.textureFileName}\n`
    }
    output += `\n`
  }
  return output
}
