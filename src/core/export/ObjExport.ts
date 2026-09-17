import * as THREE from 'three'
import { MeshObject } from '../../types/mesh'
import { computeFaceNormal } from '../../utils/math'
import { evaluateModifiers } from '../geometry/Modifiers'
import { meshCornerNormals, resolveMeshShadeMode } from '../geometry/Converters'
import { DEFAULT_AUTO_SMOOTH_ANGLE, formatObjShadeComment } from '../geometry/MeshShading'

export function exportToOBJ(meshes: MeshObject[], mtlName = 'model.mtl', materialNames?: Map<string, string>): string {
  let output = `# PolyEcho Low-Poly 3D OBJ Export\n`
  output += `mtllib ${mtlName}\n\n`

  let vOffset = 1
  let vtOffset = 1
  let vnOffset = 1

  for (const rawMesh of meshes) {
    if (!rawMesh.visible) continue

    const evaluated = evaluateModifiers(rawMesh)
    const shade = resolveMeshShadeMode(rawMesh)
    const autoSmoothAngle = rawMesh.autoSmoothAngle ?? DEFAULT_AUTO_SMOOTH_ANGLE
    output += `o ${rawMesh.name.replace(/\s+/g, '_')}\n`
    output += `${formatObjShadeComment({ shadeMode: shade, autoSmoothAngle })}\n`
    output += `usemtl ${sanitizeMtlName(materialNames?.get(rawMesh.materialId) || rawMesh.materialId)}\n`
    output += shade === 'flat' ? `s off\n` : `s 1\n`

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
        const r = hexChannel(hex, 0)
        const g = hexChannel(hex, 2)
        const b = hexChannel(hex, 4)
        output += `v ${vPos.x.toFixed(4)} ${vPos.y.toFixed(4)} ${vPos.z.toFixed(4)} ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\n`
      } else {
        output += `v ${vPos.x.toFixed(4)} ${vPos.y.toFixed(4)} ${vPos.z.toFixed(4)}\n`
      }
    }

    const cornerNormals = meshCornerNormals(evaluated.faces, evaluated.vertices, shade, autoSmoothAngle)
    const cornerVnIndex: number[][] = []
    let localVnCount = 0

    for (const f of evaluated.faces) {
      const faceVerts = f.vertexIds.map(id => evaluated.vertices.find(v => v.id === id)?.position).filter(Boolean) as { x: number; y: number; z: number }[]
      const fn = computeFaceNormal(faceVerts)
      const worldFn = new THREE.Vector3(fn.x, fn.y, fn.z).applyMatrix3(normalMatrix).normalize()

      if (cornerNormals) {
        const ids: number[] = []
        for (const vid of f.vertexIds) {
          const vn = cornerNormals.get(`${f.id}:${vid}`)
          const worldN = vn
            ? new THREE.Vector3(vn.x, vn.y, vn.z).applyMatrix3(normalMatrix).normalize()
            : worldFn
          output += `vn ${worldN.x.toFixed(4)} ${worldN.y.toFixed(4)} ${worldN.z.toFixed(4)}\n`
          ids.push(localVnCount)
          localVnCount++
        }
        cornerVnIndex.push(ids)
      } else {
        output += `vn ${worldFn.x.toFixed(4)} ${worldFn.y.toFixed(4)} ${worldFn.z.toFixed(4)}\n`
        cornerVnIndex.push(f.vertexIds.map(() => localVnCount))
        localVnCount++
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

    for (let fi = 0; fi < evaluated.faces.length; fi++) {
      const f = evaluated.faces[fi]
      output += `f`
      for (let i = 0; i < f.vertexIds.length; i++) {
        const localVIdx = evaluated.vertices.findIndex(v => v.id === f.vertexIds[i])
        const globalVIdx = vOffset + (localVIdx >= 0 ? localVIdx : 0)
        const globalVtIdx = uvCounter + i
        const globalVnIdx = vnOffset + cornerVnIndex[fi][i]

        output += ` ${globalVIdx}/${globalVtIdx}/${globalVnIdx}`
      }
      output += `\n`
      uvCounter += f.uvs.length
    }

    vOffset += evaluated.vertices.length
    vtOffset += evaluated.faces.reduce((acc, f) => acc + f.uvs.length, 0)
    vnOffset += localVnCount
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
    output += `newmtl ${sanitizeMtlName(mat.name || mat.id)}\n`
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

function hexChannel(hex: string, start: number): number {
  const n = parseInt(hex.substring(start, start + 2), 16)
  return (Number.isNaN(n) ? 255 : n) / 255
}

function sanitizeMtlName(name: string) {
  return (name || 'Material').replace(/[^\w.-]+/g, '_')
}
