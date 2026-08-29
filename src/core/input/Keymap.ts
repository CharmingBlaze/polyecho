export interface KeyBinding {
  action: string
  key: string
  shift?: boolean
  ctrl?: boolean
  alt?: boolean
  description: string
}

export const defaultKeymap: KeyBinding[] = [
  { action: 'operator.move', key: 'g', description: 'Move / Grab Selection' },
  { action: 'operator.rotate', key: 'r', description: 'Rotate Selection' },
  { action: 'operator.scale', key: 's', description: 'Scale Selection' },
  { action: 'operator.extrude', key: 'e', description: 'Extrude Region' },
  { action: 'operator.inset', key: 'i', description: 'Inset Faces' },
  { action: 'operator.bevel', key: 'b', ctrl: true, description: 'Bevel Edges / Faces' },
  { action: 'operator.loop_cut', key: 'r', ctrl: true, description: 'Loop Cut and Slide' },

  { action: 'selection.all', key: 'a', description: 'Select All' },
  { action: 'selection.none', key: 'a', alt: true, description: 'Deselect All' },

  { action: 'mode.vertex', key: '1', description: 'Vertex Select Mode' },
  { action: 'mode.edge', key: '2', description: 'Edge Select Mode' },
  { action: 'mode.face', key: '3', description: 'Face Select Mode' },
  { action: 'mode.object', key: '4', description: 'Object Select Mode' },

  { action: 'history.undo', key: 'z', ctrl: true, description: 'Undo Last Operation' },
  { action: 'history.redo', key: 'z', ctrl: true, shift: true, description: 'Redo Operation' },

  { action: 'edit.duplicate', key: 'd', shift: true, description: 'Duplicate Selection' }
]
