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
  pixelBuffer?: any
}

export interface Material {
  id: string
  name: string
  textureId: string | null
  color: string
  shading: 'unlit' | 'gouraud' | 'flat' | 'textured' | 'psx' | 'solid' | 'wireframe'
  roughness?: number
  metalness?: number
  psxJitter: boolean
  psxJitterResolution: number // e.g. 240 or 120
  psxAffine: boolean
  dither: boolean
  ditherLevel: number
  wireframe: boolean
}

