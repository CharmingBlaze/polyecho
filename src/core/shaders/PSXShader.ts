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
  uColorDepth: { value: number } // e.g. 32 (5-bit per channel RGB555)
  uLightDirection: { value: THREE.Vector3 }
  uAmbientLight: { value: THREE.Color }
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vLightIntensity;
  varying vec4 vAffineUv;

  uniform vec2 uResolution;
  uniform float uJitterAmount;
  uniform vec3 uLightDirection;
  uniform vec3 uAmbientLight;
  uniform bool uAffineEnabled;

  void main() {
    vUv = uv;
    vColor = color;

    // Gouraud shading calculation in world/view space
    vec3 transformedNormal = normalize(normalMatrix * normal);
    float diff = max(dot(transformedNormal, normalize(uLightDirection)), 0.0);
    vLightIntensity = min(1.0, 0.35 + diff * 0.75);

    // Standard projection
    vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    // PSX Vertex Jitter / Precision truncation in NDC Screen Space
    if (uJitterAmount > 0.0) {
      vec2 grid = uResolution;
      vec2 snapped = floor((clipPos.xy / clipPos.w) * grid + 0.5) / grid;
      clipPos.xy = snapped * clipPos.w;
    }

    // Affine texture mapping coordinate prep
    if (uAffineEnabled) {
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
  uniform float uColorDepth;
  uniform int uBayerSize;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vLightIntensity;
  varying vec4 vAffineUv;

  float bayer2x2(vec2 uv) {
    vec2 p = mod(floor(uv), 2.0);
    if (p.y == 0.0) {
      return p.x == 0.0 ? 0.0 / 4.0 : 2.0 / 4.0;
    } else {
      return p.x == 0.0 ? 3.0 / 4.0 : 1.0 / 4.0;
    }
  }

  // 4x4 Bayer Matrix for dithering
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

  float getBayerDither(vec2 uv) {
    if (uBayerSize == 2) return bayer2x2(uv);
    if (uBayerSize == 8) return bayer8x8(uv);
    return bayer4x4(uv);
  }

  void main() {
    vec2 finalUv;
    if (uAffineEnabled) {
      finalUv = vAffineUv.xy / max(vAffineUv.w, 0.0001);
    } else {
      finalUv = vUv;
    }

    vec4 texColor = vec4(1.0);
    if (uHasTexture) {
      texColor = texture2D(uTexture, finalUv);
      if (texColor.a < 0.1) discard;
    }

    // Multiply base color, vertex color, texture color, and Gouraud light intensity
    vec3 baseCol = texColor.rgb * uColor * vColor * vLightIntensity;

    // Retro Bayer Dithering & Color Quantization (RGB555 15-bit color)
    if (uDitherEnabled) {
      float dither = (getBayerDither(gl_FragCoord.xy) - 0.5) / max(uColorDepth, 1.0);
      baseCol += vec3(dither);
    }

    // Quantize color channels
    if (uColorDepth > 0.0) {
      baseCol = floor(baseCol * uColorDepth + 0.5) / uColorDepth;
    }

    gl_FragColor = vec4(clamp(baseCol, 0.0, 1.0), texColor.a);
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
    uColorDepth: { value: 32.0 }, // 32 steps per channel (RGB555)
    uBayerSize: { value: 4 },
    uLightDirection: { value: new THREE.Vector3(0.5, 1.0, 0.8).normalize() },
    uAmbientLight: { value: new THREE.Color(0.2, 0.2, 0.25) }
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
