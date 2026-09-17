<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import type { Bone } from '../../types/animation'
import type { MeshObject, Vector3D } from '../../types/mesh'
import type { RigLandmark } from '../../core/animation/HumanoidRig'
import { humanoidBounds, landmarkGroups } from '../../core/animation/HumanoidRig'
import { meshRestMatrix } from '../../core/animation/RiggingWorkflow'
import { meshToThreeGeometry, computeBoneWorldMatrix } from '../../core/geometry/Converters'

const props = defineProps<{ mesh: MeshObject; markers: RigLandmark[]; bones: Bone[]; activeGroup: string; view: 'front' | 'side' | 'perspective'; review: boolean }>()
const emit = defineEmits<{ move: [id: string, point: Vector3D]; select: [group: string] }>()
const host = ref<HTMLElement | null>(null)
const error = ref('')
const projected = ref<Array<{ id: string; group: string; x: number; y: number; color: string; label: string }>>([])
let renderer: THREE.WebGLRenderer | undefined
const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera()
let model: THREE.Mesh | undefined, lines: THREE.LineSegments | undefined, observer: ResizeObserver | undefined
let width = 1, height = 1, extent = 1
let dragging: { id: string; depth: number } | null = null
const center = new THREE.Vector3()
const boneShapes = new THREE.Group()
scene.add(boneShapes)
function clearBoneShapes() {
  for (const child of [...boneShapes.children]) {
    if (child instanceof THREE.Mesh) { child.geometry.dispose(); (child.material as THREE.Material).dispose() }
    boneShapes.remove(child)
  }
}
function disposeObject(object?: THREE.Mesh | THREE.LineSegments) {
  if (!object) return
  scene.remove(object); object.geometry.dispose()
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  materials.forEach(m => m.dispose())
}
function frame() {
  if (!renderer || !host.value) return
  width = Math.max(host.value.clientWidth, 1); height = Math.max(host.value.clientHeight, 1)
  renderer.setSize(width, height)
  const bounds = humanoidBounds(props.mesh), size = bounds.getSize(new THREE.Vector3())
  bounds.getCenter(center)
  extent = Math.max(size.x, size.y, size.z, .1)
  const half = props.view === 'perspective' ? size.length() / 2 * Math.max(1, height / width) * 1.15 : Math.max(size.y / 2, (props.view === 'side' ? size.z : size.x) / (2 * width / height), extent * .35) * 1.3
  camera.left = -half * width / height; camera.right = half * width / height; camera.top = half; camera.bottom = -half
  camera.near = .001; camera.far = extent * 20 + 1
  const offset = props.view === 'front' ? new THREE.Vector3(0, 0, 3) : props.view === 'side' ? new THREE.Vector3(3, 0, 0) : new THREE.Vector3(2, 1, 3)
  camera.position.copy(center).add(offset.multiplyScalar(extent)); camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  render()
}
function render() {
  if (!renderer) return
  renderer.render(scene, camera)
  projected.value = props.review ? [] : props.markers.map(marker => {
    const p = new THREE.Vector3(marker.position.x, marker.position.y, marker.position.z).project(camera)
    const group = landmarkGroups.find(g => g.id === marker.group)!
    return { id: marker.id, group: marker.group, x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, color: group.color, label: `${group.label}${marker.side ? ` ${marker.side}` : ''}` }
  })
}
function rebuild() {
  if (!renderer) return
  disposeObject(model); disposeObject(lines)
  clearBoneShapes()
  const bundle = meshToThreeGeometry(JSON.parse(JSON.stringify(props.mesh)), [], [], 'smooth', props.review ? { isPoseMode: true, bones: props.bones } : undefined)
  bundle.geometry.applyMatrix4(meshRestMatrix(props.mesh))
  model = new THREE.Mesh(bundle.geometry, new THREE.MeshStandardMaterial({ color: 0xd2d9e1, roughness: .85, metalness: .05, side: THREE.DoubleSide }))
  for (const [name, geometry] of Object.entries(bundle)) if (name !== 'geometry' && geometry instanceof THREE.BufferGeometry) geometry.dispose()
  scene.add(model)
  if (props.review) {
    const positions: number[] = [], cache = new Map<string, THREE.Matrix4>()
    for (const bone of props.bones) {
      const matrix = computeBoneWorldMatrix(bone, props.bones, false, cache)
      const endpoints = [bone.head, bone.tail].map(p => new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(matrix))
      const head = endpoints[0]!, tail = endpoints[1]!, length = head.distanceTo(tail)
      for (const v of endpoints) positions.push(v.x, v.y, v.z)
      const color = bone.name.endsWith('.L') ? 0x4ba9f0 : bone.name.endsWith('.R') ? 0xe76f98 : 0xd99828
      const radius = Math.max(extent * .007, length * .035)
      const material = () => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false })
      const shaft = new THREE.Mesh(new THREE.OctahedronGeometry(1), material())
      shaft.scale.set(radius, length / 2, radius)
      shaft.position.copy(head).lerp(tail, .5)
      if (length > 0) shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tail.clone().sub(head).normalize())
      shaft.renderOrder = 12; boneShapes.add(shaft)
      const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.2, 12, 8), material())
      joint.position.copy(head); joint.renderOrder = 13; boneShapes.add(joint)
    }
    lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)), new THREE.LineBasicMaterial({ color: 0xffbe51, depthTest: false, depthWrite: false }))
    lines.renderOrder = 10; scene.add(lines)
  }
  frame()
}
function start(event: PointerEvent, markerId: string) {
  if (event.button !== 0) return
  event.preventDefault()
  const marker = props.markers.find(m => m.id === markerId)!
  emit('select', marker.group)
  dragging = { id: markerId, depth: props.view === 'side' ? marker.position.x : marker.position.z }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function drag(event: PointerEvent) {
  if (!dragging || !host.value) return
  const rect = host.value.getBoundingClientRect()
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / width * 2 - 1, 1 - (event.clientY - rect.top) / height * 2), camera)
  const normal = props.view === 'side' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  const p = ray.ray.intersectPlane(new THREE.Plane(normal, -dragging.depth), new THREE.Vector3())
  if (p) emit('move', dragging.id, { x: p.x, y: p.y, z: p.z })
}
function nudge(event: KeyboardEvent, id: string) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const marker = props.markers.find(m => m.id === id)!, point = { ...marker.position }
  const amount = extent * (event.shiftKey ? .001 : .01)
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') point.y += event.key === 'ArrowUp' ? amount : -amount
  else { const axis = props.view === 'side' ? 'z' : 'x'; point[axis] += (event.key === 'ArrowRight' ? 1 : -1) * amount * (props.view === 'side' ? -1 : 1) }
  emit('move', id, point)
}
onMounted(() => {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.value!.prepend(renderer.domElement)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x56677d, 2.5))
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 5, 7); scene.add(light)
    observer = new ResizeObserver(frame); observer.observe(host.value!)
    rebuild()
  } catch { error.value = 'The 3D preview could not start. Close this window and try again.' }
})
watch(() => props.mesh, rebuild)
watch(() => props.view, frame)
watch(() => props.review, rebuild)
watch(() => props.bones, () => { if (props.review) rebuild() }, { deep: true })
watch(() => props.markers, render, { deep: true })
onBeforeUnmount(() => { observer?.disconnect(); disposeObject(model); disposeObject(lines); clearBoneShapes(); renderer?.dispose(); renderer?.domElement.remove() })
</script>

