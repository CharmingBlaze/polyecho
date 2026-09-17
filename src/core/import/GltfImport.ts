import * as THREE from 'three'
import { MeshObject, Vertex, Face } from '../../types/mesh'
import { Armature, Bone, AnimationClip, AnimationTrack, AnimationMarker } from '../../types/animation'
import { Material, TextureMap } from '../../types/texture'
import { computeFaceNormal } from '../../utils/math'
import { ensureMeshUVs, boxUnwrap } from '../geometry/UVUnwrap'
import { DEFAULT_AUTO_SMOOTH_ANGLE, readImportedShade } from '../geometry/MeshShading'

export interface GltfImportResult {
  meshes: MeshObject[]
  armature?: Armature
  animations?: AnimationClip[]
  textureImage?: HTMLImageElement
  textures?: TextureMap[]
  materials?: Material[]
}

export class GltfImport {
  /**
   * Loads a GLTF or GLB binary array buffer into MeshObject and Armature data.
   */
  static async loadFromArrayBuffer(buffer: ArrayBuffer, fileName = 'Imported_Model'): Promise<GltfImportResult> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
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
    const importedTextures: TextureMap[] = []
    const importedMaterials: Material[] = []
    const textureByUuid = new Map<string, string>()

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
      const usedBoneIds = new Set<string>()
      for (const tb of threeBones) {
        let boneId = tb.name || `bone_${bones.length + 1}`
        if (usedBoneIds.has(boneId)) boneId = `${boneId}_${bones.length + 1}`
        usedBoneIds.add(boneId)
        boneIdMap.set(tb.uuid, boneId)
      }

      for (const tb of threeBones) {
        const boneId = boneIdMap.get(tb.uuid)!
        const worldPos = new THREE.Vector3()
        tb.getWorldPosition(worldPos)

        const childBone = threeBones.find(b => b.parent === tb)
        const tailPos = childBone ? new THREE.Vector3() : worldPos.clone().add(new THREE.Vector3(0, 0.5, 0))
        if (childBone) childBone.getWorldPosition(tailPos)

        const parentId = (tb.parent && (tb.parent as THREE.Bone).isBone)
          ? (boneIdMap.get(tb.parent.uuid) ?? null)
          : null

        if (!parentId) rootBoneIds.push(boneId)

        bones.push({
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
        })
      }

