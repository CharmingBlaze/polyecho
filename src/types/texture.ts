export interface Palette {
  id: string
  name: string
  colors: string[]
}

export interface TextureMap {
  id: string
  name: string
  width: number
  height: number
  dataUrl: string
}

export interface Material {
  id: string
  name: string
  textureId: string | null
  color: string
  shading: 'unlit' | 'gouraud' | 'flat' | 'textured' | 'psx'
  psxJitter: boolean
  psxJitterResolution: number // e.g. 240 or 120
  psxAffine: boolean
  dither: boolean
  ditherLevel: number
  wireframe: boolean
}
