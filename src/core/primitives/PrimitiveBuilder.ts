import { PrimitiveType, PrimitiveParameters } from './PrimitiveTypes'
import { PrimitiveRegistry } from './PrimitiveRegistry'
import { EditableMesh } from '../mesh/MeshKernel'

export class PrimitiveBuilder {
  /**
   * Unified Primitive Factory. Creates a clean authoritative EditableMesh.
   */
  static create(type: PrimitiveType, parameters: PrimitiveParameters): EditableMesh {
    const def = PrimitiveRegistry.get(type)
    if (!def) {
      throw new Error(`Primitive type "${type}" is not registered in PrimitiveRegistry.`)
    }
    const mergedParams = { ...def.defaultParameters, ...parameters } as Record<string, any>
    for (const [key, value] of Object.entries(mergedParams)) {
      if (typeof value !== 'number') continue
      const fallback = Number((def.defaultParameters as any)[key]) || 1
      const finite = Number.isFinite(value) ? value : fallback
      if (key === 'subdivisions') mergedParams[key] = Math.max(0, Math.min(4, Math.round(finite)))
      else if (/segments|rings|sides|steps/i.test(key)) {
        const minimum = key === 'sides' || key === 'segments' || key === 'majorSegments' || key === 'tubeSegments' ? 3 : 1
        mergedParams[key] = Math.max(minimum, Math.min(64, Math.round(finite)))
      } else mergedParams[key] = Math.max(0.001, Math.min(10000, Math.abs(finite)))
    }
    if (type === 'TORUS') mergedParams.tubeRadius = Math.min(mergedParams.tubeRadius, mergedParams.majorRadius * 0.95)
    if (type === 'TUBE') mergedParams.innerRadius = Math.min(mergedParams.innerRadius, (mergedParams.outerRadius ?? mergedParams.radius) * 0.95)
    const mesh = def.builder.create(mergedParams)
    // Several legacy builders use the opposite winding. Normalize here so
    // placement, culling, extrusion, and export agree on the outside surface.
    let volume = 0
    for (const face of mesh.faces.values()) {
      const points = face.vertexIds.map(id => mesh.vertices.get(id)!.position)
      for (let i = 1; i < points.length - 1; i++) volume += points[0].dot(points[i].clone().cross(points[i + 1])) / 6
    }
    const flatDown = (type === 'PLANE' || type === 'CIRCLE') && [...mesh.faces.values()].some(f => f.normal.y < 0)
    if (volume < -1e-12 || flatDown) {
      const faces = [...mesh.faces.values()]
      for (const face of faces) mesh.removeFace(face.id)
      for (const face of faces) mesh.addFace([...face.vertexIds].reverse(), [...face.uvs].reverse(), face.materialIndex, face.color, face.id)
      mesh.recalculateNormals()
    }
    return mesh
  }
}
