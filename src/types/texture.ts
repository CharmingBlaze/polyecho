export interface Palette {
  id: string
  name: string
  category?: string
  isCustom?: boolean
  colors: string[]
}

export type LayerBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'additive'

export interface TextureLayer {
  id: string
  name: string
  visible: boolean
  opacity: number // 0.0 to 1.0
  blendMode: LayerBlendMode
  data?: Uint8ClampedArray
}

/** How to bind a texture onto a mesh that may share its material. */
export type TextureApplyPolicy =
  | 'this_object'      // fork the material if other meshes share it
  | 'shared_material'  // write Material.textureId; every mesh on that material updates

/** Regular sprite-sheet grid on a library image. Row 0 is the top of the image. */
export interface AtlasGrid {
  cols: number
  rows: number
}

export interface TextureMap {
  id: string
  name: string
  width: number
  height: number
  dataUrl?: string
  pixelBuffer?: any
  layers?: TextureLayer[]
  activeLayerId?: string
  /** When set, UV/Paint treat this image as a cell atlas. */
  atlas?: AtlasGrid
}

export type ShadingModel = 'pbr' | 'unlit' | 'gouraud' | 'flat' | 'textured' | 'psx' | 'saturn' | 'dreamcast' | 'n64' | 'solid' | 'wireframe'

export interface Material {
  id: string
  name: string
  textureId: string | null
  color: string
  shading: ShadingModel
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
  // PlayStation (PS1 / PSX)
  psxJitter: boolean
  psxJitterResolution: number // e.g. 240 or 120
  psxAffine: boolean
  // Sega Saturn (VDP1 / VDP2)
  saturnMeshAlpha?: boolean // VDP1 checkerboard mesh transparency & shadow dropouts
  saturnGouraud?: boolean
  // Sega Dreamcast (PowerVR CLX2)
  dreamcastVQ?: boolean // Vector Quantization texture compression look
  dreamcastSpecular?: boolean // Arcade specular shine
  dreamcastVGA?: boolean // 480p VGA CRT crisp arcade look
  dreamcastCelOutline?: boolean // Jet Set Radio style ink outline
  // Dithering Suite
  dither: boolean
  ditherLevel: number
  ditherPattern?: 'bayer4x4' | 'bayer8x8' | 'bayer2x2' | 'bayer16x16' | 'bluenoise' | 'halftone' | 'crosshatch' | 'horizontal_lines' | 'vertical_lines' | 'ordered' | 'noise' | 'checker'
  ditherScale?: number
  ditherSpace?: 'screen' | 'uv' | 'world'
  ditherChannel?: 'luma' | 'rgb' | 'alpha'
  ditherContrast?: number
  colorDepth?: number
  wireframe: boolean
  opacity?: number
  alphaTest?: number
  blendMode?: 'opaque' | 'mask' | 'blend' | 'additive'
  doubleSided?: boolean
  clearcoat?: number
  sheen?: number
  specularIntensity?: number
  specularColor?: string
}

