import { computed, ref, type Ref } from 'vue'
import { useToolStore } from '../stores/toolStore'

export type CanvasNavMode = 'pan' | 'zoom'

/** Click-step for the +/- buttons. A full 25% jump reads as the view leaping. */
export const CANVAS_BUTTON_ZOOM = 1.1

/**
 * Vertical drag zoom for a mouse or stylus.
 * About 50px of travel doubles the view, so a short pen stroke is obvious
 * without the old 0.985 curve that halved the view in a flick.
 */
export function canvasDragZoomFactor(dy: number, invert = false): number {
  return Math.pow(0.986, dy * (invert ? -1 : 1))
}

/** Zoom a 2D canvas around a point, keeping that point fixed on screen. */
export function zoomAroundPoint(
  pan: { x: number; y: number },
  zoom: number,
  originX: number,
  originY: number,
  nextZoom: number
) {
  const ratio = nextZoom / zoom
  return {
    zoom: nextZoom,
    pan: {
      x: originX - (originX - pan.x) * ratio,
      y: originY - (originY - pan.y) * ratio
    }
  }
}

/**
 * LightWave-style 2D view navigation: drag the Pan button to slide the canvas,
 * drag the Zoom button up or down to scale it. When sticky CAD controls are on,
 * a click locks that mode so the next drag in the view pans or zooms — the
 * laptop and stylus path that does not need a middle button or a wheel.
 */
export function useCanvasLightwaveNav(options: {
  zoom: Ref<number>
  panOffset: Ref<{ x: number; y: number }>
  viewSize: () => { w: number; h: number }
  /** Screen rect of the 2D view. Pointer zoom stays anchored to this box. */
  viewRect: () => DOMRect | null
  minZoom: number
  maxZoom: number
  onGesture?: () => void
}) {
  const toolStore = useToolStore()
  const armed = ref<CanvasNavMode | null>(null)
  const navigating = ref(false)
  const sticky = computed(() => toolStore.stickyViewportControls)
  let dragDepth = 0

  function clampZoom(value: number) {
    return Math.max(options.minZoom, Math.min(options.maxZoom, value))
  }

  function noteGesture() {
    options.onGesture?.()
  }

  function applyZoom(originX: number, originY: number, factor: number) {
    const next = clampZoom(options.zoom.value * factor)
    if (next === options.zoom.value) return
    const framed = zoomAroundPoint(options.panOffset.value, options.zoom.value, originX, originY, next)
    options.zoom.value = framed.zoom
    options.panOffset.value = framed.pan
    noteGesture()
  }

  function bindDrag(event: PointerEvent, onMove: (ev: PointerEvent) => void) {
    const pointerId = event.pointerId
    // Listen on the window in the capture phase. The pan button is 24px, and a
    // stylus leaves it immediately. The paint toolbar also stops pointer events,
    // which would swallow a bubble listener and leave the drag stuck.
    dragDepth++
    navigating.value = true
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      onMove(ev)
    }
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      dragDepth = Math.max(0, dragDepth - 1)
      navigating.value = dragDepth > 0
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
    }
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
  }

  function startPan(event: PointerEvent) {
    noteGesture()
    let prevX = event.clientX
    let prevY = event.clientY
    bindDrag(event, (ev) => {
      options.panOffset.value = {
        x: options.panOffset.value.x + (ev.clientX - prevX),
        y: options.panOffset.value.y + (ev.clientY - prevY)
      }
      prevX = ev.clientX
      prevY = ev.clientY
      noteGesture()
    })
  }

  function startZoom(event: PointerEvent, origin: 'center' | 'pointer') {
    noteGesture()
    const size = options.viewSize()
    const rect = options.viewRect()
    const originPoint = origin === 'pointer' && rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: size.w / 2, y: size.h / 2 }
    let prevY = event.clientY
    bindDrag(event, (ev) => {
      const dy = ev.clientY - prevY
      prevY = ev.clientY
      applyZoom(originPoint.x, originPoint.y, canvasDragZoomFactor(dy, toolStore.viewport.invertZoom))
    })
  }

  /** +/- buttons. Zooms around the middle of the view so the texture stays put. */
  function nudgeZoom(factor: number) {
    const size = options.viewSize()
    const next = clampZoom(options.zoom.value * factor)
    if (next === options.zoom.value) return
    const framed = zoomAroundPoint(
      options.panOffset.value,
      options.zoom.value,
      size.w / 2,
      size.h / 2,
      next
    )
    options.zoom.value = framed.zoom
    options.panOffset.value = framed.pan
    noteGesture()
  }

  function isPrimaryPress(event: PointerEvent) {
    if (event.altKey) return false
    if (event.button === 0) return true
    // A pen tip sometimes arrives as buttons bit 0 with button -1.
    return event.pointerType === 'pen' && event.button < 0 && (event.buttons & 1) === 1
  }

  function onNavButton(mode: CanvasNavMode, event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    // A drag always moves the view. Tapping a button that is already locked
    // releases it. Cancelling on pointerdown made every second grab a no-op.
    const releaseIfTap = sticky.value && armed.value === mode
    if (sticky.value) armed.value = mode
    if (mode === 'pan') startPan(event)
    else startZoom(event, 'center')
    if (!releaseIfTap) return
    const pointerId = event.pointerId
    const x0 = event.clientX
    const y0 = event.clientY
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener('pointerup', end, true)
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) armed.value = null
    }
    window.addEventListener('pointerup', end, true)
  }

  /** Primary drag in the canvas while a nav mode is locked. */
  function consumeCanvasPointer(event: PointerEvent): boolean {
    if (!sticky.value || !armed.value || !isPrimaryPress(event)) return false
    event.preventDefault()
    event.stopPropagation()
    if (armed.value === 'pan') startPan(event)
    else startZoom(event, 'pointer')
    return true
  }

  function clearArmed(): boolean {
    if (!armed.value) return false
    armed.value = null
    return true
  }

  function toggleSticky() {
    toolStore.stickyViewportControls = !toolStore.stickyViewportControls
    if (!toolStore.stickyViewportControls) armed.value = null
  }

  function title(mode: CanvasNavMode) {
    const idle = mode === 'pan'
      ? 'Pan (drag to slide the view)'
      : 'Zoom (drag up/down to scale the view)'
    if (!sticky.value) return idle
    if (armed.value === mode) return `${mode === 'pan' ? 'Pan' : 'Zoom'} (sticky) — click again or Esc to exit`
    return `${mode === 'pan' ? 'Pan' : 'Zoom'} (click to lock, then drag in the view)`
  }

  const cursor = computed(() => {
    if (!sticky.value || !armed.value) return ''
    return armed.value === 'pan' ? 'grab' : 'ns-resize'
  })

  const stickyTitle = computed(() => sticky.value
    ? 'Sticky view on — click Pan or Zoom to lock. Click to use click-and-hold'
    : 'Sticky view off — click to lock Pan or Zoom for a stylus or trackpad')

  return { armed, navigating, sticky, cursor, stickyTitle, onNavButton, consumeCanvasPointer, clearArmed, toggleSticky, title, nudgeZoom }
}
