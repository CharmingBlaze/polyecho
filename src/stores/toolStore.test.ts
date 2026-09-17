import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useToolStore } from './toolStore'

describe('toolStore.setAppMode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('enters UV on face select and restores the previous modeling mode', () => {
    const tools = useToolStore()
    tools.selectMode = 'vertex'
    tools.setAppMode('uvpaint')
    expect(tools.appMode).toBe('uvpaint')
    expect(tools.selectMode).toBe('face')
    tools.setAppMode('model')
    expect(tools.selectMode).toBe('vertex')
  })

  it('keeps 1–4 inside Blockout and UV instead of jumping to Modeling', () => {
    const tools = useToolStore()
    tools.setAppMode('blockout')
    tools.enterSelectMode('vertex')
    expect(tools.appMode).toBe('blockout')
    expect(tools.selectMode).toBe('vertex')

    tools.setAppMode('uvpaint')
    tools.enterSelectMode('edge')
    expect(tools.appMode).toBe('uvpaint')
    expect(tools.selectMode).toBe('edge')
  })

  it('does not leave Rig or Animate when 1–4 are pressed', () => {
    const tools = useToolStore()
    tools.setAppMode('rig')
    tools.enterSelectMode('vertex')
    expect(tools.appMode).toBe('rig')
    expect(tools.selectMode).toBe('bone')

    tools.setAppMode('animate')
    tools.enterSelectMode('face')
    expect(tools.appMode).toBe('animate')
    expect(tools.selectMode).toBe('bone')
  })

  it('treats bone and object selection as rigid object binding', () => {
    const tools = useToolStore()
    tools.setAppMode('rig')
    expect(tools.bindGeometryKind()).toBe('object')
    tools.selectMode = 'vertex'
    expect(tools.bindGeometryKind()).toBe('vertices')
    tools.selectMode = 'face'
    expect(tools.bindGeometryKind()).toBe('faces')
  })

  it('arms box select from the toolbar the same way B does', () => {
    const tools = useToolStore()
    tools.setModelTool('move')
    tools.toggleBoxSelect()
    expect(tools.modelTool).toBe('select')
    expect(tools.isBoxSelectActive).toBe(true)
    tools.toggleBoxSelect()
    expect(tools.isBoxSelectActive).toBe(false)
    tools.toggleBoxSelect()
    tools.setModelTool('rotate')
    expect(tools.isBoxSelectActive).toBe(false)
    expect(tools.modelTool).toBe('rotate')
  })
})
