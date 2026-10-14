import * as THREE from 'three'
import { DITHER_FUNCTION_GLSL } from '../materials/RealtimeDither'
import { applyPsxLightingUniforms, DEFAULT_VIEWPORT_LIGHTING, VIEWPORT_KEY_LIGHT_POSITION } from '../render/ViewportLighting'

export interface PSXShaderUniforms {
  [uniform: string]: THREE.IUniform
  uTexture: { value: THREE.Texture | null }
  uTextureRepeat: { value: THREE.Vector2 }
  uHasTexture: { value: boolean }
  uColor: { value: THREE.Color }
  uResolution: { value: THREE.Vector2 }
  uJitterAmount: { value: number }
  uAffineEnabled: { value: boolean }
  uDitherEnabled: { value: boolean }
  uDitherIntensity: { value: number }
  uColorDepth: { value: number } // e.g. 32 (5-bit per channel RGB555)
  uBayerSize: { value: number }
  uDitherScale: { value: number }
  uDitherPatternType: { value: number }
  uDitherSpace: { value: number } // 0: screen, 1: uv, 2: world
  uDitherChannel: { value: number } // 0: rgb, 1: luma, 2: alpha
  uConsoleMode: { value: number } // 0: PSX, 1: Saturn, 2: Dreamcast, 3: N64
  uSaturnMeshAlpha: { value: boolean }
  uDreamcastVQ: { value: boolean }
  uDreamcastSpecular: { value: boolean }
  uDreamcastCelOutline: { value: boolean }
  uLightDirection: { value: THREE.Vector3 }
  uLightColor: { value: THREE.Color }
  uKeyIntensity: { value: number }
  uAmbientLight: { value: THREE.Color }
  uOpacity: { value: number }
  uAlphaTest: { value: number }
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vLightColor;
  varying vec4 vAffineUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vFogDepth;

  uniform vec2 uResolution;
  uniform float uJitterAmount;
  uniform vec3 uLightDirection;
  uniform vec3 uLightColor;
  uniform float uKeyIntensity;
  uniform vec3 uAmbientLight;
  uniform bool uAffineEnabled;
  uniform int uConsoleMode; // 0: PSX, 1: Saturn, 2: Dreamcast, 3: N64

  void main() {
    vUv = uv;
    vColor = color;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormal = normalize(normalMatrix * normal);

    // Gouraud shading. Dreamcast uses half-Lambert plus a cool fill so
    // low-poly forms stay readable, the way PowerVR arcade lighting did.
    vec3 lightDir = normalize(uLightDirection);
    float ndotl = dot(vNormal, lightDir);
    float diff = max(ndotl, 0.0);
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-viewPos.xyz);
    vFogDepth = -viewPos.z;

    if (uConsoleMode == 2) {
      float wrap = diff * 0.62 + 0.38;
      vec3 fill = vec3(0.28, 0.42, 0.62) * clamp(0.55 - ndotl, 0.0, 1.0);
      vLightColor = min(uAmbientLight * 0.72 + uLightColor * wrap * uKeyIntensity + fill, vec3(1.55));
    } else {
      vLightColor = min(uAmbientLight + uLightColor * diff * uKeyIntensity, vec3(1.35));
    }

    // Standard projection
    vec4 clipPos = projectionMatrix * viewPos;

    // PSX Vertex Jitter / Precision truncation in NDC Screen Space
    if (uConsoleMode == 0 && uJitterAmount > 0.0) {
      vec2 grid = uResolution;
      vec2 snapped = floor((clipPos.xy / clipPos.w) * grid + 0.5) / grid;
      clipPos.xy = snapped * clipPos.w;
    }

    // Affine texture mapping coordinate prep (PSX / Saturn)
    if (uAffineEnabled && (uConsoleMode == 0 || uConsoleMode == 1)) {
      vAffineUv = vec4(uv * clipPos.w, 0.0, clipPos.w);
    } else {
      vAffineUv = vec4(uv, 0.0, 1.0);
    }

