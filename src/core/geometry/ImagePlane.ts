import type { Face, MeshObject, PrimitiveTransform, Vertex } from '../../types/mesh'
import type { Material } from '../../types/texture'

export type ImageCardKind = 'card' | 'vegetation' | 'reference'
export type ImageDropChoice = 'apply' | ImageCardKind

export interface ImagePlaneOptions {
  name?: string
  imageWidth: number
  imageHeight: number
  height?: number
  crossed?: boolean
  materialId?: string
  transform?: Partial<PrimitiveTransform>
}

export type ImageCardMaterialSettings = Pick<
  Material,
  'fill' | 'shading' | 'blendMode' | 'alphaTest' | 'doubleSided' | 'opacity'
>

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function quadVertices(
  width: number,
  height: number,
  axis: 'xy' | 'zy'
): Vertex[] {
  const halfWidth = width / 2
  const points = axis === 'xy'
    ? [
        { x: -halfWidth, y: 0, z: 0 },
        { x: halfWidth, y: 0, z: 0 },
        { x: halfWidth, y: height, z: 0 },
        { x: -halfWidth, y: height, z: 0 },
      ]
    : [
        { x: 0, y: 0, z: halfWidth },
        { x: 0, y: 0, z: -halfWidth },
        { x: 0, y: height, z: -halfWidth },
        { x: 0, y: height, z: halfWidth },
      ]

  return points.map(position => ({
    id: id('v'),
    position,
    color: '#ffffff',
  }))
}

function quadFace(vertices: Vertex[]): Face {
  return {
    id: id('f'),
    vertexIds: vertices.map(vertex => vertex.id),
    uvs: [
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 1, v: 1 },
      { u: 0, v: 1 },
    ],
    materialIndex: 0,
  }
}

/**
 * Builds an upright image card with its origin at the bottom center.
 * Double-sided rendering belongs to the material; duplicating the face would
 * create coplanar geometry and z-fighting.
 */
export function createImagePlane(options: ImagePlaneOptions): MeshObject {
  const imageWidth = finitePositive(options.imageWidth, 1)
  const imageHeight = finitePositive(options.imageHeight, 1)
  const height = finitePositive(options.height ?? 2, 2)
  const width = height * (imageWidth / imageHeight)
  const first = quadVertices(width, height, 'xy')
  const second = options.crossed ? quadVertices(width, height, 'zy') : []
  const vertices = [...first, ...second]
  const transform = options.transform

  return {
    id: id('mesh_image'),
    name: options.name || (options.crossed ? 'Crossed Vegetation' : 'Image Card'),
    visible: true,
    locked: false,
    materialId: options.materialId || 'default_material',
    position: {
      x: transform?.position?.x ?? 0,
      y: transform?.position?.y ?? 0,
      z: transform?.position?.z ?? 0,
    },
    rotation: {
      x: transform?.rotation?.x ?? 0,
      y: transform?.rotation?.y ?? 0,
      z: transform?.rotation?.z ?? 0,
    },
    scale: {
      x: transform?.scale?.x ?? 1,
      y: transform?.scale?.y ?? 1,
      z: transform?.scale?.z ?? 1,
    },
    shadeMode: 'flat',
    vertices,
    faces: [
      quadFace(first),
      ...(second.length ? [quadFace(second)] : []),
    ],
  }
}

export function imageCardMaterialSettings(kind: ImageCardKind): ImageCardMaterialSettings {
  if (kind === 'reference') {
    return {
      fill: 'image',
      shading: 'unlit',
      blendMode: 'blend',
      alphaTest: 0,
      doubleSided: true,
      opacity: 0.65,
    }
  }

  return {
    fill: 'image',
    shading: 'unlit',
    blendMode: 'mask',
    alphaTest: 0.05,
    doubleSided: true,
    opacity: 1,
  }
}
