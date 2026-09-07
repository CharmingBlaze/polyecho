<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAnimationStore } from '../../stores/animationStore'
import { GitCommitVertical, Plus, Trash2, Wrench } from 'lucide-vue-next'

defineOptions({ name: 'BoneTreeNode' })

const props = defineProps<{ boneId: string; depth?: number }>()
const animationStore = useAnimationStore()
const editing = ref(false)
const nameDraft = ref('')

const bone = computed(() => animationStore.armature.bones.find(item => item.id === props.boneId))
const children = computed(() => bone.value?.childrenIds
  .map(id => animationStore.armature.bones.find(item => item.id === id))
  .filter((item): item is NonNullable<typeof item> => Boolean(item)) || [])
const indent = computed(() => `${Math.min(7, props.depth || 0) * 14 + 6}px`)

function select() {
  if (!bone.value) return
  animationStore.selectedSocketId = null
  animationStore.selectBone(bone.value.id)
}
function startRename() {
  if (!bone.value) return
  nameDraft.value = bone.value.name
  editing.value = true
}
function commitRename() {
  if (bone.value && nameDraft.value.trim()) animationStore.renameBone(bone.value.id, nameDraft.value.trim())
  editing.value = false
}
function addChild() {
  if (bone.value) animationStore.addChildBone(bone.value.id, animationStore.generateSmartBoneName(bone.value.name))
}
function addSocket() {
  if (!bone.value) return
  const socket = animationStore.addSocket(bone.value.id, `Socket_${Date.now().toString(36).slice(-3)}`)
  if (socket) animationStore.selectSocket(socket.id)
}
function removeSocket(socketId: string) {
  if (bone.value) animationStore.removeSocket(bone.value.id, socketId)
}
</script>

<template>
  <template v-if="bone">
    <div
      class="flex items-center justify-between pr-1 py-1 rounded-xs cursor-pointer text-[11px] transition group"
      :style="{ paddingLeft: indent }"
      :class="animationStore.selectedBoneId === bone.id && !animationStore.selectedSocketId ? 'bg-ui-active text-ui-textAccent font-semibold border border-ui-accent/40 shadow-xs' : 'hover:bg-ui-hover text-ui-textSecondary'"
      @click="select"
    >
      <div class="flex items-center gap-1 min-w-0 flex-1">
        <span v-if="(depth || 0) > 0" class="text-ui-borderSubtle">└</span>
        <GitCommitVertical class="w-3 h-3 shrink-0" />
        <input v-if="editing" v-model="nameDraft" class="min-w-0 w-full bg-ui-input text-ui-textPrimary px-1 py-0.5 rounded-xs border border-ui-accent focus:outline-none" autofocus @click.stop @blur="commitRename" @keydown.enter="commitRename" />
        <span v-else class="truncate" @dblclick.stop="startRename">{{ bone.name }}</span>
      </div>
      <div class="flex items-center gap-0.5 opacity-50 group-hover:opacity-100">
        <button class="p-0.5 hover:text-sky-300" title="Add socket" @click.stop="addSocket"><Wrench class="w-3 h-3" /></button>
        <button class="p-0.5 hover:text-ui-textPrimary" title="Add child bone" @click.stop="addChild"><Plus class="w-3 h-3" /></button>
        <button class="p-0.5 hover:text-rose-400" title="Delete bone" @click.stop="animationStore.deleteBone(bone.id)"><Trash2 class="w-3 h-3" /></button>
      </div>
    </div>
    <div
      v-for="socket in bone.sockets || []"
      :key="socket.id"
      class="flex items-center justify-between pr-2 py-0.5 rounded-xs cursor-pointer text-[10px] text-sky-400 hover:bg-ui-hover"
      :style="{ paddingLeft: `${Math.min(7, depth || 0) * 14 + 25}px` }"
      @click.stop="animationStore.selectSocket(socket.id)"
    >
      <span class="truncate">[S] {{ socket.name }}</span>
      <button class="p-0.5 text-ui-textMuted hover:text-rose-400" title="Delete socket" @click.stop="removeSocket(socket.id)"><Trash2 class="w-2.5 h-2.5" /></button>
    </div>
    <BoneTreeNode v-for="child in children" :key="child.id" :bone-id="child.id" :depth="(depth || 0) + 1" />
  </template>
</template>
