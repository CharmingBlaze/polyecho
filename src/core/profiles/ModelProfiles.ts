import type { MeshObject } from '../../types/mesh'

export interface ModelProfile {
  id: string
  name: string
  description: string
  icon: string
  maxVertices?: number
  maxFaces?: number
  maxTextureSize?: number
  maxBoneInfluences?: number
  requireQuadsOrTrisOnly?: boolean
  recommendedFPS?: number[]
}

export const MODEL_PROFILES: ModelProfile[] = [
  {
    id: 'psx_retro',
    name: 'PSX / Retro 3D',
    description: 'Authentic 90s console constraints: strict vertex budget, 256x256 max textures, rigid joint hierarchy.',
    icon: 'psx',
    maxVertices: 1500,
    maxFaces: 1200,
    maxTextureSize: 256,
    maxBoneInfluences: 1,
    requireQuadsOrTrisOnly: true,
    recommendedFPS: [15, 20, 30]
  },
  {
    id: 'godot4_glb',
    name: 'Godot 4 Low-Poly',
    description: 'Optimized for Godot 4 standard GLTF/GLB import with multi-clip skeletal animations.',
    icon: 'godot',
    maxVertices: 15000,
    maxFaces: 10000,
    maxTextureSize: 1024,
    maxBoneInfluences: 4,
    recommendedFPS: [24, 30, 60]
  },
  {
    id: 'unity_humanoid',
    name: 'Unity Humanoid',
    description: 'Targeted for Unity Mecanim Humanoid rigs with 4-weight vertex skinning.',
    icon: 'unity',
    maxVertices: 20000,
    maxFaces: 15000,
    maxTextureSize: 2048,
    maxBoneInfluences: 4,
    recommendedFPS: [30, 60]
  },
  {
    id: 'blockbench_lowpoly',
    name: 'Blockbench / Box Style',
    description: 'Quad-heavy box and pixel model format with discrete rigid limbs and 16px texel density.',
    icon: 'blockbench',
    maxVertices: 4000,
    maxFaces: 3000,
    maxTextureSize: 256,
    maxBoneInfluences: 1,
    requireQuadsOrTrisOnly: true,
    recommendedFPS: [12, 24]
  }
]

export interface ProfileValidationIssue {
  level: 'warning' | 'error' | 'info'
  message: string
}

export function validateMeshAgainstProfile(mesh: MeshObject | null | undefined, profile: ModelProfile, textureSize = 64): ProfileValidationIssue[] {
  if (!mesh) return []
  const issues: ProfileValidationIssue[] = []

  if (profile.maxVertices && mesh.vertices.length > profile.maxVertices) {
    issues.push({
      level: 'warning',
      message: `Vertex count (${mesh.vertices.length}) exceeds ${profile.name} budget (${profile.maxVertices}).`
    })
  }

  if (profile.maxFaces && mesh.faces.length > profile.maxFaces) {
    issues.push({
      level: 'warning',
      message: `Face count (${mesh.faces.length}) exceeds ${profile.name} budget (${profile.maxFaces}).`
    })
  }

  if (profile.maxTextureSize && textureSize > profile.maxTextureSize) {
    issues.push({
      level: 'warning',
      message: `Texture resolution (${textureSize}px) exceeds ${profile.name} target (${profile.maxTextureSize}px).`
    })
  }

  if (profile.requireQuadsOrTrisOnly) {
    const nGons = mesh.faces.filter(f => f.vertexIds.length > 4)
    if (nGons.length > 0) {
      issues.push({
        level: 'warning',
        message: `Found ${nGons.length} N-gons (> 4 vertices). Triangulate or divide into quads for ${profile.name}.`
      })
    }
  }

  return issues
}
