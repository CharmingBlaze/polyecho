import { ref, type Ref } from 'vue'

/**
 * Drag a `position: fixed` (or absolute-in-viewport) panel without lag.
 * Reads the on-screen rect at pointer-down so leftover CSS transitions
 * cannot poison the grab offset.
 */
export function useFloatingDrag(
  pos: Ref<{ x: number; y: number }>,
  options?: {
    enabled?: () => boolean
    minX?: number
    minY?: number
    maxPadX?: number
    maxPadY?: number
  }
) {
  const isDragging = ref(false)

  function startDrag(e: PointerEvent) {
    if (options?.enabled && !options.enabled()) return
    if (e.button !== 0) return

    const handle = e.currentTarget as HTMLElement
    const panel = handle.closest('[data-floating-panel]') as HTMLElement | null
    const rect = (panel ?? handle).getBoundingClientRect()

    e.preventDefault()
    e.stopPropagation()

    pos.value = { x: rect.left, y: rect.top }
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    isDragging.value = true

    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      /* capture is optional */
    }

    const onMove = (move: PointerEvent) => {
      if (!isDragging.value) return
      const minX = options?.minX ?? 0
      const minY = options?.minY ?? 34
      const maxX = window.innerWidth - (options?.maxPadX ?? 80)
      const maxY = window.innerHeight - (options?.maxPadY ?? 60)
      pos.value = {
        x: Math.max(minX, Math.min(maxX, move.clientX - offsetX)),
        y: Math.max(minY, Math.min(maxY, move.clientY - offsetY))
      }
    }

    const onUp = () => {
      isDragging.value = false
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
    }

    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  return { isDragging, startDrag }
}
