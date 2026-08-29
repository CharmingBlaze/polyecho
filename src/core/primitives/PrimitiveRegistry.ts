import {
  PrimitiveType,
  PrimitiveCreationKind,
  PrimitiveParameters,
  IPrimitiveBuilder
} from './PrimitiveTypes'
import { BoxBuilder, PlaneBuilder, PyramidBuilder, WedgeBuilder } from './builders/BasicBuilders'
import {
  CylinderBuilder,
  ConeBuilder,
  SphereBuilder,
  IcosphereBuilder,
  CircleBuilder,
  PrismBuilder,
  TorusBuilder,
  TubeBuilder,
  CapsuleBuilder
} from './builders/RadialBuilders'
import { WallBuilder, StairsBuilder, ArchBuilder } from './builders/BuildBuilders'

export interface PrimitiveDefinition {
  type: PrimitiveType
  label: string
  category: 'BASIC' | 'SHAPES' | 'BUILD'
  creationKind: PrimitiveCreationKind
  defaultParameters: PrimitiveParameters
  builder: IPrimitiveBuilder
}

export class PrimitiveRegistry {
  private static registry = new Map<PrimitiveType, PrimitiveDefinition>()

  static {
    // ----------------------------------------------------
    // BASIC PRIMITIVES
    // ----------------------------------------------------
    this.register({
      type: 'BOX',
      label: 'Box',
      category: 'BASIC',
      creationKind: 'RECTANGULAR',
      defaultParameters: { width: 1, depth: 1, height: 1 },
      builder: new BoxBuilder()
    })

    this.register({
      type: 'PLANE',
      label: 'Plane',
      category: 'BASIC',
      creationKind: 'RECTANGULAR',
      defaultParameters: { width: 2, depth: 2 },
      builder: new PlaneBuilder()
    })

    this.register({
      type: 'SPHERE',
      label: 'Sphere',
      category: 'BASIC',
      creationKind: 'RADIAL',
      defaultParameters: { radius: 0.5, segments: 8, rings: 6 },
      builder: new SphereBuilder()
    })

    this.register({
      type: 'ICOSPHERE',
      label: 'Icosphere',
      category: 'BASIC',
      creationKind: 'RADIAL',
      defaultParameters: { radius: 0.5, subdivisions: 1 },
      builder: new IcosphereBuilder()
    })

    this.register({
      type: 'CYLINDER',
      label: 'Cylinder',
      category: 'BASIC',
      creationKind: 'RADIAL_HEIGHT',
      defaultParameters: { radius: 0.5, height: 1.0, sides: 8, capTop: true, capBottom: true },
      builder: new CylinderBuilder()
    })

    this.register({
      type: 'CONE',
      label: 'Cone',
      category: 'BASIC',
      creationKind: 'RADIAL_HEIGHT',
      defaultParameters: { radius: 0.5, height: 1.0, sides: 8, capBottom: true },
      builder: new ConeBuilder()
    })

    this.register({
      type: 'PYRAMID',
      label: 'Pyramid',
      category: 'BASIC',
      creationKind: 'RECTANGULAR',
      defaultParameters: { width: 1, depth: 1, height: 1 },
      builder: new PyramidBuilder()
    })

    // ----------------------------------------------------
    // SHAPES PRIMITIVES
    // ----------------------------------------------------
    this.register({
      type: 'CIRCLE',
      label: 'Circle / Disc',
      category: 'SHAPES',
      creationKind: 'RADIAL',
      defaultParameters: { radius: 0.5, sides: 8, filled: true },
      builder: new CircleBuilder()
    })

    this.register({
      type: 'PRISM',
      label: 'Prism',
      category: 'SHAPES',
      creationKind: 'RADIAL_HEIGHT',
      defaultParameters: { radius: 0.5, height: 1.0, sides: 3 },
      builder: new PrismBuilder()
    })

    this.register({
      type: 'TORUS',
      label: 'Torus',
      category: 'SHAPES',
      creationKind: 'TORUS',
      defaultParameters: { majorRadius: 0.8, tubeRadius: 0.25, majorSegments: 12, tubeSegments: 6 },
      builder: new TorusBuilder()
    })

    this.register({
      type: 'CAPSULE',
      label: 'Capsule',
      category: 'SHAPES',
      creationKind: 'RADIAL_HEIGHT',
      defaultParameters: { radius: 0.4, length: 1.0, segments: 8 },
      builder: new CapsuleBuilder()
    })

    this.register({
      type: 'WEDGE',
      label: 'Wedge / Ramp',
      category: 'SHAPES',
      creationKind: 'RECTANGULAR',
      defaultParameters: { width: 1, depth: 1, height: 1 },
      builder: new WedgeBuilder()
    })

    this.register({
      type: 'TUBE',
      label: 'Tube / Pipe',
      category: 'SHAPES',
      creationKind: 'RADIAL_HEIGHT',
      defaultParameters: { outerRadius: 0.5, innerRadius: 0.35, height: 1.0, sides: 8 },
      builder: new TubeBuilder()
    })

    // ----------------------------------------------------
    // BUILD PRIMITIVES
    // ----------------------------------------------------
    this.register({
      type: 'WALL',
      label: 'Wall',
      category: 'BUILD',
      creationKind: 'LINEAR_HEIGHT',
      defaultParameters: { length: 2.0, thickness: 0.2, height: 2.0 },
      builder: new WallBuilder()
    })

    this.register({
      type: 'STAIRS',
      label: 'Stairs',
      category: 'BUILD',
      creationKind: 'LINEAR_HEIGHT',
      defaultParameters: { width: 1.5, totalRun: 2.0, totalHeight: 1.5, steps: 4 },
      builder: new StairsBuilder()
    })

    this.register({
      type: 'ARCH',
      label: 'Arch',
      category: 'BUILD',
      creationKind: 'RECTANGULAR',
      defaultParameters: { width: 2.0, depth: 0.4, height: 2.5, openingWidth: 1.2, openingHeight: 1.8 },
      builder: new ArchBuilder()
    })
  }

  static register(def: PrimitiveDefinition) {
    this.registry.set(def.type, def)
  }

  static get(type: PrimitiveType): PrimitiveDefinition | undefined {
    return this.registry.get(type)
  }

  static getAll(): PrimitiveDefinition[] {
    return Array.from(this.registry.values())
  }

  static getByCategory(category: 'BASIC' | 'SHAPES' | 'BUILD'): PrimitiveDefinition[] {
    return this.getAll().filter(d => d.category === category)
  }
}
