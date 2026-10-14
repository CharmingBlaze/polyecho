import { describe, expect, it } from 'vitest'
import { Vector2 } from 'three'
import { createPSXMaterial } from './PSXShader'

describe('createPSXMaterial', () => {
  it('gives each mesh its own uniforms while sharing shader source', () => {
    const a = createPSXMaterial(null, new Vector2(160, 120))
    const b = createPSXMaterial(null, new Vector2(320, 240))
    expect(a.vertexShader).toBe(b.vertexShader)
    expect(a.fragmentShader).toBe(b.fragmentShader)
    expect(a.uniforms.uResolution.value.x).toBe(160)
    expect(b.uniforms.uResolution.value.x).toBe(320)
    a.uniforms.uJitterAmount.value = 0
    expect(b.uniforms.uJitterAmount.value).toBe(1)
    a.dispose()
    b.dispose()
  })
})
