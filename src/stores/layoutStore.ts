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

  // Right Sidebar States
  const rightSidebarFloating = ref<boolean>(false)
  const rightSidebarMinimized = ref<boolean>(false)
  const rightSidebarWidth = ref<number>(320)
  const rightSidebarHeight = ref<number>(560)
  const rightSidebarPos = ref<{ x: number; y: number }>({ 
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 340) : 1000, 
    y: 46 
  })

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
    leftToolbarPos.value = { x: 16, y: 46 }

    rightSidebarFloating.value = false
    rightSidebarMinimized.value = false
    rightSidebarWidth.value = 320
    rightSidebarHeight.value = 560
    rightSidebarPos.value = { 
      x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 340) : 1000, 
      y: 46 
    }
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
    rightSidebarFloating,
    rightSidebarMinimized,
    rightSidebarWidth,
    rightSidebarHeight,
    rightSidebarPos,
    toggleLeftToolbar,
    toggleRightSidebar,
    toggleStatusBar,
    resetLayout,
  }
})
