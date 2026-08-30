import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Armature, Bone, BoneSocket, Keyframe, AnimationClip, AnimationTrack, InterpolationType } from '../types/animation'
import { Vector3D, MeshObject, Vertex } from '../types/mesh'
import { sampleTrack } from '../core/animation/Armature'
import { autoWeightMeshToArmature } from '../core/animation/AutoSkinning'
import { useProjectStore } from './projectStore'

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`
}

export const useAnimationStore = defineStore('animation', () => {
  const projectStore = useProjectStore()

  // Active Armature & Clip Stack
  const armature = ref<Armature>({
    id: 'armature_main',
    name: 'Armature',
    bones: [],
    rootBoneIds: [],
    clips: [
      {
        id: 'clip_idle',
        name: 'Idle',
        durationFrames: 24,
        fps: 12,
        loop: true,
        tracks: []
      },
      {
        id: 'clip_walk',
        name: 'Walk',
        durationFrames: 24,
        fps: 12,
        loop: true,
        tracks: []
      }
    ],
    activeClipId: 'clip_idle'
  })

  const selectedBoneId = ref<string | null>(null)
  const selectedSocketId = ref<string | null>(null)
  const currentFrame = ref<number>(0)
  const isPlaying = ref<boolean>(false)
  const playbackSpeed = ref<number>(1)
  const loopMode = ref<'loop' | 'once' | 'pingpong'>('loop')
  const showBones = ref<boolean>(true)
  const xrayBones = ref<boolean>(true)
  const isTestPoseActive = ref<boolean>(false)
  const clickToPlaceMode = ref<boolean>(false)
  const showBoneHierarchyPopout = ref<boolean>(false)
  const autoKey = ref<boolean>(true)
  const interpolationMode = ref<InterpolationType>('cubic')
  const onionSkin = ref<boolean>(false)
  const onionFramesCount = ref<number>(2)
  const onionOpacity = ref<number>(0.35)
  const showMotionTrail = ref<boolean>(false)
  const recordedStatusMessage = ref<string>('Ready')

  // Weight Painting Suite State
  const isWeightPaintActive = ref<boolean>(false)
  const weightPaintTool = ref<'draw' | 'subtract' | 'smooth' | 'fill' | 'sample'>('draw')
  const weightBrushWeight = ref<number>(1.0)
  const weightBrushRadius = ref<number>(0.5)
  const weightBrushStrength = ref<number>(0.8)
  const weightBrushFalloff = ref<'smooth' | 'linear' | 'constant'>('smooth')
  const weightAutoNormalize = ref<boolean>(true)
  const weightXMirror = ref<boolean>(false)
  const showHeatmapLegend = ref<boolean>(true)

  function toggleWeightPaint(active?: boolean) {
    if (typeof active === 'boolean') {
      isWeightPaintActive.value = active
    } else {
      isWeightPaintActive.value = !isWeightPaintActive.value
    }
    if (isWeightPaintActive.value) {
      isTestPoseActive.value = false
      resetAllBonesToRest()
    }
  }

  function toggleBoneHierarchyPopout(force?: boolean) {
    if (typeof force === 'boolean') {
      showBoneHierarchyPopout.value = force
    } else {
      showBoneHierarchyPopout.value = !showBoneHierarchyPopout.value
    }
  }

  // Blockbench / GLB Animator Pose Clipboard
  const poseClipboard = ref<Record<string, { position: Vector3D; rotation: Vector3D; scale: Vector3D }>>({})

  let playInterval: number | null = null
  let playDirection = 1

  // Computed
  const activeClip = computed(() => {
    return armature.value.clips.find(c => c.id === armature.value.activeClipId) || armature.value.clips[0]
  })

  const selectedBone = computed(() => {
    return armature.value.bones.find(b => b.id === selectedBoneId.value) || null
  })

  const selectedSocket = computed(() => {
    if (!selectedSocketId.value) return null
    for (const b of armature.value.bones) {
      const s = (b.sockets || []).find(sock => sock.id === selectedSocketId.value)
      if (s) return { socket: s, bone: b }
    }
    return null
  })

  function selectSocket(socketId: string | null) {
    selectedSocketId.value = socketId
    if (socketId) {
      for (const b of armature.value.bones) {
        if ((b.sockets || []).some(s => s.id === socketId)) {
          selectedBoneId.value = b.id
          break
        }
      }
    }
  }

  const currentTimeSeconds = computed({
    get: () => {
      const fps = activeClip.value?.fps || 12
      return Number((currentFrame.value / fps).toFixed(2))
    },
    set: (sec: number) => {
      const fps = activeClip.value?.fps || 12
      setFrame(Math.round(sec * fps))
    }
  })

  const totalDurationSeconds = computed(() => {
    const fps = activeClip.value?.fps || 12
    const duration = activeClip.value?.durationFrames || 24
    return Number((duration / fps).toFixed(1))
  })

  // ----------------------------------------------------
  // CLIP MANAGEMENT (Multiple Animations For Games)
  // ----------------------------------------------------
  function addClip(name = 'New_Action', durationFrames = 24, fps = 12): AnimationClip {
    projectStore.recordState('Add Animation Clip')
    const newClip: AnimationClip = {
      id: genId('clip'),
      name,
      durationFrames,
      fps,
      loop: true,
      tracks: []
    }
    armature.value.clips.push(newClip)
    armature.value.activeClipId = newClip.id
    currentFrame.value = 0
    return newClip
  }

  function duplicateClip(clipId: string): AnimationClip | null {
    const src = armature.value.clips.find(c => c.id === clipId)
    if (!src) return null
    projectStore.recordState('Duplicate Animation Clip')
    const cloned: AnimationClip = JSON.parse(JSON.stringify(src))
    cloned.id = genId('clip')
    cloned.name = `${src.name}_Copy`
    armature.value.clips.push(cloned)
    armature.value.activeClipId = cloned.id
    return cloned
  }

  function deleteClip(clipId: string) {
    if (armature.value.clips.length <= 1) return
    projectStore.recordState('Delete Animation Clip')
    armature.value.clips = armature.value.clips.filter(c => c.id !== clipId)
    if (armature.value.activeClipId === clipId) {
      armature.value.activeClipId = armature.value.clips[0].id
      currentFrame.value = 0
    }
  }

  function renameClip(clipId: string, newName: string) {
    const clip = armature.value.clips.find(c => c.id === clipId)
    if (clip && newName.trim()) {
      projectStore.recordState('Rename Animation Clip')
      clip.name = newName.trim()
    }
  }

  function selectClip(clipId: string) {
    armature.value.activeClipId = clipId
    currentFrame.value = 0
    evaluatePose()
  }

  // ----------------------------------------------------
  // BONE MANAGEMENT
  // ----------------------------------------------------
  function addRootBone(name = 'Bone_Root'): Bone {
    projectStore.recordState('Add Root Bone')
    const newBone: Bone = {
      id: genId('bone'),
      name,
      parentId: null,
      head: { x: 0, y: 0, z: 0 },
      tail: { x: 0, y: 1.2, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      childrenIds: []
    }
    armature.value.bones.push(newBone)
    armature.value.rootBoneIds.push(newBone.id)
    selectedBoneId.value = newBone.id
    return newBone
  }

  function addChildBone(parentId: string, name = 'Bone_Child'): Bone | null {
    const parent = armature.value.bones.find(b => b.id === parentId)
    if (!parent) return null

    projectStore.recordState('Add Child Bone')
    const newBone: Bone = {
      id: genId('bone'),
      name,
      parentId: parent.id,
      head: { ...parent.tail },
      tail: { x: parent.tail.x, y: parent.tail.y + 1.0, z: parent.tail.z },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      childrenIds: []
    }

    armature.value.bones.push(newBone)
    parent.childrenIds.push(newBone.id)
    selectedBoneId.value = newBone.id
    return newBone
  }

  function deleteBone(boneId: string) {
    const boneIndex = armature.value.bones.findIndex(b => b.id === boneId)
    if (boneIndex === -1) return
    projectStore.recordState('Delete Bone')
    const bone = armature.value.bones[boneIndex]

    if (bone.parentId) {
      const parent = armature.value.bones.find(b => b.id === bone.parentId)
      if (parent) {
        parent.childrenIds = parent.childrenIds.filter(id => id !== boneId)
      }
    } else {
      armature.value.rootBoneIds = armature.value.rootBoneIds.filter(id => id !== boneId)
    }

    for (const childId of bone.childrenIds) {
      const child = armature.value.bones.find(b => b.id === childId)
      if (child) {
        child.parentId = bone.parentId
        if (!bone.parentId) {
          armature.value.rootBoneIds.push(child.id)
        }
      }
    }

    armature.value.bones.splice(boneIndex, 1)
    if (selectedBoneId.value === boneId) {
      selectedBoneId.value = armature.value.bones[0]?.id || null
    }
  }

  function renameBone(boneId: string, newName: string) {
    const bone = armature.value.bones.find(b => b.id === boneId)
    if (bone && newName.trim()) {
      projectStore.recordState('Rename Bone')
      bone.name = newName.trim()
    }
  }

  function selectBone(id: string | null) {
    selectedBoneId.value = id
  }

  function generateSmartBoneName(parentName?: string): string {
    const existingNames = new Set(armature.value.bones.map(b => b.name))
    if (!parentName) {
      let idx = armature.value.bones.length + 1
      while (existingNames.has(`Bone_${idx}`)) {
        idx++
      }
      return `Bone_${idx}`
    }

    // Strip trailing _Ext or .001, etc.
    const base = parentName.replace(/(_Ext|\.\d+)+$/g, '')
    let idx = 1
    while (true) {
      const suffix = String(idx).padStart(3, '0')
      const candidate = `${base}.${suffix}`
      if (!existingNames.has(candidate)) {
        return candidate
      }
      idx++
    }
  }

  function selectParentBone() {
    if (!selectedBone.value || !selectedBone.value.parentId) return
    selectedBoneId.value = selectedBone.value.parentId
  }

  function selectFirstChildBone() {
    if (!selectedBone.value || selectedBone.value.childrenIds.length === 0) return
    selectedBoneId.value = selectedBone.value.childrenIds[0]
  }

  function selectNextBone() {
    const bones = armature.value.bones
    if (bones.length === 0) return
    if (!selectedBoneId.value) {
      selectedBoneId.value = bones[0].id
      return
    }
    const curIdx = bones.findIndex(b => b.id === selectedBoneId.value)
    if (curIdx >= 0 && curIdx < bones.length - 1) {
      selectedBoneId.value = bones[curIdx + 1].id
    } else {
      selectedBoneId.value = bones[0].id
    }
  }

  function selectPreviousBone() {
    const bones = armature.value.bones
    if (bones.length === 0) return
    if (!selectedBoneId.value) {
      selectedBoneId.value = bones[bones.length - 1].id
      return
    }
    const curIdx = bones.findIndex(b => b.id === selectedBoneId.value)
    if (curIdx > 0) {
      selectedBoneId.value = bones[curIdx - 1].id
    } else {
      selectedBoneId.value = bones[bones.length - 1].id
    }
  }

  function extrudeBone(parentBoneId?: string | null): Bone {
    const pId = parentBoneId || selectedBoneId.value
    const parent = pId ? armature.value.bones.find(b => b.id === pId) : null

    if (!parent) {
      return addRootBone(generateSmartBoneName())
    }

    const dirX = parent.tail.x - parent.head.x
    const dirY = parent.tail.y - parent.head.y
    const dirZ = parent.tail.z - parent.head.z
    const len = Math.hypot(dirX, dirY, dirZ) || 1.0
    const normX = dirX / len
    const normY = dirY / len
    const normZ = dirZ / len

    const newBone: Bone = {
      id: genId('bone'),
      name: generateSmartBoneName(parent.name),
      parentId: parent.id,
      head: { ...parent.tail },
      tail: {
        x: parent.tail.x + normX * 1.0,
        y: parent.tail.y + normY * 1.0,
        z: parent.tail.z + normZ * 1.0
      },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      childrenIds: []
    }

    armature.value.bones.push(newBone)
    parent.childrenIds.push(newBone.id)
    selectedBoneId.value = newBone.id
    return newBone
  }

  function subdivideBone(boneId: string): Bone[] {
    const bone = armature.value.bones.find(b => b.id === boneId)
    if (!bone) return []

    const midX = (bone.head.x + bone.tail.x) / 2
    const midY = (bone.head.y + bone.tail.y) / 2
    const midZ = (bone.head.z + bone.tail.z) / 2

    const oldTail = { ...bone.tail }
    bone.tail = { x: midX, y: midY, z: midZ }

    const newBone: Bone = {
      id: genId('bone'),
      name: `${bone.name}_Sub`,
      parentId: bone.id,
      head: { x: midX, y: midY, z: midZ },
      tail: oldTail,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      childrenIds: [...bone.childrenIds]
    }

    for (const childId of bone.childrenIds) {
      const child = armature.value.bones.find(b => b.id === childId)
      if (child) child.parentId = newBone.id
    }
    bone.childrenIds = [newBone.id]

    armature.value.bones.push(newBone)
    selectedBoneId.value = newBone.id
    return [bone, newBone]
  }

  function symmetrizeArmature() {
    const existingBones = [...armature.value.bones]
    const idMap = new Map<string, string>()

    for (const bone of existingBones) {
      const name = bone.name
      const lower = name.toLowerCase()

      if (lower.includes('_l') || lower.includes('.l') || lower.includes('left')) {
        let symName = name
        if (lower.includes('_l')) symName = name.replace(/_l/gi, '_R')
        else if (lower.includes('.l')) symName = name.replace(/\.l/gi, '.R')
        else if (lower.includes('left')) symName = name.replace(/left/gi, 'Right')

        if (armature.value.bones.some(b => b.name === symName)) continue

        const symBone: Bone = {
          id: genId('bone'),
          name: symName,
          parentId: null,
          head: { x: -bone.head.x, y: bone.head.y, z: bone.head.z },
          tail: { x: -bone.tail.x, y: bone.tail.y, z: bone.tail.z },
          position: { x: -bone.position.x, y: bone.position.y, z: bone.position.z },
          rotation: { x: bone.rotation.x, y: -bone.rotation.y, z: -bone.rotation.z },
          scale: { ...bone.scale },
          childrenIds: []
        }

        idMap.set(bone.id, symBone.id)
        armature.value.bones.push(symBone)
      }
    }

    for (const [origId, symId] of idMap.entries()) {
      const orig = existingBones.find(b => b.id === origId)
      const sym = armature.value.bones.find(b => b.id === symId)
      if (!orig || !sym) continue

      if (orig.parentId) {
        const symParentId = idMap.get(orig.parentId) || orig.parentId
        sym.parentId = symParentId
        const pBone = armature.value.bones.find(b => b.id === symParentId)
        if (pBone && !pBone.childrenIds.includes(sym.id)) {
          pBone.childrenIds.push(sym.id)
        }
      } else {
        armature.value.rootBoneIds.push(sym.id)
      }
    }
  }

  function parentMeshToBone(meshId: string, boneId: string | null) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    mesh.parentId = boneId || undefined
    mesh.armatureId = boneId ? armature.value.id : undefined
  }

  function autoWeightMeshToBones(mesh: MeshObject) {
    if (armature.value.bones.length === 0) return
    autoWeightMeshToArmature(mesh, armature.value.bones, { maxInfluences: 4, falloffPower: 2.0 })
    projectStore.markGeometryUpdated()
  }

  function addBoneFromPoints(head: Vector3D, tail: Vector3D, parentId?: string | null, name = 'Bone'): Bone {
    const newBone: Bone = {
      id: genId('bone'),
      name,
      parentId: parentId || null,
      head: { ...head },
      tail: { ...tail },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      childrenIds: []
    }
    armature.value.bones.push(newBone)
    if (parentId) {
      const p = armature.value.bones.find(b => b.id === parentId)
      if (p && !p.childrenIds.includes(newBone.id)) {
        p.childrenIds.push(newBone.id)
      }
    } else {
      armature.value.rootBoneIds.push(newBone.id)
    }
    selectedBoneId.value = newBone.id
    return newBone
  }

  function bindSelectedGeometry(
    targetType: 'object' | 'vertices' | 'edges' | 'faces' | 'all_vertices' | 'smooth_auto' | 'rigid_vertex' | 'smooth_vertex', 
    targetBoneId?: string,
    options?: { 
      weight?: number
      splitBoundary?: boolean
      mode?: 'replace' | 'add'
    }
  ) {
    projectStore.recordState('Bind Geometry to Bone')
    const boneId = targetBoneId || selectedBoneId.value
    if (!boneId) return { success: false, message: 'No target bone selected' }
    const bone = armature.value.bones.find(b => b.id === boneId)
    if (!bone) return { success: false, message: 'Bone not found' }

    const activeMesh = projectStore.activeMesh
    if (!activeMesh) return { success: false, message: 'No mesh selected' }

    const weightVal = typeof options?.weight === 'number' ? Math.max(0, Math.min(1, options.weight)) : 1.0
    const mode = options?.mode || 'replace'

    // 1. Direct Object Node Parenting
    if (targetType === 'object') {
      activeMesh.parentId = boneId
      activeMesh.armatureId = armature.value.id
      return { success: true, message: `Parented ${activeMesh.name} to ${bone.name} (Object Node)` }
    }

    // 2. Smooth Proximity Falloff Skinning
    if (targetType === 'smooth_auto' || targetType === 'smooth_vertex') {
      autoWeightMeshToBones(activeMesh)
      return { success: true, message: `Auto-calculated smooth weights for ${activeMesh.name}` }
    }

    // 3. Collect Target Vertices based on targetType
    let targetVertexIds: string[] = []

    if (targetType === 'faces') {
      const vertSet = new Set<string>()
      for (const face of activeMesh.faces) {
        if (projectStore.selectedFaceIds.includes(face.id)) {
          face.vertexIds.forEach(id => vertSet.add(id))
        }
      }
      targetVertexIds = Array.from(vertSet)
    } else if (targetType === 'edges') {
      const vertSet = new Set<string>()
      for (const edgeId of projectStore.selectedEdgeIds) {
        const parts = edgeId.split('_')
        if (parts.length >= 2) {
          vertSet.add(parts[0])
          vertSet.add(parts[1])
        }
      }
      if (vertSet.size === 0 && projectStore.selectedEdgeIds.length > 0) {
        for (const f of activeMesh.faces) {
          for (let i = 0; i < f.vertexIds.length; i++) {
            const v1 = f.vertexIds[i]
            const v2 = f.vertexIds[(i + 1) % f.vertexIds.length]
            const eKey = `${v1}_${v2}`
            const eKeyRev = `${v2}_${v1}`
            if (projectStore.selectedEdgeIds.includes(eKey) || projectStore.selectedEdgeIds.includes(eKeyRev)) {
              vertSet.add(v1)
              vertSet.add(v2)
            }
          }
        }
      }
      targetVertexIds = Array.from(vertSet)
    } else if (targetType === 'vertices') {
      targetVertexIds = [...projectStore.selectedVertexIds]
    } else if (targetType === 'all_vertices') {
      targetVertexIds = activeMesh.vertices.map(v => v.id)
    } else {
      // Default / rigid_vertex fallback
      if (projectStore.selectedFaceIds.length > 0) {
        const vertSet = new Set<string>()
        for (const face of activeMesh.faces) {
          if (projectStore.selectedFaceIds.includes(face.id)) {
            face.vertexIds.forEach(id => vertSet.add(id))
          }
        }
        targetVertexIds = Array.from(vertSet)
      } else if (projectStore.selectedEdgeIds.length > 0) {
        const vertSet = new Set<string>()
        for (const edgeId of projectStore.selectedEdgeIds) {
          const parts = edgeId.split('_')
          if (parts.length >= 2) {
            vertSet.add(parts[0])
            vertSet.add(parts[1])
          }
        }
        targetVertexIds = Array.from(vertSet)
      } else if (projectStore.selectedVertexIds.length > 0) {
        targetVertexIds = [...projectStore.selectedVertexIds]
      } else {
        targetVertexIds = activeMesh.vertices.map(v => v.id)
      }
    }

    if (targetVertexIds.length === 0) {
      targetVertexIds = activeMesh.vertices.map(v => v.id)
    }

    activeMesh.armatureId = armature.value.id
    const vertIdSet = new Set(targetVertexIds)

    // Optional boundary vertex splitting for sharp low-poly mechanical hinges
    if (options?.splitBoundary && projectStore.selectedFaceIds.length > 0) {
      const selectedFaces = activeMesh.faces.filter(f => projectStore.selectedFaceIds.includes(f.id))
      const unselectedFaces = activeMesh.faces.filter(f => !projectStore.selectedFaceIds.includes(f.id))
      
      const unselectedVertIds = new Set<string>()
      unselectedFaces.forEach(f => f.vertexIds.forEach(id => unselectedVertIds.add(id)))

      const boundaryVerts = targetVertexIds.filter(id => unselectedVertIds.has(id))
      const splitMap = new Map<string, string>()

      for (const bId of boundaryVerts) {
        const origVert = activeMesh.vertices.find(v => v.id === bId)
        if (!origVert) continue
        const newVertId = genId('v_split')
        const newVert = {
          id: newVertId,
          position: { ...origVert.position },
          color: origVert.color,
          boneWeights: { [boneId]: weightVal }
        }
        activeMesh.vertices.push(newVert)
        splitMap.set(bId, newVertId)
        vertIdSet.delete(bId)
        vertIdSet.add(newVertId)
      }

      for (const face of selectedFaces) {
        face.vertexIds = face.vertexIds.map(vid => splitMap.get(vid) || vid)
      }
    }

    for (const v of activeMesh.vertices) {
      if (vertIdSet.has(v.id)) {
        if (mode === 'replace') {
          v.boneWeights = { [boneId]: weightVal }
        } else {
          if (!v.boneWeights) v.boneWeights = {}
          v.boneWeights[boneId] = weightVal
        }
      }
    }

    return { 
      success: true, 
      message: `Bound ${targetVertexIds.length} vertices to ${bone.name} (${Math.round(weightVal * 100)}%)` 
    }
  }

  function assignRigidVertices(meshId: string, vertexIds: string[], boneId: string, splitBoundary = false) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    mesh.armatureId = armature.value.id

    const vertIdSet = new Set(vertexIds)

    // Optional boundary vertex splitting for sharp low-poly mechanical hinges
    if (splitBoundary && projectStore.selectedFaceIds.length > 0) {
      const selectedFaces = mesh.faces.filter(f => projectStore.selectedFaceIds.includes(f.id))
      const unselectedFaces = mesh.faces.filter(f => !projectStore.selectedFaceIds.includes(f.id))
      
      const unselectedVertIds = new Set<string>()
      unselectedFaces.forEach(f => f.vertexIds.forEach(id => unselectedVertIds.add(id)))

      const boundaryVerts = vertexIds.filter(id => unselectedVertIds.has(id))
      const splitMap = new Map<string, string>()

      for (const bId of boundaryVerts) {
        const origVert = mesh.vertices.find(v => v.id === bId)
        if (!origVert) continue
        const newVertId = genId('v_split')
        const newVert = {
          id: newVertId,
          position: { ...origVert.position },
          color: origVert.color,
          boneWeights: { [boneId]: 1.0 }
        }
        mesh.vertices.push(newVert)
        splitMap.set(bId, newVertId)
        vertIdSet.delete(bId)
        vertIdSet.add(newVertId)
      }

      for (const face of selectedFaces) {
        face.vertexIds = face.vertexIds.map(vid => splitMap.get(vid) || vid)
      }
    }

    for (const v of mesh.vertices) {
      if (vertIdSet.has(v.id)) {
        v.boneWeights = { [boneId]: 1.0 }
      }
    }
  }

  function unbindGeometry(meshId: string, boneId?: string) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    if (boneId) {
      if (mesh.parentId === boneId) mesh.parentId = undefined
      for (const v of mesh.vertices) {
        if (v.boneWeights && v.boneWeights[boneId]) {
          delete v.boneWeights[boneId]
        }
      }
    } else {
      mesh.parentId = undefined
      for (const v of mesh.vertices) {
        v.boneWeights = {}
      }
    }
  }

  function assignVertexWeight(meshId: string, vertexIds: string[], boneId: string, weight: number) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    mesh.armatureId = armature.value.id
    const idSet = new Set(vertexIds)
    for (const v of mesh.vertices) {
      if (idSet.has(v.id)) {
        if (!v.boneWeights) v.boneWeights = {}
        if (weight <= 0) {
          delete v.boneWeights[boneId]
        } else {
          v.boneWeights[boneId] = Math.min(1.0, Math.max(0.0, weight))
        }
      }
    }
  }

  function normalizeVertexWeights(meshId: string, vertexIds: string[]) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    const idSet = new Set(vertexIds)
    for (const v of mesh.vertices) {
      if (idSet.has(v.id) && v.boneWeights) {
        let total = 0
        for (const bId in v.boneWeights) total += v.boneWeights[bId]
        if (total > 0) {
          for (const bId in v.boneWeights) {
            v.boneWeights[bId] = Number((v.boneWeights[bId] / total).toFixed(3))
          }
        }
      }
    }
  }

  // ----------------------------------------------------
  // WEIGHT PAINTING ENGINE & 3D BRUSH CALCULATIONS
  // ----------------------------------------------------
  function paintVertexWeightAtPoint(
    meshId: string,
    worldHitPoint: Vector3D,
    boneId: string,
    tool: 'draw' | 'subtract' | 'smooth' | 'fill' | 'sample' = weightPaintTool.value,
    options?: {
      radius?: number
      weight?: number
      strength?: number
      falloff?: 'smooth' | 'linear' | 'constant'
      autoNormalize?: boolean
      xMirror?: boolean
    }
  ) {
    projectStore.recordState('Paint Weight')
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    mesh.armatureId = armature.value.id

    const radius = options?.radius ?? weightBrushRadius.value
    const targetWeight = options?.weight ?? weightBrushWeight.value
    const strength = options?.strength ?? weightBrushStrength.value
    const falloff = options?.falloff ?? weightBrushFalloff.value
    const autoNorm = options?.autoNormalize ?? weightAutoNormalize.value
    const mirrorX = options?.xMirror ?? weightXMirror.value

    const meshWorldX = mesh.position.x
    const meshWorldY = mesh.position.y
    const meshWorldZ = mesh.position.z

    const affectedVerts: { vert: Vertex; dist: number; factor: number }[] = []

    for (const v of mesh.vertices) {
      const vx = meshWorldX + v.position.x
      const vy = meshWorldY + v.position.y
      const vz = meshWorldZ + v.position.z

      const dx = vx - worldHitPoint.x
      const dy = vy - worldHitPoint.y
      const dz = vz - worldHitPoint.z
      const dist = Math.hypot(dx, dy, dz)

      if (dist <= radius) {
        const ratio = Math.max(0, Math.min(1, dist / radius))
        let factor = 1.0
        if (falloff === 'smooth') {
          factor = 0.5 * (1 + Math.cos(ratio * Math.PI))
        } else if (falloff === 'linear') {
          factor = 1.0 - ratio
        } else {
          factor = 1.0
        }
        affectedVerts.push({ vert: v, dist, factor })
      }
    }

    if (affectedVerts.length === 0) return

    if (tool === 'sample') {
      affectedVerts.sort((a, b) => a.dist - b.dist)
      const closest = affectedVerts[0].vert
      const sampledW = closest.boneWeights?.[boneId] ?? 0.0
      weightBrushWeight.value = Number(sampledW.toFixed(2))
      return
    }

    if (tool === 'fill') {
      for (const item of affectedVerts) {
        if (!item.vert.boneWeights) item.vert.boneWeights = {}
        item.vert.boneWeights[boneId] = targetWeight
        if (autoNorm) {
          normalizeSingleVertex(item.vert)
        }
      }
      return
    }

    for (const item of affectedVerts) {
      const v = item.vert
      if (!v.boneWeights) v.boneWeights = {}
      const curW = v.boneWeights[boneId] ?? 0.0
      const delta = item.factor * strength

      if (tool === 'draw') {
        const newW = curW + (targetWeight - curW) * delta
        v.boneWeights[boneId] = Number(Math.max(0, Math.min(1, newW)).toFixed(4))
      } else if (tool === 'subtract') {
        const newW = curW - targetWeight * delta
        v.boneWeights[boneId] = Number(Math.max(0, newW).toFixed(4))
      } else if (tool === 'smooth') {
        let sumW = curW
        let count = 1
        for (const f of mesh.faces) {
          if (f.vertexIds.includes(v.id)) {
            for (const nId of f.vertexIds) {
              if (nId !== v.id) {
                const nVert = mesh.vertices.find(nv => nv.id === nId)
                if (nVert && nVert.boneWeights) {
                  sumW += nVert.boneWeights[boneId] ?? 0.0
                  count++
                }
              }
            }
          }
        }
        const avg = sumW / count
        v.boneWeights[boneId] = Number((curW + (avg - curW) * delta).toFixed(4))
      }

      if (autoNorm) {
        normalizeSingleVertex(v)
      }

      // X-Mirroring support
      if (mirrorX) {
        const mirrorVert = mesh.vertices.find(mv => 
          mv.id !== v.id &&
          Math.abs(mv.position.x + v.position.x) < 0.08 &&
          Math.abs(mv.position.y - v.position.y) < 0.08 &&
          Math.abs(mv.position.z - v.position.z) < 0.08
        )
        if (mirrorVert) {
          if (!mirrorVert.boneWeights) mirrorVert.boneWeights = {}
          const targetBone = armature.value.bones.find(b => b.id === boneId)
          let mirrorBoneId = boneId
          if (targetBone) {
            let mirrorName = ''
            if (targetBone.name.endsWith('.L') || targetBone.name.endsWith('_L')) {
              mirrorName = targetBone.name.replace(/([._])L$/, '$1R')
            } else if (targetBone.name.endsWith('.R') || targetBone.name.endsWith('_R')) {
              mirrorName = targetBone.name.replace(/([._])R$/, '$1L')
            }
            if (mirrorName) {
              const oppBone = armature.value.bones.find(b => b.name === mirrorName)
              if (oppBone) mirrorBoneId = oppBone.id
            }
          }
          mirrorVert.boneWeights[mirrorBoneId] = v.boneWeights[boneId]
          if (autoNorm) {
            normalizeSingleVertex(mirrorVert)
          }
        }
      }
    }
  }

  function normalizeSingleVertex(v: Vertex) {
    if (!v.boneWeights) return
    let total = 0
    for (const bId in v.boneWeights) {
      if (v.boneWeights[bId] < 0.0001) {
        delete v.boneWeights[bId]
      } else {
        total += v.boneWeights[bId]
      }
    }
    if (total > 0.0001) {
      for (const bId in v.boneWeights) {
        v.boneWeights[bId] = Number((v.boneWeights[bId] / total).toFixed(4))
      }
    }
  }

  function floodFillBoneWeight(meshId: string, boneId: string, weight: number, selectedVertsOnly = false) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    mesh.armatureId = armature.value.id

    const targetVerts = (selectedVertsOnly && projectStore.selectedVertexIds.length > 0)
      ? mesh.vertices.filter(v => projectStore.selectedVertexIds.includes(v.id))
      : mesh.vertices

    for (const v of targetVerts) {
      if (!v.boneWeights) v.boneWeights = {}
      if (weight <= 0) {
        delete v.boneWeights[boneId]
      } else {
        v.boneWeights[boneId] = Math.max(0, Math.min(1, weight))
      }
      if (weightAutoNormalize.value) {
        normalizeSingleVertex(v)
      }
    }
  }

  function normalizeAllMeshWeights(meshId: string) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    for (const v of mesh.vertices) {
      normalizeSingleVertex(v)
    }
  }

  function smoothMeshBoneWeights(meshId: string, boneId?: string) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    const targetBoneId = boneId || selectedBoneId.value
    if (!targetBoneId) return

    const originalWeights = new Map<string, number>()
    for (const v of mesh.vertices) {
      originalWeights.set(v.id, v.boneWeights?.[targetBoneId] ?? 0.0)
    }

    for (const v of mesh.vertices) {
      let sum = originalWeights.get(v.id) ?? 0.0
      let count = 1
      for (const f of mesh.faces) {
        if (f.vertexIds.includes(v.id)) {
          for (const nId of f.vertexIds) {
            if (nId !== v.id && originalWeights.has(nId)) {
              sum += originalWeights.get(nId)!
              count++
            }
          }
        }
      }
      if (!v.boneWeights) v.boneWeights = {}
      v.boneWeights[targetBoneId] = Number((sum / count).toFixed(4))
      if (weightAutoNormalize.value) {
        normalizeSingleVertex(v)
      }
    }
  }

  function clearBoneWeights(meshId: string, boneId: string) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    for (const v of mesh.vertices) {
      if (v.boneWeights && v.boneWeights[boneId]) {
        delete v.boneWeights[boneId]
      }
    }
  }

  function invertBoneWeights(meshId: string, boneId: string) {
    const mesh = projectStore.meshes.find(m => m.id === meshId)
    if (!mesh) return
    for (const v of mesh.vertices) {
      if (!v.boneWeights) v.boneWeights = {}
      const cur = v.boneWeights[boneId] ?? 0.0
      v.boneWeights[boneId] = Number((1.0 - cur).toFixed(4))
      if (weightAutoNormalize.value) {
        normalizeSingleVertex(v)
      }
    }
  }

  function addSocket(boneId: string, name = 'Socket'): BoneSocket | null {
    const bone = armature.value.bones.find(b => b.id === boneId)
    if (!bone) return null
    if (!bone.sockets) bone.sockets = []
    const socket: BoneSocket = {
      id: genId('socket'),
      name,
      boneId,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    }
    bone.sockets.push(socket)
    return socket
  }

  function removeSocket(boneId: string, socketId: string) {
    const bone = armature.value.bones.find(b => b.id === boneId)
    if (!bone || !bone.sockets) return
    bone.sockets = bone.sockets.filter(s => s.id !== socketId)
  }

  function splitBone(boneId: string): Bone[] | null {
    return subdivideBone(boneId)
  }

  function resetAllBonesToRest() {
    for (const b of armature.value.bones) {
      b.position = { x: 0, y: 0, z: 0 }
      b.rotation = { x: 0, y: 0, z: 0 }
      b.scale = { x: 1, y: 1, z: 1 }
    }
  }

  function toggleTestPose(active?: boolean) {
    if (active !== undefined) {
      isTestPoseActive.value = active
    } else {
      isTestPoseActive.value = !isTestPoseActive.value
    }
    if (!isTestPoseActive.value) {
      resetAllBonesToRest()
    }
  }

  function clearArmature() {
    armature.value.bones = []
    armature.value.rootBoneIds = []
    selectedBoneId.value = null
    for (const mesh of projectStore.meshes) {
      if (mesh.armatureId === armature.value.id) {
        mesh.armatureId = undefined
        mesh.parentId = undefined
      }
    }
  }

  // ----------------------------------------------------
  // DUAL TARGET KEYFRAMING (MESH OR BONE)
  // ----------------------------------------------------
  function getOrCreateTrack(targetId: string, targetType: 'mesh' | 'bone', targetName = ''): AnimationTrack {
    if (!activeClip.value) throw new Error('No active clip')
    let track = activeClip.value.tracks.find(t => t.targetId === targetId)
    if (!track) {
      track = {
        targetId,
        targetType,
        targetName,
        positionKeys: [],
        rotationKeys: [],
        scaleKeys: []
      }
      activeClip.value.tracks.push(track)
    }
    return track
  }

  function addKeyframe(
    targetId: string, 
    targetType: 'mesh' | 'bone', 
    property: 'position' | 'rotation' | 'scale', 
    value: Vector3D,
    frame: number = currentFrame.value
  ) {
    if (!activeClip.value) return
    const track = getOrCreateTrack(targetId, targetType)
    const keys = property === 'position' ? track.positionKeys : property === 'rotation' ? track.rotationKeys : track.scaleKeys
    const existingIdx = keys.findIndex(k => k.frame === frame)

    const newKey: Keyframe<Vector3D> = {
      id: genId('key'),
      frame,
      value: { ...value },
      interpolation: interpolationMode.value
    }

    if (existingIdx !== -1) {
      keys[existingIdx] = newKey
    } else {
      keys.push(newKey)
      keys.sort((a, b) => a.frame - b.frame)
    }
  }

  function recordCurrentKeyframe() {
    if (selectedBoneId.value) {
      const bone = selectedBone.value
      if (bone) {
        addKeyframe(bone.id, 'bone', 'rotation', bone.rotation)
        addKeyframe(bone.id, 'bone', 'position', bone.position)
        addKeyframe(bone.id, 'bone', 'scale', bone.scale)
        recordedStatusMessage.value = `Recorded ${bone.name} at ${(currentFrame.value / (activeClip.value?.fps || 12)).toFixed(1)}s`
      }
    } else if (projectStore.activeMesh) {
      const mesh = projectStore.activeMesh
      addKeyframe(mesh.id, 'mesh', 'rotation', mesh.rotation)
      addKeyframe(mesh.id, 'mesh', 'position', mesh.position)
      addKeyframe(mesh.id, 'mesh', 'scale', mesh.scale)
      recordedStatusMessage.value = `Recorded ${mesh.name} at ${(currentFrame.value / (activeClip.value?.fps || 12)).toFixed(1)}s`
    }
  }

  function recordAllBonesKeyframe(frame = currentFrame.value) {
    let count = 0
    for (const bone of armature.value.bones) {
      addKeyframe(bone.id, 'bone', 'rotation', bone.rotation, frame)
      addKeyframe(bone.id, 'bone', 'position', bone.position, frame)
      addKeyframe(bone.id, 'bone', 'scale', bone.scale, frame)
      count++
    }
    for (const mesh of projectStore.meshes) {
      addKeyframe(mesh.id, 'mesh', 'rotation', mesh.rotation, frame)
      addKeyframe(mesh.id, 'mesh', 'position', mesh.position, frame)
      addKeyframe(mesh.id, 'mesh', 'scale', mesh.scale, frame)
      count++
    }
    const sec = (frame / (activeClip.value?.fps || 12)).toFixed(1)
    recordedStatusMessage.value = `Recorded ${count} items at ${sec}s`
  }

  function clearKeyframeAtCurrentTime(frame = currentFrame.value) {
    if (!activeClip.value) return
    for (const track of activeClip.value.tracks) {
      track.positionKeys = track.positionKeys.filter(k => k.frame !== frame)
      track.rotationKeys = track.rotationKeys.filter(k => k.frame !== frame)
      track.scaleKeys = track.scaleKeys.filter(k => k.frame !== frame)
    }
    const sec = (frame / (activeClip.value?.fps || 12)).toFixed(1)
    recordedStatusMessage.value = `Cleared keyframes at ${sec}s`
  }

  function addChannelKeyframe(targetId: string, targetType: 'mesh' | 'bone', channel: 'position' | 'rotation' | 'scale', frame = currentFrame.value) {
    if (targetType === 'bone') {
      const bone = armature.value.bones.find(b => b.id === targetId)
      if (bone) {
        addKeyframe(targetId, targetType, channel, bone[channel], frame)
      }
    } else {
      const mesh = projectStore.meshes.find(m => m.id === targetId)
      if (mesh) {
        addKeyframe(targetId, targetType, channel, mesh[channel], frame)
      }
    }
  }

  function addKeyframeForSelected(property: 'position' | 'rotation' | 'scale', value: Vector3D) {
    if (selectedBoneId.value) {
      addKeyframe(selectedBoneId.value, 'bone', property, value)
    } else if (projectStore.activeMesh) {
      addKeyframe(projectStore.activeMesh.id, 'mesh', property, value)
    }
  }

  function deleteKeyframeAt(targetId: string, frame: number, channel?: 'position' | 'rotation' | 'scale') {
    if (!activeClip.value) return
    const track = activeClip.value.tracks.find(t => t.targetId === targetId)
    if (!track) return

    if (!channel || channel === 'position') {
      track.positionKeys = track.positionKeys.filter(k => k.frame !== frame)
    }
    if (!channel || channel === 'rotation') {
      track.rotationKeys = track.rotationKeys.filter(k => k.frame !== frame)
    }
    if (!channel || channel === 'scale') {
      track.scaleKeys = track.scaleKeys.filter(k => k.frame !== frame)
    }
  }

  function setKeyframeInterpolation(targetId: string, channel: 'position' | 'rotation' | 'scale', frame: number, interpolation: InterpolationType) {
    if (!activeClip.value) return
    projectStore.recordState('Set Interpolation')
    const track = activeClip.value.tracks.find(t => t.targetId === targetId)
    if (!track) return

    const keyList = channel === 'position' ? track.positionKeys : channel === 'rotation' ? track.rotationKeys : track.scaleKeys
    const key = keyList.find(k => k.frame === frame)
    if (key) {
      key.interpolation = interpolation
      if (interpolation === 'bezier' && !key.tangent) {
        key.tangent = {
          handleIn: { x: -2, y: 0 },
          handleOut: { x: 2, y: 0 },
          type: 'aligned'
        }
      }
      evaluatePose()
    }
  }

  function setKeyframeTangent(targetId: string, channel: 'position' | 'rotation' | 'scale', frame: number, tangent: any) {
    if (!activeClip.value) return
    const track = activeClip.value.tracks.find(t => t.targetId === targetId)
    if (!track) return

    const keyList = channel === 'position' ? track.positionKeys : channel === 'rotation' ? track.rotationKeys : track.scaleKeys
    const key = keyList.find(k => k.frame === frame)
    if (key) {
      key.tangent = { ...tangent }
      key.interpolation = 'bezier'
      evaluatePose()
    }
  }

  function updateKeyframeValue(targetId: string, channel: 'position' | 'rotation' | 'scale', frame: number, axis: 'x' | 'y' | 'z', value: number) {
    if (!activeClip.value) return
    const track = activeClip.value.tracks.find(t => t.targetId === targetId)
    if (!track) return

    const keyList = channel === 'position' ? track.positionKeys : channel === 'rotation' ? track.rotationKeys : track.scaleKeys
    const key = keyList.find(k => k.frame === frame)
    if (key) {
      key.value[axis] = value
      evaluatePose()
    }
  }

  // ----------------------------------------------------
  // BLOCKBENCH POSE CONTROLS (COPY / PASTE / RESET POSE)
  // ----------------------------------------------------
  function resetPose() {
    if (selectedBoneId.value) {
      const bone = selectedBone.value
      if (bone) {
        bone.rotation = { x: 0, y: 0, z: 0 }
        bone.position = { x: 0, y: 0, z: 0 }
        bone.scale = { x: 1, y: 1, z: 1 }
        if (autoKey.value) recordCurrentKeyframe()
      }
    } else if (projectStore.activeMesh) {
      const mesh = projectStore.activeMesh
      mesh.rotation = { x: 0, y: 0, z: 0 }
      if (autoKey.value) recordCurrentKeyframe()
    }
  }

  function copyPose() {
    poseClipboard.value = {}
    for (const mesh of projectStore.meshes) {
      poseClipboard.value[mesh.id] = {
        position: { ...mesh.position },
        rotation: { ...mesh.rotation },
        scale: { ...mesh.scale }
      }
    }
    for (const bone of armature.value.bones) {
      poseClipboard.value[bone.id] = {
        position: { ...bone.position },
        rotation: { ...bone.rotation },
        scale: { ...bone.scale }
      }
    }
  }

  function pastePose() {
    for (const mesh of projectStore.meshes) {
      const saved = poseClipboard.value[mesh.id]
      if (saved) {
        mesh.position = { ...saved.position }
        mesh.rotation = { ...saved.rotation }
        mesh.scale = { ...saved.scale }
        addKeyframe(mesh.id, 'mesh', 'position', mesh.position)
        addKeyframe(mesh.id, 'mesh', 'rotation', mesh.rotation)
        addKeyframe(mesh.id, 'mesh', 'scale', mesh.scale)
      }
    }
    for (const bone of armature.value.bones) {
      const saved = poseClipboard.value[bone.id]
      if (saved) {
        bone.position = { ...saved.position }
        bone.rotation = { ...saved.rotation }
        bone.scale = { ...saved.scale }
        addKeyframe(bone.id, 'bone', 'position', bone.position)
        addKeyframe(bone.id, 'bone', 'rotation', bone.rotation)
        addKeyframe(bone.id, 'bone', 'scale', bone.scale)
      }
    }
  }

  function pasteFlippedPose() {
    // 1. Mesh flipping
    for (const mesh of projectStore.meshes) {
      const name = mesh.name.toLowerCase()
      let counterpartName = ''
      if (name.includes('left')) counterpartName = name.replace('left', 'right')
      else if (name.includes('right')) counterpartName = name.replace('right', 'left')
      else if (name.includes('_l')) counterpartName = name.replace('_l', '_r')
      else if (name.includes('_r')) counterpartName = name.replace('_r', '_l')

      const counterpart = counterpartName ? projectStore.meshes.find(m => m.name.toLowerCase() === counterpartName) : mesh
      const srcId = counterpart?.id || mesh.id
      const saved = poseClipboard.value[srcId]

      if (saved) {
        mesh.position = { x: -saved.position.x, y: saved.position.y, z: saved.position.z }
        mesh.rotation = { x: saved.rotation.x, y: -saved.rotation.y, z: -saved.rotation.z }
        mesh.scale = { ...saved.scale }
        addKeyframe(mesh.id, 'mesh', 'position', mesh.position)
        addKeyframe(mesh.id, 'mesh', 'rotation', mesh.rotation)
        addKeyframe(mesh.id, 'mesh', 'scale', mesh.scale)
      }
    }

    // 2. Bone flipping (Mirror pose across X-axis)
    for (const bone of armature.value.bones) {
      const name = bone.name.toLowerCase()
      let counterpartName = ''
      if (name.includes('left')) counterpartName = name.replace('left', 'right')
      else if (name.includes('right')) counterpartName = name.replace('right', 'left')
      else if (name.includes('_l')) counterpartName = name.replace('_l', '_r')
      else if (name.includes('_r')) counterpartName = name.replace('_r', '_l')

      const counterpart = counterpartName ? armature.value.bones.find(b => b.name.toLowerCase() === counterpartName) : bone
      const srcId = counterpart?.id || bone.id
      const saved = poseClipboard.value[srcId]

      if (saved) {
        bone.position = { x: -saved.position.x, y: saved.position.y, z: saved.position.z }
        bone.rotation = { x: saved.rotation.x, y: -saved.rotation.y, z: -saved.rotation.z }
        bone.scale = { ...saved.scale }
        addKeyframe(bone.id, 'bone', 'position', bone.position)
        addKeyframe(bone.id, 'bone', 'rotation', bone.rotation)
        addKeyframe(bone.id, 'bone', 'scale', bone.scale)
      }
    }
  }

  // ----------------------------------------------------
  // TIMELINE MARKERS / GAME EVENTS
  // ----------------------------------------------------
  function addMarker(name = 'Event', frame = currentFrame.value) {
    if (!activeClip.value) return
    if (!activeClip.value.markers) {
      activeClip.value.markers = []
    }
    const newMarker = {
      id: genId('marker'),
      name,
      frame
    }
    activeClip.value.markers.push(newMarker)
    return newMarker
  }

  function deleteMarker(markerId: string) {
    if (!activeClip.value || !activeClip.value.markers) return
    activeClip.value.markers = activeClip.value.markers.filter(m => m.id !== markerId)
  }

  // ----------------------------------------------------
  // PROCEDURAL GAME ANIMATION PRESETS (1-CLICK)
  // ----------------------------------------------------
  function generateIdleBreathe() {
    const clip = addClip('Idle_Breathe', 24, 12)
    const meshes = projectStore.meshes

    for (const mesh of meshes) {
      const baseY = mesh.position.y
      const baseRotX = mesh.rotation.x

      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY }, 0)
      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY + 0.1 }, 12)
      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY }, 24)

      addKeyframe(mesh.id, 'mesh', 'rotation', { ...mesh.rotation, x: baseRotX }, 0)
      addKeyframe(mesh.id, 'mesh', 'rotation', { ...mesh.rotation, x: baseRotX + 2.5 }, 12)
      addKeyframe(mesh.id, 'mesh', 'rotation', { ...mesh.rotation, x: baseRotX }, 24)
    }
    selectClip(clip.id)
  }

  function generateWalkCycle() {
    const clip = addClip('Walk_Cycle', 24, 12)
    const meshes = projectStore.meshes

    for (const mesh of meshes) {
      const name = mesh.name.toLowerCase()
      const isLeft = name.includes('left') || name.includes('_l')
      const isLeg = name.includes('leg') || name.includes('foot')
      const isArm = name.includes('arm') || name.includes('hand')

      const baseRot = { ...mesh.rotation }

      if (isLeg) {
        const sign = isLeft ? 1 : -1
        addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, x: baseRot.x + 25 * sign }, 0)
        addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, x: baseRot.x }, 6)
        addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, x: baseRot.x - 25 * sign }, 12)
        addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, x: baseRot.x }, 18)
        addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, x: baseRot.x + 25 * sign }, 24)
      } else if (isArm) {
        const sign = isLeft ? -1 : 1
        addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, x: baseRot.x + 20 * sign }, 0)
        addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, x: baseRot.x - 20 * sign }, 12)
        addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, x: baseRot.x + 20 * sign }, 24)
      } else {
        const baseY = mesh.position.y
        addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY }, 0)
        addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY + 0.08 }, 6)
        addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY }, 12)
        addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY + 0.08 }, 18)
        addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY }, 24)
      }
    }
    selectClip(clip.id)
  }

  function generateJumpArc() {
    const clip = addClip('Jump_Arc', 20, 12)
    const meshes = projectStore.meshes

    for (const mesh of meshes) {
      const baseY = mesh.position.y
      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY }, 0)
      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY - 0.15 }, 4)
      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY + 1.2 }, 10)
      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY }, 16)
      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY - 0.1 }, 18)
      addKeyframe(mesh.id, 'mesh', 'position', { ...mesh.position, y: baseY }, 20)
    }
    selectClip(clip.id)
  }

  function generateBirdDrink() {
    const clip = addClip('Bird_Drink', 24, 12)
    const bones = armature.value.bones
    const meshes = projectStore.meshes

    // Animate neck/head or top mesh downwards to drink
    for (const b of bones) {
      const name = b.name.toLowerCase()
      if (name.includes('neck') || name.includes('head') || name.includes('spine')) {
        addKeyframe(b.id, 'bone', 'rotation', { x: 0, y: 0, z: 0 }, 0)
        addKeyframe(b.id, 'bone', 'rotation', { x: 45, y: 0, z: 0 }, 8)
        addKeyframe(b.id, 'bone', 'rotation', { x: 50, y: 0, z: 0 }, 14)
        addKeyframe(b.id, 'bone', 'rotation', { x: -10, y: 0, z: 0 }, 20)
        addKeyframe(b.id, 'bone', 'rotation', { x: 0, y: 0, z: 0 }, 24)
      }
    }
    for (const m of meshes) {
      const name = m.name.toLowerCase()
      if (name.includes('neck') || name.includes('head') || name.includes('beak')) {
        addKeyframe(m.id, 'mesh', 'rotation', { x: 0, y: 0, z: 0 }, 0)
        addKeyframe(m.id, 'mesh', 'rotation', { x: 45, y: 0, z: 0 }, 8)
        addKeyframe(m.id, 'mesh', 'rotation', { x: 50, y: 0, z: 0 }, 14)
        addKeyframe(m.id, 'mesh', 'rotation', { x: -10, y: 0, z: 0 }, 20)
        addKeyframe(m.id, 'mesh', 'rotation', { x: 0, y: 0, z: 0 }, 24)
      }
    }
    selectClip(clip.id)
  }

  function generateWingFlap() {
    const clip = addClip('Wing_Flap', 16, 12)
    const bones = armature.value.bones
    const meshes = projectStore.meshes

    for (const b of bones) {
      const name = b.name.toLowerCase()
      const isLeft = name.includes('left') || name.includes('_l') || name.includes('.l')
      if (name.includes('wing') || name.includes('arm')) {
        const sign = isLeft ? 1 : -1
        addKeyframe(b.id, 'bone', 'rotation', { x: 0, y: 0, z: -30 * sign }, 0)
        addKeyframe(b.id, 'bone', 'rotation', { x: 0, y: 0, z: 45 * sign }, 8)
        addKeyframe(b.id, 'bone', 'rotation', { x: 0, y: 0, z: -30 * sign }, 16)
      }
    }
    for (const m of meshes) {
      const name = m.name.toLowerCase()
      const isLeft = name.includes('left') || name.includes('_l') || name.includes('.l')
      if (name.includes('wing') || name.includes('arm')) {
        const sign = isLeft ? 1 : -1
        addKeyframe(m.id, 'mesh', 'rotation', { x: 0, y: 0, z: -30 * sign }, 0)
        addKeyframe(m.id, 'mesh', 'rotation', { x: 0, y: 0, z: 45 * sign }, 8)
        addKeyframe(m.id, 'mesh', 'rotation', { x: 0, y: 0, z: -30 * sign }, 16)
      }
    }
    selectClip(clip.id)
  }

  function generateQuadrupedWalk() {
    const clip = addClip('Quadruped_Walk', 24, 12)
    const bones = armature.value.bones
    const meshes = projectStore.meshes

    for (const b of bones) {
      const name = b.name.toLowerCase()
      const isLeft = name.includes('left') || name.includes('_l') || name.includes('.l')
      const isFront = name.includes('front') || name.includes('arm')
      const isBack = name.includes('back') || name.includes('rear') || name.includes('leg')

      if (isFront || isBack) {
        const phase = (isFront && isLeft) || (isBack && !isLeft) ? 0 : 12
        const sign = isLeft ? 1 : -1
        addKeyframe(b.id, 'bone', 'rotation', { x: 25 * sign, y: 0, z: 0 }, (phase + 0) % 24)
        addKeyframe(b.id, 'bone', 'rotation', { x: -25 * sign, y: 0, z: 0 }, (phase + 12) % 24)
        addKeyframe(b.id, 'bone', 'rotation', { x: 25 * sign, y: 0, z: 0 }, 24)
      }
    }
    for (const m of meshes) {
      const name = m.name.toLowerCase()
      const isLeft = name.includes('left') || name.includes('_l') || name.includes('.l')
      const isFront = name.includes('front') || name.includes('arm')
      const isBack = name.includes('back') || name.includes('rear') || name.includes('leg')

      if (isFront || isBack) {
        const phase = (isFront && isLeft) || (isBack && !isLeft) ? 0 : 12
        const sign = isLeft ? 1 : -1
        addKeyframe(m.id, 'mesh', 'rotation', { x: 25 * sign, y: 0, z: 0 }, (phase + 0) % 24)
        addKeyframe(m.id, 'mesh', 'rotation', { x: -25 * sign, y: 0, z: 0 }, (phase + 12) % 24)
        addKeyframe(m.id, 'mesh', 'rotation', { x: 25 * sign, y: 0, z: 0 }, 24)
      }
    }
    selectClip(clip.id)
  }

  function generateAttackSlash() {
    const clip = addClip('Attack_Slash', 16, 12)
    const bones = armature.value.bones
    const meshes = projectStore.meshes

    for (const b of bones) {
      const baseRot = { ...b.rotation }
      addKeyframe(b.id, 'bone', 'rotation', { ...baseRot, y: baseRot.y - 30, x: baseRot.x - 15 }, 0)
      addKeyframe(b.id, 'bone', 'rotation', { ...baseRot, y: baseRot.y - 45, x: baseRot.x - 20 }, 4)
      addKeyframe(b.id, 'bone', 'rotation', { ...baseRot, y: baseRot.y + 60, x: baseRot.x + 35 }, 8)
      addKeyframe(b.id, 'bone', 'rotation', { ...baseRot, y: baseRot.y + 40, x: baseRot.x + 20 }, 12)
      addKeyframe(b.id, 'bone', 'rotation', { ...baseRot }, 16)
    }

    for (const mesh of meshes) {
      const baseRot = { ...mesh.rotation }
      addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, y: baseRot.y - 30, x: baseRot.x - 15 }, 0)
      addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, y: baseRot.y - 45, x: baseRot.x - 20 }, 4)
      addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, y: baseRot.y + 60, x: baseRot.x + 35 }, 8)
      addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot, y: baseRot.y + 40, x: baseRot.x + 20 }, 12)
      addKeyframe(mesh.id, 'mesh', 'rotation', { ...baseRot }, 16)
    }
    selectClip(clip.id)
  }

  function generateSpinLoop() {
    const clip = addClip('Spin_360', 24, 12)
    const targets = selectedBone.value ? [selectedBone.value] : projectStore.meshes

    for (const item of targets) {
      const type = 'head' in item ? 'bone' : 'mesh'
      const baseRot = { ...item.rotation }
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y }, 0)
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y + 120 }, 8)
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y + 240 }, 16)
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y + 360 }, 24)
    }
    selectClip(clip.id)
  }

  function generateFloatingBob() {
    const clip = addClip('Hover_Bob', 24, 12)
    const targets = selectedBone.value ? [selectedBone.value] : projectStore.meshes

    for (const item of targets) {
      const type = 'head' in item ? 'bone' : 'mesh'
      const baseY = item.position.y
      addKeyframe(item.id, type, 'position', { ...item.position, y: baseY }, 0)
      addKeyframe(item.id, type, 'position', { ...item.position, y: baseY + 0.25 }, 6)
      addKeyframe(item.id, type, 'position', { ...item.position, y: baseY }, 12)
      addKeyframe(item.id, type, 'position', { ...item.position, y: baseY - 0.25 }, 18)
      addKeyframe(item.id, type, 'position', { ...item.position, y: baseY }, 24)
    }
    selectClip(clip.id)
  }

  function generateDoorOpenClose() {
    const clip = addClip('Open_Close', 24, 12)
    const targets = selectedBone.value ? [selectedBone.value] : projectStore.meshes

    for (const item of targets) {
      const type = 'head' in item ? 'bone' : 'mesh'
      const baseRot = { ...item.rotation }
      addKeyframe(item.id, type, 'rotation', { ...baseRot }, 0)
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y + 90 }, 8)
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y + 90 }, 16)
      addKeyframe(item.id, type, 'rotation', { ...baseRot }, 24)
    }
    selectClip(clip.id)
  }

  function generateTailWiggle() {
    const clip = addClip('Tail_Wiggle', 24, 12)
    const bones = armature.value.bones.length > 0 ? armature.value.bones : projectStore.meshes

    bones.forEach((item, idx) => {
      const type = 'head' in item ? 'bone' : 'mesh'
      const phase = (idx * 4) % 24
      const baseRot = { ...item.rotation }
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y + 20 }, (phase + 0) % 24)
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y - 20 }, (phase + 12) % 24)
      addKeyframe(item.id, type, 'rotation', { ...baseRot, y: baseRot.y + 20 }, 24)
    })
    selectClip(clip.id)
  }

  function generateImpactShake() {
    const clip = addClip('Impact_Shake', 12, 12)
    const targets = selectedBone.value ? [selectedBone.value] : projectStore.meshes

    for (const item of targets) {
      const type = 'head' in item ? 'bone' : 'mesh'
      const basePos = { ...item.position }
      addKeyframe(item.id, type, 'position', { ...basePos, x: basePos.x + 0.1, y: basePos.y - 0.05 }, 2)
      addKeyframe(item.id, type, 'position', { ...basePos, x: basePos.x - 0.1, y: basePos.y + 0.05 }, 4)
      addKeyframe(item.id, type, 'position', { ...basePos, x: basePos.x + 0.05 }, 6)
      addKeyframe(item.id, type, 'position', { ...basePos, x: basePos.x - 0.05 }, 8)
      addKeyframe(item.id, type, 'position', { ...basePos }, 12)
    }
    selectClip(clip.id)
  }

  function setClipDuration(seconds: number) {
    if (!activeClip.value) return
    const fps = activeClip.value.fps || 12
    activeClip.value.durationFrames = Math.max(1, Math.round(seconds * fps))
  }

  // ----------------------------------------------------
  // PLAYBACK & EVALUATION
  // ----------------------------------------------------
  function togglePlay() {
    isPlaying.value = !isPlaying.value
    if (isPlaying.value) {
      startPlayback()
    } else {
      stopPlayback()
    }
  }

  function startPlayback() {
    if (playInterval) clearInterval(playInterval)
    const fps = activeClip.value?.fps || 12
    const intervalMs = 1000 / (fps * playbackSpeed.value)

    playInterval = window.setInterval(() => {
      const maxF = activeClip.value?.durationFrames || 24

      if (loopMode.value === 'pingpong') {
        let nextF = currentFrame.value + playDirection
        if (nextF >= maxF) {
          nextF = maxF
          playDirection = -1
        } else if (nextF <= 0) {
          nextF = 0
          playDirection = 1
        }
        currentFrame.value = nextF
      } else if (loopMode.value === 'once') {
        if (currentFrame.value >= maxF) {
          stopPlayback()
          isPlaying.value = false
          return
        }
        currentFrame.value++
      } else {
        currentFrame.value = (currentFrame.value + 1) % (maxF + 1)
      }

      evaluatePose()
    }, intervalMs)
  }

  function stopPlayback() {
    if (playInterval) {
      clearInterval(playInterval)
      playInterval = null
    }
  }

  function setFrame(frame: number) {
    const maxF = activeClip.value?.durationFrames || 24
    currentFrame.value = Math.max(0, Math.min(frame, maxF))
    evaluatePose()
  }

  function evaluatePose() {
    if (!activeClip.value) return

    for (const track of activeClip.value.tracks) {
      const pose = sampleTrack(track, currentFrame.value)

      if (track.targetType === 'bone') {
        const bone = armature.value.bones.find(b => b.id === track.targetId)
        if (bone) {
          bone.position = { ...pose.position }
          bone.rotation = { ...pose.rotation }
          bone.scale = { ...pose.scale }
        }
      } else {
        const mesh = projectStore.meshes.find(m => m.id === track.targetId)
        if (mesh) {
          mesh.position = { ...pose.position }
          mesh.rotation = { ...pose.rotation }
          mesh.scale = { ...pose.scale }
        }
      }
    }
  }

  return {
    armature,
    selectedBoneId,
    selectedBone,
    currentFrame,
    isPlaying,
    playbackSpeed,
    loopMode,
    showBones,
    xrayBones,
    autoKey,
    interpolationMode,
    onionSkin,
    onionFramesCount,
    onionOpacity,
    showMotionTrail,
    activeClip,
    addClip,
    duplicateClip,
    deleteClip,
    renameClip,
    selectClip,
    addRootBone,
    addChildBone,
    extrudeBone,
    subdivideBone,
    symmetrizeArmature,
    parentMeshToBone,
    autoWeightMeshToBones,
    clearArmature,
    deleteBone,
    renameBone,
    selectBone,
    selectedSocketId,
    selectedSocket,
    selectSocket,
    getOrCreateTrack,
    addKeyframe,
    addChannelKeyframe,
    recordCurrentKeyframe,
    recordAllBonesKeyframe,
    clearKeyframeAtCurrentTime,
    recordedStatusMessage,
    currentTimeSeconds,
    totalDurationSeconds,
    addKeyframeForSelected,
    deleteKeyframeAt,
    setKeyframeInterpolation,
    setKeyframeTangent,
    updateKeyframeValue,
    resetPose,
    copyPose,
    pastePose,
    pasteFlippedPose,
    addMarker,
    deleteMarker,
    generateIdleBreathe,
    generateBirdDrink,
    generateWingFlap,
    generateQuadrupedWalk,
    generateWalkCycle,
    generateJumpArc,
    generateAttackSlash,
    generateSpinLoop,
    generateFloatingBob,
    generateDoorOpenClose,
    generateTailWiggle,
    generateImpactShake,
    isTestPoseActive,
    clickToPlaceMode,
    showBoneHierarchyPopout,
    toggleBoneHierarchyPopout,
    toggleTestPose,
    resetAllBonesToRest,
    bindSelectedGeometry,
    assignRigidVertices,
    unbindGeometry,
    assignVertexWeight,
    normalizeVertexWeights,
    isWeightPaintActive,
    weightPaintTool,
    weightBrushWeight,
    weightBrushRadius,
    weightBrushStrength,
    weightBrushFalloff,
    weightAutoNormalize,
    weightXMirror,
    showHeatmapLegend,
    toggleWeightPaint,
    paintVertexWeightAtPoint,
    floodFillBoneWeight,
    normalizeAllMeshWeights,
    smoothMeshBoneWeights,
    clearBoneWeights,
    invertBoneWeights,
    addSocket,
    removeSocket,
    splitBone,
    addBoneFromPoints,
    generateSmartBoneName,
    selectParentBone,
    selectFirstChildBone,
    selectNextBone,
    selectPreviousBone,
    setClipDuration,
    togglePlay,
    setFrame,
    evaluatePose
  }
})
