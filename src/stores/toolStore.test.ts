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

  it('keeps the last UV / Paint tab when re-entering the workspace', () => {
    const tools = useToolStore()
    tools.setAppMode('uvpaint')
    tools.uvWorkspaceTab = 'paint'
    tools.setAppMode('model')
    tools.setAppMode('uvpaint')
    expect(tools.uvWorkspaceTab).toBe('paint')
    expect(tools.selectMode).toBe('face')
  })
})
