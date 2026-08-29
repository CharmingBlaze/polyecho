import * as THREE from 'three'

export interface ViewportShadowSettings {
  enabled: boolean
  softness: number
  strength: number
  contactShadows: boolean
}

export class EditorEnvironment {
  public scene: THREE.Scene
  public shadowLight: THREE.DirectionalLight
  public ambientLight: THREE.HemisphereLight
  public fillLight: THREE.DirectionalLight
  public shadowReceiver: THREE.Mesh
  private shadowMaterial: THREE.ShadowMaterial

  public settings: ViewportShadowSettings = {
    enabled: true,
    softness: 2.0,
    strength: 0.35,
    contactShadows: true
  }

  // Fixed world-space shadow direction to prevent shimmering during orbit
  public static readonly FIXED_LIGHT_POS = new THREE.Vector3(-8, 14, 8)

  constructor(scene: THREE.Scene, shadowParent?: THREE.Group) {
    this.scene = scene

    // 1. Broad Neutral Environment Fill (Sky/Ground)
    // Ensures model surfaces are clearly visible and never pitch-black from any angle
    this.ambientLight = new THREE.HemisphereLight(0xffffff, 0x334155, 0.95)
    this.scene.add(this.ambientLight)

    // 2. Secondary Soft Rim/Fill Light
    this.fillLight = new THREE.DirectionalLight(0x94a3b8, 0.35)
    this.fillLight.position.set(8, -4, -8)
    this.scene.add(this.fillLight)

    // 3. Editor Shadow Light (Fixed world-space key light)
    this.shadowLight = new THREE.DirectionalLight(0xfffbeb, 0.85)
    this.shadowLight.position.copy(EditorEnvironment.FIXED_LIGHT_POS)
    this.shadowLight.castShadow = true

    // Shadow Map Configuration (2048x2048 high precision)
    this.shadowLight.shadow.mapSize.width = 2048
    this.shadowLight.shadow.mapSize.height = 2048
    this.shadowLight.shadow.camera.near = 0.5
    this.shadowLight.shadow.camera.far = 45
    this.shadowLight.shadow.camera.left = -10
    this.shadowLight.shadow.camera.right = 10
    this.shadowLight.shadow.camera.top = 10
    this.shadowLight.shadow.camera.bottom = -10
    this.shadowLight.shadow.bias = -0.0005
    this.shadowLight.shadow.normalBias = 0.02
    this.shadowLight.shadow.radius = this.settings.softness

    this.scene.add(this.shadowLight)

    // 4. Editor Invisible Shadow Receiver Ground Plane (Contact / Drop Shadows at Y=0)
    const groundGeometry = new THREE.PlaneGeometry(80, 80)
    this.shadowMaterial = new THREE.ShadowMaterial({
      opacity: this.settings.strength,
      depthWrite: false
    })
    this.shadowReceiver = new THREE.Mesh(groundGeometry, this.shadowMaterial)
    this.shadowReceiver.rotation.x = -Math.PI / 2
    this.shadowReceiver.position.y = -0.002
    this.shadowReceiver.receiveShadow = true
    this.shadowReceiver.name = '__editor_shadow_receiver__'
    
    if (shadowParent) {
      shadowParent.add(this.shadowReceiver)
    } else {
      this.scene.add(this.shadowReceiver)
    }
  }

  /**
   * Dynamically fits the directional shadow camera tightly around the model's bounding box.
   * Maximizes shadow map resolution without blur.
   */
  fitShadowCameraToBounds(box: THREE.Box3) {
    if (box.isEmpty()) return

    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    const maxDim = Math.max(size.x, size.y, size.z, 2.0)
    const margin = maxDim * 0.65

    const d = this.shadowLight.shadow.camera
    d.left = -margin
    d.right = margin
    d.top = margin
    d.bottom = -margin
    d.near = 0.5
    d.far = Math.max(40, maxDim * 4)
    d.updateProjectionMatrix()

    // Aim target at bounding box center
    this.shadowLight.target.position.copy(center)
    this.shadowLight.target.updateMatrixWorld()
  }

  setShadowsEnabled(enabled: boolean) {
    this.settings.enabled = enabled
    this.shadowLight.castShadow = enabled
    this.shadowReceiver.visible = enabled && this.settings.contactShadows
  }

  setSoftness(radius: number) {
    this.settings.softness = radius
    this.shadowLight.shadow.radius = radius
  }

  setStrength(opacity: number) {
    this.settings.strength = opacity
    this.shadowMaterial.opacity = opacity
  }

  dispose() {
    this.scene.remove(this.ambientLight)
    this.scene.remove(this.fillLight)
    this.scene.remove(this.shadowLight)
    this.scene.remove(this.shadowReceiver)
    this.shadowReceiver.geometry.dispose()
    this.shadowMaterial.dispose()
  }
}
