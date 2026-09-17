import { Box3, Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import type { MeshObject } from '../../types/mesh'
import type { Bone } from '../../types/animation'
import { resolveMeshBoneParentId } from './Armature'

export function meshRestMatrix(mesh: MeshObject): Matrix4 {
  return new Matrix4().compose(
    new Vector3(mesh.position.x, mesh.position.y, mesh.position.z),
    new Quaternion().setFromEuler(new Euler(...[mesh.rotation.x, mesh.rotation.y, mesh.rotation.z].map(MathUtils.degToRad) as [number, number, number])),
    new Vector3(mesh.scale.x, mesh.scale.y, mesh.scale.z),
  )
}

export const rigPresets = [
  { id: 'human', name: 'Human', description: 'Upright characters · arms out' },
  { id: 'quadruped', name: 'Four-legged', description: 'Animals · facing +Z' },
  { id: 'bird', name: 'Bird', description: 'Wings spread · facing +Z' },
  { id: 'fish', name: 'Fish', description: 'Body and tail · facing +Z' },
  { id: 'chain', name: 'Flexible chain', description: 'Tails, ropes, tentacles · along Y' },
  { id: 'single', name: 'Single joint', description: 'Props, doors, mechanical parts' },
] as const
export type RigPresetId = typeof rigPresets[number]['id']
type Point = [number, number, number]
type Joint = { name: string; parent: string | null; head: Point; tail: Point }

/** Templates are starting proportions, never an anatomical auto-rig claim. */
export function fitRigPreset(mesh: MeshObject, preset: RigPresetId): Joint[] {
  const bounds = new Box3()
  const matrix = meshRestMatrix(mesh)
  for (const vertex of mesh.vertices) bounds.expandByPoint(new Vector3(vertex.position.x, vertex.position.y, vertex.position.z).applyMatrix4(matrix))
  if (bounds.isEmpty()) return []
  const size = bounds.getSize(new Vector3())
  const center = bounds.getCenter(new Vector3())
  const extent = Math.max(size.x, size.y, size.z, 0.1)
  size.set(Math.max(size.x, extent * 0.05), Math.max(size.y, extent * 0.05), Math.max(size.z, extent * 0.05))
  const joints: Joint[] = []
  const add = (name: string, parent: string | null, head: Point, tail: Point) => joints.push({ name, parent, head, tail })
  if (preset === 'human') {
    add('Hips', null, [0, .48, 0], [0, .57, 0])
    add('Spine', 'Hips', [0, .57, 0], [0, .67, 0])
    add('Chest', 'Spine', [0, .67, 0], [0, .77, 0])
    add('Neck', 'Chest', [0, .77, 0], [0, .84, 0])
    add('Head', 'Neck', [0, .84, 0], [0, .97, 0])
    for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
      add(`Shoulder.${side}`, 'Chest', [0, .75, 0], [sign * .13, .74, 0])
      add(`UpperArm.${side}`, `Shoulder.${side}`, [sign * .13, .74, 0], [sign * .3, .73, 0])
      add(`Forearm.${side}`, `UpperArm.${side}`, [sign * .3, .73, 0], [sign * .41, .72, 0])
      add(`Hand.${side}`, `Forearm.${side}`, [sign * .41, .72, 0], [sign * .49, .72, 0])
      add(`Thigh.${side}`, 'Hips', [sign * .07, .48, 0], [sign * .08, .27, .03])
      add(`Shin.${side}`, `Thigh.${side}`, [sign * .08, .27, .03], [sign * .08, .06, 0])
      add(`Foot.${side}`, `Shin.${side}`, [sign * .08, .06, 0], [sign * .08, .04, .4])
    }
  } else if (preset === 'quadruped' || preset === 'bird') {
    add('Body', null, [0, .6, -.25], [0, .65, .2])
    add('Neck', 'Body', [0, .65, .2], [0, .85, .3])
    add('Head', 'Neck', [0, .85, .3], [0, .85, .48])
    add('Tail', 'Body', [0, .6, -.25], [0, .65, -.48])
    for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
      if (preset === 'bird') {
        add(`Wing.${side}`, 'Body', [0, .65, .1], [sign * .26, .7, 0])
        add(`WingTip.${side}`, `Wing.${side}`, [sign * .26, .7, 0], [sign * .48, .65, -.15])
      }
      for (const [label, z] of (preset === 'bird' ? [['Leg', -.1]] : [['BackLeg', -.23], ['FrontLeg', .2]]) as [string, number][]) {
        add(`${label}.${side}`, 'Body', [sign * .15, .6, z], [sign * .15, .3, z + .03])
        add(`${label}Lower.${side}`, `${label}.${side}`, [sign * .15, .3, z + .03], [sign * .15, .04, z])
      }
    }
  } else if (preset === 'fish') {
    add('Body', null, [0, .5, .4], [0, .5, 0])
    add('Tail', 'Body', [0, .5, 0], [0, .5, -.25])
    add('TailTip', 'Tail', [0, .5, -.25], [0, .5, -.48])
  } else {
    const count = preset === 'chain' ? 5 : 1
    for (let i = 0; i < count; i++) add(`Joint_${i + 1}`, i ? `Joint_${i}` : null, [0, i / count, 0], [0, (i + 1) / count, 0])
  }
  const fit = ([x, y, z]: Point): Point => [center.x + x * size.x, center.y + (y - .5) * size.y, center.z + z * size.z]
  return joints.map(j => ({ ...j, head: fit(j.head), tail: fit(j.tail) }))
}

export function inspectRig(mesh: MeshObject | null | undefined, bones: Bone[]) {
  const ids = new Set(bones.map(b => b.id))
  let unweighted = 0, invalid = 0
  const rigid = mesh ? !!resolveMeshBoneParentId(mesh, bones) : false
  for (const vertex of mesh?.vertices ?? []) {
    const entries = Object.entries(vertex.boneWeights ?? {})
    const valid = entries.filter(([id, w]) => ids.has(id) && Number.isFinite(w) && w > 0)
    const total = valid.reduce((sum, [, w]) => sum + w, 0)
    if (!rigid && total <= .001) unweighted++
    if (entries.some(([id, w]) => !Number.isFinite(w) || w < 0 || (w > 0 && !ids.has(id))) || (!rigid && total > 0 && (Math.abs(total - 1) > .01 || valid.length > 4))) invalid++
  }
  const brokenBones = bones.filter(b => {
    const seen = new Set([b.id])
    let parent = b.parentId
    while (parent) {
      if (!ids.has(parent) || seen.has(parent)) return true
      seen.add(parent)
      parent = bones.find(j => j.id === parent)?.parentId ?? null
    }
    return ![b.head.x, b.head.y, b.head.z, b.tail.x, b.tail.y, b.tail.z].every(Number.isFinite) || Math.hypot(b.tail.x - b.head.x, b.tail.y - b.head.y, b.tail.z - b.head.z) < 1e-6
  }).length
  return { unweighted, invalid, brokenBones, rigid, ready: !!mesh?.vertices.length && bones.length > 0 && !unweighted && !invalid && !brokenBones }
}
