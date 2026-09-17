import type { Bone } from '../../types/animation'
import type { Vector3D } from '../../types/mesh'

/** Move a pivot and any coincident segment ends, without translating entire limbs. */
export function fitJoint(bones: Bone[], boneId: string, position: Vector3D, mirror = false): boolean {
  const bone = bones.find(b => b.id === boneId)
  if (!bone || !Object.values(position).every(Number.isFinite)) return false
  const apply = (target: Bone, point: Vector3D) => {
    const previous = { ...target.head }
    const tolerance = Math.max(1e-8, Math.hypot(target.tail.x - previous.x, target.tail.y - previous.y, target.tail.z - previous.z) * 1e-5)
    const coincides = (p: Vector3D) => Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z) < tolerance
    for (const other of bones) {
      if (other === target || other.id === target.parentId || other.parentId === target.id) {
        if (coincides(other.tail)) other.tail = { ...point }
        if (coincides(other.head)) other.head = { ...point }
      }
    }
    target.head = { ...point }
  }
  let root = bone
  const visited = new Set<string>()
  while (root.parentId && !visited.has(root.id)) {
    visited.add(root.id)
    const parent = bones.find(b => b.id === root.parentId)
    if (!parent) break
    root = parent
  }
  const centerX = root.head.x
  const oppositeName = bone.name.replace(/([._])([LR])$/, (_, sep, side) => `${sep}${side === 'L' ? 'R' : 'L'}`)
  const opposite = mirror && oppositeName !== bone.name ? bones.find(b => b.name === oppositeName) : undefined
  apply(bone, position)
  if (opposite) apply(opposite, { ...position, x: 2 * centerX - position.x })
  return true
}
