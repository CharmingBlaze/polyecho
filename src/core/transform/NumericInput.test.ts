import { describe, expect, it } from 'vitest'
import { NumericInput } from './NumericInput'

describe('NumericInput', () => {
  it('parses typed digits, decimal, and sign', () => {
    const n = new NumericInput()
    expect(n.getValue()).toBeNull()
    n.handleKey('2')
    n.handleKey('.')
    n.handleKey('5')
    expect(n.getValue()).toBe(2.5)
    n.handleKey('-')
    expect(n.getValue()).toBe(-2.5)
    n.handleKey('Backspace')
    n.handleKey('Backspace')
    n.handleKey('Backspace')
    n.handleKey('Backspace')
    expect(n.getValue()).toBeNull()
  })
})
