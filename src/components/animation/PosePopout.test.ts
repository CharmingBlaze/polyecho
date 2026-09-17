import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import PosePopout from './PosePopout.vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'
import { useHistoryStore } from '../../stores/historyStore'

let app: App, pinia: Pinia, host: HTMLDivElement
afterEach(() => { app?.unmount(); disposePinia(pinia); host?.remove(); vi.restoreAllMocks() })
async function mount() {
  pinia = createPinia(); setActivePinia(pinia)
  const animation = useAnimationStore()
  useToolStore().setAppMode('animate')
  animation.showPosePopup = true
  host = document.createElement('div'); document.body.appendChild(host)
  app = createApp(PosePopout).use(pinia); app.mount(host)
  await nextTick()
  return animation
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text)
  expect(button, text).toBeTruthy(); button!.click(); await nextTick()
}
async function edit(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
  input.value = value; input.dispatchEvent(new Event('change')); await nextTick()
}
describe('quick pose and animate', () => {
  it('advances moving and spinning object keys during playback without a skeleton', async () => {
    const animation = await mount()
    const mesh = useProjectStore().activeMesh!
    expect(animation.armature.bones).toHaveLength(0)
    animation.interpolationMode = 'linear'
    animation.recordCurrentKeyframe()
    animation.setFrame(24)
    animation.setPoseValues(mesh.id, 'mesh', 'position', { x: 2 })
    animation.setPoseValues(mesh.id, 'mesh', 'rotation', { y: 360 })
    animation.setFrame(0)
    let tick: FrameRequestCallback | undefined
    vi.spyOn(performance, 'now').mockReturnValue(0)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { tick = callback; return 1 })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    animation.togglePlay()
    tick!(100)
    expect(animation.isPlaying).toBe(true)
    expect(animation.currentFrame).toBe(1)
    expect(mesh.position.x).toBeCloseTo(2 / 24)
    expect(mesh.rotation.y).toBeCloseTo(15)
    tick!(200)
    expect(animation.currentFrame).toBe(2)
    expect(mesh.position.x).toBeCloseTo(4 / 24)
    expect(mesh.rotation.y).toBeCloseTo(30)
    animation.togglePlay()
  })
  it('moves with pointer or keyboard and resizes without losing transport controls', async () => {
    await mount()
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    const handle = host.querySelector<HTMLElement>('[aria-label="Move pose panel"]')!
    const left = parseFloat(dialog.style.left)
    handle.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 80, clientY: 90 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 130, clientY: 90 }))
    window.dispatchEvent(new PointerEvent('pointerup'))
    await nextTick()
    expect(parseFloat(dialog.style.left)).toBe(left + 50)
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    expect(parseFloat(dialog.style.left)).toBe(left + 40)
    const width = parseFloat(dialog.style.width)
    host.querySelector('[aria-label="Resize pose panel"]')!.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 400, clientY: 600 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 450, clientY: 600 }))
    window.dispatchEvent(new PointerEvent('pointerup'))
    await nextTick()
    expect(parseFloat(dialog.style.width)).toBe(width + 50)
    expect(host.querySelector('footer')!.textContent).toContain('Key & next')
  })
  it('shows useful guidance in an empty scene instead of disabled pose fields', async () => {
    await mount()
    useProjectStore().meshes = []
    useProjectStore().activeMeshId = ''
    await nextTick()
    expect(host.textContent).toContain('Your scene is empty')
    expect(host.querySelector('[aria-label="Pose rotation X"]')).toBeNull()
    await click('Open Modeling')
    expect(useToolStore().appMode).toBe('model')
  })
  it('scrubs frames and pauses playback', async () => {
    const animation = await mount()
    animation.togglePlay()
    const slider = host.querySelector<HTMLInputElement>('[aria-label="Scrub animation frame"]')!
    slider.value = '8'
    slider.dispatchEvent(new Event('input'))
    expect(animation.currentFrame).toBe(8)
    expect(animation.isPlaying).toBe(false)
  })
  it('keys two bone poses and samples the saved animation', async () => {
    const animation = await mount()
    const bone = animation.addRootBone('Arm'); animation.selectBone(bone.id)
    animation.autoKey = false; await nextTick()
    await edit('Pose rotation X', '20')
    await click('Key & next →')
    expect(animation.currentFrame).toBe(3)
    await edit('Pose rotation X', '50')
    await click('Insert key')
    const keys = animation.activeClip.tracks.find(t => t.targetId === bone.id)!.rotationKeys
    expect(keys.map(k => [k.frame, k.value.x])).toEqual([[0, 20], [3, 50]])
    animation.setFrame(0); expect(bone.rotation.x).toBe(20)
    animation.setFrame(3); expect(bone.rotation.x).toBe(50)
    await click('▶ Play'); expect(animation.isPlaying).toBe(true)
    await click('Pause'); expect(animation.isPlaying).toBe(false)
  })
  it('nudges selected objects precisely and undoes both values and keys', async () => {
    const animation = await mount(), project = useProjectStore()
    const mesh = project.activeMesh!
    await click('Move')
    const before = mesh.position.x
    host.querySelector<HTMLButtonElement>('[aria-label="Increase X"]')!.dispatchEvent(new MouseEvent('click', { shiftKey: true }))
    expect(mesh.position.x).toBeCloseTo(before + 0.01)
    expect(animation.activeClip.tracks.find(t => t.targetId === mesh.id)!.positionKeys).toHaveLength(1)
    useHistoryStore().undo()
    expect(project.activeMesh!.position.x).toBe(before)
    expect(animation.activeClip.tracks).toHaveLength(0)
  })
  it('follows bone selection and resets a whole channel in one undo step', async () => {
    const animation = await mount()
    const first = animation.addRootBone('First'), second = animation.addRootBone('Second')
    animation.autoKey = false
    animation.setPoseValues(first.id, 'bone', 'rotation', { x: 10, y: 20, z: 30 })
    animation.selectBone(first.id); await nextTick()
    await click('Reset rotation')
    expect(first.rotation).toEqual({ x: 0, y: 0, z: 0 })
    useHistoryStore().undo()
    expect(animation.armature.bones.find(b => b.id === first.id)!.rotation).toEqual({ x: 10, y: 20, z: 30 })
    animation.selectBone(second.id); await nextTick()
    await edit('Pose rotation X', '45')
    expect(animation.selectedBone!.rotation.x).toBe(45)
    expect(animation.armature.bones.find(b => b.id === first.id)!.rotation.x).toBe(10)
  })
  it('hides outside animation and pauses playback on edits', async () => {
    const animation = await mount()
    animation.togglePlay()
    await edit('Pose rotation X', '30')
    expect(animation.isPlaying).toBe(false)
    useToolStore().setAppMode('model'); await nextTick()
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })
})
