import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rasterizeAppIcon } from './appIconRaster'
import { encodeIcoFromPngs, pngsFromIconSizes, readIcoDirCount } from './encodeIco'
import { encodePngRgba, findPngOffset, readPngIhdr } from '../painting/encodePng'

const SIZES = [16, 32, 48, 256]

describe('app icon', () => {
  it('writes PNG-in-ICO with the favicon crystal mark', () => {
    const master = rasterizeAppIcon(256)
    expect(master.length).toBe(256 * 256 * 4)
    const png256 = encodePngRgba(256, 256, master)
    expect(findPngOffset(png256)).toBe(0)
    expect(readPngIhdr(png256)).toEqual({ width: 256, height: 256 })
    let amber = 0
    for (let i = 0; i < master.length; i += 4) {
      if (master[i] > 200 && master[i + 1] > 130 && master[i + 2] < 80) amber++
    }
    expect(amber).toBeGreaterThan(100)

    const images = pngsFromIconSizes(master, 256, SIZES)
    const ico = encodeIcoFromPngs(images)
    expect(readIcoDirCount(ico)).toBe(SIZES.length)

    const root = process.cwd()
    mkdirSync(resolve(root, 'build'), { recursive: true })
    mkdirSync(resolve(root, 'public'), { recursive: true })
    writeFileSync(resolve(root, 'build', 'icon.png'), png256)
    writeFileSync(resolve(root, 'build', 'icon.ico'), ico)
    writeFileSync(resolve(root, 'public', 'icon.ico'), ico)
  })
})
