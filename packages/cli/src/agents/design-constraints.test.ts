import { describe, it, expect } from 'vitest'
import {
  getDesignQualityForType,
  inferPageTypeFromRoute,
  DESIGN_QUALITY_COMMON,
  CORE_CONSTRAINTS,
  RULES_DATA_DISPLAY,
  RULES_CARDS_LAYOUT,
} from './design-constraints.js'

describe('getDesignQualityForType', () => {
  it('returns marketing constraints with generous spacing', () => {
    const result = getDesignQualityForType('marketing')
    expect(result).toContain('py-20')
    expect(result).not.toContain('gap-4 md:gap-6')
    expect(result).not.toContain('max-w-sm')
  })

  it('returns app constraints with compact spacing', () => {
    const result = getDesignQualityForType('app')
    expect(result).toContain('gap-4')
    expect(result).not.toContain('py-20')
  })

  it('returns auth constraints with centered card', () => {
    const result = getDesignQualityForType('auth')
    expect(result).toContain('max-w-md')
    expect(result).not.toContain('py-20')
  })
})

describe('inferPageTypeFromRoute', () => {
  it('returns auth for /login', () => {
    expect(inferPageTypeFromRoute('/login')).toBe('auth')
  })
  it('returns auth for /register', () => {
    expect(inferPageTypeFromRoute('/register')).toBe('auth')
  })
  it('returns auth for /forgot-password', () => {
    expect(inferPageTypeFromRoute('/forgot-password')).toBe('auth')
  })
  it('returns marketing for /pricing', () => {
    expect(inferPageTypeFromRoute('/pricing')).toBe('marketing')
  })
  it('returns marketing for /features', () => {
    expect(inferPageTypeFromRoute('/features')).toBe('marketing')
  })
  it('returns app for /dashboard', () => {
    expect(inferPageTypeFromRoute('/dashboard')).toBe('app')
  })
  it('returns app for /settings', () => {
    expect(inferPageTypeFromRoute('/settings')).toBe('app')
  })
  it('returns marketing for /landing', () => {
    expect(inferPageTypeFromRoute('/landing')).toBe('marketing')
  })
  it('returns marketing for /home', () => {
    expect(inferPageTypeFromRoute('/home')).toBe('marketing')
  })
})

describe('DESIGN_QUALITY_CRITICAL', () => {
  it('is appended to marketing constraints', () => {
    const result = getDesignQualityForType('marketing')
    expect(result).toContain('CRITICAL CODE RULES')
    expect(result).toContain('shrink-0')
  })

  it('is appended to app constraints', () => {
    const result = getDesignQualityForType('app')
    expect(result).toContain('CRITICAL CODE RULES')
    expect(result).toContain('NEVER use raw Tailwind colors')
  })

  it('is appended to auth constraints', () => {
    const result = getDesignQualityForType('auth')
    expect(result).toContain('CRITICAL CODE RULES')
    expect(result).toContain('shrink-0')
  })
})

describe('Fix G: auth max-w-md', () => {
  it('DESIGN_QUALITY_AUTH uses max-w-md not max-w-sm', () => {
    const result = getDesignQualityForType('auth')
    expect(result).toContain('max-w-md')
    expect(result).not.toContain('max-w-sm')
  })
})

describe('DESIGN_QUALITY_APP design principles', () => {
  it('contains page header direction', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('text-2xl font-bold tracking-tight')
  })

  it('contains stat metrics variation guidance', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('STAT METRICS')
    expect(quality).toContain('not always 4 identical cards')
  })

  it('contains filter area with Select requirement', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('NEVER use native <select>')
    expect(quality).toContain('SelectTrigger')
    expect(quality).toContain('NEVER render filter options as inline text')
  })

  it('contains badge placement rules', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('badge')
    expect(quality).toContain('gap-2')
  })

  it('contains empty state guidance', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('EMPTY STATE')
  })

  it('contains layout variety options', () => {
    const quality = getDesignQualityForType('app')
    expect(quality).toContain('Layout')
  })
})

describe('DESIGN_QUALITY_AUTH reference snippet', () => {
  it('contains auth card snippet with form pattern', () => {
    const quality = getDesignQualityForType('auth')
    expect(quality).toContain('w-full max-w-md')
    expect(quality).toContain('<CardHeader className="space-y-1">')
    expect(quality).toContain('<form className="space-y-4">')
    expect(quality).toContain('underline-offset-4')
  })
})

