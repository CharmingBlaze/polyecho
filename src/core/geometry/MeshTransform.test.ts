import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyWorldDeltaToObjectTRS } from './MeshTransform'

function proxyDelta(from: THREE.Vector3, to: THREE.Vector3, fromScale = 1, toScale = 1) {
  const identity = new THREE.Quaternion()
  const start = new THREE.Matrix4().compose(from, identity, new THREE.Vector3(fromScale, fromScale, fromScale))
  const now = new THREE.Matrix4().compose(to, identity, new THREE.Vector3(toScale, toScale, toScale))
  return new THREE.Matrix4().multiplyMatrices(now, start.clone().invert())
}

describe('applyWorldDeltaToObjectTRS', () => {
  it('keeps object scale when the identity proxy is only translated', () => {
    const start = {
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 0.3, 1),
    }
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    applyWorldDeltaToObjectTRS(
      start,
      proxyDelta(new THREE.Vector3(), new THREE.Vector3(2, 0.5, 0)),
      pos,
      quat,
      scale
    )
    expect(pos.x).toBeCloseTo(2)
    expect(pos.y).toBeCloseTo(0.5)
    expect(scale.x).toBeCloseTo(1)
    expect(scale.y).toBeCloseTo(0.3)
    expect(scale.z).toBeCloseTo(1)
  })

  it('moves by the proxy delta instead of snapping the origin onto a cursor pivot', () => {
    const start = {
      position: new THREE.Vector3(5, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(2, 2, 2),
    }
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    applyWorldDeltaToObjectTRS(
      start,
      proxyDelta(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)),
      pos,
      quat,
      scale
    )
    expect(pos.x).toBeCloseTo(6)
    expect(scale.x).toBeCloseTo(2)
  })

  it('multiplies existing object scale by a scale-only proxy delta', () => {
    const start = {
      position: new THREE.Vector3(0, 1, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(2, 2, 2),
    }
    const identity = new THREE.Quaternion()
    const proxyStart = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 1, 0),
      identity,
      new THREE.Vector3(1, 1, 1)
    )
    const proxyNow = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 1, 0),
      identity,
      new THREE.Vector3(1, 0.5, 1)
    )
    const delta = new THREE.Matrix4().multiplyMatrices(proxyNow, proxyStart.clone().invert())
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    applyWorldDeltaToObjectTRS(start, delta, pos, quat, scale)
    expect(pos.y).toBeCloseTo(1)
    expect(scale.x).toBeCloseTo(2)
    expect(scale.y).toBeCloseTo(1)
    expect(scale.z).toBeCloseTo(2)
  })
})
