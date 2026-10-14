export const UV_RULER_SIZE = 18

export type UvRulerTick = {
  pos: number
  uv: number
  label: string | null
  major: boolean
}

const NICE_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1]

export function niceUvStep(span: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1
  const target = span / 8
  const found = NICE_STEPS.find(step => step >= target)
  if (found) return found
  return Math.ceil(target)
}

export function formatUvTick(uv: number, step: number): string {
  if (Math.abs(uv) < 1e-8) return '0'
  if (Math.abs(uv - 1) < 1e-8) return '1'
  if (step >= 0.1) return uv.toFixed(1).replace(/\.0$/, '')
  if (step >= 0.01) return uv.toFixed(2).replace(/0$/, '').replace(/\.$/, '')
  return uv.toFixed(3)
}

/** Ticks from `uvAtScreen0` at `screen0` to `uvAtScreen1` at `screen1`. */
export function uvMappedTicks(
  screen0: number,
  screen1: number,
  uvAtScreen0: number,
  uvAtScreen1: number
): UvRulerTick[] {
  const spanScreen = screen1 - screen0
  const spanUv = uvAtScreen1 - uvAtScreen0
  if (Math.abs(spanScreen) < 1e-6 || Math.abs(spanUv) < 1e-10) return []

  const lo = Math.min(uvAtScreen0, uvAtScreen1)
  const hi = Math.max(uvAtScreen0, uvAtScreen1)
  const step = niceUvStep(hi - lo)
  const first = Math.ceil((lo - 1e-9) / step) * step
  const ticks: UvRulerTick[] = []

  for (let uv = first; uv <= hi + 1e-9; uv += step) {
    const t = (uv - uvAtScreen0) / spanUv
    const pos = screen0 + t * spanScreen
    const snapped = Math.abs(uv) < 1e-8 ? 0 : Math.abs(uv - 1) < 1e-8 ? 1 : Number(uv.toFixed(6))
    const major = step >= 0.25 || Math.abs(snapped % 0.25) < 1e-6 || snapped === 0 || snapped === 1
    ticks.push({
      pos,
      uv: snapped,
      label: major ? formatUvTick(snapped, step) : null,
      major,
    })
  }
  return ticks
}

export function drawUvRulers(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    originX: number
    originY: number
    texW: number
    texH: number
    cursor?: { x: number; y: number; u: number; v: number } | null
  }
) {
  const { width, height, originX, originY, texW, texH, cursor } = opts
  if (width < 40 || height < 40) return

  const uTicks = uvMappedTicks(originX, originX + texW, 0, 1)
  const vTicks = uvMappedTicks(originY, originY + texH, 1, 0)

  ctx.save()
  ctx.fillStyle = 'rgba(11, 13, 18, 0.92)'
  ctx.fillRect(0, 0, width, UV_RULER_SIZE)
  ctx.fillRect(0, 0, UV_RULER_SIZE, height)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.beginPath()
  ctx.moveTo(0, UV_RULER_SIZE + 0.5)
  ctx.lineTo(width, UV_RULER_SIZE + 0.5)
  ctx.moveTo(UV_RULER_SIZE + 0.5, 0)
  ctx.lineTo(UV_RULER_SIZE + 0.5, height)
  ctx.stroke()

  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)'

  for (const tick of uTicks) {
    if (tick.pos < UV_RULER_SIZE || tick.pos > width) continue
    const len = tick.major ? 7 : 4
    ctx.strokeStyle = tick.major ? 'rgba(226, 232, 240, 0.55)' : 'rgba(226, 232, 240, 0.28)'
    ctx.beginPath()
    ctx.moveTo(tick.pos + 0.5, UV_RULER_SIZE)
    ctx.lineTo(tick.pos + 0.5, UV_RULER_SIZE - len)
    ctx.stroke()
    if (tick.label) {
      ctx.textAlign = 'center'
      ctx.fillText(tick.label, tick.pos, 6)
    }
  }

  for (const tick of vTicks) {
    if (tick.pos < UV_RULER_SIZE || tick.pos > height) continue
    const len = tick.major ? 7 : 4
    ctx.strokeStyle = tick.major ? 'rgba(226, 232, 240, 0.55)' : 'rgba(226, 232, 240, 0.28)'
    ctx.beginPath()
    ctx.moveTo(UV_RULER_SIZE, tick.pos + 0.5)
    ctx.lineTo(UV_RULER_SIZE - len, tick.pos + 0.5)
    ctx.stroke()
    if (tick.label) {
      ctx.save()
      ctx.translate(7, tick.pos)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.fillText(tick.label, 0, 0)
      ctx.restore()
    }
  }

  ctx.fillStyle = 'rgba(11, 13, 18, 0.92)'
  ctx.fillRect(0, 0, UV_RULER_SIZE, UV_RULER_SIZE)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'
  ctx.textAlign = 'center'
  ctx.fillText('UV', UV_RULER_SIZE / 2, UV_RULER_SIZE / 2)

  const midU = originX + texW * 0.5
  const midV = originY + texH * 0.5
  ctx.setLineDash([3, 4])
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.35)'
  ctx.beginPath()
  ctx.moveTo(midU + 0.5, UV_RULER_SIZE)
  ctx.lineTo(midU + 0.5, height)
  ctx.moveTo(UV_RULER_SIZE, midV + 0.5)
  ctx.lineTo(width, midV + 0.5)
  ctx.stroke()
  ctx.setLineDash([])

  if (cursor) {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.55)'
    ctx.beginPath()
    ctx.moveTo(cursor.x + 0.5, UV_RULER_SIZE)
    ctx.lineTo(cursor.x + 0.5, height)
    ctx.moveTo(UV_RULER_SIZE, cursor.y + 0.5)
    ctx.lineTo(width, cursor.y + 0.5)
    ctx.stroke()
    ctx.fillStyle = 'rgba(251, 191, 36, 0.95)'
    ctx.textAlign = 'left'
    ctx.fillText(`${cursor.u.toFixed(3)}`, Math.min(width - 44, Math.max(UV_RULER_SIZE + 4, cursor.x + 4)), 6)
    ctx.textAlign = 'right'
    ctx.fillText(`${cursor.v.toFixed(3)}`, 16, Math.min(height - 4, Math.max(UV_RULER_SIZE + 8, cursor.y)))
  }

  ctx.restore()
}
