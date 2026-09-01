import { ref, computed } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import type { TextureApplyPolicy } from '../types/texture'

/**
 * Apply-to-object with a share prompt.
 * Select / create live on the project store — do not use this for those.
 */
export function useTextureApply() {
  const project = useProjectStore()
  const pendingTextureId = ref<string | null>(null)

  const isOpen = computed(() => pendingTextureId.value !== null)
  const sharedCount = computed(() => {
    const mesh = project.activeMesh
    if (!mesh) return 1
    return project.countMeshesUsingMaterial(mesh.materialId || 'default_material')
  })

  function applyToActiveMesh(textureId: string) {
    const mesh = project.activeMesh
    if (!mesh) {
      project.selectTexture(textureId)
      return
    }
    if (project.isMaterialShared(mesh.materialId || 'default_material')) {
      pendingTextureId.value = textureId
      return
    }
    project.applyTextureToMesh(mesh.id, textureId, 'this_object')
  }

  function confirm(policy: TextureApplyPolicy) {
    const id = pendingTextureId.value
    const mesh = project.activeMesh
    pendingTextureId.value = null
    if (!id || !mesh) return
    project.applyTextureToMesh(mesh.id, id, policy)
  }

  function cancel() {
    pendingTextureId.value = null
  }

  return { isOpen, pendingTextureId, sharedCount, applyToActiveMesh, confirm, cancel }
}
