import * as THREE from 'three'
import type { Material } from '../../types/texture'

/** Shader pattern ids. Keep in lockstep with `peDitherScalar` and the 2D preview. */
export const DITHER_PATTERN_INDEX: Record<string, number> = {
  bayer4x4: 0,
  bayer8x8: 1,
  ordered: 1,
  bayer2x2: 2,
  bayer16x16: 3,
  bluenoise: 4,
  halftone: 5,
  crosshatch: 6,
  horizontal_lines: 7,
  vertical_lines: 8,
  checker: 9,
  noise: 10,
  snes: 11,
  saturn_mesh: 12,
  dreamcast: 13,
  gba: 14,
  diagonal: 15,
  dots: 16,
  rgb_shift: 17
}

export function ditherPatternIndex(pattern?: string | null): number {
  if (!pattern) return 0
  return DITHER_PATTERN_INDEX[pattern] ?? 0
}

export interface RealtimeDitherSettings {
  enabled: boolean
  pattern: number
  intensity: number
  depth: number
  scale: number
  space: number
  channel: number
}

export function ditherSettingsFromMaterial(
  mat: Material | null | undefined,
  viewportDither = false
): RealtimeDitherSettings {
  const patternName = mat?.ditherPattern || (mat?.shading === 'saturn' ? 'checker' : 'bayer4x4')
  const space = mat?.ditherSpace === 'uv' ? 1 : mat?.ditherSpace === 'world' ? 2 : 0
  const channel = mat?.ditherChannel === 'luma' ? 1 : mat?.ditherChannel === 'alpha' ? 2 : 0
  return {
    enabled: Boolean(mat?.dither || viewportDither),
    pattern: ditherPatternIndex(patternName),
    intensity: typeof mat?.ditherLevel === 'number' ? mat.ditherLevel / 32 : 1,
    depth: typeof mat?.colorDepth === 'number' ? mat.colorDepth : 32,
    scale: typeof mat?.ditherScale === 'number' ? mat.ditherScale : 1,
    space,
    channel
  }
}

