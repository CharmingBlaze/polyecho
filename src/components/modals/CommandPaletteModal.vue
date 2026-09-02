<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import BlenderIcon from '../icons/BlenderIcon.vue'
import { Search, CornerDownLeft, Sparkles } from 'lucide-vue-next'
import { actionRegistry } from '../../core/commands/ActionRegistry'
import { useKeymapStore } from '../../stores/keymapStore'

const keymapStore = useKeymapStore()

const isOpen = ref(false)
const searchQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

interface CommandItem {
  id: string
  title: string
  category: string
  shortcut?: string
  icon?: any
  action: () => void
}

const allCommands = computed<CommandItem[]>(() => {
  return actionRegistry.getAll().map(cmd => {
    const remapped = keymapStore.getKeyFor(cmd.id)
    return {
      id: cmd.id,
      title: cmd.label,
      category: cmd.category,
      shortcut: remapped || cmd.shortcut,
      icon: cmd.icon,
      action: () => actionRegistry.execute(cmd.id)
    }
  })
})

const filteredCommands = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return allCommands.value
  return allCommands.value.filter(cmd => 
    cmd.title.toLowerCase().includes(query) || 
    cmd.category.toLowerCase().includes(query) ||
    (cmd.shortcut && cmd.shortcut.toLowerCase().includes(query))
  )
})

function openPalette() {
  isOpen.value = true
  searchQuery.value = ''
  selectedIndex.value = 0
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function closePalette() {
  isOpen.value = false
}

function executeSelected() {
  if (filteredCommands.value.length > 0) {
    const cmd = filteredCommands.value[selectedIndex.value] || filteredCommands.value[0]
    closePalette()
    cmd.action()
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isOpen.value) {
    if (e.code === 'Space' && (e.ctrlKey || e.shiftKey) && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      openPalette()
    }
    return
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    closePalette()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % filteredCommands.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    executeSelected()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('open-command-palette', openPalette)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('open-command-palette', openPalette)
})
</script>

<template>
  <!-- Blender F3 / Space Command Search Palette Modal -->
  <div 
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-24 select-none font-sans"
    @click.self="closePalette"
  >
    <div class="w-full max-w-xl bg-ui-panel border border-ui-borderStrong rounded-xs shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
      <!-- Search Input Bar -->
      <div class="flex items-center px-3 py-2.5 bg-ui-header border-b border-ui-borderSubtle gap-2">
        <Search class="w-4 h-4 text-amber-400 shrink-0" />
        <input 
          ref="inputRef"
          type="text"
          v-model="searchQuery"
          placeholder="Search operator, modifier, tool, primitive (e.g. Extrude, Mirror, X-Ray)..."
          class="flex-1 bg-transparent text-ui-textPrimary placeholder:text-ui-textMuted text-xs font-mono focus:outline-none"
        />
        <span class="text-[10px] text-ui-textMuted font-mono">ESC to cancel</span>
        <button @click="closePalette" class="text-ui-textMuted hover:text-white">&times;</button>
      </div>

      <!-- Command Results List -->
      <div class="max-h-80 overflow-y-auto divide-y divide-ui-borderSubtle/60 p-1 custom-scrollbar">
        <template v-if="filteredCommands.length > 0">
          <button 
            v-for="(cmd, idx) in filteredCommands"
            :key="cmd.id"
            @click="selectedIndex = idx; executeSelected()"
            @mouseenter="selectedIndex = idx"
            class="w-full text-left px-3 py-1.5 rounded-xs flex items-center justify-between transition text-xs font-mono"
            :class="selectedIndex === idx ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-xs' : 'text-ui-textSecondary hover:bg-ui-hover'"
          >
            <div class="flex items-center gap-2.5">
              <BlenderIcon v-if="cmd.icon" :name="cmd.icon" :size="14" :color="selectedIndex === idx ? '#f59e0b' : 'currentColor'" />
              <Sparkles v-else class="w-3.5 h-3.5 text-slate-500" />
              <div>
                <span class="font-medium text-ui-textPrimary">{{ cmd.title }}</span>
                <span class="ml-2 text-[10px] px-1 py-0.2 rounded-xs bg-ui-input border border-ui-borderSubtle text-ui-textMuted">{{ cmd.category }}</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <span v-if="cmd.shortcut" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ui-input border border-ui-borderSubtle text-amber-400 font-bold">
                {{ cmd.shortcut }}
              </span>
              <CornerDownLeft v-if="selectedIndex === idx" class="w-3 h-3 text-amber-400" />
            </div>
          </button>
        </template>

        <div v-else class="py-8 text-center text-xs text-ui-textMuted">
          No matching operators or tools found.
        </div>
      </div>
    </div>
  </div>
</template>
