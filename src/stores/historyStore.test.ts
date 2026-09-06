import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useHistoryStore } from './historyStore'
import { useProjectStore } from './projectStore'

describe('historyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('undo restores a mesh vertex after recordState', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const mesh = project.activeMesh
    if (!mesh) throw new Error('expected default cube')
    const startX = mesh.vertices[0].position.x
    history.recordState('Move Vertex')
    mesh.vertices[0].position.x = startX + 3
    project.markGeometryUpdated()
    history.undo()
    expect(project.activeMesh?.vertices[0].position.x).toBe(startX)
  })

  it('undo restores pixels and bumps textureRevision', () => {
    const project = useProjectStore()
    const history = useHistoryStore()
    const buf = project.pixelBuffer
    const before = buf.getPixelHex(0, 0)
    const rev = project.textureRevision
    history.recordState('Paint Pixel')
    buf.drawBrush(0, 0, '#ff0000', 1, 1, 'square', true)
    project.markTextureUpdated()
    expect(project.textureRevision).toBeGreaterThan(rev)
    expect(buf.getPixelHex(0, 0).toLowerCase()).toBe('#ff0000')
    history.undo()
    expect(project.pixelBuffer.getPixelHex(0, 0).toLowerCase()).toBe(before.toLowerCase())
    expect(project.textureRevision).toBeGreaterThan(rev)
  })

  it('tracks dirty until markClean', () => {
    const history = useHistoryStore()
    expect(history.isDirty()).toBe(false)
    history.recordState('Edit')
    expect(history.isDirty()).toBe(true)
    history.markClean()
    expect(history.isDirty()).toBe(false)
    history.undo()
    expect(history.isDirty()).toBe(true)
    history.clearHistory()
    expect(history.isDirty()).toBe(false)
  })
})
