<script setup lang="ts">
import { computed } from 'vue'
import { X, Keyboard } from 'lucide-vue-next'
import { useKeymapStore, type KeyBinding } from '../../stores/keymapStore'

defineEmits<{
  (e: 'close'): void
}>()

const keymapStore = useKeymapStore()

const categories = computed(() => {
  const groups = new Map<KeyBinding['category'], KeyBinding[]>()
  for (const b of keymapStore.bindings) {
    const list = groups.get(b.category) || []
    list.push(b)
    groups.set(b.category, list)
  }
  return [...groups.entries()]
})
</script>

<template>
  <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 select-none">
    <div class="bg-dcc-850 border border-dcc-700 rounded-xl w-[520px] shadow-2xl overflow-hidden flex flex-col">
      <div class="h-12 bg-dcc-900 border-b border-dcc-750 px-4 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <Keyboard class="w-4 h-4 text-indigo-400" />
          <span class="font-bold text-sm text-slate-200 font-mono">Keyboard Shortcuts</span>
        </div>
        <button @click="$emit('close')" class="p-1 rounded text-slate-400 hover:text-white hover:bg-dcc-750">
          <X class="w-4 h-4" />
        </button>
      </div>

      <p class="px-4 pt-3 text-[11px] text-slate-400">
        These are the live bindings. Rebind in Preferences → Keyboard.
      </p>

      <div class="p-4 max-h-[420px] overflow-y-auto flex flex-col space-y-3 text-xs">
        <div v-for="[cat, items] in categories" :key="cat">
          <div class="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">{{ cat }}</div>
          <div
            v-for="s in items"
            :key="s.id"
            class="flex items-center justify-between py-1.5 px-2 rounded bg-dcc-900/60 border border-dcc-800 mb-1"
          >
            <span class="text-slate-300">{{ s.label }}</span>
            <kbd class="px-2 py-0.5 bg-dcc-800 border border-dcc-700 text-indigo-300 font-mono font-bold rounded shadow-sm">
              {{ s.currentKey }}
            </kbd>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