    gl_Position = clipPos;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uTextureRepeat;
  uniform bool uHasTexture;
  uniform vec3 uColor;
  uniform bool uAffineEnabled;
  uniform bool uDitherEnabled;
  uniform float uDitherIntensity;
  uniform float uColorDepth;
  uniform int uBayerSize;
  uniform float uDitherScale;
  uniform int uDitherPatternType;
  uniform int uDitherSpace;
  uniform int uDitherChannel;
  uniform int uConsoleMode; // 0: PSX, 1: Saturn, 2: Dreamcast, 3: N64
  uniform bool uSaturnMeshAlpha;
  uniform bool uDreamcastVQ;
  uniform bool uDreamcastSpecular;
  uniform bool uDreamcastCelOutline;
  uniform vec3 uLightDirection;
  uniform float uOpacity;
  uniform float uAlphaTest;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vLightColor;
  varying vec4 vAffineUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vFogDepth;

  ${DITHER_FUNCTION_GLSL}

  float getDitherValue(vec2 uv) {
    return peDitherScalar(uv, uDitherPatternType, uDitherScale);
  }

  void main() {
    // ----------------------------------------------------
    // 1. SEGA SATURN VDP1 MESH TRANSPARENCY (Checker Dropout)
    // ----------------------------------------------------
    if (uConsoleMode == 1 && uSaturnMeshAlpha) {
      vec2 screenPixel = floor(gl_FragCoord.xy);
      if (mod(screenPixel.x + screenPixel.y, 2.0) == 0.0) {
        discard;
      }
    }

    // ----------------------------------------------------
    // 2. JET SET RADIO CEL-SHADING OUTLINE (Dreamcast)
    // ----------------------------------------------------
    if (uConsoleMode == 2 && uDreamcastCelOutline) {
      float edgeDot = dot(normalize(vNormal), normalize(vViewDir));
      if (edgeDot < 0.25) {
        gl_FragColor = vec4(0.08, 0.08, 0.12, uOpacity);
        return;
      }
    }

    // ----------------------------------------------------
    // 3. TEXTURE COORDINATES & MAPPING
    // ----------------------------------------------------
    vec2 finalUv;
    if (uAffineEnabled && (uConsoleMode == 0 || uConsoleMode == 1)) {
      finalUv = vAffineUv.xy / max(vAffineUv.w, 0.0001);
    } else {
      finalUv = vUv;
    }
    finalUv *= uTextureRepeat;

    vec4 texColor = vec4(1.0);
    if (uHasTexture) {
      texColor = texture2D(uTexture, finalUv);
      if (uAlphaTest > 0.0 && texColor.a < uAlphaTest) discard;
    }

    // ----------------------------------------------------
    // 4. LIGHTING & BASE COLOR
    // ----------------------------------------------------
    vec3 baseCol = texColor.rgb * uColor * vColor * vLightColor;

    // Sega Dreamcast / PowerVR2: glossy gouraud, env-map rim, saturated color.
    if (uConsoleMode == 2) {
      vec3 n = normalize(vNormal);
      vec3 viewDir = normalize(vViewDir);
      if (uDreamcastSpecular) {
        vec3 lightDir = normalize(uLightDirection);
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(n, halfDir), 0.0), 28.0);
        baseCol += vec3(1.0, 0.98, 0.94) * spec * 0.85;
      }
      float fresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.6);
      baseCol += vec3(0.42, 0.70, 1.0) * fresnel * 0.28;

      if (uDreamcastVQ) {
        float luma = dot(baseCol, vec3(0.299, 0.587, 0.114));
        baseCol = mix(vec3(luma), baseCol, 1.22);
        baseCol = pow(max(baseCol, vec3(0.0)), vec3(0.9));
      }

      // Distance haze used by late-90s Sega games (sky matches the viewport fog).
      float fog = smoothstep(7.0, 34.0, vFogDepth);
      baseCol = mix(baseCol, vec3(0.494, 0.784, 0.918), fog * 0.62);

      // PowerVR wrote a 16-bit RGB565 framebuffer with ordered dither.
      float dither = getDitherValue(gl_FragCoord.xy) - 0.5;
      vec3 steps = vec3(31.0, 63.0, 31.0);
      baseCol = clamp(baseCol, 0.0, 1.0) + dither / steps;
      baseCol = floor(clamp(baseCol, 0.0, 1.0) * steps + 0.5) / steps;
    }

    // ----------------------------------------------------
    // 5. DITHERING SUITE
    // ----------------------------------------------------
    vec2 ditherCoords = gl_FragCoord.xy;
    if (uDitherSpace == 1) {
      ditherCoords = finalUv * 256.0;
    } else if (uDitherSpace == 2) {
      ditherCoords = vWorldPos.xy * 64.0;
    }

    if (uDitherEnabled && uConsoleMode != 2) {
      float ditherVal = getDitherValue(ditherCoords);
      float quantSteps = uColorDepth > 0.0 ? uColorDepth : 32.0;
      float ditherOffset = (ditherVal * uDitherIntensity) / max(quantSteps, 1.0);

      if (uDitherChannel == 2) {
        float alphaCutoff = texColor.a;
        if ((ditherVal + 0.5) > alphaCutoff) discard;
      } else if (uDitherChannel == 1) {
        float luma = dot(baseCol, vec3(0.299, 0.587, 0.114));
        float ditheredLuma = clamp(luma + ditherOffset, 0.0, 1.0);
        float lumaRatio = luma > 0.001 ? (ditheredLuma / luma) : 1.0;
        baseCol = clamp(baseCol * lumaRatio, 0.0, 1.0);
      } else {
        baseCol = clamp(baseCol + peDitherDelta(ditherCoords, uDitherPatternType, uDitherScale, uDitherIntensity, uColorDepth), 0.0, 1.0);
      }
    }

    // ----------------------------------------------------
    // 6. COLOR QUANTIZATION (PSX/Saturn 15-bit RGB555). Dreamcast uses RGB565 above.
    // ----------------------------------------------------
    if (uColorDepth > 0.0 && uConsoleMode != 2) {
      baseCol = floor(baseCol * uColorDepth + 0.5) / uColorDepth;
    }

    gl_FragColor = vec4(clamp(baseCol, 0.0, 1.0), texColor.a * uOpacity);
  }
