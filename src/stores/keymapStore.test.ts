import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useKeymapStore } from './keymapStore'

describe('keymapStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useKeymapStore().initKeymaps()
  })

  it('matches copy/paste chords including flipped pose', () => {
    const store = useKeymapStore()
    const copy = new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true })
    const paste = new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', ctrlKey: true })
    const flipped = new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', ctrlKey: true, shiftKey: true })
    expect(store.matchingActionIds(copy)).toContain('copy_selection')
    expect(store.matchingActionIds(paste)).toContain('paste_clipboard')
    expect(store.matchingActionIds(flipped)).toContain('paste_flipped_pose')
    expect(store.matchingActionIds(flipped)).not.toContain('paste_clipboard')
  })
})
