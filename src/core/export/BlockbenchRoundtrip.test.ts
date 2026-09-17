import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { exportToBlockbench } from './BlockbenchExport'
import { importBlockbench } from '../import/BlockbenchImport'

describe('Blockbench I/O', () => {
  it('round-trips a cube as a Blockbench element with object TRS', () => {
    const cube = createCube('HeroCube', 2)
    cube.position = { x: 1, y: 2, z: 0 }
    cube.rotation = { x: 0, y: 15, z: 0 }
    const json = exportToBlockbench([cube], [], undefined, { projectName: 'Hero' })
    expect(json).toContain('"format_version"')
    expect(json).toContain('HeroCube')

    const { projectName, meshes } = importBlockbench(json)
    expect(projectName).toBe('Hero')
    expect(meshes.length).toBe(1)
    expect(meshes[0].name).toBe('HeroCube')
    expect(meshes[0].faces.length).toBe(6)
    expect(meshes[0].vertices.length).toBe(8)
    expect(meshes[0].position.x).toBeCloseTo(1, 4)
    expect(meshes[0].position.y).toBeCloseTo(2, 4)
    expect(meshes[0].rotation.y).toBeCloseTo(15, 4)
    const maxLocal = Math.max(...meshes[0].vertices.map(v => Math.abs(v.position.x)))
    expect(maxLocal).toBeLessThan(1.2)
  })
})
