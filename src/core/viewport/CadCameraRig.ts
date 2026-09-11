import * as THREE from 'three'
import { CADCameraControls, type InputBindings } from 'cad-camera-controls'

export type CadViewKind = 'persp' | 'top' | 'front' | 'right'

const IDLE_PERSP: InputBindings = { rotate: { button: 0 }, pan: { button: 2 } }
const SKETCH_PERSP: InputBindings = { rotate: { button: 1 }, pan: { button: 2 } }
const ORTHO_BINDINGS: InputBindings = { rotate: { button: 1 }, pan: { button: 2 } }

function configure(controls: CADCameraControls, persp: boolean) {
  controls.enableDamping = true
  controls.dampingFactor = 0.18
  controls.orbitStyle = 'turntable'
  controls.zoomMode = 'dolly'
  controls.minDistance = 0.05
  controls.maxDistance = 500
  controls.minZoom = 0.08
  controls.maxZoom = 80
  controls.enableKeyboard = false
  controls.preventContextMenu = true
  controls.pivot.set(0, 0.5, 0)
  controls.enabled = false
  controls.inputBindings = persp ? IDLE_PERSP : ORTHO_BINDINGS
}

/** One CADCameraControls per viewport camera, only the hovered pane is live. */
export class CadCameraRig {
  readonly persp: CADCameraControls
  readonly top: CADCameraControls
  readonly front: CADCameraControls
  readonly right: CADCameraControls
  private readonly all: CADCameraControls[]
  private readonly clock = new THREE.Clock()
  private allowed = true
  private activeKind: CadViewKind = 'persp'

  constructor(
    cameras: {
      persp: THREE.PerspectiveCamera
      top: THREE.OrthographicCamera
      front: THREE.OrthographicCamera
      right: THREE.OrthographicCamera
    },
    domElement: HTMLElement
  ) {
    this.persp = new CADCameraControls(cameras.persp, domElement)
    this.top = new CADCameraControls(cameras.top, domElement)
    this.front = new CADCameraControls(cameras.front, domElement)
    this.right = new CADCameraControls(cameras.right, domElement)
    configure(this.persp, true)
    configure(this.top, false)
    configure(this.front, false)
    configure(this.right, false)
    this.all = [this.persp, this.top, this.front, this.right]
    this.applyEnabled()
  }

  get pivot(): THREE.Vector3 {
    return this.persp.pivot
  }

  control(kind: CadViewKind): CADCameraControls {
    return this[kind]
  }

  applyIdleBindings() {
    this.persp.inputBindings = IDLE_PERSP
  }

  applySketchBindings() {
    this.persp.inputBindings = SKETCH_PERSP
  }

  setAllowed(on: boolean) {
    this.allowed = on
    this.applyEnabled()
  }

  setActiveKind(kind: CadViewKind) {
    this.activeKind = kind
    this.applyEnabled()
  }

  setInvertZoom(invert: boolean) {
    const speed = invert ? -1 : 1
    for (const c of this.all) c.zoomSpeed = speed
  }

  syncPivotsFromPersp() {
    const p = this.persp.pivot
    this.top.pivot.copy(p)
    this.front.pivot.copy(p)
    this.right.pivot.copy(p)
  }

  update() {
    const dt = this.clock.getDelta()
    for (const c of this.all) c.update(dt)
  }

  dispose() {
    for (const c of this.all) c.dispose()
  }

  private applyEnabled() {
    for (const c of this.all) c.enabled = false
    if (!this.allowed) return
    this.control(this.activeKind).enabled = true
  }
}

export function viewKindFromQuadrant(q: string): CadViewKind {
  if (q === 'top_left') return 'top'
  if (q === 'bottom_left' || q === 'col_front') return 'front'
  if (q === 'bottom_right' || q === 'col_side') return 'right'
  return 'persp'
}
