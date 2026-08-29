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
    const mergedParams = { ...def.defaultParameters, ...parameters }
    return def.builder.create(mergedParams)
  }
}
