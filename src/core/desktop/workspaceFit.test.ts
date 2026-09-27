import { describe, expect, it } from 'vitest'
import { sidebarWidthLimit, timelineHeightFor } from './workspaceFit'

describe('workspace fit', () => {
  it('keeps a wide properties column on a desktop', () => {
    expect(sidebarWidthLimit(1600)).toBe(600)
    expect(sidebarWidthLimit(1440)).toBeGreaterThanOrEqual(320)
  })

  it('caps the sidebar so a narrow laptop still has a view', () => {
    const limit = sidebarWidthLimit(900)
    expect(limit).toBeLessThanOrEqual(420)
    expect(900 - 48 - limit).toBeGreaterThanOrEqual(430)
  })

  it('shortens the timeline only when the window is short', () => {
    expect(timelineHeightFor(1080)).toBe(280)
    expect(timelineHeightFor(800)).toBe(200)
    expect(timelineHeightFor(640)).toBe(148)
  })
})
