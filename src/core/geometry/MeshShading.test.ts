import { describe, expect, it } from 'vitest'
import { createCube } from './Primitives'
import { meshToThreeGeometry } from './Converters'
import {
  inferShadeModeFromGeometry,
  inferShadeModeFromTriangles,
  parseObjShadeComment,
  formatObjShadeComment,
  parseShadeExtras
} from './MeshShading'

describe('MeshShading', () => {
  it('parses and writes OBJ shade comments', () => {
    expect(parseObjShadeComment('# polyecho_shade smooth')).toEqual({ shadeMode: 'smooth', autoSmoothAngle: undefined })
    expect(parseObjShadeComment('# polyecho_shade auto 45')).toEqual({ shadeMode: 'auto', autoSmoothAngle: 45 })
    expect(formatObjShadeComment({ shadeMode: 'flat' })).toBe('# polyecho_shade flat')
    expect(formatObjShadeComment({ shadeMode: 'auto', autoSmoothAngle: 30 })).toBe('# polyecho_shade auto 30')
  })

  it('reads shade extras from glTF userData', () => {
    expect(parseShadeExtras({ shadeMode: 'smooth' })).toEqual({ shadeMode: 'smooth', autoSmoothAngle: undefined })
    expect(parseShadeExtras({ shadeMode: 'auto', autoSmoothAngle: 40 })).toEqual({ shadeMode: 'auto', autoSmoothAngle: 40 })
    expect(parseShadeExtras({ shadeMode: 'pbr' })).toBeNull()
  })

  it('infers flat when every corner uses the face normal', () => {
    const cube = createCube('FlatCube', 2)
    cube.shadeMode = 'flat'
    const { geometry } = meshToThreeGeometry(cube)
    expect(inferShadeModeFromGeometry(geometry)).toBe('flat')
    geometry.dispose()
  })

  it('infers smooth when a cube uses shared vertex normals', () => {
    const cube = createCube('SmoothCube', 2)
    cube.shadeMode = 'smooth'
    const { geometry } = meshToThreeGeometry(cube)
    expect(inferShadeModeFromGeometry(geometry)).toBe('smooth')
    geometry.dispose()
  })

  it('infers auto when a welded vertex has split normals', () => {
    expect(inferShadeModeFromTriangles([
      {
        positions: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
        normals: [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }]
      },
      {
        positions: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }],
        normals: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }]
      }
    ])).toBe('auto')
  })
})
