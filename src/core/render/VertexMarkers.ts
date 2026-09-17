import * as THREE from 'three'

/** CSS pixels. Screen-space circles, constant size at any zoom. */
export const VERTEX_MARKER_SIZE_PX = 16
export const VERTEX_HOVER_SIZE_PX = 22

export const VERTEX_COLOR_IDLE = { r: 0.92, g: 0.93, b: 0.96 }
export const VERTEX_COLOR_SELECTED = { r: 1, g: 0.48, b: 0.08 }
export const VERTEX_COLOR_HOVER = { r: 0.2, g: 0.92, b: 1 }
export const VERTEX_COLOR_SELECTED_HOVER = { r: 1, g: 0.92, b: 0.22 }

let unitQuad: THREE.BufferGeometry | null = null
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

const vertexMarkerVert = /* glsl */ `
attribute vec3 instancePosition;
attribute vec3 aMarkerColor;
uniform float uSizePx;
uniform vec2 uResolution;
uniform vec3 uFill;
uniform float uUseInstanceColor;
varying vec3 vColor;
varying vec2 vUv;

void main() {
  vColor = mix(uFill, aMarkerColor, uUseInstanceColor);
  vUv = uv;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(instancePosition, 1.0);
  vec2 ndcPixel = uSizePx / max(uResolution, vec2(1.0));
  clip.xy += position.xy * ndcPixel * 2.0 * clip.w;
  clip.z -= 0.002 * clip.w;
  gl_Position = clip;
}
`

const vertexMarkerFrag = /* glsl */ `
varying vec3 vColor;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float alpha = 1.0 - smoothstep(0.84, 1.0, r);
  if (alpha < 0.02) discard;
  float fill = 1.0 - smoothstep(0.52, 0.66, r);
  vec3 outline = vec3(0.05, 0.06, 0.08);
  gl_FragColor = vec4(mix(outline, vColor, fill), alpha);
}
`

function makeMaterial(sizePx: number, instanceColor: boolean): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSizePx: { value: sizePx },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uFill: { value: new THREE.Color(VERTEX_COLOR_HOVER.r, VERTEX_COLOR_HOVER.g, VERTEX_COLOR_HOVER.b) },
      uUseInstanceColor: { value: instanceColor ? 1 : 0 }
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
  if (!markerMaterial) markerMaterial = makeMaterial(VERTEX_MARKER_SIZE_PX, true)
  return markerMaterial
}

export function getHoverVertexMarkerMaterial(): THREE.ShaderMaterial {
  if (!hoverMaterial) hoverMaterial = makeMaterial(VERTEX_HOVER_SIZE_PX, false)
  return hoverMaterial
}

export function setVertexMarkerSeeThrough(seeThrough: boolean) {
  getVertexMarkerMaterial().depthTest = !seeThrough
  getHoverVertexMarkerMaterial().depthTest = !seeThrough
}

export function setHoverVertexMarkerColor(rgb: { r: number; g: number; b: number } | string | number) {
  const fill = getHoverVertexMarkerMaterial().uniforms.uFill.value as THREE.Color
  if (typeof rgb === 'object' && rgb && 'r' in rgb) fill.setRGB(rgb.r, rgb.g, rgb.b)
  else fill.set(rgb as string | number)
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

function markerColorAttribute(count: number, src?: THREE.BufferAttribute) {
  const arr = src
    ? new Float32Array(src.array as Float32Array).slice(0, count * 3)
    : new Float32Array(count * 3)
  if (!src) {
    for (let i = 0; i < count; i++) {
      arr[i * 3] = VERTEX_COLOR_IDLE.r
      arr[i * 3 + 1] = VERTEX_COLOR_IDLE.g
      arr[i * 3 + 2] = VERTEX_COLOR_IDLE.b
    }
  }
  const attr = new THREE.InstancedBufferAttribute(arr, 3)
  attr.setUsage(THREE.DynamicDrawUsage)
  return attr
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
  geo.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(posArr, 3))
  geo.setAttribute('aMarkerColor', markerColorAttribute(count, col))
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
  src.setAttribute('color', new THREE.Float32BufferAttribute([
    VERTEX_COLOR_HOVER.r, VERTEX_COLOR_HOVER.g, VERTEX_COLOR_HOVER.b
  ], 3))
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
  const colors = geometry.getAttribute('aMarkerColor') as THREE.InstancedBufferAttribute | undefined
  if (!colors || map.length === 0 || map.length * 3 !== colors.array.length) return false
  for (let i = 0; i < map.length; i++) {
    const c = selected.has(map[i]) ? VERTEX_COLOR_SELECTED : VERTEX_COLOR_IDLE
    colors.setXYZ(i, c.r, c.g, c.b)
  }
  colors.needsUpdate = true
  return true
}
