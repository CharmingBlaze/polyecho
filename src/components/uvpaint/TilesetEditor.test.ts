import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import TilesetEditor from './TilesetEditor.vue'
import { useProjectStore } from '../../stores/projectStore'
import { clearTilesetSession } from '../../composables/useTilesetWindow'

let app: App, pinia: Pinia, host: HTMLDivElement
afterEach(() => { app?.unmount(); if (pinia) disposePinia(pinia); host?.remove(); clearTilesetSession() })
async function setup() {
  clearTilesetSession()
  pinia = createPinia(); setActivePinia(pinia)
  const project = useProjectStore()
  const texture = project.createTexture('Test atlas', 16, 16, undefined, undefined, { record: false, atlas: { cols: 2, rows: 2 } })
  texture.pixelBuffer.clear('#123456')
  const base = texture.pixelBuffer.activeLayer!
  texture.pixelBuffer.addLayer('Tile details')
  texture.pixelBuffer.setPixel(12, 12, '#ff0000')
  host = document.createElement('div'); document.body.appendChild(host)
  app = createApp(TilesetEditor, { imageId: texture.id }).use(pinia); app.mount(host); await nextTick(); await nextTick()
  return { project, texture, base }
}
async function click(text: string) {
  const el = [...document.querySelectorAll<HTMLButtonElement>('.tileset-dialog button')].find(b => b.textContent?.trim() === text)
  expect(el, text).toBeTruthy(); el!.click(); await nextTick()
}
describe('Tileset draft workflow', () => {
  it('selects a custom square on the whole atlas and saves only that region', async () => {
    const { texture } = await setup()
    await click('square')
    const surface = document.querySelector<HTMLElement>('[aria-label="Full atlas selection surface"]')!
    surface.setPointerCapture = vi.fn()
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 16, height: 16 }) as DOMRect
    surface.dispatchEvent(new MouseEvent('pointerdown', { clientX: 2, clientY: 3, button: 0, bubbles: true }))
    surface.dispatchEvent(new MouseEvent('pointermove', { clientX: 5, clientY: 8, bubbles: true }))
    surface.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('.tile-title')?.textContent).toContain('4 × 4')
    await click('Fill tile with color'); await click('Save tile to atlas')
    expect(texture.pixelBuffer.getPixelHex(2, 3)).toBe('#ffffff')
    expect(texture.pixelBuffer.getPixelHex(5, 6)).toBe('#ffffff')
    expect(texture.pixelBuffer.getPixelHex(6, 6)).toBe('#123456')
  })
  it('does not capture modeling shortcuts outside the floating panel', async () => {
    await setup()
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(document.querySelector('.tileset-dialog')?.getAttribute('aria-modal')).toBe('false')
  })
  it('preserves outside paint changes instead of overwriting them with a stale draft', async () => {
    const { texture } = await setup()
    await click('Fill tile with color')
    texture.pixelBuffer.setPixel(0, 0, '#11ff00')
    await click('Save tile to atlas')
    expect(texture.pixelBuffer.getPixelHex(0, 0)).toBe('#11ff00')
    expect(document.querySelector('[role="status"]')?.textContent).toContain('changed outside')
  })
  it('keeps draft pixels private until save and preserves neighboring tiles and lower layers', async () => {
    const { texture, base } = await setup()
    await click('Fill tile with color')
    expect(texture.pixelBuffer.getPixelHex(0, 0)).toBe('#123456')
    await click('Save tile to atlas')
    expect(texture.pixelBuffer.getPixelHex(0, 0)).toBe('#ffffff')
    expect(texture.pixelBuffer.getPixelHex(12, 12)).toBe('#ff0000')
    expect([...base.ctx.getImageData(0, 0, 1, 1).data]).toEqual([18, 52, 86, 255])
  })
  it('auto-saves the draft when switching tiles so the first tile keeps its pixels', async () => {
    const { texture } = await setup()
    await click('Fill tile with color')
    document.querySelector<HTMLButtonElement>('[aria-label="Select tile 2"]')!.click(); await nextTick()
    expect(document.querySelector('[aria-label="Select tile 2"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(texture.pixelBuffer.getPixelHex(0, 0)).toBe('#ffffff')
    expect(texture.pixelBuffer.getPixelHex(12, 12)).toBe('#ff0000')
  })
  it('switches the working atlas from the image list', async () => {
    const { project, texture } = await setup()
    project.createTexture('Other atlas', 16, 16, undefined, undefined, { record: false, atlas: { cols: 2, rows: 2 } })
    await nextTick()
    const picker = document.querySelector<HTMLSelectElement>('[aria-label="Tileset image"]')!
    const next = project.textures.find(item => item.name === 'Other atlas')!
    picker.value = next.id
    picker.dispatchEvent(new Event('change'))
    await nextTick()
    expect(picker.value).toBe(next.id)
    expect(document.querySelector('.tileset-dialog header span')?.textContent).toContain('Other atlas')
    expect(texture.id).not.toBe(next.id)
  })
  it('extracts an image without changing the active atlas or material assignment', async () => {
    const { project, texture } = await setup()
    const before = project.materials.map(m => m.textureId)
    await click('Create image from this tile')
    expect(project.activeTextureId).toBe(texture.id)
    expect(project.textures.at(-1)?.width).toBe(8)
    expect(project.materials.map(m => m.textureId)).toEqual(before)
  })
  it('shows a large leftover 2×2 sheet as one atlas with a 16px tile picker', async () => {
    pinia = createPinia(); setActivePinia(pinia)
    const project = useProjectStore()
    const texture = project.createTexture('Terrain', 256, 256, undefined, undefined, { record: false, atlas: { cols: 2, rows: 2 } })
    host = document.createElement('div'); document.body.appendChild(host)
    app = createApp(TilesetEditor, { imageId: texture.id }).use(pinia); app.mount(host)
    await nextTick(); await nextTick()
    expect(document.querySelector('.tile-grid')).toBeNull()
    expect(document.querySelector('[aria-label="Atlas tile picker"]')).toBeTruthy()
    expect(document.querySelector('.picker-meta')?.textContent).toContain('16×16 tiles')
    expect(document.querySelector('.picker-meta')?.textContent).toContain('16×16 px')
    expect(texture.atlas).toEqual({ cols: 16, rows: 16 })
    document.querySelector<HTMLButtonElement>('[aria-label="32 px tiles"]')!.click()
    await nextTick(); await nextTick()
    expect(texture.atlas).toEqual({ cols: 8, rows: 8 })
    expect(document.querySelector('.picker-meta')?.textContent).toContain('32×32 px')
    const width = document.querySelector<HTMLInputElement>('[aria-label="Tile width in pixels"]')!
    width.value = '64'
    width.dispatchEvent(new Event('change'))
    await nextTick(); await nextTick()
    expect(texture.atlas).toEqual({ cols: 4, rows: 4 })
  })
})
