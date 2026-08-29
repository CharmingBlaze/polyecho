import * as THREE from 'three'
import { PrimitiveType, PrimitiveParameters } from '../primitives/PrimitiveTypes'
import { PrimitiveBuilder } from '../primitives/PrimitiveBuilder'
import { MeshBridge } from '../mesh/MeshBridge'

export class PrimitiveGhost {
  public group: THREE.Group
  private meshInstance: THREE.Mesh
  private wireframeInstance: THREE.LineSegments
  private fillMaterial: THREE.MeshBasicMaterial
  private wireMaterial: THREE.LineBasicMaterial

  constructor(parentGroup?: THREE.Group) {
    this.group = new THREE.Group()
    this.group.name = '__primitive_ghost__'

    this.fillMaterial = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthTest: true
    })

    this.wireMaterial = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      linewidth: 2,
      depthTest: true
    })

    this.meshInstance = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMaterial)
    this.wireframeInstance = new THREE.LineSegments(new THREE.BufferGeometry(), this.wireMaterial)

    this.group.add(this.meshInstance)
    this.group.add(this.wireframeInstance)

    if (parentGroup) {
      parentGroup.add(this.group)
    }
  }

  /**
   * Updates the ghost geometry, transform, and dimensions in real time.
   */
  update(
    type: PrimitiveType,
    params: PrimitiveParameters,
    position: THREE.Vector3,
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3(1, 1, 1)
  ) {
    const editableMesh = PrimitiveBuilder.create(type, params)
    const geom = MeshBridge.editableMeshToThreeGeometry(editableMesh)

    this.meshInstance.geometry.dispose()
    this.meshInstance.geometry = geom

    this.wireframeInstance.geometry.dispose()
    this.wireframeInstance.geometry = new THREE.WireframeGeometry(geom)

    this.group.position.copy(position)
    this.group.quaternion.copy(rotation)
    this.group.scale.copy(scale)
    this.group.visible = true
  }

  hide() {
    this.group.visible = false
  }

  show() {
    this.group.visible = true
  }

  dispose(parentGroup?: THREE.Group) {
    this.hide()
    if (parentGroup) {
      parentGroup.remove(this.group)
    }
    this.meshInstance.geometry.dispose()
    this.wireframeInstance.geometry.dispose()
    this.fillMaterial.dispose()
    this.wireMaterial.dispose()
  }
}
