import { describe, it, expect } from 'vitest'
import { getDesignQualityForType, inferPageTypeFromRoute, DESIGN_QUALITY_COMMON } from './design-constraints.js'

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
    expect(result).not.toContain('max-w-sm')
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

describe('Fix H: toolbar flex-1', () => {
  it('DESIGN_QUALITY_APP includes toolbar rules', () => {
    const result = getDesignQualityForType('app')
    expect(result).toContain('flex-1')
    expect(result).toContain('Search input')
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
