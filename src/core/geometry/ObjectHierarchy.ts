/** Parent-child checks for `MeshObject.parentId` (outliner / parentMesh). */

export function isDescendantOf(
  meshes: Array<{ id: string; parentId?: string | null }>,
  childId: string,
  potentialAncestorId: string
): boolean {
  if (childId === potentialAncestorId) return false
  const byId = new Map(meshes.map(mesh => [mesh.id, mesh]))
  let current = byId.get(potentialAncestorId)
  const seen = new Set<string>()
  while (current?.parentId) {
    if (seen.has(current.id)) return false
    seen.add(current.id)
    if (current.parentId === childId) return true
    current = byId.get(current.parentId)
  }
  return false
}