describe('DESIGN_QUALITY_COMMON', () => {
  it('contains typography rules', () => {
    expect(DESIGN_QUALITY_COMMON).toContain('font')
  })
  it('contains visual depth rules', () => {
    expect(DESIGN_QUALITY_COMMON).toContain('Visual Depth')
  })
  it('does not contain marketing spacing', () => {
    expect(DESIGN_QUALITY_COMMON).not.toContain('py-20 md:py-28')
  })
  it('does not contain app compact spacing', () => {
    expect(DESIGN_QUALITY_COMMON).not.toContain('gap-4 md:gap-6 between sections')
  })
})

describe('design-constraints nested-containers rule', () => {
  it('CORE_CONSTRAINTS forbids nested bordered containers (always-on)', () => {
    expect(CORE_CONSTRAINTS).toContain('Nested bordered containers')
    expect(CORE_CONSTRAINTS).toContain('card-in-card')
  })

  it('RULES_CARDS_LAYOUT includes BAD/GOOD examples for nested cards', () => {
    expect(RULES_CARDS_LAYOUT).toContain('NO nested visual containers')
    expect(RULES_CARDS_LAYOUT).toContain('BAD:')
    expect(RULES_CARDS_LAYOUT).toContain('GOOD (flat stack)')
    expect(RULES_CARDS_LAYOUT).toContain('GOOD (single card, rows)')
  })
})

describe('design-constraints chart rule', () => {
  it('CORE_CONSTRAINTS bans chart placeholder text (always-on)', () => {
    expect(CORE_CONSTRAINTS).toContain('CHARTS')
    expect(CORE_CONSTRAINTS).toContain('Chart visualization would go here')
  })

  it('CORE_CONSTRAINTS points to RULES_DATA_DISPLAY for chart detail', () => {
    expect(CORE_CONSTRAINTS).toContain('shadcn Chart + recharts')
    expect(CORE_CONSTRAINTS).toContain('RULES_DATA_DISPLAY')
  })

  it('RULES_DATA_DISPLAY includes full chart pattern', () => {
    expect(RULES_DATA_DISPLAY).toContain('pnpm dlx shadcn@latest add chart')
    expect(RULES_DATA_DISPLAY).toContain('ChartContainer')
    expect(RULES_DATA_DISPLAY).toContain('ChartTooltipContent')
    expect(RULES_DATA_DISPLAY).toContain('var(--chart-1)')
    expect(RULES_DATA_DISPLAY).toContain('h-[200px]')
    expect(RULES_DATA_DISPLAY).toContain('h-[300px]')
    expect(RULES_DATA_DISPLAY).toContain('h-[400px]')
  })

  it('RULES_DATA_DISPLAY picks right chart type per data shape', () => {
    expect(RULES_DATA_DISPLAY).toContain('AreaChart — trends over time')
    expect(RULES_DATA_DISPLAY).toContain('BarChart — category comparisons')
    expect(RULES_DATA_DISPLAY).toContain('PieChart — portions of a whole')
  })

  it('RULES_DATA_DISPLAY includes empty state pattern', () => {
    expect(RULES_DATA_DISPLAY).toContain('No data yet')
  })
})

describe('design-constraints number formatting rule', () => {
  it('CORE_CONSTRAINTS requires Intl.NumberFormat for money', () => {
    expect(CORE_CONSTRAINTS).toContain('NUMBER FORMATTING')
    expect(CORE_CONSTRAINTS).toContain('Intl.NumberFormat')
    expect(CORE_CONSTRAINTS).toContain('"currency"')
  })

  it('CORE_CONSTRAINTS bans toFixed for money', () => {
    expect(CORE_CONSTRAINTS).toContain('value.toFixed')
  })
})

describe('design-constraints mock data location rule', () => {
  it('CORE_CONSTRAINTS requires extract to src/data for 5+ element arrays', () => {
    expect(CORE_CONSTRAINTS).toContain('src/data/')
    expect(CORE_CONSTRAINTS).toContain('5+ elements')
  })
})

describe('design-constraints mock data rules', () => {
  it('CORE_CONSTRAINTS includes mock data ISO rule', () => {
    expect(CORE_CONSTRAINTS).toContain('ISO 8601')
    expect(CORE_CONSTRAINTS).toContain('MOCK/SAMPLE DATA')
  })
  it('RULES_DATA_DISPLAY distinguishes rendered vs source dates', () => {
    expect(RULES_DATA_DISPLAY).toContain('Dates in rendered output')
    expect(RULES_DATA_DISPLAY).toContain('Dates in source data')
  })
  it('RULES_DATA_DISPLAY includes mock data section', () => {
    expect(RULES_DATA_DISPLAY).toContain('MOCK DATA IN COMPONENTS')
    expect(RULES_DATA_DISPLAY).toContain('NEVER store display strings')
  })
})
