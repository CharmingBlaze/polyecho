import { describe, expect, it } from 'vitest'
import { createImagePlane, imageCardMaterialSettings } from './ImagePlane'

function bounds(mesh: ReturnType<typeof createImagePlane>) {
  const xs = mesh.vertices.map(vertex => vertex.position.x)
  const ys = mesh.vertices.map(vertex => vertex.position.y)
  const zs = mesh.vertices.map(vertex => vertex.position.z)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

describe('ImagePlane', () => {
  it('creates one upright quad with a bottom-center pivot and full UV coverage', () => {
    const mesh = createImagePlane({
      imageWidth: 400,
      imageHeight: 200,
      height: 3,
      materialId: 'image_material',
    })

    expect(mesh.vertices).toHaveLength(4)
    expect(mesh.faces).toHaveLength(1)
    expect(mesh.materialId).toBe('image_material')
    expect(bounds(mesh)).toEqual({
      minX: -3,
      maxX: 3,
      minY: 0,
      maxY: 3,
      minZ: 0,
      maxZ: 0,
    })
    expect(mesh.faces[0].uvs).toEqual([
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 1, v: 1 },
      { u: 0, v: 1 },
    ])
  })

  it('uses one face rather than duplicate coplanar front and back faces', () => {
    const mesh = createImagePlane({ imageWidth: 64, imageHeight: 64 })
    expect(mesh.faces).toHaveLength(1)
    expect(new Set(mesh.faces[0].vertexIds).size).toBe(4)
  })

  it('creates two perpendicular quads in one crossed-vegetation mesh', () => {
    const mesh = createImagePlane({
      imageWidth: 100,
      imageHeight: 200,
      height: 4,
      crossed: true,
    })

    expect(mesh.vertices).toHaveLength(8)
    expect(mesh.faces).toHaveLength(2)
    expect(bounds(mesh)).toEqual({
      minX: -1,
      maxX: 1,
      minY: 0,
      maxY: 4,
      minZ: -1,
      maxZ: 1,
    })
    expect(mesh.faces[0].vertexIds.some(id => mesh.faces[1].vertexIds.includes(id))).toBe(false)
    expect(mesh.faces.every(face => face.uvs.length === face.vertexIds.length)).toBe(true)
  })

  it('preserves transforms and safely handles invalid dimensions', () => {
    const mesh = createImagePlane({
      imageWidth: 0,
      imageHeight: Number.NaN,
      height: -2,
      transform: {
        position: { x: 2, y: 3, z: 4 },
        rotation: { x: 0, y: 45, z: 0 },
      },
    })

    expect(bounds(mesh).maxX - bounds(mesh).minX).toBe(2)
    expect(bounds(mesh).maxY - bounds(mesh).minY).toBe(2)
    expect(mesh.position).toEqual({ x: 2, y: 3, z: 4 })
    expect(mesh.rotation).toEqual({ x: 0, y: 45, z: 0 })
  })

  it('provides cutout foliage and translucent reference material presets', () => {
    expect(imageCardMaterialSettings('vegetation')).toMatchObject({
      fill: 'image',
      shading: 'unlit',
      blendMode: 'mask',
      alphaTest: 0.05,
      doubleSided: true,
      opacity: 1,
    })
    expect(imageCardMaterialSettings('reference')).toMatchObject({
      fill: 'image',
      shading: 'unlit',
      blendMode: 'blend',
      alphaTest: 0,
      doubleSided: true,
      opacity: 0.65,
    })
  })
})
