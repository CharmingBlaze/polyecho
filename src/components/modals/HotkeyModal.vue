<script setup lang="ts">
import { X, Keyboard } from 'lucide-vue-next'

defineEmits<{
  (e: 'close'): void
}>()

const shortcuts = [
  { key: 'Tab', desc: 'Toggle between Object Mode and Edit Mode' },
  { key: '1', desc: 'Vertex Selection Mode' },
  { key: '2', desc: 'Edge Selection Mode' },
  { key: '3', desc: 'Face Selection Mode' },
  { key: 'G / W', desc: 'Move / Translate Tool' },
  { key: 'R', desc: 'Rotate Tool' },
  { key: 'S', desc: 'Scale Tool' },
  { key: 'E', desc: 'Extrude selected Face(s)' },
  { key: 'I', desc: 'Inset selected Face(s)' },
  { key: 'M', desc: 'Merge selected Vertices to center' },
  { key: 'Delete / X', desc: 'Delete selected Vertices / Faces' },
  { key: 'B', desc: 'Pixel Pencil / Brush Tool' },
  { key: 'Z', desc: 'Shading Pie Menu (Solid, Tex, Wire, PSX)' },
  { key: 'Alt + Z', desc: 'Toggle X-Ray Mode (Translucent Mesh)' },
  { key: 'Space', desc: 'Play / Pause Animation timeline' },
  { key: 'Ctrl + Z', desc: 'Undo last action' },
  { key: 'Ctrl + Y', desc: 'Redo last action' },
  { key: 'Ctrl + S', desc: 'Save project (.psxproj)' },
]
</script>

<template>
  <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 select-none">
    <div class="bg-dcc-850 border border-dcc-700 rounded-xl w-[480px] shadow-2xl overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="h-12 bg-dcc-900 border-b border-dcc-750 px-4 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <Keyboard class="w-4 h-4 text-indigo-400" />
          <span class="font-bold text-sm text-slate-200 font-mono">Keyboard Shortcuts</span>
        </div>
        <button @click="$emit('close')" class="p-1 rounded text-slate-400 hover:text-white hover:bg-dcc-750">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- List -->
      <div class="p-4 max-h-[420px] overflow-y-auto flex flex-col space-y-1 text-xs">
        <div 
          v-for="s in shortcuts" 
          :key="s.key"
          class="flex items-center justify-between py-1.5 px-2 rounded bg-dcc-900/60 border border-dcc-800"
        >
          <span class="text-slate-300">{{ s.desc }}</span>
          <kbd class="px-2 py-0.5 bg-dcc-800 border border-dcc-700 text-indigo-300 font-mono font-bold rounded shadow-sm">
            {{ s.key }}
          </kbd>
        </div>
      </div>
    </div>
  </div>
</template>
