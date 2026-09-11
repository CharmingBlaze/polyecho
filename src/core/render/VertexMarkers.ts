import * as THREE from 'three'

/** CSS pixels. Screen-space squares, constant size at any zoom. */
export const VERTEX_MARKER_SIZE_PX = 18
export const VERTEX_HOVER_SIZE_PX = 22

export const VERTEX_COLOR_IDLE = { r: 0.93, g: 0.93, b: 0.96 }
export const VERTEX_COLOR_SELECTED = { r: 1, g: 0.62, b: 0.12 }

let unitQuad: THREE.BufferGeometry | null = null
let markerMap: THREE.CanvasTexture | null = null
let markerMaterial: THREE.ShaderMaterial | null = null
let hoverMaterial: THREE.ShaderMaterial | null = null

export function screenSpaceClipOffset(
  clipW: number,
  corner: number,
  sizePx: number,
  resolutionPx: number
): number {
  if (resolutionPx <= 0) return 0
  return corner * (sizePx / resolutionPx) * 2 * clipW
}

function getUnitQuad(): THREE.BufferGeometry {
  if (!unitQuad) unitQuad = new THREE.PlaneGeometry(1, 1)
  return unitQuad
}

function getMarkerMap(): THREE.CanvasTexture {
  if (markerMap) return markerMap
  const s = 32
  const canvas = document.createElement('canvas')
  canvas.width = s
  canvas.height = s
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    markerMap = new THREE.CanvasTexture(canvas)
    return markerMap
  }
  ctx.clearRect(0, 0, s, s)
  ctx.fillStyle = '#111111'
  ctx.fillRect(1, 1, 30, 30)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(4, 4, 24, 24)
  markerMap = new THREE.CanvasTexture(canvas)
  markerMap.magFilter = THREE.NearestFilter
  markerMap.minFilter = THREE.NearestFilter
  markerMap.generateMipmaps = false
  markerMap.needsUpdate = true
  return markerMap
}

const vertexMarkerVert = /* glsl */ `
attribute vec3 instancePosition;
attribute vec3 instanceColor;
uniform float uSizePx;
uniform vec2 uResolution;
uniform vec3 uTint;
varying vec3 vColor;
varying vec2 vUv;

void main() {
  vColor = instanceColor * uTint;
  vUv = uv;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(instancePosition, 1.0);
  vec2 ndcPixel = uSizePx / max(uResolution, vec2(1.0));
  clip.xy += position.xy * ndcPixel * 2.0 * clip.w;
  clip.z -= 0.002 * clip.w;
  gl_Position = clip;
}
`

const vertexMarkerFrag = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying vec2 vUv;

