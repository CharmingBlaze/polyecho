import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, watch, type App } from 'vue'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import TextureProps from './TextureProps.vue'
import { useProjectStore } from '../../stores/projectStore'
import { useToolStore } from '../../stores/toolStore'

let app: App | undefined
let pinia: Pinia | undefined
let host: HTMLDivElement
afterEach(() => { app?.unmount(); if (pinia) disposePinia(pinia); host?.remove(); vi.restoreAllMocks() })

async function mountInspector() {
  pinia = createPinia()
  setActivePinia(pinia)
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(TextureProps).use(pinia)
  app.mount(host)
  await nextTick()
  return useProjectStore()
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  expect(button, label).toBeTruthy()
  button!.click()
  await nextTick()
}

describe('Texture inspector workflow', () => {
  it('opens the chosen image even when workspace entry follows the selected object', async () => {
    const project = await mountInspector()
    const tool = useToolStore()
    tool.setAppMode('model')
    const alternate = project.createTexture('Paint this image', 32, 32, undefined, undefined, { record: false })
    const stop = watch(() => tool.appMode, mode => {
      if (mode === 'uvpaint') project.syncPaintTargetFromMesh()
    })
    try {
      await click('Open Paint')
      await nextTick()
      expect(tool.appMode).toBe('uvpaint')
      expect(tool.uvWorkspaceTab).toBe('paint')
      expect(project.activeTextureId).toBe(alternate.id)
    } finally { stop() }
  })
  it('browses images without rebinding the selected object, then applies explicitly', async () => {
    const project = await mountInspector()
    useToolStore().setAppMode('uvpaint')
    const alternate = project.createTexture('Alternate', 32, 32, undefined, undefined, { record: false, select: false })
    const apply = vi.spyOn(project, 'applyTextureToMesh')
    const material = project.materials.find(m => m.id === project.activeMesh?.materialId)!
    const original = material.textureId
    await click('Library')
    const row = [...host.querySelectorAll<HTMLButtonElement>('.texture-library-row')].find(b => b.textContent?.includes('Alternate'))!
    row.click()
    await nextTick()
    expect(project.activeTextureId).toBe(alternate.id)
    expect(material.textureId).toBe(original)
    expect(apply).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Not using this image')
    await click('Apply to selected object')
    expect(apply).toHaveBeenCalled()
    expect(project.materials.find(m => m.id === project.activeMesh?.materialId)?.textureId).toBe(alternate.id)
  })
  it('exposes add, replace, and delete on the image tab', async () => {
    await mountInspector()
    expect([...host.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(expect.arrayContaining(['New', 'Import', 'Replace', 'Delete', 'Open Paint']))
  })
  it('applies a newly created image to the selected object', async () => {
    const project = await mountInspector()
    const before = project.materials.find(m => m.id === project.activeMesh?.materialId)?.textureId
    await click('New')
    const create = [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith('Create'))
    expect(create).toBeTruthy()
    create!.click()
    await nextTick()
    const applied = project.materials.find(m => m.id === project.activeMesh?.materialId)?.textureId
    expect(applied).toBe(project.activeTextureId)
    expect(applied).not.toBe(before)
    expect(project.textures.find(t => t.id === applied)?.name).toMatch(/^Texture_/)
  })
  it('keeps atlas and scene-wide actions out of the everyday image tab', async () => {
    await mountInspector()
    expect(host.textContent).toContain('Image settings')
    expect(host.textContent).not.toContain('Combine scene textures')
    expect(host.querySelector('[aria-label="Texture layers"]')).toBeNull()
    await click('Advanced')
    expect(host.textContent).toContain('Texture atlas')
    expect(host.querySelectorAll('details[open]')).toHaveLength(0)
  })
})
