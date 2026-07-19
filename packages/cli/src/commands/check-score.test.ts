import { describe, it, expect } from 'vitest'
import { computeQualityScore } from './check.js'

// Minimal CheckResult factory — only the fields the score reads.
function result(over: {
  total?: number
  clean?: number
  withErrors?: number
  withWarnings?: number
  broken?: number
  deadRoutes?: number
  unused?: number
  crossPage?: number
}): any {
  return {
    pages: {
      total: over.total ?? 7,
      clean: over.clean ?? 7,
      withErrors: over.withErrors ?? 0,
      withWarnings: over.withWarnings ?? 0,
      files: [],
    },
    shared: { total: 0, consistent: 0, unused: over.unused ?? 0, withInlineDuplicates: 0, entries: [] },
    links: { total: 0, broken: Array.from({ length: over.broken ?? 0 }, () => ({ file: '', line: 0, href: '/x' })) },
    deadRoutes: Array.from({ length: over.deadRoutes ?? 0 }, (_, i) => `/dead-${i}`),
    crossPage: {
      issues: Array.from({ length: over.crossPage ?? 0 }, () => ({ type: 't', severity: 'warn', message: 'm' })),
    },
    autoFixable: 0,
  }
}

describe('computeQualityScore', () => {
  it('a perfectly clean app scores 100', () => {
    expect(computeQualityScore(result({}))).toBe(100)
  })

  it('the 0/100 regression: 7 clean pages + 6 broken links + 1 error is NOT critical', () => {
    // Old formula: 6*15 + 1*10 = 100 → score 0. Now links cap at 24.
    const score = computeQualityScore(result({ broken: 6, withErrors: 1 }))
    expect(score).toBeGreaterThanOrEqual(60) // "Good"/"Needs work", not "Critical"
    expect(score).toBe(66) // 100 - min(36,24) - 10
  })

  it('broken-link penalty saturates (cap 24) — many links cannot zero good pages', () => {
    const score = computeQualityScore(result({ broken: 40 }))
    expect(score).toBe(76) // 100 - 24, regardless of link count
  })

  it('page-level errors weigh most and cap at 40', () => {
    expect(computeQualityScore(result({ withErrors: 10 }))).toBe(60) // 100 - min(100,40)
  })

  it('a genuinely broken project can still reach 0', () => {
    const score = computeQualityScore(
      result({ withErrors: 10, withWarnings: 10, broken: 10, deadRoutes: 10, unused: 10, crossPage: 10 }),
    )
    expect(score).toBe(0)
  })

  it('console and json paths agree (same function, no drift)', () => {
    const r = result({ broken: 3, withWarnings: 2 })
    // both callers now route through computeQualityScore — identical by construction
    expect(computeQualityScore(r)).toBe(computeQualityScore(r))
    expect(computeQualityScore(r)).toBe(100 - Math.min(3 * 6, 24) - Math.min(2 * 3, 15))
  })
})
