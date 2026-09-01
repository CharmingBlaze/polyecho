import * as THREE from 'three'

export interface PSXShaderUniforms {
  [uniform: string]: THREE.IUniform
  uTexture: { value: THREE.Texture | null }
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
  uAmbientLight: { value: THREE.Color }
  uOpacity: { value: number }
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vLightIntensity;
  varying vec4 vAffineUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  uniform vec2 uResolution;
  uniform float uJitterAmount;
  uniform vec3 uLightDirection;
  uniform vec3 uAmbientLight;
  uniform bool uAffineEnabled;
  uniform int uConsoleMode; // 0: PSX, 1: Saturn, 2: Dreamcast, 3: N64

  void main() {
    vUv = uv;
    vColor = color;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vNormal = normalize(normalMatrix * normal);

    // Gouraud shading calculation in world/view space
    vec3 lightDir = normalize(uLightDirection);
    float diff = max(dot(vNormal, lightDir), 0.0);
    vLightIntensity = min(1.0, 0.30 + diff * 0.75);

    // View direction for specular highlights (Dreamcast)
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-viewPos.xyz);

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

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vLightIntensity;
  varying vec4 vAffineUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  float bayer2x2(vec2 uv) {
    vec2 p = mod(floor(uv), 2.0);
    if (p.y == 0.0) {
      return p.x == 0.0 ? 0.0 / 4.0 : 2.0 / 4.0;
    } else {
      return p.x == 0.0 ? 3.0 / 4.0 : 1.0 / 4.0;
    }
  }

  // 4x4 Bayer Matrix
  float bayer4x4(vec2 uv) {
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

  float bayer8x8(vec2 uv) {
    vec2 p = mod(floor(uv), 8.0);
    vec2 p4 = mod(p, 4.0);
    float m4 = bayer4x4(p4);
    vec2 p2 = floor(p / 4.0);
    float m2 = bayer2x2(p2);
    return (m4 * 16.0 + m2) / 64.0;
  }

  float bayer16x16(vec2 uv) {
    vec2 p = mod(floor(uv), 16.0);
    vec2 p8 = mod(p, 8.0);
    float m8 = bayer8x8(p8);
    vec2 p2 = floor(p / 8.0);
    float m2 = bayer2x2(p2);
    return (m8 * 64.0 + m2) / 256.0;
  }

  // Clustered Dot Halftone Matrix 4x4
  float halftone4x4(vec2 uv) {
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

  // Blue Noise pseudo-hash
  float blueNoise(vec2 uv) {
    vec2 p = mod(floor(uv), 8.0);
    float n = fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    float b = bayer8x8(p);
    return mix(b, n, 0.45);
  }

  float crosshatch(vec2 uv) {
    vec2 p = floor(uv);
    float l1 = mod(p.x + p.y, 4.0) == 0.0 ? 0.35 : -0.15;
    float l2 = mod(p.x - p.y + 4000.0, 4.0) == 0.0 ? 0.35 : -0.15;
    return (l1 + l2) * 0.5;
  }

  float horizontalLines(vec2 uv) {
    return mod(floor(uv.y), 2.0) == 0.0 ? 0.35 : -0.35;
  }

  float verticalLines(vec2 uv) {
    return mod(floor(uv.x), 2.0) == 0.0 ? 0.35 : -0.35;
  }

  float checker2x2(vec2 uv) {
    vec2 p = mod(floor(uv), 2.0);
    return (p.x == p.y) ? 0.35 : -0.35;
  }

  float randomNoise(vec2 uv) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  }

  float getDitherValue(vec2 uv) {
    vec2 scaledUv = floor(uv / max(uDitherScale, 1.0));
    if (uDitherPatternType == 1) return bayer8x8(scaledUv) - 0.5;
    if (uDitherPatternType == 2) return bayer2x2(scaledUv) - 0.5;
    if (uDitherPatternType == 3) return bayer16x16(scaledUv) - 0.5;
    if (uDitherPatternType == 4) return blueNoise(scaledUv) - 0.5;
    if (uDitherPatternType == 5) return halftone4x4(scaledUv) - 0.5;
    if (uDitherPatternType == 6) return crosshatch(scaledUv);
    if (uDitherPatternType == 7) return horizontalLines(scaledUv);
    if (uDitherPatternType == 8) return verticalLines(scaledUv);
    if (uDitherPatternType == 9) return checker2x2(scaledUv);
    if (uDitherPatternType == 10) return randomNoise(scaledUv);
    return bayer4x4(scaledUv) - 0.5;
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

    vec4 texColor = vec4(1.0);
    if (uHasTexture) {
      texColor = texture2D(uTexture, finalUv);
      if (texColor.a < 0.05) discard;
    }

    // ----------------------------------------------------
    // 4. LIGHTING & BASE COLOR
    // ----------------------------------------------------
    vec3 baseCol = texColor.rgb * uColor * vColor * vLightIntensity;

    // Sega Dreamcast PowerVR Arcade Specular Highlights
    if (uConsoleMode == 2 && uDreamcastSpecular) {
      vec3 lightDir = normalize(uLightDirection);
      vec3 halfDir = normalize(lightDir + vViewDir);
      float spec = pow(max(dot(vNormal, halfDir), 0.0), 16.0);
      baseCol += vec3(0.6, 0.65, 0.7) * spec * 0.75;
    }

    // Dreamcast VQ Vector Quantization Arcade Color Boost
    if (uConsoleMode == 2 && uDreamcastVQ) {
      // 16-bit RGB565 / VQ Punchy Contrast
      baseCol = pow(baseCol, vec3(0.95)) * 1.08;
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

    if (uDitherEnabled) {
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
        baseCol = clamp(baseCol + vec3(ditherOffset), 0.0, 1.0);
      }
    }

    // ----------------------------------------------------
    // 6. COLOR QUANTIZATION (PSX/Saturn 15-bit RGB555 vs DC 16/24-bit)
    // ----------------------------------------------------
    if (uColorDepth > 0.0) {
      baseCol = floor(baseCol * uColorDepth + 0.5) / uColorDepth;
    }

    gl_FragColor = vec4(clamp(baseCol, 0.0, 1.0), texColor.a * uOpacity);
  }
`

export function createPSXMaterial(texture: THREE.Texture | null = null, resolution = new THREE.Vector2(320, 240)): THREE.ShaderMaterial {
  if (texture) {
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
  }

  const uniforms: PSXShaderUniforms = {
    uTexture: { value: texture },
    uHasTexture: { value: texture !== null },
    uColor: { value: new THREE.Color(1, 1, 1) },
    uResolution: { value: resolution },
    uJitterAmount: { value: 1.0 },
    uAffineEnabled: { value: true },
    uDitherEnabled: { value: true },
    uDitherIntensity: { value: 1.0 },
    uColorDepth: { value: 32.0 }, // 32 steps per channel (RGB555)
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
    uLightDirection: { value: new THREE.Vector3(0.5, 1.0, 0.8).normalize() },
    uAmbientLight: { value: new THREE.Color(0.2, 0.2, 0.25) },
    uOpacity: { value: 1.0 }
  }

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true
  })
}
