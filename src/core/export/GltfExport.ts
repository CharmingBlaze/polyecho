import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { MeshObject } from '../../types/mesh'
import { AnimationClip } from '../../types/animation'
import { meshToThreeGeometry } from '../geometry/Converters'

export async function exportToGLTF(
  meshes: MeshObject[],
  textureMap: Map<string, THREE.Texture>,
  clips: AnimationClip[] = [],
  binary = true
): Promise<Blob> {
  const scene = new THREE.Scene()

  for (const meshObj of meshes) {
    if (!meshObj.visible) continue

    const { geometry } = meshToThreeGeometry(meshObj)
    const texture = textureMap.get(meshObj.materialId) || null

    let material: THREE.Material
    if (texture) {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      material = new THREE.MeshBasicMaterial({
        map: texture,
        vertexColors: true,
        side: THREE.DoubleSide
      })
    } else {
      material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.8,
        metalness: 0.1,
        vertexColors: true,
        side: THREE.DoubleSide
      })
    }

    const threeMesh = new THREE.Mesh(geometry, material)
    threeMesh.name = meshObj.name
    threeMesh.position.set(meshObj.position.x, meshObj.position.y, meshObj.position.z)
    threeMesh.rotation.set(
      THREE.MathUtils.degToRad(meshObj.rotation.x),
      THREE.MathUtils.degToRad(meshObj.rotation.y),
      THREE.MathUtils.degToRad(meshObj.rotation.z)
    )
    threeMesh.scale.set(meshObj.scale.x, meshObj.scale.y, meshObj.scale.z)

    scene.add(threeMesh)
  }

  // Convert AnimationClips to Three.js AnimationClips
  const threeClips: THREE.AnimationClip[] = []

  for (const clip of clips) {
    const tracks: THREE.KeyframeTrack[] = []
    const fps = clip.fps || 24
    const duration = (clip.durationFrames || 24) / fps

    if (clip.tracks && clip.tracks.length > 0) {
      for (const track of clip.tracks) {
        let targetNodeName = ''
        if (track.targetType === 'mesh') {
          const mesh = meshes.find(m => m.id === track.targetId)
          if (mesh) targetNodeName = mesh.name
        } else {
          targetNodeName = track.targetName || track.targetId
        }
        if (!targetNodeName) continue

        // Position keys
        if (track.positionKeys && track.positionKeys.length > 0) {
          const times: number[] = []
          const values: number[] = []
          for (const k of track.positionKeys) {
            times.push(k.frame / fps)
            values.push(k.value.x, k.value.y, k.value.z)
          }
          tracks.push(new THREE.VectorKeyframeTrack(`${targetNodeName}.position`, times, values))
        }

        // Rotation keys (Euler to Quaternion)
        if (track.rotationKeys && track.rotationKeys.length > 0) {
          const times: number[] = []
          const values: number[] = []
          for (const k of track.rotationKeys) {
            times.push(k.frame / fps)
            const euler = new THREE.Euler(
              THREE.MathUtils.degToRad(k.value.x),
              THREE.MathUtils.degToRad(k.value.y),
              THREE.MathUtils.degToRad(k.value.z)
            )
            const q = new THREE.Quaternion().setFromEuler(euler)
            values.push(q.x, q.y, q.z, q.w)
          }
          tracks.push(new THREE.QuaternionKeyframeTrack(`${targetNodeName}.quaternion`, times, values))
        }

        // Scale keys
        if (track.scaleKeys && track.scaleKeys.length > 0) {
          const times: number[] = []
          const values: number[] = []
          for (const k of track.scaleKeys) {
            times.push(k.frame / fps)
            values.push(k.value.x, k.value.y, k.value.z)
          }
          tracks.push(new THREE.VectorKeyframeTrack(`${targetNodeName}.scale`, times, values))
        }
      }
    }

    if (tracks.length > 0) {
      const threeClip = new THREE.AnimationClip(clip.name, duration, tracks)
      if (clip.markers && clip.markers.length > 0) {
        ;(threeClip as any).userData = {
          events: clip.markers.map(m => ({
            name: m.name,
            frame: m.frame,
            time: Number((m.frame / fps).toFixed(3))
          }))
        }
      }
      threeClips.push(threeClip)
    }
  }

  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (gltf) => {
        if (binary) {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' })
          resolve(blob)
        } else {
          const output = JSON.stringify(gltf, null, 2)
          const blob = new Blob([output], { type: 'model/gltf+json' })
          resolve(blob)
        }
      },
      (error) => reject(error),
      { binary, animations: threeClips }
    )
  })
}
