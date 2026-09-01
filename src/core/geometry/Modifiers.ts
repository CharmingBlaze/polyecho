import { Face, MeshObject, MirrorModifier, SolidifyModifier, SubdivisionModifier, Vertex } from '../../types/mesh'

export function defaultMirrorModifier(): MirrorModifier {
  return {
    enabled: true,
    axisX: true,
    axisY: false,
    axisZ: false,
    clipping: true,
    merge: true,
    mergeThreshold: 0.001,
    flipU: false,
    flipV: false,
    bisect: true
  }
}

export function defaultSubdivisionModifier(): SubdivisionModifier {
  return {
    enabled: true,
    level: 1,
    type: 'catmull-clark'
  }
}

export function defaultSolidifyModifier(): SolidifyModifier {
  return {
    enabled: true,
    thickness: 0.08,
    offset: -1,
    fillRim: true
  }
}
import { evaluateMirror } from './MirrorModifier'
import { evaluateSubdivision } from './SubdivisionModifier'
import { evaluateSolidify } from './SolidifyModifier'

/**
 * Non-destructive stack, Blender default generate order:
 * Mirror → Subdivision Surface → Solidify
 */
export function evaluateModifiers(mesh: MeshObject): { vertices: Vertex[]; faces: Face[] } {
  let { vertices, faces } = evaluateMirror(mesh)

  if (mesh.subdivision?.enabled && mesh.subdivision.level > 0) {
    const type = mesh.subdivision.type === 'simple' ? 'simple' : 'catmull-clark'
    const sub = evaluateSubdivision(vertices, faces, mesh.subdivision.level, type)
    vertices = sub.vertices
    faces = sub.faces
  }

  if (mesh.solidify?.enabled && Math.abs(mesh.solidify.thickness) > 1e-8) {
    const sol = evaluateSolidify(
      vertices,
      faces,
      mesh.solidify.thickness,
      mesh.solidify.offset ?? -1,
      mesh.solidify.fillRim !== false
    )
    vertices = sol.vertices
    faces = sol.faces
  }

  return { vertices, faces }
}

export function applyModifier(
  mesh: MeshObject,
  type: 'mirror' | 'subdivision' | 'solidify' | 'all'
): void {
  if (type === 'all') {
    const { vertices, faces } = evaluateModifiers(mesh)
    mesh.vertices = vertices
    mesh.faces = faces
    if (mesh.mirror) mesh.mirror.enabled = false
    if (mesh.subdivision) mesh.subdivision.enabled = false
    if (mesh.solidify) mesh.solidify.enabled = false
    return
  }

  if (type === 'mirror' && mesh.mirror?.enabled) {
    const { vertices, faces } = evaluateMirror(mesh)
    mesh.vertices = vertices
    mesh.faces = faces
    mesh.mirror.enabled = false
  } else if (type === 'subdivision' && mesh.subdivision?.enabled) {
    const typeName = mesh.subdivision.type === 'simple' ? 'simple' : 'catmull-clark'
    const { vertices, faces } = evaluateSubdivision(
      mesh.vertices,
      mesh.faces,
      mesh.subdivision.level,
      typeName
    )
    mesh.vertices = vertices
    mesh.faces = faces
    mesh.subdivision.enabled = false
  } else if (type === 'solidify' && mesh.solidify?.enabled) {
    const { vertices, faces } = evaluateSolidify(
      mesh.vertices,
      mesh.faces,
      mesh.solidify.thickness,
      mesh.solidify.offset ?? -1,
      mesh.solidify.fillRim !== false
    )
    mesh.vertices = vertices
    mesh.faces = faces
    mesh.solidify.enabled = false
  }
}
