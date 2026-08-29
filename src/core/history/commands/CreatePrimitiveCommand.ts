import { Command } from '../CommandManager'
import { PrimitiveType, PrimitiveParameters } from '../../primitives/PrimitiveTypes'
import { PrimitiveBuilder } from '../../primitives/PrimitiveBuilder'
import { MeshBridge } from '../../mesh/MeshBridge'
import { MeshObject, Vector3D } from '../../../types/mesh'

export interface PrimitiveTransform {
  position: Vector3D
  rotation: Vector3D
  scale: Vector3D
}

export class CreatePrimitiveCommand implements Command {
  readonly name: string
  readonly description: string
  private type: PrimitiveType
  private parameters: PrimitiveParameters
  private transform: PrimitiveTransform
  private meshesArray: MeshObject[]
  private createdMeshId: string

  constructor(
    type: PrimitiveType,
    parameters: PrimitiveParameters,
    transform: PrimitiveTransform,
    meshesArray: MeshObject[]
  ) {
    this.type = type
    this.parameters = parameters
    this.transform = transform
    this.meshesArray = meshesArray
    this.createdMeshId = `mesh_${type.toLowerCase()}_${Date.now()}`
    this.name = `Create ${type}`
    this.description = `Create ${type}`
  }

  execute(): boolean {
    const editableMesh = PrimitiveBuilder.create(this.type, this.parameters)
    const meshObj = MeshBridge.editableMeshToMeshObject(
      editableMesh,
      `${this.type.charAt(0) + this.type.slice(1).toLowerCase()}`,
      this.createdMeshId
    )

    meshObj.position = { ...this.transform.position }
    meshObj.rotation = { ...this.transform.rotation }
    meshObj.scale = { ...this.transform.scale }

    this.meshesArray.push(meshObj)
    return true
  }

  undo(): boolean {
    const idx = this.meshesArray.findIndex(m => m.id === this.createdMeshId)
    if (idx !== -1) {
      this.meshesArray.splice(idx, 1)
      return true
    }
    return false
  }

  redo(): boolean {
    return this.execute()
  }
}
