import { describe, expect, it } from 'vitest'
import { createCube } from '../geometry/Primitives'
import { exportToOBJ } from './ObjExport'
import { ObjImport } from '../import/ObjImport'

describe('OBJ I/O', () => {
  it('exports a cube that imports back with six faces', () => {
    const cube = createCube('Cube', 2)
    const obj = exportToOBJ([cube])
    expect(obj).toContain('o Cube')
    expect(obj).toContain('# polyecho_shade flat')
    expect(obj).toContain('s off')
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

  it('writes usemtl names and round-trips vertex colors', () => {
    const cube = createCube('Painted', 2)
    cube.materialId = 'mat_paint'
    cube.vertices[0].color = '#ff0000'
    const obj = exportToOBJ([cube], 'model.mtl', new Map([['mat_paint', 'PaintMat']]))
    expect(obj).toContain('usemtl PaintMat')
    expect(obj).toMatch(/^v .* 1\.0000 0\.0000 0\.0000$/m)

    const { meshes, materialNames } = ObjImport.parse(obj, 'Imported')
    expect(materialNames).toContain('PaintMat')
    expect(meshes[0].materialId).toBe('PaintMat')
    expect(meshes[0].vertices.some(v => v.color?.toLowerCase() === '#ff0000')).toBe(true)
  })

  it('round-trips Shade Smooth and Smooth by Angle', () => {
    const smooth = createCube('SmoothCube', 2)
    smooth.shadeMode = 'smooth'
    const smoothObj = exportToOBJ([smooth])
    expect(smoothObj).toContain('# polyecho_shade smooth')
    expect(smoothObj).toContain('s 1')
    expect(ObjImport.parse(smoothObj).meshes[0].shadeMode).toBe('smooth')

    const auto = createCube('AutoCube', 2)
    auto.shadeMode = 'auto'
    auto.autoSmoothAngle = 45
    const autoObj = exportToOBJ([auto])
    expect(autoObj).toContain('# polyecho_shade auto 45')
    const imported = ObjImport.parse(autoObj).meshes[0]
    expect(imported.shadeMode).toBe('auto')
    expect(imported.autoSmoothAngle).toBe(45)
  })
})
