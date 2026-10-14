export interface VisibleObject {
  id: string
  visible: boolean
}

function selectedSet(selectedIds: Iterable<string>): Set<string> {
  return selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
}

export function isSelectionIsolated(meshes: VisibleObject[], selectedIds: Iterable<string>): boolean {
  const selected = selectedSet(selectedIds)
  if (!selected.size) return false
  return meshes.every(mesh => (selected.has(mesh.id) ? mesh.visible : !mesh.visible))
}

export function canHideSelected(meshes: VisibleObject[], selectedIds: Iterable<string>): boolean {
  const selected = selectedSet(selectedIds)
  return meshes.some(mesh => selected.has(mesh.id) && mesh.visible)
}

export function canHideUnselected(meshes: VisibleObject[], selectedIds: Iterable<string>): boolean {
  const selected = selectedSet(selectedIds)
  return selected.size > 0 && meshes.some(mesh => !selected.has(mesh.id) && mesh.visible)
}

export function canShowHidden(meshes: VisibleObject[]): boolean {
  return meshes.some(mesh => !mesh.visible)
}

export function canIsolateSelected(meshes: VisibleObject[], selectedIds: Iterable<string>): boolean {
  const selected = selectedSet(selectedIds)
  if (!selected.size) return false
  return canShowHidden(meshes) || canHideUnselected(meshes, selected)
}

export function hideSelected(meshes: VisibleObject[], selectedIds: Iterable<string>): number {
  const selected = selectedSet(selectedIds)
  let changed = 0
  for (const mesh of meshes) {
    if (!selected.has(mesh.id) || !mesh.visible) continue
    mesh.visible = false
    changed++
  }
  return changed
}

export function hideUnselected(meshes: VisibleObject[], selectedIds: Iterable<string>): number {
  const selected = selectedSet(selectedIds)
  if (!selected.size) return 0
  let changed = 0
  for (const mesh of meshes) {
    if (selected.has(mesh.id) || !mesh.visible) continue
    mesh.visible = false
    changed++
  }
  return changed
}

export function showHidden(meshes: VisibleObject[]): number {
  let changed = 0
  for (const mesh of meshes) {
    if (mesh.visible) continue
    mesh.visible = true
    changed++
  }
  return changed
}

/** Show only the selection. If that is already the scene, show everything again. */
export function isolateSelected(meshes: VisibleObject[], selectedIds: Iterable<string>): number {
  const selected = selectedSet(selectedIds)
  if (!selected.size) return 0
  if (isSelectionIsolated(meshes, selected)) return showHidden(meshes)
  let changed = 0
  for (const mesh of meshes) {
    const want = selected.has(mesh.id)
    if (mesh.visible === want) continue
    mesh.visible = want
    changed++
  }
  return changed
}
