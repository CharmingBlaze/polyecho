import { describe, expect, it } from 'vitest'
import { isDesktopApp, getLastProjectPath, setLastProjectPath, listRecentProjects, getLaunchProjectPath } from './desktopApi'

describe('desktopApi', () => {
  it('is not a desktop host under happy-dom', async () => {
    expect(isDesktopApp()).toBe(false)
    expect(getLastProjectPath()).toBeNull()
    setLastProjectPath('C:/tmp/test.psxproj')
    expect(getLastProjectPath()).toBe('C:/tmp/test.psxproj')
    setLastProjectPath(null)
    expect(await listRecentProjects()).toEqual([])
    expect(await getLaunchProjectPath()).toBeNull()
  })
})
