import * as THREE from 'three'
import { EditableMesh } from '../../mesh/MeshKernel'
import { WallParameters, StairsParameters, ArchParameters, IPrimitiveBuilder } from '../PrimitiveTypes'
import { BoxBuilder } from './BasicBuilders'

const QUAD_UVS = [
  new THREE.Vector2(0, 0),
  new THREE.Vector2(1, 0),
  new THREE.Vector2(1, 1),
  new THREE.Vector2(0, 1)
]

function addBox(
  mesh: EditableMesh,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number
) {
  const v = (x: number, y: number, z: number) => mesh.addVertex(new THREE.Vector3(x, y, z)).id
  const a = v(x0, y0, z1)
  const b = v(x1, y0, z1)
  const c = v(x1, y1, z1)
  const d = v(x0, y1, z1)
  const e = v(x0, y0, z0)
  const f = v(x1, y0, z0)
  const g = v(x1, y1, z0)
  const h = v(x0, y1, z0)
  mesh.addFace([a, b, c, d], QUAD_UVS, 0)
  mesh.addFace([f, e, h, g], QUAD_UVS, 0)
  mesh.addFace([d, c, g, h], QUAD_UVS, 0)
  mesh.addFace([e, f, b, a], QUAD_UVS, 0)
  mesh.addFace([b, f, g, c], QUAD_UVS, 0)
  mesh.addFace([e, a, d, h], QUAD_UVS, 0)
}

function addQuad(mesh: EditableMesh, a: number, b: number, c: number, d: number) {
  mesh.addFace([a, b, c, d], QUAD_UVS, 0)
}

export class WallBuilder implements IPrimitiveBuilder<WallParameters> {
  create(params: WallParameters): EditableMesh {
    const len = Math.abs(params.width || params.length || 0) || 2.0
    const thick = Math.abs(params.thickness || params.depth || 0) || 0.2
    const h = Math.abs(params.height) || 2.0

    return new BoxBuilder().create({
      width: len,
      depth: Math.max(0.04, thick),
      height: h
    })
  }
}

export class StairsBuilder implements IPrimitiveBuilder<StairsParameters> {
  create(params: StairsParameters): EditableMesh {
    const mesh = new EditableMesh()
    const w = Math.abs(params.width) || 1.5
    const totalRun = Math.abs(params.totalRun) || 2.0
    const totalHeight = Math.abs(params.totalHeight ?? params.height ?? 0) || 1.5
    const steps = Math.max(2, Math.min(32, params.steps || 4))

    const stepDepth = totalRun / steps
    const stepHeight = totalHeight / steps
    const hw = w / 2
    const z0base = -totalRun / 2

    for (let s = 0; s < steps; s++) {
      const z0 = z0base + s * stepDepth
      const z1 = z0base + (s + 1) * stepDepth
      const y1 = (s + 1) * stepHeight
      addBox(mesh, -hw, hw, 0, y1, z0, z1)
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class ArchBuilder implements IPrimitiveBuilder<ArchParameters> {
  create(params: ArchParameters): EditableMesh {
    const mesh = new EditableMesh()
    const w = Math.abs(params.width) || 2.0
    const d = Math.abs(params.depth) || 0.4
    const h = Math.abs(params.height) || 2.5
    const segs = Math.max(4, params.segments || 8)

    const rOut = w / 2
    const requestedInner = Math.abs(params.openingWidth) / 2
    const rIn = Math.min(
      rOut * 0.88,
      requestedInner > 0.02 ? requestedInner : rOut * 0.55
    )
    const crown = rOut
    const legH = Math.max(0.08, h - crown)
    const z0 = -d / 2
    const z1 = d / 2

    const outer: { x: number; y: number }[] = [{ x: -rOut, y: 0 }]
    const inner: { x: number; y: number }[] = [{ x: -rIn, y: 0 }]
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI - (i / segs) * Math.PI
      outer.push({ x: Math.cos(a) * rOut, y: legH + Math.sin(a) * rOut })
      inner.push({ x: Math.cos(a) * rIn, y: legH + Math.sin(a) * rIn })
    }
    outer.push({ x: rOut, y: 0 })
    inner.push({ x: rIn, y: 0 })

    const frontOut: number[] = []
    const backOut: number[] = []
    const frontIn: number[] = []
    const backIn: number[] = []
    for (let i = 0; i < outer.length; i++) {
      frontOut.push(mesh.addVertex(new THREE.Vector3(outer[i].x, outer[i].y, z1)).id)
      backOut.push(mesh.addVertex(new THREE.Vector3(outer[i].x, outer[i].y, z0)).id)
      frontIn.push(mesh.addVertex(new THREE.Vector3(inner[i].x, inner[i].y, z1)).id)
      backIn.push(mesh.addVertex(new THREE.Vector3(inner[i].x, inner[i].y, z0)).id)
    }

    for (let i = 0; i < outer.length - 1; i++) {
      addQuad(mesh, frontOut[i], frontOut[i + 1], frontIn[i + 1], frontIn[i])
      addQuad(mesh, backOut[i + 1], backOut[i], backIn[i], backIn[i + 1])
      addQuad(mesh, backOut[i], backOut[i + 1], frontOut[i + 1], frontOut[i])
      addQuad(mesh, frontIn[i], frontIn[i + 1], backIn[i + 1], backIn[i])
    }

    const last = outer.length - 1
    addQuad(mesh, frontOut[0], frontIn[0], backIn[0], backOut[0])
    addQuad(mesh, frontIn[last], frontOut[last], backOut[last], backIn[last])

    mesh.recalculateNormals()
    return mesh
  }
}
