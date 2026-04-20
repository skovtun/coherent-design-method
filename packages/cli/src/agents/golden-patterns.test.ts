import { describe, it, expect } from 'vitest'
import { pickGoldenPatterns, GOLDEN_PATTERN_KEYS } from './golden-patterns.js'

describe('pickGoldenPatterns', () => {
  it('returns filter-bar content when message mentions filter', () => {
    const out = pickGoldenPatterns('fix the filter transactions section')
    expect(out).toContain('filter-bar')
    expect(out).toContain('flex flex-wrap items-center gap-3')
  })

  it('returns stat-card content when message mentions stats/kpi', () => {
    const out = pickGoldenPatterns('add KPI cards to the dashboard')
    expect(out).toContain('stat-card')
  })

  it('returns chart-card content when message mentions chart/analytics', () => {
    const out = pickGoldenPatterns('analytics page with revenue chart')
    expect(out).toContain('chart-card')
    expect(out).toContain('var(--chart-1)')
  })

  it('returns empty string when no keyword matches', () => {
    expect(pickGoldenPatterns('change button color to primary')).toBe('')
  })

  it('combines multiple patterns when multiple keywords hit', () => {
    const out = pickGoldenPatterns('dashboard with stats cards and a revenue chart + filters')
    expect(out).toContain('filter-bar')
    expect(out).toContain('stat-card')
    expect(out).toContain('chart-card')
  })

  it('also inspects pageSections for keyword hits', () => {
    const out = pickGoldenPatterns('update the sidebar', ['Revenue chart over 12 months'])
    expect(out).toContain('chart-card')
  })

  it('exposes all four pattern keys', () => {
    expect(GOLDEN_PATTERN_KEYS).toEqual(['filter-bar', 'stat-card', 'empty-state', 'chart-card'])
  })
})
