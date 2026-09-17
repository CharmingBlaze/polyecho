import { Box3, Vector3 } from 'three'
import type { MeshObject, Vector3D } from '../../types/mesh'
import type { Bone } from '../../types/animation'
import { meshRestMatrix } from './RiggingWorkflow'

export const landmarkGroups = [
  { id: 'chin', label: 'Chin', color: '#36cdd2', hint: 'Place at the base of the chin, centered below the face.' },
  { id: 'shoulder', label: 'Shoulders', color: '#a78bfa', hint: 'Place at the shoulder pivots where the arms meet the torso.' },
  { id: 'elbow', label: 'Elbows', color: '#f0d56b', hint: 'Place in the center of each elbow bend.' },
  { id: 'wrist', label: 'Wrists', color: '#a7d65c', hint: 'Place where each hand meets the forearm.' },
  { id: 'pelvis', label: 'Pelvis', color: '#ee83a6', hint: 'Place on the centerline, just above where the legs separate.' },
  { id: 'knee', label: 'Knees', color: '#f4ab5d', hint: 'Place at the knee pivots. Check their depth from the side.' },
  { id: 'ankle', label: 'Ankles', color: '#72b9f3', hint: 'Place where each lower leg meets the foot.' },
] as const
export type LandmarkGroup = typeof landmarkGroups[number]['id']
export interface RigLandmark { id: string; group: LandmarkGroup; side?: 'L' | 'R'; position: Vector3D }
export function humanoidBounds(mesh: MeshObject) {
  const bounds = new Box3(), matrix = meshRestMatrix(mesh)
  for (const v of mesh.vertices) bounds.expandByPoint(new Vector3(v.position.x, v.position.y, v.position.z).applyMatrix4(matrix))
  return bounds
}
export function suggestHumanoidMarkers(mesh: MeshObject, pose: 't' | 'a' = 't'): RigLandmark[] {
  const bounds = humanoidBounds(mesh)
  if (bounds.isEmpty()) return []
  const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3())
  const result: RigLandmark[] = []
  const add = (group: LandmarkGroup, x: number, y: number, z = 0, side?: 'L' | 'R') => result.push({ id: side ? `${group}.${side}` : group, group, side, position: { x: center.x + x * size.x, y: bounds.min.y + y * size.y, z: center.z + z * size.z } })
  add('chin', 0, .84); add('pelvis', 0, .49)
  for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
    add('shoulder', .13 * sign, .75, 0, side)
    add('elbow', .3 * sign, pose === 'a' ? .61 : .74, 0, side)
    add('wrist', .43 * sign, pose === 'a' ? .46 : .73, 0, side)
    add('knee', .08 * sign, .27, .03, side)
    add('ankle', .08 * sign, .055, 0, side)
  }
  return result
}
export function moveHumanoidMarker(markers: RigLandmark[], id: string, position: Vector3D, symmetry: boolean) {
  const marker = markers.find(m => m.id === id)
  if (!marker || !Object.values(position).every(Number.isFinite)) return
  marker.position = { ...position }
  const center = markers.find(m => m.id === 'pelvis')?.position.x ?? 0
  if (symmetry && marker.side) {
    const opposite = markers.find(m => m.group === marker.group && m.side && m.side !== marker.side)
    if (opposite) opposite.position = { ...position, x: 2 * center - position.x }
  }
}
export function validateHumanoidMarkers(markers: RigLandmark[]): string[] {
  const errors: string[] = []
  const get = (id: string) => markers.find(m => m.id === id)?.position
  for (const group of landmarkGroups) {
    const ids = ['chin', 'pelvis'].includes(group.id) ? [group.id] : [`${group.id}.L`, `${group.id}.R`]
    if (ids.some(id => !get(id) || !Object.values(get(id)!).every(Number.isFinite))) errors.push(`Place the ${group.label.toLowerCase()} markers.`)
  }
  if (errors.length) return errors
  if (get('chin')!.y <= get('pelvis')!.y) errors.push('The chin must be above the pelvis. Orient the model upright first.')
  for (const side of ['L', 'R']) {
    if (get(`knee.${side}`)!.y >= get('pelvis')!.y || get(`ankle.${side}`)!.y >= get(`knee.${side}`)!.y) errors.push(`Check the hip, knee and ankle order on side ${side}.`)
  }
  return errors
}

/** Deterministic preview bones. Document IDs are assigned only when committing. */
export function buildHumanoidRig(mesh: MeshObject, markers: RigLandmark[], detail: 'standard' | 'simple' = 'standard'): Bone[] {
  if (validateHumanoidMarkers(markers).length) return []
  const point = (id: string) => ({ ...markers.find(m => m.id === id)!.position })
  const lerp = (a: Vector3D, b: Vector3D, t: number): Vector3D => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
  const pelvis = point('pelvis'), chin = point('chin')
  const bounds = humanoidBounds(mesh), size = bounds.getSize(new Vector3())
  const bones: Bone[] = []
  const add = (name: string, parentId: string | null, head: Vector3D, tail: Vector3D) => bones.push({ id: name, name, parentId, head: { ...head }, tail: { ...tail }, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, childrenIds: [] })
  const waist = lerp(pelvis, chin, .23), chest = lerp(pelvis, chin, .55), neck = lerp(pelvis, chin, .82)
  add('Hips', null, pelvis, waist)
  add('Spine', 'Hips', waist, detail === 'standard' ? chest : chin)
  if (detail === 'standard') { add('Chest', 'Spine', chest, neck); add('Neck', 'Chest', neck, chin) }
  add('Head', detail === 'standard' ? 'Neck' : 'Spine', chin, { ...chin, y: Math.max(bounds.max.y, chin.y + size.y * .05) })
  for (const side of ['L', 'R'] as const) {
    const shoulder = point(`shoulder.${side}`), elbow = point(`elbow.${side}`), wrist = point(`wrist.${side}`)
    const knee = point(`knee.${side}`), ankle = point(`ankle.${side}`)
    const sign = side === 'L' ? 1 : -1
    if (detail === 'standard') add(`Shoulder.${side}`, 'Chest', neck, shoulder)
    add(`UpperArm.${side}`, detail === 'standard' ? `Shoulder.${side}` : 'Spine', shoulder, elbow)
    add(`Forearm.${side}`, `UpperArm.${side}`, elbow, wrist)
    add(`Hand.${side}`, `Forearm.${side}`, wrist, lerp(elbow, wrist, 1.25))
    const hip = { x: pelvis.x + sign * Math.max(Math.abs(knee.x - pelvis.x) * .8, size.x * .035), y: pelvis.y, z: pelvis.z }
    add(`Thigh.${side}`, 'Hips', hip, knee)
    add(`Shin.${side}`, `Thigh.${side}`, knee, ankle)
    add(`Foot.${side}`, `Shin.${side}`, ankle, { ...ankle, z: ankle.z + Math.max(size.z * .3, size.y * .045) })
  }
  for (const bone of bones) if (bone.parentId) bones.find(b => b.id === bone.parentId)!.childrenIds.push(bone.id)
  return bones
}
