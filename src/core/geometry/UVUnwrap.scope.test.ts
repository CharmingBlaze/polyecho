import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createCone, createCube, createCylinder, createSphere } from './Primitives'
import {
  boxUnwrap,
  coneUnwrap,
  cubemapCrossUnwrap,
  cylinderUnwrap,
  meshWorldPoint,
  planarUnwrap,
  sphereUnwrap
} from './UVUnwrap'
import type { MeshObject, UV } from '../../types/mesh'

function stamp(mesh: MeshObject) {
  for (const face of mesh.faces) {
    face.uvs = face.vertexIds.map(() => ({ u: 0.123, v: 0.456 }))
  }
}

function isStamped(uvs: UV[]) {
  return uvs.every(uv => Math.abs(uv.u - 0.123) < 1e-9 && Math.abs(uv.v - 0.456) < 1e-9)
}

function span(uvs: UV[]) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (const uv of uvs) {
    minU = Math.min(minU, uv.u)
    maxU = Math.max(maxU, uv.u)
    minV = Math.min(minV, uv.v)
    maxV = Math.max(maxV, uv.v)
  }
  return { du: maxU - minU, dv: maxV - minV }
}

describe('unwrap scope and coverage', () => {
  it('matches the viewport Euler XYZ pose', () => {
    const mesh = createCube()
    mesh.rotation = { x: 20, y: -35, z: 10 }
    mesh.scale = { x: 1.5, y: 0.5, z: 2 }
    mesh.position = { x: 4, y: -1, z: 0.25 }
    const local = { x: 1, y: 2, z: 3 }
    const expected = new THREE.Vector3(local.x, local.y, local.z)
      .multiply(new THREE.Vector3(mesh.scale.x, mesh.scale.y, mesh.scale.z))
    expected.applyEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(mesh.rotation.x),
      THREE.MathUtils.degToRad(mesh.rotation.y),
      THREE.MathUtils.degToRad(mesh.rotation.z),
      'XYZ'
    ))
    expected.add(new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z))
    const world = meshWorldPoint(mesh, local)
    expect(world.x).toBeCloseTo(expected.x)
    expect(world.y).toBeCloseTo(expected.y)
    expect(world.z).toBeCloseTo(expected.z)
  })

  it('unwraps every selected face and leaves the rest untouched', () => {
    const ops = [
      (mesh: MeshObject, faces: number[]) => boxUnwrap(mesh, faces),
      (mesh: MeshObject, faces: number[]) => planarUnwrap(mesh, 'z', faces),
      (mesh: MeshObject, faces: number[]) => cylinderUnwrap(mesh, faces),
      (mesh: MeshObject, faces: number[]) => sphereUnwrap(mesh, faces),
      (mesh: MeshObject, faces: number[]) => coneUnwrap(mesh, faces),
      (mesh: MeshObject, faces: number[]) => cubemapCrossUnwrap(mesh, faces)
    ]
    for (const op of ops) {
      const mesh = createCube()
      stamp(mesh)
      const selected = [0, 2, 4]
      const result = op(mesh, selected)
      for (let i = 0; i < result.faces.length; i++) {
        expect(result.faces[i].uvs).toHaveLength(result.faces[i].vertexIds.length)
        if (selected.includes(i)) expect(isStamped(result.faces[i].uvs)).toBe(false)
        else expect(result.faces[i].uvs).toEqual(mesh.faces[i].uvs)
      }
    }
  })

  it('unwraps every face of the object when no subset is given', () => {
    const mesh = createCube()
    stamp(mesh)
    for (const result of [boxUnwrap(mesh), planarUnwrap(mesh, 'y'), cylinderUnwrap(mesh), sphereUnwrap(mesh), coneUnwrap(mesh), cubemapCrossUnwrap(mesh)]) {
      for (const face of result.faces) {
        expect(face.uvs).toHaveLength(face.vertexIds.length)
        expect(isStamped(face.uvs)).toBe(false)
      }
    }
  })

  it('keeps every cylinder, cone, and sphere face compact, including the seam', () => {
    const cases: [string, MeshObject, (mesh: MeshObject) => MeshObject, number][] = [
      ['cylinder', createCylinder('Cyl', 1, 2, 8), cylinderUnwrap, 0.25],
      ['cone', createCone('Cone', 1, 2, 8), coneUnwrap, 0.75],
      ['sphere', createSphere('Sph', 1, 8, 12), sphereUnwrap, 0.2]
    ]
    for (const [name, mesh, op, limit] of cases) {
      mesh.rotation = { x: 90, y: 25, z: 0 }
      const result = op(mesh)
      for (const face of result.faces) {
        const box = span(face.uvs)
        expect(box.du, name).toBeLessThan(limit)
        expect(box.dv, name).toBeLessThanOrEqual(1)
        expect(face.uvs.every(uv => Number.isFinite(uv.u) && Number.isFinite(uv.v))).toBe(true)
      }
    }
  })
})
