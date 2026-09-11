import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCube } from '../../geometry/Primitives'
import { MeshBridge } from '../MeshBridge'
import { KnifeKernel } from './KnifeKernel'

describe('KnifeKernel screen follow', () => {
  it('snaps overlay angles around the last point without changing distance', () => {
    const from = new THREE.Vector2(100, 100)
    const to = new THREE.Vector2(140, 105)
    const snapped = KnifeKernel.snapScreenToAngle(from, to, 45)
    const angle = Math.atan2(snapped.y - from.y, snapped.x - from.x)
    expect(Math.abs(angle) < 1e-6 || Math.abs(Math.abs(angle) - Math.PI / 4) < 1e-6).toBe(true)
    expect(snapped.distanceTo(from)).toBeCloseTo(to.distanceTo(from), 4)
  })
})

describe('KnifeKernel on arbitrary faces', () => {
  it('pokes a face and connects two interior cuts', () => {
    const { mesh } = MeshBridge.meshObjectToEditableMesh(createCube('Cube', 2))
    const top = [...mesh.faces.values()].find((f) =>
      f.vertexIds.every((id) => (mesh.vertices.get(id)?.position.y ?? 0) > 0.5)
    )
    expect(top).toBeTruthy()
    const beforeFaces = mesh.faces.size
    KnifeKernel.applyCuts(
      mesh,
      [
        {
          world: new THREE.Vector3(0, 1, 0.35),
          screen: new THREE.Vector2(0, 0),
          targetType: 'FACE',
          faceId: top!.id,
        },
        {
          world: new THREE.Vector3(0, 1, -0.35),
          screen: new THREE.Vector2(10, 0),
          targetType: 'FACE',
          faceId: top!.id,
        },
      ],
      {
        cutThrough: false,
        camera: new THREE.PerspectiveCamera(),
        viewportRect: { left: 0, top: 0, width: 100, height: 100 },
      }
    )
    expect(mesh.faces.size).toBeGreaterThan(beforeFaces)
    expect(mesh.vertices.size).toBeGreaterThan(8)
    for (const face of mesh.faces.values()) {
      expect(face.vertexIds.length).toBeGreaterThanOrEqual(3)
      expect(face.uvs.length).toBe(face.vertexIds.length)
    }
  })
})
