import * as THREE from 'three'
import { EditableMesh } from '../../mesh/MeshKernel'
import { WallParameters, StairsParameters, ArchParameters, IPrimitiveBuilder } from '../PrimitiveTypes'
import { BoxBuilder } from './BasicBuilders'

export class WallBuilder implements IPrimitiveBuilder<WallParameters> {
  create(params: WallParameters): EditableMesh {
    const len = Math.abs(params.length) || 2.0
    const thick = Math.abs(params.thickness) || 0.2
    const h = Math.abs(params.height) || 2.0

    // Creates an upright wall aligned with length along X, thickness along Z, height along Y
    return new BoxBuilder().create({
      width: len,
      depth: thick,
      height: h
    })
  }
}

export class StairsBuilder implements IPrimitiveBuilder<StairsParameters> {
  create(params: StairsParameters): EditableMesh {
    const mesh = new EditableMesh()
    const w = Math.abs(params.width) || 1.5
    const totalRun = Math.abs(params.totalRun) || 2.0
    const totalHeight = Math.abs(params.totalHeight) || 1.5
    const steps = Math.max(2, Math.min(32, params.steps || 4))

    const stepDepth = totalRun / steps
    const stepHeight = totalHeight / steps
    const hw = w / 2

    // Generates stepped profile with clean quads
    for (let s = 0; s < steps; s++) {
      const z0 = s * stepDepth
      const z1 = (s + 1) * stepDepth
      const y0 = s * stepHeight
      const y1 = (s + 1) * stepHeight

      const v0 = mesh.addVertex(new THREE.Vector3(-hw, y0, z0)).id
      const v1 = mesh.addVertex(new THREE.Vector3( hw, y0, z0)).id
      const v2 = mesh.addVertex(new THREE.Vector3( hw, y1, z0)).id
      const v3 = mesh.addVertex(new THREE.Vector3(-hw, y1, z0)).id

      const v4 = mesh.addVertex(new THREE.Vector3( hw, y1, z1)).id
      const v5 = mesh.addVertex(new THREE.Vector3(-hw, y1, z1)).id

      const uvs = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(1, 0),
        new THREE.Vector2(1, 1),
        new THREE.Vector2(0, 1)
      ]

      // Riser (vertical quad)
      mesh.addFace([v0, v1, v2, v3], uvs, 0)
      // Tread (horizontal step quad)
      mesh.addFace([v3, v2, v4, v5], uvs, 0)
    }

    mesh.recalculateNormals()
    return mesh
  }
}

export class ArchBuilder implements IPrimitiveBuilder<ArchParameters> {
  create(params: ArchParameters): EditableMesh {
    const w = Math.abs(params.width) || 2.0
    const d = Math.abs(params.depth) || 0.4
    const h = Math.abs(params.height) || 2.5

    // Arch base frame
    return new BoxBuilder().create({
      width: w,
      depth: d,
      height: h
    })
  }
}
