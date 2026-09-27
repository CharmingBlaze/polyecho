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

  it('matches Ctrl+A to select all', () => {
    const store = useKeymapStore()
    const chord = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true })
    expect(store.matchingActionIds(chord)).toContain('select_all')
  })

  it('loads built-in preset and updates bindings and mouse settings', () => {
    const store = useKeymapStore()
    expect(store.loadPreset('maya_industry')).toBe(true)
    expect(store.getKeyFor('grab')).toBe('w')
    expect(store.getKeyFor('rotate')).toBe('e')
    expect(store.getKeyFor('scale')).toBe('r')
    expect(store.mouse.navScheme).toBe('maya')
    expect(store.mouse.emulate3ButtonMouse).toBe(true)
    expect(store.mouse.orbitButton).toBe('alt_left')
  })

  it('saves, loads, exports and imports custom presets', () => {
    const store = useKeymapStore()
    store.rebind('grab', 'm')
    store.updateMouseSetting('orbitButton', 'right')
    const preset = store.saveCustomPreset('My Custom Preset')
    expect(preset.name).toBe('My Custom Preset')
    expect(preset.keymaps['grab']).toBe('m')
    expect(preset.mouse.orbitButton).toBe('right')

    // Reset to Blender default
    store.loadPreset('blender_default')
    expect(store.getKeyFor('grab')).toBe('g')
    expect(store.mouse.orbitButton).toBe('middle')

    // Reload custom preset
    expect(store.loadPreset(preset.id)).toBe(true)
    expect(store.getKeyFor('grab')).toBe('m')
    expect(store.mouse.orbitButton).toBe('right')

    // Export and import JSON
    const json = store.exportPresetJson()
    const imported = store.importPresetJson(json)
    expect(imported.success).toBe(true)
    expect(imported.preset?.name).toContain('My Custom Preset')

    // Delete custom preset
    expect(store.deleteCustomPreset(preset.id)).toBe(true)
  })

  it('applies mouse preset schemes and saves descriptions', () => {
    const store = useKeymapStore()
    store.applyMousePresetScheme('unreal')
    expect(store.mouse.navScheme).toBe('unreal')
    expect(store.mouse.orbitButton).toBe('right')
    expect(store.mouse.panButton).toBe('middle')
    expect(store.mouse.specialsTrigger).toBe('middle')

    const p = store.saveCustomPreset('Unreal Rigging', 'Custom Unreal setup')
    expect(p.name).toBe('Unreal Rigging')
    expect(p.description).toBe('Custom Unreal setup')
    expect(p.mouse.orbitButton).toBe('right')
  })
})
