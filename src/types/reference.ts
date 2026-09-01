export type ReferencePlane = 'front' | 'side' | 'top'

export interface ReferenceImage {
  id: string
  name: string
  plane: ReferencePlane
  dataUrl: string
  opacity: number
  scale: number
  offsetX: number
  offsetY: number
  flipX: boolean
  visible: boolean
  locked: boolean
}
