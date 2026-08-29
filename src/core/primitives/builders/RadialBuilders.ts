import * as THREE from 'three'
import { EditableMesh } from '../../mesh/MeshKernel'
import {
  SphereParameters,
  IcosphereParameters,
  CylinderParameters,
  ConeParameters,
  CircleParameters,
  TorusParameters,
  CapsuleParameters,
  TubeParameters,
  IPrimitiveBuilder
} from '../PrimitiveTypes'

export class CylinderBuilder implements IPrimitiveBuilder<CylinderParameters> {
  create(params: CylinderParameters): EditableMesh {
    const mesh = new EditableMesh()
    const r = Math.abs(params.radius) || 0.5
    const h = Math.abs(params.height) || 1.0
    const sides = Math.max(3, params.sides || 8)
    const capTop = params.capTop !== false
    const capBottom = params.capBottom !== false

    const hy = h / 2
    const topVerts: number[] = []
    const botVerts: number[] = []

    for (let i = 0; i < sides; i++) {
      const theta = (i / sides) * Math.PI * 2
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r

      topVerts.push(mesh.addVertex(new THREE.Vector3(x, hy, z)).id)
      botVerts.push(mesh.addVertex(new THREE.Vector3(x, -hy, z)).id)
    }

    // Side Quad Faces
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides
      const v0 = botVerts[i]
      const v1 = botVerts[next]
      const v2 = topVerts[next]
      const v3 = topVerts[i]

      const u0 = i / sides
      const u1 = (i + 1) / sides
      const uvs = [
        new THREE.Vector2(u0, 0),
        new THREE.Vector2(u1, 0),
        new THREE.Vector2(u1, 1),
        new THREE.Vector2(u0, 1)
      ]
      mesh.addFace([v0, v1, v2, v3], uvs, 0)
    }

