import * as THREE from 'three'
import { MeshObject } from '../../types/mesh'
import { meshToThreeGeometry } from '../geometry/Converters'

export interface SpriteSheetOptions {
  frameWidth: number // e.g. 64 or 128
  frameHeight: number
  directions: number // 4 or 8 directions (angles)
  framesPerDir: number // e.g. 4 frames
  isoAngle: number // e.g. 30 or 45 degrees
}

export function renderSpriteSheet(
  meshes: MeshObject[],
  textureMap: Map<string, THREE.Texture>,
  options: SpriteSheetOptions
): HTMLCanvasElement {
  const { frameWidth, frameHeight, directions, framesPerDir, isoAngle } = options

  const totalCols = framesPerDir
  const totalRows = directions
  const sheetCanvas = document.createElement('canvas')
  sheetCanvas.width = totalCols * frameWidth
  sheetCanvas.height = totalRows * frameHeight
  const ctx = sheetCanvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // Offscreen Three.js renderer
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  renderer.setSize(frameWidth, frameHeight)
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const ambient = new THREE.AmbientLight(0xffffff, 0.9)
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(2, 4, 3)
  scene.add(ambient, dirLight)

  const group = new THREE.Group()
  for (const meshObj of meshes) {
    if (!meshObj.visible) continue
    const { geometry } = meshToThreeGeometry(meshObj)
    const texture = textureMap.get(meshObj.materialId) || null

    const mat = new THREE.MeshLambertMaterial({
      map: texture,
      vertexColors: true,
      side: THREE.DoubleSide
    })
    const m = new THREE.Mesh(geometry, mat)
    group.add(m)
  }
  scene.add(group)

  // Isometric / Orthographic Camera
  const aspect = frameWidth / frameHeight
  const d = 3
  const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 100)
  const elevationRad = THREE.MathUtils.degToRad(isoAngle)

  // Render each direction and frame
  for (let dirIdx = 0; dirIdx < directions; dirIdx++) {
    const azimuthRad = (dirIdx / directions) * Math.PI * 2

    const camX = Math.sin(azimuthRad) * Math.cos(elevationRad) * 10
    const camY = Math.sin(elevationRad) * 10
    const camZ = Math.cos(azimuthRad) * Math.cos(elevationRad) * 10

    camera.position.set(camX, camY, camZ)
    camera.lookAt(0, 0.5, 0)

    for (let frameIdx = 0; frameIdx < framesPerDir; frameIdx++) {
      renderer.render(scene, camera)
      ctx.drawImage(renderer.domElement, frameIdx * frameWidth, dirIdx * frameHeight)
    }
  }

  renderer.dispose()
  return sheetCanvas
}
