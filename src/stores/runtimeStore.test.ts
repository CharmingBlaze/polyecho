import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRuntimeStore } from './runtimeStore'

describe('runtimeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('records and dismisses the last error', () => {
    const runtime = useRuntimeStore()
    runtime.reportError(new Error('mesh explode'), 'test')
    expect(runtime.lastError).toBe('mesh explode')
    expect(runtime.lastErrorSource).toBe('test')
    runtime.dismissError()
    expect(runtime.lastError).toBeNull()
  })
})