    // Top Cap n-gon
    if (capTop) {
      const topUvs = topVerts.map((_, i) => {
        const theta = (i / sides) * Math.PI * 2
        return new THREE.Vector2(0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta))
      })
      mesh.addFace([...topVerts], topUvs, 0)
    }

    // Bottom Cap n-gon (reversed winding for outward normal)
    if (capBottom) {
      const reversedBot = [...botVerts].reverse()
      const botUvs = reversedBot.map((_, i) => {
        const theta = (i / sides) * Math.PI * 2
        return new THREE.Vector2(0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta))
      })
      mesh.addFace(reversedBot, botUvs, 0)
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class ConeBuilder implements IPrimitiveBuilder<ConeParameters> {
  create(params: ConeParameters): EditableMesh {
    const mesh = new EditableMesh()
    const r = Math.abs(params.radius) || 0.5
    const h = Math.abs(params.height) || 1.0
    const sides = Math.max(3, params.sides || 8)
    const capBottom = params.capBottom !== false

    const botVerts: number[] = []
    for (let i = 0; i < sides; i++) {
      const theta = (i / sides) * Math.PI * 2
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      botVerts.push(mesh.addVertex(new THREE.Vector3(x, 0, z)).id)
    }

    const apex = mesh.addVertex(new THREE.Vector3(0, h, 0)).id

    // Side Triangular Faces
    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides
      const v0 = botVerts[i]
      const v1 = botVerts[next]
      const uvs = [
        new THREE.Vector2(i / sides, 0),
        new THREE.Vector2((i + 1) / sides, 0),
        new THREE.Vector2((i + 0.5) / sides, 1)
      ]
      mesh.addFace([v0, v1, apex], uvs, 0)
    }

    // Bottom Cap
    if (capBottom) {
      const reversedBot = [...botVerts].reverse()
      const botUvs = reversedBot.map((_, i) => {
        const theta = (i / sides) * Math.PI * 2
        return new THREE.Vector2(0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta))
      })
      mesh.addFace(reversedBot, botUvs, 0)
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class SphereBuilder implements IPrimitiveBuilder<SphereParameters> {
  create(params: SphereParameters): EditableMesh {
    const mesh = new EditableMesh()
    const r = Math.abs(params.radius) || 0.5
    const segments = Math.max(4, params.segments || 8)
    const rings = Math.max(3, params.rings || 6)

    const topPole = mesh.addVertex(new THREE.Vector3(0, r, 0)).id
    const botPole = mesh.addVertex(new THREE.Vector3(0, -r, 0)).id

    const ringVerts: number[][] = []
    for (let lat = 1; lat < rings; lat++) {
      const phi = (lat / rings) * Math.PI
      const y = Math.cos(phi) * r
      const ringRadius = Math.sin(phi) * r

      const currentRing: number[] = []
      for (let lon = 0; lon < segments; lon++) {
        const theta = (lon / segments) * Math.PI * 2
        const x = Math.cos(theta) * ringRadius
        const z = Math.sin(theta) * ringRadius
        currentRing.push(mesh.addVertex(new THREE.Vector3(x, y, z)).id)
      }
      ringVerts.push(currentRing)
    }

    // Top Cap Triangles
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments
      mesh.addFace([topPole, ringVerts[0][i], ringVerts[0][next]], [
        new THREE.Vector2((i + 0.5) / segments, 1),
        new THREE.Vector2(i / segments, 1 - 1 / rings),
        new THREE.Vector2((i + 1) / segments, 1 - 1 / rings)
      ], 0)
    }

    // Intermediate Quads
    for (let rIdx = 0; rIdx < ringVerts.length - 1; rIdx++) {
      const r1 = ringVerts[rIdx]
      const r2 = ringVerts[rIdx + 1]
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments
        const v0 = r2[i]
        const v1 = r2[next]
        const v2 = r1[next]
        const v3 = r1[i]

        const uvs = [
          new THREE.Vector2(i / segments, (rIdx + 1) / rings),
          new THREE.Vector2((i + 1) / segments, (rIdx + 1) / rings),
          new THREE.Vector2((i + 1) / segments, rIdx / rings),
          new THREE.Vector2(i / segments, rIdx / rings)
        ]
        mesh.addFace([v0, v1, v2, v3], uvs, 0)
      }
    }

    // Bottom Cap Triangles
    const lastRing = ringVerts[ringVerts.length - 1]
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments
      mesh.addFace([botPole, lastRing[next], lastRing[i]], [
        new THREE.Vector2((i + 0.5) / segments, 0),
        new THREE.Vector2((i + 1) / segments, 1 / rings),
        new THREE.Vector2(i / segments, 1 / rings)
      ], 0)
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class IcosphereBuilder implements IPrimitiveBuilder<IcosphereParameters> {
  create(params: IcosphereParameters): EditableMesh {
    const mesh = new EditableMesh()
    const r = Math.abs(params.radius) || 0.5
    const phi = (1.0 + Math.sqrt(5.0)) / 2.0

    // 12 base icosahedron vertices normalized to radius
    const baseVerts = [
      new THREE.Vector3(-1,  phi, 0).normalize().multiplyScalar(r),
      new THREE.Vector3( 1,  phi, 0).normalize().multiplyScalar(r),
      new THREE.Vector3(-1, -phi, 0).normalize().multiplyScalar(r),
      new THREE.Vector3( 1, -phi, 0).normalize().multiplyScalar(r),
      new THREE.Vector3(0, -1,  phi).normalize().multiplyScalar(r),
      new THREE.Vector3(0,  1,  phi).normalize().multiplyScalar(r),
      new THREE.Vector3(0, -1, -phi).normalize().multiplyScalar(r),
      new THREE.Vector3(0,  1, -phi).normalize().multiplyScalar(r),
      new THREE.Vector3( phi, 0, -1).normalize().multiplyScalar(r),
      new THREE.Vector3( phi, 0,  1).normalize().multiplyScalar(r),
      new THREE.Vector3(-phi, 0, -1).normalize().multiplyScalar(r),
      new THREE.Vector3(-phi, 0,  1).normalize().multiplyScalar(r)
    ]

    const vIds = baseVerts.map(pos => mesh.addVertex(pos).id)

    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ]

    const triUvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(0.5, 1)
    ]

    for (const f of faces) {
      mesh.addFace([vIds[f[0]], vIds[f[1]], vIds[f[2]]], triUvs, 0)
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class CircleBuilder implements IPrimitiveBuilder<CircleParameters> {
  create(params: CircleParameters): EditableMesh {
    const mesh = new EditableMesh()
    const r = Math.abs(params.radius) || 0.5
    const sides = Math.max(3, params.sides || 8)

    const vertIds: number[] = []
    const uvs: THREE.Vector2[] = []

    for (let i = 0; i < sides; i++) {
      const theta = (i / sides) * Math.PI * 2
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      vertIds.push(mesh.addVertex(new THREE.Vector3(x, 0, z)).id)
      uvs.push(new THREE.Vector2(0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta)))
    }

    if (params.filled !== false) {
      mesh.addFace(vertIds, uvs, 0)
    } else {
      // Wire circle: add perimeter edges
      for (let i = 0; i < sides; i++) {
        mesh.getOrCreateEdge(vertIds[i], vertIds[(i + 1) % sides])
      }
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class PrismBuilder extends CylinderBuilder {}

export class TorusBuilder implements IPrimitiveBuilder<TorusParameters> {
  create(params: TorusParameters): EditableMesh {
    const mesh = new EditableMesh()
    const R = Math.abs(params.majorRadius) || 1.0
    const r = Math.abs(params.tubeRadius) || 0.3
    const majorSegs = Math.max(4, params.majorSegments || 12)
    const tubeSegs = Math.max(3, params.tubeSegments || 6)

    const grid: number[][] = []

    for (let i = 0; i < majorSegs; i++) {
      const u = (i / majorSegs) * Math.PI * 2
      const ring: number[] = []
      for (let j = 0; j < tubeSegs; j++) {
        const v = (j / tubeSegs) * Math.PI * 2
        const x = (R + r * Math.cos(v)) * Math.cos(u)
        const y = r * Math.sin(v)
        const z = (R + r * Math.cos(v)) * Math.sin(u)
        ring.push(mesh.addVertex(new THREE.Vector3(x, y, z)).id)
      }
      grid.push(ring)
    }

    for (let i = 0; i < majorSegs; i++) {
      const nextI = (i + 1) % majorSegs
      for (let j = 0; j < tubeSegs; j++) {
        const nextJ = (j + 1) % tubeSegs
        const v0 = grid[i][j]
        const v1 = grid[nextI][j]
        const v2 = grid[nextI][nextJ]
        const v3 = grid[i][nextJ]

        const uvs = [
          new THREE.Vector2(i / majorSegs, j / tubeSegs),
          new THREE.Vector2((i + 1) / majorSegs, j / tubeSegs),
          new THREE.Vector2((i + 1) / majorSegs, (j + 1) / tubeSegs),
          new THREE.Vector2(i / majorSegs, (j + 1) / tubeSegs)
        ]
        mesh.addFace([v0, v1, v2, v3], uvs, 0)
      }
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class TubeBuilder implements IPrimitiveBuilder<TubeParameters> {
  create(params: TubeParameters): EditableMesh {
    const mesh = new EditableMesh()
    const rOut = Math.abs(params.outerRadius) || 0.5
    const rIn = Math.min(rOut * 0.9, Math.abs(params.innerRadius) || 0.3)
    const h = Math.abs(params.height) || 1.0
    const sides = Math.max(3, params.sides || 8)
    const hy = h / 2

    const topOut: number[] = []
    const botOut: number[] = []
    const topIn: number[] = []
    const botIn: number[] = []

    for (let i = 0; i < sides; i++) {
      const theta = (i / sides) * Math.PI * 2
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)

      topOut.push(mesh.addVertex(new THREE.Vector3(cos * rOut, hy, sin * rOut)).id)
      botOut.push(mesh.addVertex(new THREE.Vector3(cos * rOut, -hy, sin * rOut)).id)
      topIn.push(mesh.addVertex(new THREE.Vector3(cos * rIn, hy, sin * rIn)).id)
      botIn.push(mesh.addVertex(new THREE.Vector3(cos * rIn, -hy, sin * rIn)).id)
    }

    const uvs = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1, 0),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(0, 1)
    ]

    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides
      // Outer Quad Wall
      mesh.addFace([botOut[i], botOut[next], topOut[next], topOut[i]], uvs, 0)
      // Inner Quad Wall (reversed winding)
      mesh.addFace([topIn[i], topIn[next], botIn[next], botIn[i]], uvs, 0)
      // Top Quad Rim
      mesh.addFace([topOut[i], topOut[next], topIn[next], topIn[i]], uvs, 0)
      // Bottom Quad Rim
      mesh.addFace([botIn[i], botIn[next], botOut[next], botOut[i]], uvs, 0)
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class CapsuleBuilder implements IPrimitiveBuilder<CapsuleParameters> {
  create(params: CapsuleParameters): EditableMesh {
    const mesh = new EditableMesh()
    const r = Math.abs(params.radius) || 0.4
    const length = Math.abs(params.length) || 1.0
    const sides = Math.max(4, params.segments || 8)
    const hl = length / 2

    // Builds cylinder body + hemispherical caps
    const cyl = new CylinderBuilder().create({ radius: r, height: length, sides, capTop: false, capBottom: false })
    for (const [, v] of cyl.vertices) {
      mesh.addVertex(v.position)
    }
    for (const [, f] of cyl.faces) {
      mesh.addFace([...f.vertexIds], [...f.uvs], f.materialIndex)
    }

    const topCenter = mesh.addVertex(new THREE.Vector3(0, hl + r, 0)).id
    const botCenter = mesh.addVertex(new THREE.Vector3(0, -hl - r, 0)).id

    const topRing: number[] = []
    const botRing: number[] = []
    for (let i = 0; i < sides; i++) {
      topRing.push(i * 2)
      botRing.push(i * 2 + 1)
    }

    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides
      mesh.addFace([topCenter, topRing[i], topRing[next]], [
        new THREE.Vector2(0.5, 1),
        new THREE.Vector2(0, 0),
        new THREE.Vector2(1, 0)
      ], 0)
      mesh.addFace([botCenter, botRing[next], botRing[i]], [
        new THREE.Vector2(0.5, 0),
        new THREE.Vector2(1, 1),
        new THREE.Vector2(0, 1)
      ], 0)
    }

    mesh.recalculateNormals()
    return mesh
  }
}
