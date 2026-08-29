import { PixelBuffer } from './PixelCanvas'

/**
 * Generates an authentic retro 64x64 PSX game texture atlas with 4 distinct materials:
 * 1. Top-Left (0..31, 0..31): Medieval Dungeon Stone Bricks with mortar and bevels
 * 2. Top-Right (32..63, 0..31): Weathered Wood Planks with iron corner rivets
 * 3. Bottom-Left (0..31, 32..63): Heavy Industrial Metal Plate with hazard stripes & vents
 * 4. Bottom-Right (32..63, 32..63): Gold / Cyber Glow Tech Circuit with neon core
 */
export function generateRetroAtlas(pb: PixelBuffer) {
  pb.clear('#181a20')

  // --- 1. Top-Left: Dungeon Stone Bricks (0, 0 to 32, 32) ---
  const stoneBase = '#4b5563'
  const stoneLight = '#6b7280'
  const stoneDark = '#374151'
  const mortar = '#1f2937'

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const noise = ((x * 13 + y * 19) % 7) > 3
      pb.setPixel(x, y, noise ? stoneLight : stoneBase)
    }
  }

  // Brick horizontal mortar lines
  for (let y = 0; y < 32; y += 8) {
    for (let x = 0; x < 32; x++) {
      pb.setPixel(x, y, mortar)
      if (y + 1 < 32) pb.setPixel(x, y + 1, stoneDark)
    }
  }

  // Brick vertical mortar lines (staggered)
  for (let row = 0; row < 4; row++) {
    const yStart = row * 8
    const offset = row % 2 === 0 ? 0 : 8
    for (let x = offset; x < 32; x += 16) {
      for (let y = yStart; y < yStart + 8 && y < 32; y++) {
        pb.setPixel(x, y, mortar)
        if (x + 1 < 32) pb.setPixel(x + 1, y, stoneLight)
      }
    }
  }

  // --- 2. Top-Right: Weathered Wood Planks (32, 0 to 64, 32) ---
  const woodLight = '#92400e'
  const woodMid = '#78350f'
  const woodDark = '#451a03'
  const woodHighlight = '#b45309'
  const ironRivet = '#94a3b8'

  for (let y = 0; y < 32; y++) {
    for (let x = 32; x < 64; x++) {
      const grain = ((x * 7 + y * 3) % 5) === 0
      pb.setPixel(x, y, grain ? woodHighlight : woodMid)
    }
  }

  // Horizontal plank gaps
  for (let y = 0; y < 32; y += 8) {
    for (let x = 32; x < 64; x++) {
      pb.setPixel(x, y, woodDark)
      if (y + 1 < 32) pb.setPixel(x, y + 1, woodLight)
    }
  }

  // Corner Iron Rivets
  const rivets = [
    [34, 2], [61, 2], [34, 9], [61, 9],
    [34, 18], [61, 18], [34, 26], [61, 26]
  ]
  for (const [rx, ry] of rivets) {
    pb.setPixel(rx, ry, ironRivet)
    pb.setPixel(rx + 1, ry, '#cbd5e1')
    pb.setPixel(rx, ry + 1, '#334155')
  }

  // --- 3. Bottom-Left: Industrial Metal Plate / Hazard (0, 32 to 32, 64) ---
  const metalLight = '#64748b'
  const metalDark = '#0f172a'
  const yellowHazard = '#eab308'
  const darkHazard = '#1e293b'

  for (let y = 32; y < 64; y++) {
    for (let x = 0; x < 32; x++) {
      const isBorder = x === 0 || x === 31 || y === 32 || y === 63
      const isInnerBorder = x === 1 || x === 30 || y === 33 || y === 62
      if (isBorder) {
        pb.setPixel(x, y, metalDark)
      } else if (isInnerBorder) {
        pb.setPixel(x, y, metalLight)
      } else {
        const stripe = ((x + y) % 8) < 4
        pb.setPixel(x, y, stripe ? yellowHazard : darkHazard)
      }
    }
  }

  // Center Metal Vent Box
  for (let y = 40; y < 56; y++) {
    for (let x = 8; x < 24; x++) {
      const isVentLine = y % 2 === 0
      pb.setPixel(x, y, isVentLine ? metalDark : metalLight)
    }
  }

  // --- 4. Bottom-Right: Sci-Fi Neon Tech Core (32, 32 to 64, 64) ---
  const techBase = '#0f172a'
  const techPanel = '#1e1b4b'
  const cyanGlow = '#38bdf8'
  const neonCore = '#a855f7'
  const brightWhite = '#ffffff'

  for (let y = 32; y < 64; y++) {
    for (let x = 32; x < 64; x++) {
      pb.setPixel(x, y, techBase)
    }
  }

  // Outer Tech Frame
  for (let y = 34; y < 62; y++) {
    for (let x = 34; x < 62; x++) {
      pb.setPixel(x, y, techPanel)
    }
  }

  // Glowing Diamond Core
  const cx = 48
  const cy = 48
  for (let y = 36; y < 60; y++) {
    for (let x = 36; x < 60; x++) {
      const dist = Math.abs(x - cx) + Math.abs(y - cy)
      if (dist === 8 || dist === 7) {
        pb.setPixel(x, y, cyanGlow)
      } else if (dist <= 6 && dist >= 3) {
        pb.setPixel(x, y, neonCore)
      } else if (dist < 3) {
        pb.setPixel(x, y, brightWhite)
      }
    }
  }

  // Corner tech circuit traces
  pb.drawLine(34, 34, 40, 34, cyanGlow, 1)
  pb.drawLine(34, 34, 34, 40, cyanGlow, 1)
  pb.drawLine(61, 34, 55, 34, cyanGlow, 1)
  pb.drawLine(61, 34, 61, 40, cyanGlow, 1)
  pb.drawLine(34, 61, 40, 61, cyanGlow, 1)
  pb.drawLine(34, 61, 34, 55, cyanGlow, 1)
  pb.drawLine(61, 61, 55, 61, cyanGlow, 1)
  pb.drawLine(61, 61, 61, 55, cyanGlow, 1)
}
