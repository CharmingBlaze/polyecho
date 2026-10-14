export interface CollectedObject {
  id: string
  collection?: string
  visible: boolean
  locked: boolean
}

export interface CollectionGroup<T extends CollectedObject> {
  name: string | null
  meshes: T[]
}

export function normalizeCollectionName(name: string | undefined | null): string | undefined {
  const trimmed = name?.trim()
  return trimmed ? trimmed : undefined
}

export function nextCollectionName(meshes: Array<{ collection?: string }>): string {
  const used = new Set(
    meshes.map(mesh => normalizeCollectionName(mesh.collection)).filter((name): name is string => Boolean(name))
  )
  let index = 1
  while (used.has(`Collection ${index}`)) index++
  return `Collection ${index}`
}

export function groupByCollection<T extends CollectedObject>(meshes: T[]): CollectionGroup<T>[] {
  const buckets = new Map<string | null, T[]>()
  for (const mesh of meshes) {
    const key = normalizeCollectionName(mesh.collection) ?? null
    const list = buckets.get(key)
    if (list) list.push(mesh)
    else buckets.set(key, [mesh])
  }
  const named = [...buckets.keys()].filter((key): key is string => key !== null).sort((a, b) => a.localeCompare(b))
  const groups: CollectionGroup<T>[] = named.map(name => ({ name, meshes: buckets.get(name)! }))
  const scene = buckets.get(null)
  if (scene?.length) groups.push({ name: null, meshes: scene })
  return groups
}

export function setMeshesCollection(
  meshes: CollectedObject[],
  ids: Iterable<string>,
  name: string | undefined
): number {
  const selected = ids instanceof Set ? ids : new Set(ids)
  const next = normalizeCollectionName(name)
  let changed = 0
  for (const mesh of meshes) {
    if (!selected.has(mesh.id)) continue
    const current = normalizeCollectionName(mesh.collection)
    if (current === next) continue
    if (next) mesh.collection = next
    else delete mesh.collection
    changed++
  }
  return changed
}

export function renameCollection(meshes: CollectedObject[], from: string, to: string | undefined): number {
  const source = normalizeCollectionName(from)
  const next = normalizeCollectionName(to)
  if (!source || source === next) return 0
  return setMeshesCollection(
    meshes,
    meshes.filter(mesh => normalizeCollectionName(mesh.collection) === source).map(mesh => mesh.id),
    next
  )
}

export function setCollectionVisible(meshes: CollectedObject[], name: string, visible: boolean): number {
  const collection = normalizeCollectionName(name)
  if (!collection) return 0
  let changed = 0
  for (const mesh of meshes) {
    if (normalizeCollectionName(mesh.collection) !== collection || mesh.visible === visible) continue
    mesh.visible = visible
    changed++
  }
  return changed
}

export function setCollectionLocked(meshes: CollectedObject[], name: string, locked: boolean): number {
  const collection = normalizeCollectionName(name)
  if (!collection) return 0
  let changed = 0
  for (const mesh of meshes) {
    if (normalizeCollectionName(mesh.collection) !== collection || mesh.locked === locked) continue
    mesh.locked = locked
    changed++
  }
  return changed
}

export function collectionAllVisible(meshes: CollectedObject[], name: string): boolean {
  const collection = normalizeCollectionName(name)
  if (!collection) return true
  const members = meshes.filter(mesh => normalizeCollectionName(mesh.collection) === collection)
  return members.length > 0 && members.every(mesh => mesh.visible)
}

export function collectionAllLocked(meshes: CollectedObject[], name: string): boolean {
  const collection = normalizeCollectionName(name)
  if (!collection) return false
  const members = meshes.filter(mesh => normalizeCollectionName(mesh.collection) === collection)
  return members.length > 0 && members.every(mesh => mesh.locked)
}
