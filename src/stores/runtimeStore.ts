import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isDesktopApp, logDesktopCrash } from '../core/desktop/desktopApi'

export const useRuntimeStore = defineStore('runtime', () => {
  const lastError = ref<string | null>(null)
  const lastErrorSource = ref<string | null>(null)

  function reportError(err: unknown, source = 'app') {
    const message = err instanceof Error ? err.message : String(err)
    lastError.value = message
    lastErrorSource.value = source
    console.error('[PolyEcho]', source, err)
    if (isDesktopApp()) void logDesktopCrash(source, message, err)
  }

  function dismissError() {
    lastError.value = null
    lastErrorSource.value = null
  }

  return { lastError, lastErrorSource, reportError, dismissError }
})
