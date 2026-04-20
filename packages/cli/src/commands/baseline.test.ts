import { describe, it, expect } from 'vitest'
import { compareBaselines } from './baseline.js'

const empty = {
  route: '/',
  file: 'app/page.tsx',
  lineCount: 100,
  issues: {} as Record<string, number>,
  componentImports: [] as string[],
  sharedImports: [] as string[],
}

describe('compareBaselines', () => {
  it('no regression when pages are identical', () => {
    const prior = { date: '2026-04-18', cliVersion: '0.6.98', pages: { '/': { ...empty } } }
    const curr = { date: '2026-04-19', cliVersion: '0.6.99', pages: { '/': { ...empty } } }
    expect(compareBaselines(prior, curr)).toEqual([])
  })

  it('flags new validator issue on a page', () => {
    const prior = { date: '2026-04-18', cliVersion: '0.6.98', pages: { '/': { ...empty } } }
    const curr = {
      date: '2026-04-19',
      cliVersion: '0.6.99',
      pages: { '/': { ...empty, issues: { CHART_PLACEHOLDER: 1 } } },
    }
    const regressions = compareBaselines(prior, curr)
    expect(regressions).toHaveLength(1)
    expect(regressions[0].added.some(a => a.kind === 'issue' && a.detail.includes('CHART_PLACEHOLDER'))).toBe(true)
  })

  it('flags dropped UI component import', () => {
    const prior = {
      date: '2026-04-18',
      cliVersion: '0.6.98',
      pages: { '/': { ...empty, componentImports: ['Card', 'Button'] } },
    }
    const curr = {
      date: '2026-04-19',
      cliVersion: '0.6.99',
      pages: { '/': { ...empty, componentImports: ['Card'] } },
    }
    const regressions = compareBaselines(prior, curr)
    expect(regressions[0].added.some(a => a.kind === 'removed-component' && a.detail === 'Button')).toBe(true)
  })

  it('flags dropped shared component', () => {
    const prior = {
      date: '2026-04-18',
      cliVersion: '0.6.98',
      pages: { '/': { ...empty, sharedImports: ['StatCard', 'AccountCard'] } },
    }
    const curr = {
      date: '2026-04-19',
      cliVersion: '0.6.99',
      pages: { '/': { ...empty, sharedImports: ['StatCard'] } },
    }
    const regressions = compareBaselines(prior, curr)
    expect(regressions[0].added.some(a => a.kind === 'removed-shared' && a.detail === 'AccountCard')).toBe(true)
  })

  it('flags significant line-count shrink (>30%)', () => {
    const prior = { date: '2026-04-18', cliVersion: '0.6.98', pages: { '/': { ...empty, lineCount: 200 } } }
    const curr = { date: '2026-04-19', cliVersion: '0.6.99', pages: { '/': { ...empty, lineCount: 100 } } }
    const regressions = compareBaselines(prior, curr)
    expect(regressions).toHaveLength(1)
    expect(regressions[0].lineDelta).toBe(-100)
  })

  it('ignores small line-count shrink (<30%)', () => {
    const prior = { date: '2026-04-18', cliVersion: '0.6.98', pages: { '/': { ...empty, lineCount: 200 } } }
    const curr = { date: '2026-04-19', cliVersion: '0.6.99', pages: { '/': { ...empty, lineCount: 180 } } }
    const regressions = compareBaselines(prior, curr)
    expect(regressions).toEqual([])
  })

  it('ignores pages not in prior baseline (new pages)', () => {
    const prior = { date: '2026-04-18', cliVersion: '0.6.98', pages: {} }
    const curr = { date: '2026-04-19', cliVersion: '0.6.99', pages: { '/new': { ...empty, route: '/new' } } }
    expect(compareBaselines(prior, curr)).toEqual([])
  })

  it('same issue count is not a regression', () => {
    const prior = {
      date: '2026-04-18',
      cliVersion: '0.6.98',
      pages: { '/': { ...empty, issues: { MISSING_ARIA_LABEL: 2 } } },
    }
    const curr = {
      date: '2026-04-19',
      cliVersion: '0.6.99',
      pages: { '/': { ...empty, issues: { MISSING_ARIA_LABEL: 2 } } },
    }
    expect(compareBaselines(prior, curr)).toEqual([])
  })

  it('issue count growth is a regression', () => {
    const prior = {
      date: '2026-04-18',
      cliVersion: '0.6.98',
      pages: { '/': { ...empty, issues: { MISSING_ARIA_LABEL: 1 } } },
    }
    const curr = {
      date: '2026-04-19',
      cliVersion: '0.6.99',
      pages: { '/': { ...empty, issues: { MISSING_ARIA_LABEL: 3 } } },
    }
    const regressions = compareBaselines(prior, curr)
    expect(regressions[0].added.some(a => a.detail.includes('×2'))).toBe(true)
  })
})
