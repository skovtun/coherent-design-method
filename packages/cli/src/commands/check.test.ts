import { describe, it, expect } from 'vitest'

// Test the quality score calculation logic (extracted from check.ts)
function calculateScore(result: {
  pages: { withErrors: number; withWarnings: number }
  links: { broken: { length: number } }
  shared: { unused: number }
}): number {
  const errorPenalty = result.pages.withErrors * 10
  const warningPenalty = result.pages.withWarnings * 3
  const linkPenalty = result.links.broken.length * 15
  const unusedPenalty = result.shared.unused * 2
  const totalPenalty = errorPenalty + warningPenalty + linkPenalty + unusedPenalty
  return Math.max(0, Math.min(100, 100 - totalPenalty))
}

describe('quality score calculation', () => {
  it('returns 100 for clean project', () => {
    expect(
      calculateScore({
        pages: { withErrors: 0, withWarnings: 0 },
        links: { broken: { length: 0 } },
        shared: { unused: 0 },
      }),
    ).toBe(100)
  })

  it('deducts 10 per error', () => {
    expect(
      calculateScore({
        pages: { withErrors: 2, withWarnings: 0 },
        links: { broken: { length: 0 } },
        shared: { unused: 0 },
      }),
    ).toBe(80)
  })

  it('deducts 3 per warning', () => {
    expect(
      calculateScore({
        pages: { withErrors: 0, withWarnings: 5 },
        links: { broken: { length: 0 } },
        shared: { unused: 0 },
      }),
    ).toBe(85)
  })

  it('deducts 15 per broken link', () => {
    expect(
      calculateScore({
        pages: { withErrors: 0, withWarnings: 0 },
        links: { broken: { length: 2 } },
        shared: { unused: 0 },
      }),
    ).toBe(70)
  })

  it('never goes below 0', () => {
    expect(
      calculateScore({
        pages: { withErrors: 10, withWarnings: 10 },
        links: { broken: { length: 5 } },
        shared: { unused: 10 },
      }),
    ).toBe(0)
  })

  it('combines penalties correctly', () => {
    // 1 error (10) + 2 warnings (6) + 1 broken link (15) + 1 unused (2) = 33
    expect(
      calculateScore({
        pages: { withErrors: 1, withWarnings: 2 },
        links: { broken: { length: 1 } },
        shared: { unused: 1 },
      }),
    ).toBe(67)
  })

  it('labels: 90+ = Excellent', () => {
    const score = calculateScore({
      pages: { withErrors: 0, withWarnings: 2 },
      links: { broken: { length: 0 } },
      shared: { unused: 0 },
    })
    expect(score).toBe(94)
    expect(score >= 90).toBe(true)
  })
})
