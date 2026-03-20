import { describe, it, expect } from 'vitest'
import { parseNavTypeFromPlan } from './split-generator.js'

describe('parseNavTypeFromPlan', () => {
  it('extracts sidebar navType from plan response', () => {
    const planResult = {
      requests: [{ type: 'add-page', changes: { id: 'dashboard', name: 'Dashboard', route: '/dashboard' } }],
      navigation: { type: 'sidebar' },
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('sidebar')
  })

  it('extracts both navType', () => {
    const planResult = {
      requests: [],
      navigation: { type: 'both' },
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('both')
  })

  it('defaults to header when no navigation field', () => {
    const planResult = {
      requests: [{ type: 'add-page', changes: { id: 'home', name: 'Home', route: '/' } }],
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('header')
  })

  it('defaults to header for invalid navType', () => {
    const planResult = {
      requests: [],
      navigation: { type: 'invalid-type' },
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('header')
  })

  it('defaults to header when navigation is null', () => {
    const planResult = {
      requests: [],
      navigation: null,
    }
    expect(parseNavTypeFromPlan(planResult)).toBe('header')
  })
})