/** Ordered-dither library shared by the console shader and the standard-material patch. */
export const DITHER_FUNCTION_GLSL = /* glsl */ `
  float peBayer2x2(vec2 uv) {
    vec2 p = mod(floor(uv), 2.0);
    if (p.y == 0.0) {
      return p.x == 0.0 ? 0.0 / 4.0 : 2.0 / 4.0;
    } else {
      return p.x == 0.0 ? 3.0 / 4.0 : 1.0 / 4.0;
    }
  }

  float peBayer4x4(vec2 uv) {
    vec2 p = mod(floor(uv), 4.0);
    int x = int(p.x);
    int y = int(p.y);
    if (y == 0) {
      if (x == 0) return 0.0 / 16.0;
      if (x == 1) return 8.0 / 16.0;
      if (x == 2) return 2.0 / 16.0;
      return 10.0 / 16.0;
    } else if (y == 1) {
      if (x == 0) return 12.0 / 16.0;
      if (x == 1) return 4.0 / 16.0;
      if (x == 2) return 14.0 / 16.0;
      return 6.0 / 16.0;
    } else if (y == 2) {
      if (x == 0) return 3.0 / 16.0;
      if (x == 1) return 11.0 / 16.0;
      if (x == 2) return 1.0 / 16.0;
      return 9.0 / 16.0;
    } else {
      if (x == 0) return 15.0 / 16.0;
      if (x == 1) return 7.0 / 16.0;
      if (x == 2) return 13.0 / 16.0;
      return 5.0 / 16.0;
    }
  }

  float peBayer8x8(vec2 uv) {
    vec2 p = mod(floor(uv), 8.0);
    float i4 = peBayer4x4(mod(p, 4.0)) * 16.0;
    float i2 = peBayer2x2(floor(p / 4.0)) * 4.0;
    return (4.0 * i4 + i2) / 64.0;
  }

  float peBayer16x16(vec2 uv) {
    vec2 p = mod(floor(uv), 16.0);
    float i8 = peBayer8x8(mod(p, 8.0)) * 64.0;
    float i2 = peBayer2x2(floor(p / 8.0)) * 4.0;
    return (4.0 * i8 + i2) / 256.0;
  }

  float peHalftone4x4(vec2 uv) {
    vec2 p = mod(floor(uv), 4.0);
    int x = int(p.x);
    int y = int(p.y);
    if (y == 0) {
      if (x == 0) return 11.0 / 16.0;
      if (x == 1) return 4.0 / 16.0;
      if (x == 2) return 6.0 / 16.0;
      return 12.0 / 16.0;
    } else if (y == 1) {
      if (x == 0) return 3.0 / 16.0;
      if (x == 1) return 0.0 / 16.0;
      if (x == 2) return 1.0 / 16.0;
      return 7.0 / 16.0;
    } else if (y == 2) {
      if (x == 0) return 9.0 / 16.0;
      if (x == 1) return 2.0 / 16.0;
      if (x == 2) return 5.0 / 16.0;
      return 10.0 / 16.0;
    } else {
      if (x == 0) return 15.0 / 16.0;
      if (x == 1) return 8.0 / 16.0;
      if (x == 2) return 14.0 / 16.0;
      return 13.0 / 16.0;
    }
  }

  float peBlueNoise(vec2 uv) {
    vec2 p = mod(floor(uv), 8.0);
    float n = fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    float b = peBayer8x8(p);
    return mix(b, n, 0.45);
  }

  float peCrosshatch(vec2 uv) {
    vec2 p = floor(uv);
    float l1 = mod(p.x + p.y, 4.0) == 0.0 ? 0.35 : -0.15;
    float l2 = mod(p.x - p.y + 4000.0, 4.0) == 0.0 ? 0.35 : -0.15;
    return (l1 + l2) * 0.5;
  }

  float peHorizontalLines(vec2 uv) {
    return mod(floor(uv.y), 2.0) == 0.0 ? 0.35 : -0.35;
  }

  float peVerticalLines(vec2 uv) {
    return mod(floor(uv.x), 2.0) == 0.0 ? 0.35 : -0.35;
  }

  float peChecker2x2(vec2 uv) {
    vec2 p = mod(floor(uv), 2.0);
    return (p.x == p.y) ? 0.35 : -0.35;
  }

  float peRandomNoise(vec2 uv) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  }

  float peDitherScalar(vec2 uv, int pattern, float scale) {
    vec2 scaledUv = floor(uv / max(scale, 1.0));
    if (pattern == 1) return peBayer8x8(scaledUv) - 0.5;
    if (pattern == 2) return peBayer2x2(scaledUv) - 0.5;
    if (pattern == 3) return peBayer16x16(scaledUv) - 0.5;
    if (pattern == 4) return peBlueNoise(scaledUv) - 0.5;
    if (pattern == 5) return peHalftone4x4(scaledUv) - 0.5;
    if (pattern == 6) return peCrosshatch(scaledUv);
    if (pattern == 7) return peHorizontalLines(scaledUv);
    if (pattern == 8) return peVerticalLines(scaledUv);
    if (pattern == 9) return peChecker2x2(scaledUv);
    if (pattern == 10) return peRandomNoise(scaledUv);
    if (pattern == 11) return peBayer4x4(floor(scaledUv / 2.0)) - 0.5;
    if (pattern == 12) return mod(scaledUv.x + scaledUv.y, 2.0) < 0.5 ? 0.5 : -0.5;
    if (pattern == 13) return mix(peBayer8x8(scaledUv), peBlueNoise(scaledUv), 0.35) - 0.5;
    if (pattern == 14) return peBayer2x2(floor(scaledUv / 2.0)) - 0.5;
    if (pattern == 15) return mod(scaledUv.x + scaledUv.y, 4.0) / 4.0 - 0.5;
    if (pattern == 16) return peHalftone4x4(floor(scaledUv / 2.0)) - 0.5;
    return peBayer4x4(scaledUv) - 0.5;
  }

  vec3 peDitherDelta(vec2 uv, int pattern, float scale, float intensity, float depth) {
    float quant = depth > 0.0 ? depth : 32.0;
    float k = intensity / max(quant, 1.0);
    if (pattern == 17) {
      vec2 scaled = floor(uv / max(scale, 1.0));
      return vec3(
        peBayer4x4(scaled) - 0.5,
        peBayer4x4(scaled + vec2(1.0, 0.0)) - 0.5,
        peBayer4x4(scaled + vec2(0.0, 1.0)) - 0.5
      ) * k;
    }
    return vec3(peDitherScalar(uv, pattern, scale) * k);
  }
`

