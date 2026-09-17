import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import AnimationInspector from './AnimationInspector.vue'
import { useAnimationStore } from '../../stores/animationStore'
import { useHistoryStore } from '../../stores/historyStore'

let app: App | undefined
let pinia: Pinia
let host: HTMLDivElement
afterEach(() => { app?.unmount(); disposePinia(pinia); host?.remove() })
async function mount() {
  pinia = createPinia()
  setActivePinia(pinia)
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(AnimationInspector).use(pinia)
  app.mount(host)
  await nextTick()
  return useAnimationStore()
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  expect(button, label).toBeTruthy()
  button!.click()
  await nextTick()
}
describe('animation workspace', () => {
  it('records typed bone poses and restores pose and keys together on undo', async () => {
    const animation = await mount()
    const bone = animation.addRootBone('Hip')
    animation.selectBone(bone.id)
    await nextTick()
    const input = host.querySelector<HTMLInputElement>('[aria-label="Rotation X"]')!
    input.value = '35'
    input.dispatchEvent(new Event('change'))
    await nextTick()
    expect(animation.selectedBone?.rotation.x).toBe(35)
    expect(animation.activeClip.tracks.find(t => t.targetId === bone.id)?.rotationKeys[0].value.x).toBe(35)
    useHistoryStore().undo()
    expect(animation.selectedBone?.rotation.x).toBe(0)
    expect(animation.activeClip.tracks.find(t => t.targetId === bone.id)?.rotationKeys.length || 0).toBe(0)
  })
  it('keeps manual poses unkeyed and rejects invalid values', async () => {
    const animation = await mount()
    const bone = animation.addRootBone('Hip')
    animation.autoKey = false
    animation.setBonePoseValue(bone.id, 'scale', 'x', 2)
    animation.setBonePoseValue(bone.id, 'scale', 'x', NaN)
    expect(bone.scale.x).toBe(2)
    expect(animation.activeClip.tracks).toHaveLength(0)
  })
  it('deletes only the target key and offers advanced pose tools', async () => {
    const animation = await mount()
    const first = animation.addRootBone('Hip')
    const second = animation.addRootBone('Hand')
    animation.setBonePoseValue(first.id, 'rotation', 'x', 10)
    animation.setBonePoseValue(second.id, 'rotation', 'x', 20)
    animation.selectBone(first.id)
    await nextTick()
    await click('Delete target key')
    expect(animation.activeClip.tracks.find(t => t.targetId === second.id)?.rotationKeys).toHaveLength(1)
    expect(host.querySelector('[aria-label="Scale X"]')).toBeNull()
    await click('Advanced')
    expect(host.querySelector('[aria-label="Scale X"]')).not.toBeNull()
  })
  it('creates clips with the chosen timing and loop setting', async () => {
    const animation = await mount()
    const duration = host.querySelector<HTMLInputElement>('[aria-label="New clip duration"]')!
    duration.value = '2'
    duration.dispatchEvent(new Event('input'))
    await click('New')
    expect(animation.activeClip.durationFrames).toBe(60)
    expect(animation.activeClip.fps).toBe(30)
    expect(animation.activeClip.loop).toBe(true)
  })
})
