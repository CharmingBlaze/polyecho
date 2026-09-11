import { describe, expect, it, afterEach } from 'vitest'
import * as THREE from 'three'
import { ScreenGeometry } from './ScreenGeometry'

afterEach(() => {
  ScreenGeometry.blockoutMaximized = 'none'
  ScreenGeometry.blockoutFrontFrac = 1 / 3
  ScreenGeometry.blockoutSideFrac = 1 / 3
  ScreenGeometry.blockoutFrontCollapsed = false
  ScreenGeometry.blockoutSideCollapsed = false
  ScreenGeometry.blockoutPerspCollapsed = false
})

describe('ScreenGeometry.tripleCols', () => {
  it('gives the maximized pane the full width even if split fracs are stale', () => {
    ScreenGeometry.blockoutFrontFrac = 1 / 3
    ScreenGeometry.blockoutSideFrac = 1 / 3
    ScreenGeometry.blockoutMaximized = 'front'
    expect(ScreenGeometry.tripleCols(900)).toEqual({
      front: 900,
      side: 0,
      persp: 0,
      xSide: 900,
      xPersp: 900
    })
    ScreenGeometry.blockoutMaximized = 'side'
    expect(ScreenGeometry.tripleCols(900).side).toBe(900)
    ScreenGeometry.blockoutMaximized = 'persp'
    expect(ScreenGeometry.tripleCols(900).persp).toBe(900)
  })

  it('maps front-pane rays across the full canvas when Front is maximized', () => {
    ScreenGeometry.blockoutMaximized = 'front'
    const rect = { left: 10, top: 20, width: 900, height: 400 }
    const pane = ScreenGeometry.paneRect(rect, 'col_front')
    expect(pane).toEqual({ left: 10, top: 20, width: 900, height: 400 })
  })

  it('places uneven Front / Side / Persp columns from live split fracs', () => {
    ScreenGeometry.blockoutFrontFrac = 0.55
    ScreenGeometry.blockoutSideFrac = 0.2
    expect(ScreenGeometry.tripleCols(1000)).toEqual({
      front: 550,
      side: 200,
      persp: 250,
      xSide: 550,
      xPersp: 750
    })
    const pane = ScreenGeometry.paneRect({ left: 80, top: 40, width: 1000, height: 400 }, 'col_front')
    expect(pane).toEqual({ left: 80, top: 40, width: 550, height: 400 })
  })

  it('minimized Persp is a restore strip; Front and Side share the rest', () => {
    ScreenGeometry.blockoutPerspCollapsed = true
    ScreenGeometry.blockoutFrontFrac = 1 / 3
    ScreenGeometry.blockoutSideFrac = 1 / 3
    const cols = ScreenGeometry.tripleCols(1000)
    expect(cols.persp).toBe(ScreenGeometry.COLLAPSED_PX)
    expect(cols.front + cols.side + cols.persp).toBe(1000)
    expect(cols.front).toBeGreaterThan(400)
    expect(cols.side).toBeGreaterThan(400)
  })

  it('minimized Front is a restore strip on the left', () => {
    ScreenGeometry.blockoutFrontCollapsed = true
    const cols = ScreenGeometry.tripleCols(900)
    expect(cols.front).toBe(ScreenGeometry.COLLAPSED_PX)
    expect(cols.front + cols.side + cols.persp).toBe(900)
  })
})

describe('ScreenGeometry pointer mapping', () => {
  it('scales a window click into renderer client pixels when the canvas is offset', () => {
    const el = {
      clientWidth: 800,
      clientHeight: 400,
      getBoundingClientRect: () => ({ left: 120, top: 60, width: 800, height: 400 })
    } as HTMLElement
    expect(ScreenGeometry.pointerInView({ x: 120 + 400, y: 60 + 200 }, el)).toEqual({ x: 400, y: 200 })
  })

  it('round-trips a Front-pane world point at a wide split', () => {
    ScreenGeometry.blockoutFrontFrac = 0.7
    ScreenGeometry.blockoutSideFrac = 0.15
    const el = {
      clientWidth: 1000,
      clientHeight: 400,
      getBoundingClientRect: () => ({ left: 40, top: 20, width: 1000, height: 400 })
    } as HTMLElement
    const cam = new THREE.OrthographicCamera(-3.5, 3.5, 2, -2, 0.1, 100)
    cam.position.set(0, 0, 10)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    cam.updateProjectionMatrix()
    const world = new THREE.Vector3(0.5, -0.25, 0)
    const overlay = ScreenGeometry.worldToOverlay(world, cam, el, 'col_front')
    const ray = ScreenGeometry.rayFromClient(
      { x: 40 + overlay.x, y: 20 + overlay.y },
      cam,
      el,
      'col_front'
    )
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const hit = new THREE.Vector3()
    expect(ray.intersectPlane(plane, hit)).toBeTruthy()
    expect(hit.x).toBeCloseTo(world.x, 4)
    expect(hit.y).toBeCloseTo(world.y, 4)
  })

  it('treats a click in the Front column as inside that pane at a wide split', () => {
    ScreenGeometry.blockoutFrontFrac = 0.7
    ScreenGeometry.blockoutSideFrac = 0.15
    const el = {
      clientWidth: 1000,
      clientHeight: 400,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 400 })
    } as HTMLElement
    expect(ScreenGeometry.isInPane({ x: 100, y: 200 }, el, 'col_front')).toBe(true)
    expect(ScreenGeometry.isInPane({ x: 900, y: 200 }, el, 'col_front')).toBe(false)
  })
})
