import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshObject, Vertex, Face } from '../../types/mesh'
import { Armature, Bone, AnimationClip, AnimationTrack } from '../../types/animation'
import { computeFaceNormal } from '../../utils/math'
import { ensureMeshUVs, boxUnwrap } from '../geometry/UVUnwrap'

export interface GltfImportResult {
  meshes: MeshObject[]
  armature?: Armature
  animations?: AnimationClip[]
  textureImage?: HTMLImageElement
}

export class GltfImport {
  /**
   * Loads a GLTF or GLB binary array buffer into MeshObject and Armature data.
   */
  static async loadFromArrayBuffer(buffer: ArrayBuffer, fileName = 'Imported_Model'): Promise<GltfImportResult> {
    const loader = new GLTFLoader()

    const gltf = await new Promise<any>((resolve, reject) => {
      loader.parse(
        buffer,
        '',
        gltfData => resolve(gltfData),
        err => reject(err)
      )
    })

    const meshes: MeshObject[] = []
    const bones: Bone[] = []
    const threeBones: THREE.Bone[] = []

    // 1. Traverse scene graph to collect meshes & bones
    gltf.scene.updateMatrixWorld(true)

    gltf.scene.traverse((obj: THREE.Object3D) => {
      if ((obj as any).isBone) {
        threeBones.push(obj as THREE.Bone)
      }
    })

    // Process Bones if skeleton exists
    const rootBoneIds: string[] = []
    const boneIdMap = new Map<string, string>()

    if (threeBones.length > 0) {
      for (const tb of threeBones) {
        const boneId = tb.name || `bone_${bones.length + 1}`
        boneIdMap.set(tb.uuid, boneId)

        const worldPos = new THREE.Vector3()
        tb.getWorldPosition(worldPos)

        const childBone = threeBones.find(b => b.parent === tb)
        const tailPos = childBone ? new THREE.Vector3() : worldPos.clone().add(new THREE.Vector3(0, 0.5, 0))
        if (childBone) {
          childBone.getWorldPosition(tailPos)
        }

        const parentId = (tb.parent && (tb.parent as any).isBone)
          ? (tb.parent.name || (tb.parent as any).uuid)
          : null

        if (!parentId) {
          rootBoneIds.push(boneId)
        }

        const bone: Bone = {
          id: boneId,
          name: tb.name || boneId,
          parentId,
          head: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
          tail: { x: tailPos.x, y: tailPos.y, z: tailPos.z },
          position: { x: tb.position.x, y: tb.position.y, z: tb.position.z },
          rotation: {
            x: THREE.MathUtils.radToDeg(tb.rotation.x),
            y: THREE.MathUtils.radToDeg(tb.rotation.y),
            z: THREE.MathUtils.radToDeg(tb.rotation.z)
          },
          scale: { x: tb.scale.x, y: tb.scale.y, z: tb.scale.z },
          childrenIds: []
        }

        bones.push(bone)
      }

      // Populate childrenIds
      for (const bone of bones) {
        if (bone.parentId) {
          const parent = bones.find(b => b.id === bone.parentId)
          if (parent && !parent.childrenIds.includes(bone.id)) {
            parent.childrenIds.push(bone.id)
          }
        }
      }
    }

    // Process Meshes
    gltf.scene.traverse((obj: THREE.Object3D) => {
      if ((obj as any).isMesh) {
        const threeMesh = obj as THREE.Mesh
        const geom = threeMesh.geometry
        if (!geom) return

        const posAttr = geom.getAttribute('position')
        const uvAttr = geom.getAttribute('uv')
        const indexAttr = geom.getIndex()

        if (!posAttr) return

        const meshVertices: Vertex[] = []
        const meshFaces: Face[] = []

        // Extract vertices
        for (let i = 0; i < posAttr.count; i++) {
          const vPos = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
          vPos.applyMatrix4(threeMesh.matrixWorld)

          meshVertices.push({
            id: `v_${i + 1}`,
            position: { x: vPos.x, y: vPos.y, z: vPos.z }
          })
        }

        // Extract Triangles into Faces
        const triangleCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3

        for (let i = 0; i < triangleCount; i++) {
          const i0 = indexAttr ? indexAttr.getX(i * 3) : i * 3
          const i1 = indexAttr ? indexAttr.getX(i * 3 + 1) : i * 3 + 1
          const i2 = indexAttr ? indexAttr.getX(i * 3 + 2) : i * 3 + 2

          const vid0 = `v_${i0 + 1}`
          const vid1 = `v_${i1 + 1}`
          const vid2 = `v_${i2 + 1}`

          const uvs: { u: number; v: number }[] = []
          if (uvAttr) {
            uvs.push(
              { u: uvAttr.getX(i0), v: uvAttr.getY(i0) },
              { u: uvAttr.getX(i1), v: uvAttr.getY(i1) },
              { u: uvAttr.getX(i2), v: uvAttr.getY(i2) }
            )
          } else {
            uvs.push({ u: 0, v: 0 }, { u: 1, v: 0 }, { u: 0, v: 1 })
          }

          const v0 = meshVertices[i0]?.position || { x: 0, y: 0, z: 0 }
          const v1 = meshVertices[i1]?.position || { x: 0, y: 0, z: 0 }
          const v2 = meshVertices[i2]?.position || { x: 0, y: 0, z: 0 }
          const normal = computeFaceNormal([v0, v1, v2])

          meshFaces.push({
            id: `f_${i + 1}`,
            vertexIds: [vid0, vid1, vid2],
            uvs,
            normal,
            materialIndex: 0
          })
        }

        if (meshVertices.length > 0 && meshFaces.length > 0) {
          const gltfMesh: MeshObject = {
            id: `mesh_gltf_${Date.now()}_${meshes.length + 1}`,
            name: threeMesh.name || `${fileName}_Mesh_${meshes.length + 1}`,
            visible: true,
            locked: false,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            materialId: 'default_material',
            shadeMode: 'flat',
            vertices: meshVertices,
            faces: meshFaces
          }

          // Check if UVs exist or need Smart Box Unwrap
          const hasValidUVs = meshFaces.some(f => f.uvs && f.uvs.some(u => u.u !== 0 || u.v !== 0))
          if (!hasValidUVs) {
            const unwrapped = boxUnwrap(gltfMesh)
            gltfMesh.faces = unwrapped.faces
          }
          ensureMeshUVs(gltfMesh)

          meshes.push(gltfMesh)
        }
      }
    })

    // Process Animations if present
    const animations: AnimationClip[] = []
    if (gltf.animations && gltf.animations.length > 0) {
      for (const clip of gltf.animations) {
        const trackMap = new Map<string, AnimationTrack>()
        const fps = 24

        for (const track of clip.tracks) {
          const trackName = track.name
          const boneName = trackName.split('.')[0]
          const prop = trackName.split('.')[1] // 'position' | 'quaternion' | 'scale'

          let animTrack = trackMap.get(boneName)
          if (!animTrack) {
            animTrack = {
              targetId: boneName,
              targetType: 'bone',
              targetName: boneName,
              positionKeys: [],
              rotationKeys: [],
              scaleKeys: []
            }
            trackMap.set(boneName, animTrack)
          }

          const times = track.times
          const values = track.values

          for (let k = 0; k < times.length; k++) {
            const frame = Math.round(times[k] * fps)
            if (prop === 'position') {
              animTrack.positionKeys.push({
                id: `kpos_${frame}_${k}`,
                frame,
                value: { x: values[k * 3], y: values[k * 3 + 1], z: values[k * 3 + 2] },
                interpolation: 'linear'
              })
            } else if (prop === 'scale') {
              animTrack.scaleKeys.push({
                id: `kscale_${frame}_${k}`,
                frame,
                value: { x: values[k * 3], y: values[k * 3 + 1], z: values[k * 3 + 2] },
                interpolation: 'linear'
              })
            }
          }
        }

        animations.push({
          id: `clip_${clip.name || 'Action'}_${Date.now()}`,
          name: clip.name || 'Action',
          fps: 24,
          durationFrames: Math.round(clip.duration * 24) || 24,
          loop: true,
          tracks: Array.from(trackMap.values())
        })
      }
    }

    const armature: Armature | undefined = bones.length > 0 ? {
      id: `armature_${Date.now()}`,
      name: `${fileName}_Armature`,
      bones,
      rootBoneIds,
      clips: animations,
      activeClipId: animations[0]?.id || null
    } : undefined

    return {
      meshes,
      armature,
      animations: animations.length > 0 ? animations : undefined
    }
  }
}
