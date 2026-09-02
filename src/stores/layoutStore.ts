import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayoutStore = defineStore('layout', () => {
  // Panel Visibility
  const showLeftToolbar = ref<boolean>(true)
  const showRightSidebar = ref<boolean>(true)
  const showStatusBar = ref<boolean>(true)

  // Left Toolbar States (Floating by default)
  const leftToolbarFloating = ref<boolean>(true)
  const leftToolbarMinimized = ref<boolean>(false)
  const leftToolbarColumns = ref<1 | 2>(2)
  const leftToolbarWidth = ref<number>(74)
  const leftToolbarHeight = ref<number>(500)
  const leftToolbarPos = ref<{ x: number; y: number }>({ x: 16, y: 46 })
  const leftToolbarHasMoved = ref(false)

  // Right Sidebar States
  const rightSidebarFloating = ref<boolean>(false)
  const rightSidebarMinimized = ref<boolean>(false)
  const rightSidebarWidth = ref<number>(320)
  const rightSidebarHeight = ref<number>(560)
  const rightSidebarPos = ref<{ x: number; y: number }>({ 
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 340) : 1000, 
    y: 46 
  })

  type InspectorTab = 'outliner' | 'props' | 'modifiers' | 'material' | 'texture' | 'refs' | 'bindings' | 'weights' | 'skeleton'

  const inspectorTabsByMode: Record<string, InspectorTab[]> = {
    model: ['outliner', 'props', 'modifiers', 'material', 'texture'],
    blockout: ['outliner', 'props', 'refs', 'modifiers'],
    uvpaint: ['outliner', 'props', 'texture', 'material', 'modifiers'],
    animate: ['outliner', 'props', 'modifiers', 'material', 'texture'],
    rig: ['skeleton', 'props', 'bindings', 'weights']
  }

  const inspectorTab = ref<InspectorTab>('outliner')
  const lastInspectorTabByMode = ref<Record<string, InspectorTab>>({
    model: 'outliner',
    blockout: 'refs',
    uvpaint: 'texture',
    animate: 'props',
    rig: 'skeleton'
  })

  const blockoutFrontFrac = ref(1 / 3)
  const blockoutSideFrac = ref(1 / 3)

  function resetBlockoutSplits() {
    blockoutFrontFrac.value = 1 / 3
    blockoutSideFrac.value = 1 / 3
  }

  function visibleInspectorTabs(mode: string): InspectorTab[] {
    return inspectorTabsByMode[mode] || inspectorTabsByMode.model
  }

  function setInspectorTab(tab: InspectorTab, mode?: string) {
    inspectorTab.value = tab
    const key = mode || 'model'
    lastInspectorTabByMode.value = { ...lastInspectorTabByMode.value, [key]: tab }
  }

  function restoreInspectorTab(mode: string) {
    const defaults: Record<string, InspectorTab> = {
      model: 'outliner',
      blockout: 'refs',
      uvpaint: 'texture',
      animate: 'props',
      rig: 'skeleton'
    }
    const visible = visibleInspectorTabs(mode)
    const remembered = lastInspectorTabByMode.value[mode] || defaults[mode] || 'outliner'
    inspectorTab.value = visible.includes(remembered) ? remembered : (visible[0] || 'outliner')
  }

  function toggleLeftToolbar() {
    showLeftToolbar.value = !showLeftToolbar.value
  }

  function toggleRightSidebar() {
    showRightSidebar.value = !showRightSidebar.value
  }

  function toggleStatusBar() {
    showStatusBar.value = !showStatusBar.value
  }

  function resetLayout() {
    showLeftToolbar.value = true
    showRightSidebar.value = true
    showStatusBar.value = true

    leftToolbarFloating.value = true
    leftToolbarMinimized.value = false
    leftToolbarColumns.value = 2
    leftToolbarWidth.value = 74
    leftToolbarHeight.value = 500
    leftToolbarPos.value = { x: 16, y: typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 400 }
    leftToolbarHasMoved.value = false

    rightSidebarFloating.value = false
    rightSidebarMinimized.value = false
    rightSidebarWidth.value = 320
    rightSidebarHeight.value = 560
    rightSidebarPos.value = { 
      x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 340) : 1000, 
      y: 46 
    }
    resetBlockoutSplits()
  }

  return {
    showLeftToolbar,
    showRightSidebar,
    showStatusBar,
    leftToolbarFloating,
    leftToolbarMinimized,
    leftToolbarColumns,
    leftToolbarWidth,
    leftToolbarHeight,
    leftToolbarPos,
    leftToolbarHasMoved,
    rightSidebarFloating,
    rightSidebarMinimized,
    rightSidebarWidth,
    rightSidebarHeight,
    rightSidebarPos,
    inspectorTab,
    lastInspectorTabByMode,
    blockoutFrontFrac,
    blockoutSideFrac,
    resetBlockoutSplits,
    visibleInspectorTabs,
    setInspectorTab,
    restoreInspectorTab,
    toggleLeftToolbar,
    toggleRightSidebar,
    toggleStatusBar,
    resetLayout,
  }
})