`

/** PS1/Saturn/N64 stay nearest. Dreamcast (mode 2) is bilinear with mipmaps. */
export function applyConsoleTextureFiltering(texture: THREE.Texture | null, consoleMode: number) {
  if (!texture) return
  if (consoleMode === 2) {
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 8
  } else {
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.anisotropy = 1
  }
  texture.needsUpdate = true
}

let psxMaterialPrototype: THREE.ShaderMaterial | null = null

function buildPSXMaterialPrototype(): THREE.ShaderMaterial {
  const uniforms: PSXShaderUniforms = {
    uTexture: { value: null },
    uTextureRepeat: { value: new THREE.Vector2(1, 1) },
    uHasTexture: { value: false },
    uColor: { value: new THREE.Color(1, 1, 1) },
    uResolution: { value: new THREE.Vector2(320, 240) },
    uJitterAmount: { value: 1.0 },
    uAffineEnabled: { value: true },
    uDitherEnabled: { value: true },
    uDitherIntensity: { value: 1.0 },
    uColorDepth: { value: 32.0 },
    uBayerSize: { value: 4 },
    uDitherScale: { value: 1.0 },
    uDitherPatternType: { value: 0 },
    uDitherSpace: { value: 0 },
    uDitherChannel: { value: 0 },
    uConsoleMode: { value: 0 },
    uSaturnMeshAlpha: { value: false },
    uDreamcastVQ: { value: false },
    uDreamcastSpecular: { value: false },
    uDreamcastCelOutline: { value: false },
    uLightDirection: { value: VIEWPORT_KEY_LIGHT_POSITION.clone().normalize() },
    uLightColor: { value: new THREE.Color(DEFAULT_VIEWPORT_LIGHTING.keyColor) },
    uKeyIntensity: { value: 0.95 },
    uAmbientLight: { value: new THREE.Color(0.5, 0.55, 0.58) },
    uOpacity: { value: 1.0 },
    uAlphaTest: { value: 0.05 }
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true
  })
  applyPsxLightingUniforms(material.uniforms, DEFAULT_VIEWPORT_LIGHTING)
  return material
}

/** Clones a shared program so console materials do not recompile GLSL per mesh. */
export function createPSXMaterial(texture: THREE.Texture | null = null, resolution = new THREE.Vector2(320, 240)): THREE.ShaderMaterial {
  applyConsoleTextureFiltering(texture, 0)
  if (!psxMaterialPrototype) psxMaterialPrototype = buildPSXMaterialPrototype()
  const material = psxMaterialPrototype.clone()
  material.uniforms.uTexture.value = texture
  material.uniforms.uHasTexture.value = texture !== null
  material.uniforms.uResolution.value = resolution.clone()
  applyPsxLightingUniforms(material.uniforms, DEFAULT_VIEWPORT_LIGHTING)
  return material
}
