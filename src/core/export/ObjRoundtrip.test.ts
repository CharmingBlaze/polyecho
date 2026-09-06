import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { exportToOBJ } from './ObjExport'
import { ObjImport } from '../import/ObjImport'

describe('OBJ I/O', () => {
  it('exports a cube that imports back with six faces', () => {
    const cube = createCube('Cube', 2)
    const obj = exportToOBJ([cube])
    expect(obj).toContain('o Cube')
    expect(obj.match(/^vt /gm)?.length).toBeGreaterThan(0)
    expect(obj.match(/^f /gm)?.length).toBe(6)

    const { meshes } = ObjImport.parse(obj, 'Imported')
    expect(meshes.length).toBeGreaterThanOrEqual(1)
    expect(meshes[0].faces.length).toBe(6)
    expect(meshes[0].vertices.length).toBeGreaterThanOrEqual(8)
    for (const face of meshes[0].faces) {
      expect(face.vertexIds.length).toBeGreaterThanOrEqual(3)
      expect(face.uvs.length).toBe(face.vertexIds.length)
    }
  })
})
