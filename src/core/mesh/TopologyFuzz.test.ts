import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { getMeshEdges } from '../geometry/EdgeUtils'
import {
  cleanupMeshGeometry, extrudeFaces, insetFaces, pokeFaces, splitEdges,
  subdivideFaces, triangulateFaces,
} from '../geometry/Operations'
import { MeshBridge } from './MeshBridge'
import { MeshValidator } from './MeshValidator'

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('deterministic topology fuzz', () => {
  for (let seed = 1; seed <= 20; seed++) {
    it(`keeps every intermediate mesh valid (seed ${seed})`, () => {
      const next = random(seed)
      let mesh = createCube(`Fuzz_${seed}`, 2)
      const operations: string[] = []

      for (let step = 0; step < 8; step++) {
        const face = mesh.faces[Math.floor(next() * mesh.faces.length)]
        const edges = getMeshEdges(mesh)
        const edge = edges[Math.floor(next() * edges.length)]
        const choice = Math.floor(next() * 7)
        if (choice === 0 && face) {
          operations.push(`extrude:${face.id}`)
          mesh = extrudeFaces(mesh, [face.id], 0.05 + next() * 0.2).mesh
        } else if (choice === 1 && face) {
          operations.push(`inset:${face.id}`)
          mesh = insetFaces(mesh, [face.id], 0.03 + next() * 0.08).mesh
        } else if (choice === 2 && face) {
          operations.push(`poke:${face.id}`)
          mesh = pokeFaces(mesh, [face.id]).mesh
        } else if (choice === 3 && edge) {
          operations.push(`split:${edge.id}`)
          mesh = splitEdges(mesh, [edge.id], 0.2 + next() * 0.6).mesh
        } else if (choice === 4 && face) {
          operations.push(`subdivide:${face.id}`)
          mesh = subdivideFaces(mesh, [face.id], { cuts: 1, smoothness: 0 }).mesh
        } else if (choice === 5 && face) {
          operations.push(`triangulate:${face.id}`)
          mesh = triangulateFaces(mesh, [face.id]).mesh
        } else {
          operations.push('cleanup')
          mesh = cleanupMeshGeometry(mesh).mesh
        }

        const report = MeshValidator.validate(MeshBridge.meshObjectToEditableMesh(mesh).mesh)
        expect(
          report.valid,
          `seed=${seed} step=${step} ops=${operations.join(',')} report=${JSON.stringify(report)}`,
        ).toBe(true)
        expect(mesh.faces.every(item => item.vertexIds.length >= 3 && item.uvs.length === item.vertexIds.length)).toBe(true)
        expect(new Set(mesh.vertices.map(vertex => vertex.id)).size).toBe(mesh.vertices.length)
        expect(new Set(mesh.faces.map(item => item.id)).size).toBe(mesh.faces.length)
      }
    })
  }
})
