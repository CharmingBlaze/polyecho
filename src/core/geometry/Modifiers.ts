import { Face, MeshObject, MirrorModifier, SolidifyModifier, SubdivisionModifier, Vertex } from '../../types/mesh'
import { evaluateMirror, type ModifierPurpose } from './MirrorModifier'
import { evaluateSubdivision } from './SubdivisionModifier'
import { evaluateSolidify } from './SolidifyModifier'

export function defaultMirrorModifier(): MirrorModifier {
  return {
    enabled: true,
    showEdit: true,
    showRender: true,
    axisX: true,
    axisY: false,
    axisZ: false,
    bisectX: false,
    bisectY: false,
    bisectZ: false,
    flipX: false,
    flipY: false,
    flipZ: false,
    clipping: false,
    merge: true,
    mergeThreshold: 0.001,
    bisectDistance: 0.001,
    flipU: false,
    flipV: false,
    offsetU: 0,
    offsetV: 0,
    bisect: false
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

export interface ModifierEvalOptions {
  scene?: readonly MeshObject[]
  purpose?: ModifierPurpose
  inEditMode?: boolean
}

export type GenerateModifierName = 'mirror' | 'subdivision' | 'solidify'

/** Blender-style generate order when `mesh.modifierStack` is unset. */
export const DEFAULT_MODIFIER_STACK: readonly GenerateModifierName[] = ['mirror', 'subdivision', 'solidify']

function modifierPresent(mesh: MeshObject, name: GenerateModifierName): boolean {
  if (name === 'mirror') return !!mesh.mirror
  if (name === 'subdivision') return !!mesh.subdivision
  return !!mesh.solidify
}

export function resolveModifierStack(mesh: MeshObject): GenerateModifierName[] {
  const present = DEFAULT_MODIFIER_STACK.filter(name => modifierPresent(mesh, name))
  const custom = mesh.modifierStack
  if (!custom?.length) return present
  const seen = new Set<GenerateModifierName>()
  const ordered: GenerateModifierName[] = []
  for (const name of custom) {
    if (!present.includes(name) || seen.has(name)) continue
    seen.add(name)
    ordered.push(name)
  }
  for (const name of present) {
    if (seen.has(name)) continue
    ordered.push(name)
  }
  return ordered
}

export function moveModifier(mesh: MeshObject, name: GenerateModifierName, delta: -1 | 1): boolean {
  const stack = resolveModifierStack(mesh)
  const index = stack.indexOf(name)
  const nextIndex = index + delta
  if (index < 0 || nextIndex < 0 || nextIndex >= stack.length) return false
  const next = [...stack]
  const swap = next[index]!
  next[index] = next[nextIndex]!
  next[nextIndex] = swap
  mesh.modifierStack = next
  return true
}

/**
 * Non-destructive stack. Default generate order is Mirror → Subdivision → Solidify
 * unless `mesh.modifierStack` reorders the present entries.
 */
export function evaluateModifiers(
  mesh: MeshObject,
  options?: ModifierEvalOptions
): { vertices: Vertex[]; faces: Face[] } {
  const purpose = options?.purpose ?? 'viewport'
  let vertices = mesh.vertices
  let faces = mesh.faces

  for (const name of resolveModifierStack(mesh)) {
    if (name === 'mirror') {
      const staged = { ...mesh, vertices, faces }
      const mirrored = evaluateMirror(staged, options?.scene, purpose, options?.inEditMode ?? false)
      vertices = mirrored.vertices
      faces = mirrored.faces
      continue
    }
    if (name === 'subdivision') {
      if (!mesh.subdivision?.enabled || mesh.subdivision.level <= 0) continue
      const type = mesh.subdivision.type === 'simple' ? 'simple' : 'catmull-clark'
      const sub = evaluateSubdivision(vertices, faces, mesh.subdivision.level, type)
      vertices = sub.vertices
      faces = sub.faces
      continue
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
  }

  return { vertices, faces }
}

export function applyModifier(
  mesh: MeshObject,
  type: 'mirror' | 'subdivision' | 'solidify' | 'all',
  scene?: readonly MeshObject[]
): void {
  if (type === 'all') {
    const { vertices, faces } = evaluateModifiers(mesh, { scene, purpose: 'apply' })
    mesh.vertices = vertices
    mesh.faces = faces
    if (mesh.mirror) mesh.mirror.enabled = false
    if (mesh.subdivision) mesh.subdivision.enabled = false
    if (mesh.solidify) mesh.solidify.enabled = false
    return
  }

  if (type === 'mirror' && mesh.mirror) {
    const { vertices, faces } = evaluateMirror(mesh, scene, 'apply')
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
