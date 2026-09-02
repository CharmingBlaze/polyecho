import type { PrimitiveType, PrimitiveParameters } from '../primitives/PrimitiveTypes'
import type { PrimitivePlacementMode } from '../operators/placement/PrimitivePlacementOperator'
import type { PlacementOrientation } from '../placement/SurfacePlacementSolver'

export const EDITOR_EVENTS = {
  modalTool: 'editor:modal-tool',
  cameraView: 'editor:camera-view',
  openPrimitiveMenu: 'editor:open-primitive-menu',
  startPrimitivePlacement: 'editor:start-primitive-placement',
  primitiveCreated: 'editor:primitive-created',
  openExport: 'editor:open-export',
  fillFace: 'editor:fill-face',
  openPie: 'editor:open-pie',
  toggleUvOverlay: 'editor:toggle-uv-overlay'
} as const

export type ModalToolCommand =
  | 'grab'
  | 'rotate'
  | 'scale'
  | 'extrude'
  | 'inset'
  | 'bevel'
  | 'knife'
  | 'loop_cut'
  | 'polydraw'
  | 'polybuild'

export type CameraViewCommand = 'persp' | 'top' | 'front' | 'right' | 'iso'
export type ExportFormatCommand = 'glb' | 'obj'

export interface PrimitivePlacementCommand {
  type: PrimitiveType
  mode?: PrimitivePlacementMode
  orientation?: PlacementOrientation
  parameters?: PrimitiveParameters
}

export function requestModalTool(tool: ModalToolCommand) {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.modalTool, { detail: { tool } }))
}

export function requestCameraView(view: CameraViewCommand) {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.cameraView, { detail: view }))
}

export function requestPrimitiveMenu(position = { x: 100, y: 150 }) {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.openPrimitiveMenu, { detail: position }))
}

export function requestPrimitivePlacement(detail: PrimitivePlacementCommand) {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.startPrimitivePlacement, { detail }))
}

export function notifyPrimitiveCreated(detail: unknown) {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.primitiveCreated, { detail }))
}

export function requestExport(format?: ExportFormatCommand) {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.openExport, { detail: format }))
}

export function requestFillFace() {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.fillFace))
}

export type PieMenuCommand = 'shading' | 'mode' | 'snap'

export function requestOpenPie(menu: PieMenuCommand) {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.openPie, { detail: menu }))
}

export function requestToggleUvOverlay() {
  window.dispatchEvent(new CustomEvent(EDITOR_EVENTS.toggleUvOverlay))
}