const DITHER_APPLY_GLSL = /* glsl */ `
  {
    vec2 peCoords = gl_FragCoord.xy;
    if (peDitherSpace == 1) peCoords = vPeUv * 256.0;
    else if (peDitherSpace == 2) peCoords = vPeWorld.xy * 64.0;
    if (peDitherChannel == 2) {
      float peVal = peDitherScalar(peCoords, peDitherPattern, peDitherScale);
      if ((peVal + 0.5) > gl_FragColor.a) discard;
    } else if (peDitherChannel == 1) {
      float peVal = peDitherScalar(peCoords, peDitherPattern, peDitherScale);
      float peQuant = peDitherDepth > 0.0 ? peDitherDepth : 32.0;
      float peOffset = (peVal * peDitherIntensity) / max(peQuant, 1.0);
      float peLuma = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
      float peDithered = clamp(peLuma + peOffset, 0.0, 1.0);
      float peRatio = peLuma > 0.001 ? (peDithered / peLuma) : 1.0;
      gl_FragColor.rgb = clamp(gl_FragColor.rgb * peRatio, 0.0, 1.0);
    } else {
      gl_FragColor.rgb = clamp(gl_FragColor.rgb + peDitherDelta(peCoords, peDitherPattern, peDitherScale, peDitherIntensity, peDitherDepth), 0.0, 1.0);
    }
    if (peDitherDepth > 0.0) {
      gl_FragColor.rgb = floor(gl_FragColor.rgb * peDitherDepth + 0.5) / peDitherDepth;
    }
  }
`

/** Ordered dither on the lit framebuffer. Leaves PBR, flat, Gouraud, and unlit shading in place. */
export function applyRealtimeDither(material: THREE.Material, settings: RealtimeDitherSettings) {
  if (!settings.enabled) return
  if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshBasicMaterial)) return

  material.customProgramCacheKey = () => 'polyecho-realtime-dither'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.peDitherPattern = { value: settings.pattern }
    shader.uniforms.peDitherIntensity = { value: settings.intensity }
    shader.uniforms.peDitherDepth = { value: settings.depth }
    shader.uniforms.peDitherScale = { value: settings.scale }
    shader.uniforms.peDitherSpace = { value: settings.space }
    shader.uniforms.peDitherChannel = { value: settings.channel }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPeUv;\nvarying vec3 vPeWorld;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_UV
  vPeUv = uv;
#else
  vPeUv = vec2(0.0);
#endif`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vPeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform int peDitherPattern;
uniform float peDitherIntensity;
uniform float peDitherDepth;
uniform float peDitherScale;
uniform int peDitherSpace;
uniform int peDitherChannel;
varying vec2 vPeUv;
varying vec3 vPeWorld;
${DITHER_FUNCTION_GLSL}`
      )
      .replace('#include <dithering_fragment>', `${DITHER_APPLY_GLSL}\n#include <dithering_fragment>`)
  }
  material.needsUpdate = true
}
