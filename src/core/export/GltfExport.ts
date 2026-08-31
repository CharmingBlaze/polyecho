import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { MeshObject } from '../../types/mesh'
import { AnimationClip, Armature } from '../../types/animation'
import { meshToThreeGeometry } from '../geometry/Converters'

export async function exportToGLTF(
  meshes: MeshObject[],
  textureMap: Map<string, THREE.Texture>,
  clips: AnimationClip[] = [],
  binary = true,
  armature?: Armature
): Promise<Blob> {
  const scene = new THREE.Scene()

  // 1. Build Three.js Bone hierarchy & Skeleton if armature exists
  const hasArmature = armature && armature.bones && armature.bones.length > 0
  const threeBoneMap = new Map<string, THREE.Bone>()
  const boneIndexMap = new Map<string, number>()
  const skeletonBones: THREE.Bone[] = []
  let skeleton: THREE.Skeleton | null = null

  if (hasArmature) {
    for (let i = 0; i < armature.bones.length; i++) {
      const b = armature.bones[i]
      const tb = new THREE.Bone()
      tb.name = b.name || b.id
      threeBoneMap.set(b.id, tb)
      boneIndexMap.set(b.id, i)
      skeletonBones.push(tb)
    }

    const rootBones: THREE.Bone[] = []
    for (const b of armature.bones) {
      const tb = threeBoneMap.get(b.id)!
      if (b.parentId && threeBoneMap.has(b.parentId)) {
        const parentBone = armature.bones.find(x => x.id === b.parentId)
        if (parentBone) {
          tb.position.set(
            b.head.x - parentBone.head.x,
            b.head.y - parentBone.head.y,
            b.head.z - parentBone.head.z
          )
        } else {
          tb.position.set(b.head.x, b.head.y, b.head.z)
        }
        threeBoneMap.get(b.parentId)!.add(tb)
      } else {
        tb.position.set(b.head.x, b.head.y, b.head.z)
        rootBones.push(tb)
      }
    }

    const armatureGroup = new THREE.Group()
    armatureGroup.name = armature.name || 'Armature'
    for (const rb of rootBones) {
      armatureGroup.add(rb)
    }
    scene.add(armatureGroup)

    skeleton = new THREE.Skeleton(skeletonBones)
  }

  // 2. Build Meshes & Skinned Meshes
  for (const meshObj of meshes) {
    if (!meshObj.visible) continue

    const {
      geometry,
      wireframeGeometry,
      vertexPointsGeometry,
      selectedFacesGeometry,
      selectedEdgesGeometry,
      edgeLinesGeometry
    } = meshToThreeGeometry(meshObj)
    wireframeGeometry.dispose()
    vertexPointsGeometry.dispose()
    selectedFacesGeometry.dispose()
    selectedEdgesGeometry.dispose()
    edgeLinesGeometry.dispose()
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

    if (hasArmature && skeleton) {
      // Build skinIndex and skinWeight buffers for SkinnedMesh
      const posAttr = geometry.getAttribute('position')
      const vertCount = posAttr ? posAttr.count : 0
      const skinIndices: number[] = []
      const skinWeights: number[] = []

      // Create lookup map for vertices
      const meshVertMap = new Map<string, any>()
      for (const v of meshObj.vertices) {
        meshVertMap.set(v.id, v)
      }

      // Check if mesh has parent bone or vertex weights
      const defaultBoneIdx = meshObj.parentBoneId && boneIndexMap.has(meshObj.parentBoneId)
        ? boneIndexMap.get(meshObj.parentBoneId)!
        : 0

      for (let i = 0; i < vertCount; i++) {
        // Approximate vertex matching or parent bone fallback
        const vx = posAttr.getX(i)
        const vy = posAttr.getY(i)
        const vz = posAttr.getZ(i)

        let matchedVert: any = null
        for (const v of meshObj.vertices) {
          if (Math.hypot(v.position.x - vx, v.position.y - vy, v.position.z - vz) < 0.001) {
            matchedVert = v
            break
          }
        }

        if (matchedVert && matchedVert.boneWeights && Object.keys(matchedVert.boneWeights).length > 0) {
          const entries = Object.entries(matchedVert.boneWeights)
            .filter(([bId, w]) => (w as number) > 0.001 && boneIndexMap.has(bId))
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .slice(0, 4)

          let totalW = entries.reduce((acc, [, w]) => acc + (w as number), 0)
          if (totalW < 0.0001) totalW = 1

          const idx4 = [0, 0, 0, 0]
          const w4 = [0, 0, 0, 0]
          for (let k = 0; k < entries.length; k++) {
            idx4[k] = boneIndexMap.get(entries[k][0]) || 0
            w4[k] = (entries[k][1] as number) / totalW
          }
          skinIndices.push(...idx4)
          skinWeights.push(...w4)
        } else {
          skinIndices.push(defaultBoneIdx, 0, 0, 0)
          skinWeights.push(1, 0, 0, 0)
        }
      }

      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))

      const skinnedMesh = new THREE.SkinnedMesh(geometry, material)
      skinnedMesh.name = meshObj.name
      skinnedMesh.position.set(meshObj.position.x, meshObj.position.y, meshObj.position.z)
      skinnedMesh.rotation.set(
        THREE.MathUtils.degToRad(meshObj.rotation.x),
        THREE.MathUtils.degToRad(meshObj.rotation.y),
        THREE.MathUtils.degToRad(meshObj.rotation.z)
      )
      skinnedMesh.scale.set(meshObj.scale.x, meshObj.scale.y, meshObj.scale.z)

      skinnedMesh.bind(skeleton)
      scene.add(skinnedMesh)
    } else {
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
  }

  // 3. Convert AnimationClips to Three.js AnimationClips targeting bones and meshes
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
          // Bone target
          const bone = armature?.bones.find(b => b.id === track.targetId)
          targetNodeName = bone ? (bone.name || bone.id) : (track.targetName || track.targetId)
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
  const disposeScene = () => {
    scene.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose()
        const material = (obj as THREE.Mesh).material
        if (Array.isArray(material)) {
          for (const m of material) m.dispose()
        } else if (material) {
          material.dispose()
        }
      }
    })
  }
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (gltf) => {
        disposeScene()
        if (binary) {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' })
          resolve(blob)
        } else {
          const output = JSON.stringify(gltf, null, 2)
          const blob = new Blob([output], { type: 'model/gltf+json' })
          resolve(blob)
        }
      },
      (error) => {
        disposeScene()
        reject(error)
      },
      { binary, animations: threeClips }
    )
  })
}
