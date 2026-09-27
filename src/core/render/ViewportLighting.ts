import * as THREE from 'three'

/** Editor viewport rig. Not part of the document; stored with preferences. */
export interface ViewportLightingSettings {
  keyIntensity: number
  keyColor: string
  fillIntensity: number
  fillColor: string
  ambientIntensity: number
  skyColor: string
  groundColor: string
  /** Contact-shadow opacity on the ground plane. */
  shadowStrength: number
}

/**
 * Dreamcast-style arcade sun: high and slightly off-axis so the top faces
 * stay bright and one side still turns. Fill comes from the opposite sky.
 */
export const VIEWPORT_KEY_LIGHT_POSITION = new THREE.Vector3(-5, 18, 7)
export const VIEWPORT_FILL_LIGHT_POSITION = new THREE.Vector3(11, 12, -9)

export const DEFAULT_VIEWPORT_LIGHTING: ViewportLightingSettings = {
  keyIntensity: 1.65,
  keyColor: '#ffe7c2',
  fillIntensity: 0.9,
  fillColor: '#7ec8ff',
  ambientIntensity: 1.5,
  skyColor: '#b7e4ff',
  groundColor: '#d2c0a4',
  shadowStrength: 0.2,
}

const HEX = /^#[0-9a-fA-F]{6}$/

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function clampHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value : fallback
}

export function sanitizeViewportLighting(raw: unknown): ViewportLightingSettings {
  const src = raw && typeof raw === 'object' ? raw as Partial<ViewportLightingSettings> : {}
  const d = DEFAULT_VIEWPORT_LIGHTING
  return {
    keyIntensity: clampNumber(src.keyIntensity, d.keyIntensity, 0, 4),
    keyColor: clampHex(src.keyColor, d.keyColor),
    fillIntensity: clampNumber(src.fillIntensity, d.fillIntensity, 0, 4),
    fillColor: clampHex(src.fillColor, d.fillColor),
    ambientIntensity: clampNumber(src.ambientIntensity, d.ambientIntensity, 0, 4),
    skyColor: clampHex(src.skyColor, d.skyColor),
    groundColor: clampHex(src.groundColor, d.groundColor),
    shadowStrength: clampNumber(src.shadowStrength, d.shadowStrength, 0, 1),
  }
}

/** PSX / Saturn / Dreamcast / N64 shader does not read scene lights. */
export interface PsxLightingUniforms {
  ambient: THREE.Color
  keyColor: THREE.Color
  keyIntensity: number
}

export function psxLightingFromSettings(settings: ViewportLightingSettings): PsxLightingUniforms {
  const s = sanitizeViewportLighting(settings)
  const d = DEFAULT_VIEWPORT_LIGHTING
  const sky = new THREE.Color(s.skyColor)
  const ground = new THREE.Color(s.groundColor)
  const ambientScale = s.ambientIntensity / d.ambientIntensity
  // Open shade stays bright and picks up more sky than ground, like a PowerVR arcade scene.
  const ambient = sky.clone().lerp(ground, 0.35).multiplyScalar(0.62 * ambientScale)
  return {
    ambient,
    keyColor: new THREE.Color(s.keyColor),
    keyIntensity: (s.keyIntensity / d.keyIntensity) * 0.95,
  }
}

export function applyPsxLightingUniforms(
  uniforms: { [key: string]: THREE.IUniform },
  settings: ViewportLightingSettings,
): void {
  const lit = psxLightingFromSettings(settings)
  if (uniforms.uAmbientLight) uniforms.uAmbientLight.value = lit.ambient
  if (uniforms.uLightColor) uniforms.uLightColor.value = lit.keyColor
  if (uniforms.uKeyIntensity) uniforms.uKeyIntensity.value = lit.keyIntensity
  if (uniforms.uLightDirection) {
    uniforms.uLightDirection.value = VIEWPORT_KEY_LIGHT_POSITION.clone().normalize()
  }
}
