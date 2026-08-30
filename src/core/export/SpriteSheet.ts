import * as THREE from 'three'
import { MeshObject } from '../../types/mesh'
import { AnimationClip, Armature } from '../../types/animation'
import { meshToThreeGeometry } from '../geometry/Converters'
import { sampleTrack } from '../animation/Armature'

export interface SpriteSheetOptions {
  frameWidth: number // e.g. 32, 64, 128
  frameHeight: number
  directions: number // 4 or 8 directions (angles)
  framesPerDir?: number // number of animation frames to capture
  isoAngle: number // e.g. 30, 45 or 0 (pure top/ortho)
  clip?: AnimationClip | null
  armature?: Armature | null
  frameStep?: number // e.g. 1 = capture every frame, 2 = every second frame
}

/**
 * Bakes 3D low-poly models and animated clips into an 8-directional or 4-directional 2D sprite sheet.
 */
export function renderSpriteSheet(
  meshes: MeshObject[],
  textureMap: Map<string, THREE.Texture>,
  options: SpriteSheetOptions
): HTMLCanvasElement {
  const { frameWidth, frameHeight, directions, isoAngle, clip, armature, frameStep = 1 } = options

  // Determine total frames to capture
  let totalFrames = options.framesPerDir || 1
  let frameIndices: number[] = [0]

  if (clip && clip.durationFrames > 0) {
    frameIndices = []
    for (let f = 0; f <= clip.durationFrames; f += frameStep) {
      frameIndices.push(f)
    }
    totalFrames = frameIndices.length
  }

  const totalCols = totalFrames
  const totalRows = directions
  const sheetCanvas = document.createElement('canvas')
  sheetCanvas.width = Math.max(1, totalCols * frameWidth)
  sheetCanvas.height = Math.max(1, totalRows * frameHeight)
  const ctx = sheetCanvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // Offscreen Three.js renderer
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true })
  renderer.setSize(frameWidth, frameHeight)
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const ambient = new THREE.AmbientLight(0xffffff, 0.95)
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85)
  dirLight.position.set(3, 5, 4)
  scene.add(ambient, dirLight)

  // Map of three.js meshes created from MeshObjects
  const threeMeshes = new Map<string, { threeMesh: THREE.Mesh; baseMesh: MeshObject }>()
  const rootGroup = new THREE.Group()

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
    m.position.set(meshObj.position.x, meshObj.position.y, meshObj.position.z)
    m.rotation.set(
      THREE.MathUtils.degToRad(meshObj.rotation.x),
      THREE.MathUtils.degToRad(meshObj.rotation.y),
      THREE.MathUtils.degToRad(meshObj.rotation.z)
    )
    m.scale.set(meshObj.scale.x, meshObj.scale.y, meshObj.scale.z)

    rootGroup.add(m)
    threeMeshes.set(meshObj.id, { threeMesh: m, baseMesh: meshObj })
  }
  scene.add(rootGroup)

  // Camera setup
  const aspect = frameWidth / frameHeight
  const bbox = new THREE.Box3().setFromObject(rootGroup)
  const size = bbox.getSize(new THREE.Vector3())
  const center = bbox.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1.5)
  const d = maxDim * 0.9

  const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 100)
  const elevationRad = THREE.MathUtils.degToRad(isoAngle)

  // Function to evaluate pose at a given frame
  const applyPoseAtFrame = (frame: number) => {
    if (!clip) return

    // Sample tracks in clip
    const boneTransforms = new Map<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>()

    for (const track of clip.tracks) {
      const pose = sampleTrack(track, frame)
      if (track.targetType === 'bone') {
        boneTransforms.set(track.targetId, {
          position: new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z),
          rotation: new THREE.Euler(
            THREE.MathUtils.degToRad(pose.rotation.x),
            THREE.MathUtils.degToRad(pose.rotation.y),
            THREE.MathUtils.degToRad(pose.rotation.z)
          ),
          scale: new THREE.Vector3(pose.scale.x, pose.scale.y, pose.scale.z)
        })
      } else {
        const item = threeMeshes.get(track.targetId)
        if (item) {
          item.threeMesh.position.set(pose.position.x, pose.position.y, pose.position.z)
          item.threeMesh.rotation.set(
            THREE.MathUtils.degToRad(pose.rotation.x),
            THREE.MathUtils.degToRad(pose.rotation.y),
            THREE.MathUtils.degToRad(pose.rotation.z)
          )
          item.threeMesh.scale.set(pose.scale.x, pose.scale.y, pose.scale.z)
        }
      }
    }

    // Apply bone parenting to meshes if mesh.parentId is set
    if (armature) {
      for (const [, { threeMesh, baseMesh }] of threeMeshes.entries()) {
        if (baseMesh.parentId && boneTransforms.has(baseMesh.parentId)) {
          const bTransform = boneTransforms.get(baseMesh.parentId)!
          threeMesh.position.copy(bTransform.position)
          threeMesh.rotation.copy(bTransform.rotation)
          threeMesh.scale.copy(bTransform.scale)
        }
      }
    }
  }

  // Render each direction and frame
  for (let dirIdx = 0; dirIdx < directions; dirIdx++) {
    const azimuthRad = (dirIdx / directions) * Math.PI * 2

    const camDist = 10
    const camX = center.x + Math.sin(azimuthRad) * Math.cos(elevationRad) * camDist
    const camY = center.y + Math.sin(elevationRad) * camDist
    const camZ = center.z + Math.cos(azimuthRad) * Math.cos(elevationRad) * camDist

    camera.position.set(camX, camY, camZ)
    camera.lookAt(center.x, center.y, center.z)

    for (let fIdx = 0; fIdx < frameIndices.length; fIdx++) {
      const frameNum = frameIndices[fIdx]
      applyPoseAtFrame(frameNum)

      renderer.render(scene, camera)
      ctx.drawImage(renderer.domElement, fIdx * frameWidth, dirIdx * frameHeight)
    }
  }

  // Clean up
  renderer.dispose()
  return sheetCanvas
}
