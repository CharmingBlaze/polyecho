import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPlane } from '../geometry/Primitives'
import { useProjectStore } from '../../stores/projectStore'
import { loadOpenProject } from './projectIo'

let pinia: ReturnType<typeof createPinia>

describe('project loading lifecycle', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => disposePinia(pinia))

  it('does not reuse a resident kernel from the previous project', async () => {
    const project = useProjectStore()
    const previous = project.activeMesh!
    const previousResident = project.acquireEditableMesh(previous).mesh
    const replacement = createPlane('Replacement', 4)
    replacement.id = previous.id

    await loadOpenProject(JSON.stringify({
      version: '1.0',
      appName: 'PSXModeller',
      projectName: 'Loaded',
      meshes: [replacement],
    }))

    const loadedResident = project.acquireEditableMesh(project.activeMesh!).mesh
    expect(loadedResident).not.toBe(previousResident)
    expect(loadedResident.faces.size).toBe(1)
    expect(project.projectName).toBe('Loaded')
  })
})
