import { describe, it, expect } from 'vitest'
import { getDeterministicComponentCode } from './deterministic-templates.js'
import { validatePageQuality } from '../utils/quality-validator.js'
import type { PlannedComponentSchema } from '../commands/chat/plan-generator.js'
import type { z } from 'zod'

type PlannedComponent = z.infer<typeof PlannedComponentSchema>

const base = (over: Partial<PlannedComponent> = {}): PlannedComponent => ({
  name: 'StatsChart',
  description: '',
  props: '{}',
  usedBy: [],
  type: 'data-display',
  shadcnDeps: [],
  ...over,
})

describe('getDeterministicComponentCode — StatsChart', () => {
  it('returns template code for exact name "StatsChart"', () => {
    const code = getDeterministicComponentCode(base())
    expect(code).not.toBeNull()
    expect(code).toContain('export function StatsChart')
    expect(code).toContain('ChartContainer')
    expect(code).toContain('recharts')
  })

  it('returns null for unrelated component names', () => {
    expect(getDeterministicComponentCode(base({ name: 'PricingCard', type: 'section' }))).toBeNull()
    expect(getDeterministicComponentCode(base({ name: 'Header', type: 'layout' }))).toBeNull()
    expect(getDeterministicComponentCode(base({ name: 'ContactForm', type: 'form' }))).toBeNull()
  })

  it('accepts chart/graph names with data-display type', () => {
    expect(getDeterministicComponentCode(base({ name: 'RevenueChart' }))).not.toBeNull()
    expect(getDeterministicComponentCode(base({ name: 'AnalyticsGraph' }))).not.toBeNull()
  })

  it('rejects chart-named components when type is not data-display', () => {
    expect(getDeterministicComponentCode(base({ name: 'RevenueChart', type: 'section' }))).toBeNull()
  })

  it('renames component when name differs from StatsChart', () => {
    const code = getDeterministicComponentCode(base({ name: 'RevenueChart' }))
    expect(code).toContain('export function RevenueChart')
    expect(code).toContain('interface RevenueChartProps')
    expect(code).not.toContain('export function StatsChart')
  })

  it('passes quality-validator — no CHART_PLACEHOLDER, no raw colors, no empty box', () => {
    const code = getDeterministicComponentCode(base())
    expect(code).not.toBeNull()
    const issues = validatePageQuality(code!, undefined, 'app')
    const errors = issues.filter(i => i.severity === 'error')
    expect(errors).toEqual([])
  })

  it('uses semantic chart tokens (var(--chart-N)), never raw Tailwind colors', () => {
    const code = getDeterministicComponentCode(base())!
    expect(code).toContain('var(--chart-1)')
    expect(code).not.toMatch(/\bbg-(?:blue|red|green|yellow|purple|pink|indigo|gray|slate|zinc|neutral|stone)-\d/)
  })

  it('includes an empty-state fallback for empty data', () => {
    const code = getDeterministicComponentCode(base())!
    expect(code).toContain('No data yet')
    expect(code).toContain('hasData')
  })
})
