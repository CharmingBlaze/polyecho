import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayoutStore = defineStore('layout', () => {
  // Panel Visibility
  const showLeftToolbar = ref<boolean>(true)
  const showRightSidebar = ref<boolean>(true)
  const showStatusBar = ref<boolean>(true)
  const showPrimitivePanel = ref(false)

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

  type InspectorTab = 'outliner' | 'props' | 'tools' | 'modifiers' | 'material' | 'texture' | 'refs' | 'bindings' | 'weights' | 'skeleton'

  const inspectorTabsByMode: Record<string, InspectorTab[]> = {
    model: ['outliner', 'tools', 'props', 'modifiers', 'material', 'texture'],
    blockout: ['outliner', 'tools', 'props', 'refs', 'modifiers'],
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

  type BlockoutPane = 'front' | 'side' | 'persp'

  const blockoutFrontFrac = ref(1 / 3)
  const blockoutSideFrac = ref(1 / 3)
  const blockoutFrontCollapsed = ref(false)
  const blockoutSideCollapsed = ref(false)
  const blockoutPerspCollapsed = ref(false)
  const blockoutMaximized = ref<'none' | BlockoutPane>('none')

  const BLOCKOUT_COLLAPSED_FRAC = 0.045
  const BLOCKOUT_VISIBLE_MIN_FRAC = 0.14

  function perspFrac() {
    return 1 - blockoutFrontFrac.value - blockoutSideFrac.value
  }

  function applyFrontSide(front: number, side: number) {
    blockoutFrontFrac.value = front
    blockoutSideFrac.value = side
  }

  function resetBlockoutSplits() {
    applyFrontSide(1 / 3, 1 / 3)
    blockoutFrontCollapsed.value = false
    blockoutSideCollapsed.value = false
    blockoutPerspCollapsed.value = false
    blockoutMaximized.value = 'none'
  }

  function restoreBlockoutPane(pane: BlockoutPane) {
    if (pane === 'front') {
      blockoutFrontCollapsed.value = false
      const keepPersp = blockoutPerspCollapsed.value ? BLOCKOUT_COLLAPSED_FRAC : BLOCKOUT_VISIBLE_MIN_FRAC
      const maxThis = 1 - blockoutSideFrac.value - keepPersp
      applyFrontSide(Math.min(1 / 3, Math.max(BLOCKOUT_VISIBLE_MIN_FRAC, maxThis)), blockoutSideFrac.value)
      return
    }
    if (pane === 'side') {
      blockoutSideCollapsed.value = false
      const keepPersp = blockoutPerspCollapsed.value ? BLOCKOUT_COLLAPSED_FRAC : BLOCKOUT_VISIBLE_MIN_FRAC
      const maxThis = 1 - blockoutFrontFrac.value - keepPersp
      applyFrontSide(blockoutFrontFrac.value, Math.min(1 / 3, Math.max(BLOCKOUT_VISIBLE_MIN_FRAC, maxThis)))
      return
    }
    blockoutPerspCollapsed.value = false
    const others = 1 - 1 / 3
    const front = blockoutFrontFrac.value
    const side = blockoutSideFrac.value
    const sum = front + side
    if (sum < 1e-6) applyFrontSide(others / 2, others / 2)
    else applyFrontSide((front / sum) * others, (side / sum) * others)
  }

  function minimizeBlockoutPane(pane: BlockoutPane) {
    if (blockoutMaximized.value !== 'none') {
      resetBlockoutSplits()
    }

    const already =
      (pane === 'front' && blockoutFrontCollapsed.value)
      || (pane === 'side' && blockoutSideCollapsed.value)
      || (pane === 'persp' && blockoutPerspCollapsed.value)
    if (already) {
      restoreBlockoutPane(pane)
      return
    }

    const othersCollapsed = (['front', 'side', 'persp'] as const)
      .filter((p) => p !== pane)
      .every((p) => (
        p === 'front' ? blockoutFrontCollapsed.value
        : p === 'side' ? blockoutSideCollapsed.value
        : blockoutPerspCollapsed.value
      ))
    if (othersCollapsed) return

    if (blockoutMaximized.value === pane) blockoutMaximized.value = 'none'

    if (pane === 'front') {
      blockoutFrontCollapsed.value = true
      applyFrontSide(BLOCKOUT_COLLAPSED_FRAC, blockoutSideFrac.value)
      return
    }
    if (pane === 'side') {
      blockoutSideCollapsed.value = true
      applyFrontSide(blockoutFrontFrac.value, BLOCKOUT_COLLAPSED_FRAC)
      return
    }
    blockoutPerspCollapsed.value = true
    const need = 1 - BLOCKOUT_COLLAPSED_FRAC
    const front = Math.max(BLOCKOUT_COLLAPSED_FRAC, blockoutFrontFrac.value)
    const side = Math.max(BLOCKOUT_COLLAPSED_FRAC, blockoutSideFrac.value)
    const sum = front + side
    applyFrontSide((front / sum) * need, (side / sum) * need)
  }

  function maximizeBlockoutPane(pane: BlockoutPane) {
    if (blockoutMaximized.value === pane) {
      resetBlockoutSplits()
      return
    }
    blockoutMaximized.value = pane
    blockoutFrontCollapsed.value = false
    blockoutSideCollapsed.value = false
    blockoutPerspCollapsed.value = false
    if (pane === 'front') applyFrontSide(1, 0)
    else if (pane === 'side') applyFrontSide(0, 1)
    else applyFrontSide(0, 0)
  }

  function noteBlockoutSplitDrag() {
    blockoutMaximized.value = 'none'
    blockoutFrontCollapsed.value = blockoutFrontFrac.value <= BLOCKOUT_COLLAPSED_FRAC + 0.012
    blockoutSideCollapsed.value = blockoutSideFrac.value <= BLOCKOUT_COLLAPSED_FRAC + 0.012
    blockoutPerspCollapsed.value = perspFrac() <= BLOCKOUT_COLLAPSED_FRAC + 0.012
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
    showPrimitivePanel,
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
    blockoutFrontCollapsed,
    blockoutSideCollapsed,
    blockoutPerspCollapsed,
    blockoutMaximized,
    resetBlockoutSplits,
    minimizeBlockoutPane,
    maximizeBlockoutPane,
    restoreBlockoutPane,
    noteBlockoutSplitDrag,
    visibleInspectorTabs,
    setInspectorTab,
    restoreInspectorTab,
    toggleLeftToolbar,
    toggleRightSidebar,
    toggleStatusBar,
    resetLayout,
  }
})
