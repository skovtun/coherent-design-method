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

  it('exposes all registered pattern keys', () => {
    expect(GOLDEN_PATTERN_KEYS).toEqual([
      'filter-bar',
      'stat-card',
      'empty-state',
      'chart-card',
      'dialog',
      'dropdown-menu',
      'alert-dialog',
      'sheet',
      'pagination',
    ])
  })

  it('returns dialog pattern for "modal" keyword', () => {
    expect(pickGoldenPatterns('add a modal to create budget')).toContain('dialog')
  })

  it('returns dropdown pattern for "row actions"', () => {
    expect(pickGoldenPatterns('add row actions for transactions table')).toContain('dropdown-menu')
  })

  it('returns alert-dialog pattern for "delete confirmation"', () => {
    expect(pickGoldenPatterns('add a delete confirmation prompt')).toContain('alert-dialog')
  })

  it('returns sheet pattern for "side drawer"', () => {
    expect(pickGoldenPatterns('open a side drawer for advanced filters')).toContain('sheet')
  })

  it('returns pagination pattern for "pagination"', () => {
    expect(pickGoldenPatterns('add pagination below the table')).toContain('pagination')
  })
})