      for (const bone of bones) {
        if (bone.parentId) {
          const parent = bones.find(b => b.id === bone.parentId)
          if (parent && !parent.childrenIds.includes(bone.id)) parent.childrenIds.push(bone.id)
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
        const colAttr = geom.getAttribute('color')
        const skinIndexAttr = geom.getAttribute('skinIndex')
        const skinWeightAttr = geom.getAttribute('skinWeight')
        const indexAttr = geom.getIndex()

        if (!posAttr) return

        const worldPos = new THREE.Vector3()
        const worldQuat = new THREE.Quaternion()
        const worldScale = new THREE.Vector3()
        threeMesh.matrixWorld.decompose(worldPos, worldQuat, worldScale)
        const worldEuler = new THREE.Euler().setFromQuaternion(worldQuat)

        const skeleton = (threeMesh as THREE.SkinnedMesh).skeleton
        const meshVertices: Vertex[] = []
        const meshFaces: Face[] = []

        for (let i = 0; i < posAttr.count; i++) {
          const vertex: Vertex = {
            id: `v_${i + 1}`,
            position: { x: posAttr.getX(i), y: posAttr.getY(i), z: posAttr.getZ(i) }
          }
          if (colAttr) {
            vertex.color = colorAttrHex(colAttr, i)
          }
          if (skinIndexAttr && skinWeightAttr && skeleton) {
            const weights = skinWeightsFromAttrs(skinIndexAttr, skinWeightAttr, i, skeleton, boneIdMap)
            if (weights) vertex.boneWeights = weights
          }
          meshVertices.push(vertex)
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
          const bound = bindImportedMaterial(
            threeMesh.material,
            importedTextures,
            importedMaterials,
            textureByUuid
          )
          const parentBone = threeMesh.parent && (threeMesh.parent as THREE.Bone).isBone
            ? boneIdMap.get(threeMesh.parent.uuid)
            : undefined
          const shade = readImportedShade(threeMesh, geom)
          const gltfMesh: MeshObject = {
            id: `mesh_gltf_${meshes.length + 1}_${Math.random().toString(36).slice(2, 8)}`,
            name: threeMesh.name || `${fileName}_Mesh_${meshes.length + 1}`,
            visible: threeMesh.visible,
            locked: false,
            position: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
            rotation: {
              x: THREE.MathUtils.radToDeg(worldEuler.x),
              y: THREE.MathUtils.radToDeg(worldEuler.y),
              z: THREE.MathUtils.radToDeg(worldEuler.z)
            },
            scale: { x: worldScale.x, y: worldScale.y, z: worldScale.z },
            materialId: bound,
            shadeMode: shade.shadeMode,
            autoSmoothAngle: shade.autoSmoothAngle ?? (shade.shadeMode === 'auto' ? DEFAULT_AUTO_SMOOTH_ANGLE : undefined),
            parentBoneId: parentBone,
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
          const isBoneTarget = bones.some(b => b.id === boneName || b.name === boneName)

          let animTrack = trackMap.get(boneName)
          if (!animTrack) {
            animTrack = {
              targetId: boneName,
              targetType: isBoneTarget ? 'bone' : 'mesh',
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
            } else if (prop === 'quaternion') {
              const q = new THREE.Quaternion(
                values[k * 4],
                values[k * 4 + 1],
                values[k * 4 + 2],
                values[k * 4 + 3]
              )
              const euler = new THREE.Euler().setFromQuaternion(q)
              animTrack.rotationKeys.push({
                id: `krot_${frame}_${k}`,
                frame,
                value: {
                  x: THREE.MathUtils.radToDeg(euler.x),
                  y: THREE.MathUtils.radToDeg(euler.y),
                  z: THREE.MathUtils.radToDeg(euler.z)
                },
                interpolation: 'linear'
              })
            }
          }
        }

        animations.push({
          id: `clip_${clip.name || 'Action'}_${Date.now()}_${animations.length}`,
          name: clip.name || 'Action',
          fps: 24,
          durationFrames: Math.round(clip.duration * 24) || 24,
          loop: true,
          tracks: Array.from(trackMap.values()),
          markers: markersFromGltfClip(gltf, clip.name)
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
      animations: animations.length > 0 ? animations : undefined,
      textures: importedTextures.length > 0 ? importedTextures : undefined,
      materials: importedMaterials.length > 0 ? importedMaterials : undefined
    }
  }
}

function firstMaterial(mat: THREE.Material | THREE.Material[]): THREE.Material | null {
  if (Array.isArray(mat)) return mat[0] ?? null
  return mat ?? null
}

function textureToDataUrl(tex: THREE.Texture): string | undefined {
  const img = tex.image as { toDataURL?: (type?: string) => string } | HTMLCanvasElement | undefined
  if (!img) return undefined
  if (typeof (img as HTMLCanvasElement).toDataURL === 'function') {
    try {
      return (img as HTMLCanvasElement).toDataURL('image/png')
    } catch {
      return undefined
    }
  }
  return undefined
}

function bindImportedMaterial(
  rawMat: THREE.Material | THREE.Material[],
  textures: TextureMap[],
  materials: Material[],
  textureByUuid: Map<string, string>
): string {
  const threeMat = firstMaterial(rawMat)
  const map = threeMat && 'map' in threeMat
    ? ((threeMat as THREE.MeshStandardMaterial).map ?? null)
    : null

  let textureId: string | null = null
  if (map) {
    const existing = textureByUuid.get(map.uuid)
    if (existing) {
      textureId = existing
    } else {
      const image = map.image as { width?: number; height?: number } | undefined
      textureId = `tex_gltf_${textures.length + 1}`
      textureByUuid.set(map.uuid, textureId)
      textures.push({
        id: textureId,
        name: map.name || `Imported_${textures.length + 1}`,
        width: image?.width || 64,
        height: image?.height || 64,
        dataUrl: textureToDataUrl(map)
      })
    }
  }

  const color = threeMat && 'color' in threeMat && (threeMat as THREE.MeshStandardMaterial).color
    ? `#${(threeMat as THREE.MeshStandardMaterial).color.getHexString()}`
    : '#ffffff'
  const std = threeMat as THREE.MeshStandardMaterial
  const matId = `mat_gltf_${materials.length + 1}`
  materials.push({
    id: matId,
    name: threeMat?.name || `Imported_${materials.length + 1}`,
    textureId,
    color,
    shading: 'textured',
    roughness: typeof std.roughness === 'number' ? std.roughness : undefined,
    metalness: typeof std.metalness === 'number' ? std.metalness : undefined,
    opacity: typeof std.opacity === 'number' ? std.opacity : undefined,
    alphaTest: typeof std.alphaTest === 'number' ? std.alphaTest : undefined,
    blendMode: std?.transparent ? ((std.alphaTest ?? 0) > 0 ? 'mask' : 'blend') : 'opaque',
    doubleSided: std?.side === THREE.DoubleSide,
    psxJitter: false,
    psxJitterResolution: 240,
    psxAffine: false,
    dither: false,
    ditherLevel: 32,
    wireframe: Boolean(std?.wireframe)
  })
  return matId
}

type AttrXYZW = {
  getX(index: number): number
  getY(index: number): number
  getZ(index: number): number
  getW?(index: number): number
}

function colorAttrHex(attr: AttrXYZW, i: number): string {
  const color = new THREE.Color().setRGB(attr.getX(i), attr.getY(i), attr.getZ(i), THREE.LinearSRGBColorSpace)
  return `#${color.getHexString()}`
}

function skinWeightsFromAttrs(
  skinIndex: AttrXYZW,
  skinWeight: AttrXYZW,
  i: number,
  skeleton: THREE.Skeleton,
  boneIdMap: Map<string, string>
): Record<string, number> | undefined {
  const idx = [skinIndex.getX(i), skinIndex.getY(i), skinIndex.getZ(i), skinIndex.getW?.(i) ?? 0]
  const w = [skinWeight.getX(i), skinWeight.getY(i), skinWeight.getZ(i), skinWeight.getW?.(i) ?? 0]
  const weights: Record<string, number> = {}
  for (let k = 0; k < 4; k++) {
    if (w[k] <= 0.001) continue
    const bone = skeleton.bones[idx[k]]
    if (!bone) continue
    const id = boneIdMap.get(bone.uuid) || bone.name
    if (!id) continue
    weights[id] = (weights[id] || 0) + w[k]
  }
  return Object.keys(weights).length ? weights : undefined
}

function markersFromGltfClip(gltf: { parser?: { json?: { animations?: Array<{ name?: string; extras?: { events?: Array<{ name?: string; frame?: number; time?: number }> } }> } } }, clipName: string): AnimationMarker[] | undefined {
  const raw = gltf.parser?.json?.animations?.find(a => a.name === clipName)
  const events = raw?.extras?.events
  if (!events?.length) return undefined
  return events.map((ev, i) => ({
    id: `mk_${clipName}_${i}`,
    name: ev.name || `Marker_${i + 1}`,
    frame: typeof ev.frame === 'number' ? ev.frame : Math.round((ev.time || 0) * 24)
  }))
}
