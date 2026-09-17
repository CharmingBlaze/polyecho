import * as THREE from 'three'
import { PrimitiveType, PrimitiveParameters } from '../primitives/PrimitiveTypes'
import { PrimitiveBuilder } from '../primitives/PrimitiveBuilder'
import { MeshBridge } from '../mesh/MeshBridge'

function boxEdgePositions(box: THREE.Box3): number[] {
  const { x: x0, y: y0, z: z0 } = box.min
  const { x: x1, y: y1, z: z1 } = box.max
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]
  ]
  const edges = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]
  const pos: number[] = []
  for (const i of edges) pos.push(c[i][0], c[i][1], c[i][2])
  return pos
}

function dashedLine(color: number, opacity: number, dashSize: number, gapSize: number, depthTest: boolean) {
  return new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize,
    gapSize,
    depthTest,
    depthWrite: false
  })
}

export class PrimitiveGhost {
  public group: THREE.Group
  private geometryKey = ''
  private lift = 0
  public faceCount = 0
  private meshInstance: THREE.Mesh
  private wireframeInstance: THREE.LineSegments
  private boundsInstance: THREE.LineSegments
  private fillMaterial: THREE.MeshBasicMaterial
  private wireMaterial: THREE.LineDashedMaterial
  private boundsMaterial: THREE.LineDashedMaterial

  constructor(parentGroup?: THREE.Group) {
    this.group = new THREE.Group()
    this.group.name = '__primitive_ghost__'
    this.group.renderOrder = 70

    this.fillMaterial = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    })

    this.wireMaterial = dashedLine(0xe0f2fe, 0.55, 0.05, 0.04, true)
    this.boundsMaterial = dashedLine(0xfde68a, 0.95, 0.08, 0.055, false)

    this.meshInstance = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMaterial)
    this.meshInstance.renderOrder = 70
    this.meshInstance.userData.ignorePick = true
    this.wireframeInstance = new THREE.LineSegments(new THREE.BufferGeometry(), this.wireMaterial)
    this.wireframeInstance.renderOrder = 71
    this.wireframeInstance.userData.ignorePick = true
    this.boundsInstance = new THREE.LineSegments(new THREE.BufferGeometry(), this.boundsMaterial)
    this.boundsInstance.renderOrder = 80
    this.boundsInstance.userData.ignorePick = true

    this.group.add(this.meshInstance)
    this.group.add(this.wireframeInstance)
    this.group.add(this.boundsInstance)

    if (parentGroup) parentGroup.add(this.group)
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
      for (const edge of editableMesh.edges.values()) {
        lines.push(editableMesh.vertices.get(edge.v1)!.position, editableMesh.vertices.get(edge.v2)!.position)
      }
      this.wireframeInstance.geometry = new THREE.BufferGeometry().setFromPoints(lines)
      this.wireframeInstance.computeLineDistances()
      this.wireframeInstance.visible = editableMesh.edges.size > 12

      this.boundsInstance.geometry.dispose()
      const box = geom.boundingBox ?? new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5))
      const span = box.getSize(new THREE.Vector3()).length()
      const dash = Math.max(0.04, span * 0.045)
      this.boundsMaterial.dashSize = dash
      this.boundsMaterial.gapSize = dash * 0.7
      this.boundsInstance.geometry = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(boxEdgePositions(box), 3)
      )
      this.boundsInstance.computeLineDistances()
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
    if (parentGroup) parentGroup.remove(this.group)
    this.meshInstance.geometry.dispose()
    this.wireframeInstance.geometry.dispose()
    this.boundsInstance.geometry.dispose()
    this.fillMaterial.dispose()
    this.wireMaterial.dispose()
    this.boundsMaterial.dispose()
  }
}
