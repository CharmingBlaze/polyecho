/** Paint tools that still need the object gizmo (select / UV layout). */
const GIZMO_PAINT_TOOLS = new Set(['select'])

/**
 * Hide the object transform gizmo while painting so it does not steal clicks.
 * UV tab keeps the gizmo. Paint tab keeps it only for the Select tool.
 */
export function paintHidesTransformGizmo(
  appMode: string,
  uvWorkspaceTab: string,
  paintTool: string
): boolean {
  if (appMode !== 'uvpaint') return false
  if (uvWorkspaceTab !== 'paint') return false
  return !GIZMO_PAINT_TOOLS.has(paintTool)
}

export function shouldConcealTransformGizmo(options: {
  appMode: string
  uvWorkspaceTab: string
  paintTool: string
  isPlaying?: boolean
  isWeightPaintActive?: boolean
}): boolean {
  if (options.appMode === 'animate' && options.isPlaying) return true
  if (options.isWeightPaintActive) return true
  return paintHidesTransformGizmo(options.appMode, options.uvWorkspaceTab, options.paintTool)
}
