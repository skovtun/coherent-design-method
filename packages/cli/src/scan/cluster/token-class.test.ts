import { describe, expect, it } from 'vitest'
import { isGenericUtility, MAX_GENERIC_UTILITY_TOKENS, stripVariants } from './token-class.js'

describe('stripVariants', () => {
  it('removes Tailwind variant prefixes', () => {
    expect(stripVariants('lg:px-30')).toBe('px-30')
    expect(stripVariants('lg:hover:bg-white')).toBe('bg-white')
    expect(stripVariants('text-sm')).toBe('text-sm')
  })
})

describe('isGenericUtility', () => {
  it('true for bare styling utilities (color / weight / size / spacing / display)', () => {
    expect(isGenericUtility(['text-grey_light_text'])).toBe(true)
    expect(isGenericUtility(['font-medium', 'text-black'])).toBe(true)
    expect(isGenericUtility(['block'])).toBe(true)
    expect(isGenericUtility(['mb-6', 'text-grey'])).toBe(true)
    expect(isGenericUtility(['font-bold', 'text-black', 'text-lg'])).toBe(true)
    expect(isGenericUtility(['font-mono', 'px-3', 'py-2', 'text-xs'])).toBe(true)
    expect(isGenericUtility(['pr-4', 'py-2'])).toBe(true)
    // responsive arbitrary values still classify by their base utility
    expect(isGenericUtility(['font-bold', 'lg:leading-[*]', 'lg:text-[*]', 'text-3xl', 'text-black'])).toBe(true)
  })

  it('false for structural layout recipes', () => {
    expect(isGenericUtility(['container', 'mx-auto', 'px-5', 'text-sm'])).toBe(false) // container
    expect(isGenericUtility(['grid', 'grid-cols-a1a'])).toBe(false) // grid template
    expect(isGenericUtility(['lg:self-start', 'lg:sticky', 'lg:top-24', 'space-y-4'])).toBe(false) // sticky
    expect(isGenericUtility(['flex-1', 'hidden', 'justify-center', 'lg:flex'])).toBe(false) // flex/justify
    expect(isGenericUtility(['flex', 'flex-wrap', 'gap-x-6', 'gap-y-2', 'items-center'])).toBe(false) // gap/items
  })

  it('false for semantic component classes', () => {
    expect(isGenericUtility(['lb-label'])).toBe(false)
    expect(isGenericUtility(['mk-btn', 'mk-btn-ghost'])).toBe(false)
    expect(isGenericUtility(['x-slot:description'])).toBe(false)
    expect(isGenericUtility(['label'])).toBe(false) // bare custom class, not Tailwind
  })

  it('false for parsed @class / interpolation junk', () => {
    expect(isGenericUtility(['name="trigger"', 'x-slot'])).toBe(false)
    expect(isGenericUtility(['color="green"', 'x-badge'])).toBe(false)
    expect(isGenericUtility(['$profit', '0', '>=', '?', 'font-bold'])).toBe(false)
  })

  it('false for empty or oversized token sets', () => {
    expect(isGenericUtility([])).toBe(false)
    const many = Array.from({ length: MAX_GENERIC_UTILITY_TOKENS + 1 }, (_, i) => `text-${i}`)
    expect(isGenericUtility(many)).toBe(false)
  })
})
