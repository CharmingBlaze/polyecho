const GLB_MAGIC = 0x46546C67
const JSON_CHUNK = 0x4E4F534A
const BIN_CHUNK = 0x004E4942

export function readGlb(buffer: ArrayBuffer): { json: Record<string, unknown>; bin: ArrayBuffer | null } {
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Not a GLB file.')
  }
  const jsonLength = view.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength))) as Record<string, unknown>
  const next = 20 + jsonLength
  if (next + 8 > buffer.byteLength) return { json, bin: null }
  const binLength = view.getUint32(next, true)
  const binType = view.getUint32(next + 4, true)
  if (binType !== BIN_CHUNK) return { json, bin: null }
  return { json, bin: buffer.slice(next + 8, next + 8 + binLength) }
}

export function writeGlb(json: unknown, bin: ArrayBuffer | null): ArrayBuffer {
  const jsonBytes = padChunk(new TextEncoder().encode(JSON.stringify(json)), 0x20)
  const binBytes = bin ? padChunk(new Uint8Array(bin), 0) : null
  const total = 12 + 8 + jsonBytes.length + (binBytes ? 8 + binBytes.length : 0)
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonBytes.length, true)
  view.setUint32(16, JSON_CHUNK, true)
  bytes.set(jsonBytes, 20)
  if (binBytes) {
    const offset = 20 + jsonBytes.length
    view.setUint32(offset, binBytes.length, true)
    view.setUint32(offset + 4, BIN_CHUNK, true)
    bytes.set(binBytes, offset + 8)
  }
  return out
}

type BufferView = { buffer?: number; byteOffset?: number; byteLength: number }

export function embedPngImages(buffer: ArrayBuffer, pngs: Uint8Array[]): ArrayBuffer {
  if (pngs.length === 0) return buffer
  const { json, bin } = readGlb(buffer)
  const binBytes = bin ? new Uint8Array(bin) : new Uint8Array(0)
  const views = Array.isArray(json.bufferViews) ? [...(json.bufferViews as BufferView[])] : []
  const pieces: Uint8Array[] = views.map((view) => {
    const offset = view.byteOffset || 0
    return binBytes.slice(offset, offset + view.byteLength)
  })

  const images = (Array.isArray(json.images) ? json.images : []) as Array<{
    bufferView?: number
    mimeType?: string
    uri?: string
  }>
  json.images = images

  if (images.length === 0) {
    for (const png of pngs) {
      pieces.push(png)
      images.push({ mimeType: 'image/png', bufferView: pieces.length - 1 })
    }
    const textures = (Array.isArray(json.textures) ? json.textures : []) as Array<{
      sampler?: number
      source?: number
    }>
    json.textures = textures
    if (!Array.isArray(json.samplers) || (json.samplers as unknown[]).length === 0) {
      json.samplers = [{ magFilter: 9728, minFilter: 9728, wrapS: 10497, wrapT: 10497 }]
    }
    const start = textures.length
    for (let i = 0; i < pngs.length; i++) {
      textures.push({ sampler: 0, source: start + i })
    }
    const materials = (Array.isArray(json.materials) ? json.materials : []) as Array<Record<string, unknown>>
    for (let i = 0; i < materials.length && i < pngs.length; i++) {
      const pbr = (typeof materials[i].pbrMetallicRoughness === 'object' && materials[i].pbrMetallicRoughness
        ? materials[i].pbrMetallicRoughness
        : {}) as Record<string, unknown>
      pbr.baseColorTexture = { index: start + i }
      materials[i].pbrMetallicRoughness = pbr
    }
  } else {
    for (let i = 0; i < images.length && i < pngs.length; i++) {
      const img = images[i]
      if (typeof img.bufferView === 'number' && pieces[img.bufferView]) {
        pieces[img.bufferView] = pngs[i]
      } else {
        pieces.push(pngs[i])
        img.bufferView = pieces.length - 1
      }
      img.mimeType = 'image/png'
      delete img.uri
    }
  }

  let offset = 0
  const packed: Uint8Array[] = []
  json.bufferViews = pieces.map((piece) => {
    const pad = (4 - (piece.length % 4)) % 4
    const view = { buffer: 0, byteOffset: offset, byteLength: piece.length }
    const chunk = new Uint8Array(piece.length + pad)
    chunk.set(piece)
    packed.push(chunk)
    offset += chunk.length
    return view
  })
  const outBin = new Uint8Array(offset)
  let writeAt = 0
  for (const chunk of packed) {
    outBin.set(chunk, writeAt)
    writeAt += chunk.length
  }
  json.buffers = [{ byteLength: outBin.byteLength }]
  return writeGlb(json, outBin.buffer)
}

export function injectClipExtras(
  buffer: ArrayBuffer,
  extrasByClipName: Record<string, Record<string, unknown>>
): ArrayBuffer {
  const { json, bin } = readGlb(buffer)
  const animations = json.animations
  if (!Array.isArray(animations)) return buffer
  for (const anim of animations) {
    if (!anim || typeof anim !== 'object') continue
    const rec = anim as Record<string, unknown>
    const name = typeof rec.name === 'string' ? rec.name : ''
    const extra = extrasByClipName[name]
    if (!extra) continue
    rec.extras = { ...(typeof rec.extras === 'object' && rec.extras ? rec.extras as object : {}), ...extra }
  }
  return writeGlb(json, bin)
}

function padChunk(data: Uint8Array, fill: number): Uint8Array {
  const pad = (4 - (data.length % 4)) % 4
  if (pad === 0) return data
  const out = new Uint8Array(data.length + pad)
  out.set(data)
  out.fill(fill, data.length)
  return out
}
