import * as THREE from 'three'
import { PrimitiveType, PrimitiveParameters } from '../primitives/PrimitiveTypes'
import { PrimitiveBuilder } from '../primitives/PrimitiveBuilder'
import { MeshBridge } from '../mesh/MeshBridge'

export class PrimitiveGhost {
  public group: THREE.Group
  private geometryKey = ''
  private lift = 0
  public faceCount = 0
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
   * `restPosition` is the footprint on the construction surface.
   * Local Y is lifted so `boundingBox.min.y` sits on that plane (CAD boxes
   * are centered; stairs/arches sit on y=0 — both land on the ground).
   */
  update(
    type: PrimitiveType,
    params: PrimitiveParameters,
    restPosition: THREE.Vector3,
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3(1, 1, 1)
  ) {
    const key = JSON.stringify([type, params])
    if (this.geometryKey !== key) {
    this.geometryKey = key
    const editableMesh = PrimitiveBuilder.create(type, params)
    this.faceCount = editableMesh.faces.size
    const geom = MeshBridge.editableMeshToThreeGeometry(editableMesh)
    geom.computeBoundingBox()
    const minY = geom.boundingBox?.min.y ?? 0
    this.lift = Number.isFinite(minY) ? -minY : 0

    this.meshInstance.geometry.dispose()
    this.meshInstance.geometry = geom

    this.wireframeInstance.geometry.dispose()
    const lines: THREE.Vector3[] = []
    for (const edge of editableMesh.edges.values()) lines.push(editableMesh.vertices.get(edge.v1)!.position, editableMesh.vertices.get(edge.v2)!.position)
    this.wireframeInstance.geometry = new THREE.BufferGeometry().setFromPoints(lines)
    }

    this.group.quaternion.copy(rotation)
    this.group.scale.copy(scale)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)
    this.group.position.copy(restPosition).addScaledVector(up, this.lift * scale.y)
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
