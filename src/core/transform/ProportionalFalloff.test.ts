import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { connectedFalloffWeights } from './ProportionalFalloff'

function line(count: number, spacing: number) {
  const positions = new Map<number, THREE.Vector3>()
  const neighbors = new Map<number, number[]>()
  for (let i = 0; i < count; i++) {
    positions.set(i, new THREE.Vector3(i * spacing, 0, 0))
    const n: number[] = []
    if (i > 0) n.push(i - 1)
    if (i < count - 1) n.push(i + 1)
    neighbors.set(i, n)
  }
  return { positions, neighbors }
}

describe('connectedFalloffWeights', () => {
  it('keeps the source at full strength and fades along edges', () => {
    const { positions, neighbors } = line(5, 1)
    const weights = connectedFalloffWeights(positions, neighbors, [0], 4)
    expect(weights.get(0)).toBeCloseTo(1, 5)
    expect(weights.get(2)!).toBeGreaterThan(0)
    expect(weights.get(2)!).toBeLessThan(weights.get(1)!)
    expect(weights.has(4)).toBe(false)
  })

  it('does not jump across a gap that has no edge', () => {
    const positions = new Map<number, THREE.Vector3>([
      [0, new THREE.Vector3(0, 0, 0)],
      [1, new THREE.Vector3(0.1, 0, 0)]
    ])
    const neighbors = new Map<number, number[]>([[0, []], [1, []]])
    const weights = connectedFalloffWeights(positions, neighbors, [0], 10)
    expect(weights.has(0)).toBe(true)
    expect(weights.has(1)).toBe(false)
  })
})
