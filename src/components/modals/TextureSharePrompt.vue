<script setup lang="ts">
import type { TextureApplyPolicy } from '../../types/texture'

defineProps<{
  objectCount: number
}>()

const emit = defineEmits<{
  confirm: [policy: TextureApplyPolicy]
  cancel: []
}>()
</script>

<template>
  <div
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
    @click.self="emit('cancel')"
  >
    <div class="w-80 space-y-3 rounded-xs border border-ui-borderStrong bg-ui-panel p-3 shadow-2xl">
      <div class="text-xs font-bold uppercase text-amber-300">Shared material</div>
      <p class="text-[11px] leading-relaxed text-ui-textSecondary">
        This material is used by <span class="font-bold text-ui-textPrimary">{{ objectCount }}</span> objects.
        Apply the texture to this object only, or to every object on the material?
      </p>
      <div class="flex flex-col gap-1">
        <button
          type="button"
          class="rounded-xs bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
          @click="emit('confirm', 'this_object')"
        >
          This object only
        </button>
        <button
          type="button"
          class="rounded-xs border border-ui-borderDefault bg-ui-input px-2 py-1.5 text-xs font-bold text-ui-textPrimary hover:bg-ui-hover"
          @click="emit('confirm', 'shared_material')"
        >
          All objects on this material
        </button>
        <button
          type="button"
          class="px-2 py-1 text-[11px] text-ui-textMuted hover:text-white"
          @click="emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