void main() {
  vec4 texel = texture2D(uMap, vUv);
  if (texel.a < 0.2) discard;
  gl_FragColor = vec4(texel.rgb * vColor, 1.0);
}
`

function makeMaterial(sizePx: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSizePx: { value: sizePx },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uMap: { value: getMarkerMap() }
    },
    vertexShader: vertexMarkerVert,
    fragmentShader: vertexMarkerFrag,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8,
    transparent: true,
    toneMapped: false
  })
  mat.userData.retain = true
  return mat
}

export function getVertexMarkerMaterial(): THREE.ShaderMaterial {
  if (!markerMaterial) markerMaterial = makeMaterial(VERTEX_MARKER_SIZE_PX)
  return markerMaterial
}

export function getHoverVertexMarkerMaterial(): THREE.ShaderMaterial {
  if (!hoverMaterial) hoverMaterial = makeMaterial(VERTEX_HOVER_SIZE_PX)
  return hoverMaterial
}

export function setVertexMarkerSeeThrough(seeThrough: boolean) {
  getVertexMarkerMaterial().depthTest = !seeThrough
  getHoverVertexMarkerMaterial().depthTest = !seeThrough
}

export function setHoverVertexMarkerColor(hex: string | number) {
  getHoverVertexMarkerMaterial().uniforms.uTint.value.set(hex)
}

export function setVertexMarkerViewport(widthCss: number, heightCss: number) {
  const w = Math.max(1, widthCss)
  const h = Math.max(1, heightCss)
  if (markerMaterial) {
    markerMaterial.uniforms.uResolution.value.set(w, h)
    markerMaterial.uniforms.uSizePx.value = VERTEX_MARKER_SIZE_PX
  }
  if (hoverMaterial) {
    hoverMaterial.uniforms.uResolution.value.set(w, h)
    hoverMaterial.uniforms.uSizePx.value = VERTEX_HOVER_SIZE_PX
  }
}

export function vertexPointsToMarkerGeometry(src: THREE.BufferGeometry): THREE.InstancedBufferGeometry {
  const pos = src.getAttribute('position') as THREE.BufferAttribute
  const col = src.getAttribute('color') as THREE.BufferAttribute | undefined
  const count = pos?.count ?? 0
  const geo = new THREE.InstancedBufferGeometry()
  const quad = getUnitQuad()
  geo.index = quad.index!.clone()
  geo.setAttribute('position', quad.getAttribute('position')!.clone())
  geo.setAttribute('uv', quad.getAttribute('uv')!.clone())
  const posArr = new Float32Array((pos?.array as Float32Array | undefined) ?? [])
  const colArr = col
    ? new Float32Array(col.array as Float32Array)
    : new Float32Array(count * 3).fill(1)
  geo.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(posArr, 3))
  geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colArr, 3))
  geo.instanceCount = count
  const box = new THREE.Box3()
  if (count) box.setFromArray(posArr)
  else box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.01, 0.01, 0.01))
  geo.boundingBox = box
  geo.boundingSphere = new THREE.Sphere()
  box.getBoundingSphere(geo.boundingSphere)
  return geo
}

export function createVertexMarkerMesh(pointsGeometry: THREE.BufferGeometry): THREE.Mesh {
  const geom = vertexPointsToMarkerGeometry(pointsGeometry)
  pointsGeometry.dispose()
  const mesh = new THREE.Mesh(geom, getVertexMarkerMaterial())
  mesh.frustumCulled = false
  mesh.renderOrder = 55
  mesh.matrixAutoUpdate = true
  return mesh
}

export function replaceVertexMarkerGeometry(mesh: THREE.Mesh, pointsGeometry: THREE.BufferGeometry) {
  const next = vertexPointsToMarkerGeometry(pointsGeometry)
  pointsGeometry.dispose()
  mesh.geometry.dispose()
  mesh.geometry = next
}

export function createHoverVertexMarker(): THREE.Mesh {
  const src = new THREE.BufferGeometry()
  src.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
  src.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1], 3))
  const geom = vertexPointsToMarkerGeometry(src)
  src.dispose()
  const mesh = new THREE.Mesh(geom, getHoverVertexMarkerMaterial())
  mesh.frustumCulled = false
  mesh.renderOrder = 56
  mesh.visible = false
  return mesh
}

export function setHoverMarkerWorld(mesh: THREE.Mesh, x: number, y: number, z: number) {
  const attr = mesh.geometry.getAttribute('instancePosition') as THREE.InstancedBufferAttribute | undefined
  if (!attr) return
  attr.setXYZ(0, x, y, z)
  attr.needsUpdate = true
}

export function paintVertexMarkerColors(
  geometry: THREE.BufferGeometry,
  map: string[],
  selected: Set<string>
) {
  const colors = geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute | undefined
  if (!colors || map.length * 3 !== colors.array.length) return false
  for (let i = 0; i < map.length; i++) {
    const c = selected.has(map[i]) ? VERTEX_COLOR_SELECTED : VERTEX_COLOR_IDLE
    colors.setXYZ(i, c.r, c.g, c.b)
  }
  colors.needsUpdate = true
  return true
}
