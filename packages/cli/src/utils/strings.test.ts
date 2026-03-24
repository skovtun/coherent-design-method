import { describe, it, expect } from 'vitest'
import { toTitleCase } from './strings.js'

describe('toTitleCase', () => {
  it('converts kebab-case', () => {
    expect(toTitleCase('my-cool-app')).toBe('My Cool App')
  })
  it('converts snake_case', () => {
    expect(toTitleCase('test_projector')).toBe('Test Projector')
  })
  it('converts single word', () => {
    expect(toTitleCase('taskflow')).toBe('Taskflow')
  })
  it('converts camelCase', () => {
    expect(toTitleCase('myCoolApp')).toBe('My Cool App')
  })
  it('normalizes ALL_CAPS', () => {
    expect(toTitleCase('MY-APP')).toBe('My App')
  })
  it('strips @scope prefix', () => {
    expect(toTitleCase('@org/my-app')).toBe('My App')
  })
  it('returns fallback for empty string', () => {
    expect(toTitleCase('')).toBe('My App')
  })
  it('returns fallback for whitespace', () => {
    expect(toTitleCase('   ')).toBe('My App')
  })
})
