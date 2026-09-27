import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from './layoutStore'

describe('layoutStore sidebar memory', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('hides the inspector on first visit to Blockout and UV, and restores if opened', () => {
    const layout = useLayoutStore()
    expect(layout.showRightSidebar).toBe(true)

    layout.applySidebarForMode('blockout')
    expect(layout.showRightSidebar).toBe(false)
    expect(layout.inspectorTab).toBe('refs')

    layout.showRightSidebar = true
    layout.noteSidebarVisible('blockout', true)
    layout.applySidebarForMode('model')
    expect(layout.showRightSidebar).toBe(true)

    layout.applySidebarForMode('blockout')
    expect(layout.showRightSidebar).toBe(true)

    layout.applySidebarForMode('uvpaint')
    expect(layout.showRightSidebar).toBe(false)
    expect(layout.inspectorTab).toBe('props')

    layout.showRightSidebar = true
    layout.noteSidebarVisible('uvpaint', true)
    layout.applySidebarForMode('model')
    layout.applySidebarForMode('uvpaint')
    expect(layout.showRightSidebar).toBe(false)
  })

  it('opens Mesh Tools in Modeling and the UV sheet in UV/Paint', () => {
    const layout = useLayoutStore()
    layout.applySidebarForMode('model')
    expect(layout.inspectorTab).toBe('tools')
    layout.setInspectorTab('material', 'model')
    layout.applySidebarForMode('uvpaint')
    expect(layout.inspectorTab).toBe('props')
    layout.applySidebarForMode('model')
    expect(layout.inspectorTab).toBe('material')
  })

  it('opens Skeleton in Rig and keeps the inspector visible', () => {
    const layout = useLayoutStore()
    layout.applySidebarForMode('rig')
    expect(layout.showRightSidebar).toBe(true)
    expect(layout.inspectorTab).toBe('skeleton')
    layout.setInspectorTab('weights', 'rig')
    layout.applySidebarForMode('model')
    layout.applySidebarForMode('rig')
    expect(layout.inspectorTab).toBe('weights')
  })

  it('moves, closes, and restores the UV and Paint tool shelves', () => {
    const layout = useLayoutStore()

    layout.moveToolShelf('uv', 120, 80)
    layout.patchToolShelf('paint', { open: false, minimized: true })
    expect(layout.toolShelves.uv).toMatchObject({ x: 120, y: 80 })
    expect(layout.toolShelves.paint).toMatchObject({ open: false, minimized: true })

    layout.resetLayout()
    expect(layout.toolShelves.uv).toEqual({ open: true, minimized: false, x: 12, y: 12 })
    expect(layout.toolShelves.paint).toEqual({ open: true, minimized: false, x: 12, y: 12 })
  })
})