<template>
  <div ref="host" class="relative h-full w-full overflow-hidden bg-gradient-to-b from-slate-700/40 to-ui-input" aria-label="Humanoid model preview">
    <div v-if="!review" class="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-white/15" />
    <p v-if="error" role="alert" class="absolute inset-x-4 top-4 text-rose-300">{{ error }}</p>
    <template v-if="!error && view !== 'perspective'">
      <button v-for="marker in projected" :key="marker.id" type="button" :aria-label="`Move ${marker.label} marker`" :title="`${marker.label}: drag or use arrow keys`" class="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-[3px] shadow-lg transition-shadow focus-visible:outline focus-visible:outline-white" :class="marker.group === activeGroup ? 'ring-4 ring-white/25 bg-white/10' : 'bg-black/15'" :style="{ left: `${marker.x}px`, top: `${marker.y}px`, borderColor: marker.color }" @pointerdown="start($event, marker.id)" @pointermove="drag" @pointerup="dragging = null" @pointercancel="dragging = null" @keydown="nudge($event, marker.id)"><span class="sr-only">{{ marker.label }}</span></button>
    </template>
    <div class="pointer-events-none absolute bottom-4 left-4 rounded bg-black/35 px-3 py-2 text-[11px] text-slate-200">{{ review ? 'Preview only · original model unchanged' : view === 'perspective' ? 'Use Front or Side to place markers' : 'Drag markers · arrow keys to nudge · Shift for precision' }}</div>
  </div>
</template>
