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
})
