import { describe, it, expect } from 'vitest'
import { getAllowedColorClasses, extractCssVariableNames } from './allowedColorClasses.js'

describe('extractCssVariableNames', () => {
  it('extracts variable names from CSS string', () => {
    const css = `:root {
  --background: #fff;
  --foreground: #000;
  --primary: #3b82f6;
  --primary-foreground: #fafafa;
}`
    const names = extractCssVariableNames(css)
    expect(names).toContain('background')
    expect(names).toContain('foreground')
    expect(names).toContain('primary')
    expect(names).toContain('primary-foreground')
    expect(names).not.toContain('radius') // --radius is not a color
  })

  it('deduplicates names from :root and .dark blocks', () => {
    const css = `:root { --primary: #3b82f6; }\n.dark { --primary: #60a5fa; }`
    const names = extractCssVariableNames(css)
    const primaryCount = names.filter(n => n === 'primary').length
    expect(primaryCount).toBe(1)
  })
})

describe('getAllowedColorClasses', () => {
  const css = `:root {
  --radius: 0.5rem;
  --background: #ffffff;
  --foreground: #09090b;
  --primary: #3b82f6;
  --primary-foreground: #fafafa;
  --muted: #f4f4f5;
  --muted-foreground: #71717a;
  --destructive: #ef4444;
  --border: #e4e4e7;
  --success: #22c55e;
}`

  it('generates allowed classes for all Tailwind color prefixes', () => {
    const result = getAllowedColorClasses(css)
    // bg- prefix
    expect(result.classes.has('bg-primary')).toBe(true)
    expect(result.classes.has('bg-background')).toBe(true)
    expect(result.classes.has('bg-destructive')).toBe(true)
    // text- prefix
    expect(result.classes.has('text-foreground')).toBe(true)
    expect(result.classes.has('text-muted-foreground')).toBe(true)
    // border- prefix
    expect(result.classes.has('border-border')).toBe(true)
    // fill/stroke for SVG
    expect(result.classes.has('fill-primary')).toBe(true)
    expect(result.classes.has('stroke-border')).toBe(true)
    // shadow, ring, etc.
    expect(result.classes.has('shadow-primary')).toBe(true)
    expect(result.classes.has('ring-primary')).toBe(true)
  })

  it('does NOT include --radius as a color class', () => {
    const result = getAllowedColorClasses(css)
    expect(result.classes.has('bg-radius')).toBe(false)
  })

  it('also includes special non-variable tokens: border (bare)', () => {
    const result = getAllowedColorClasses(css)
    // "border" alone (no suffix) is valid in Tailwind
    expect(result.classes.has('border')).toBe(true)
  })

  it('generates a compact constraintSnippet string', () => {
    const result = getAllowedColorClasses(css)
    expect(result.constraintSnippet).toContain('bg-primary')
    expect(result.constraintSnippet).toContain('text-foreground')
    // Should be compact — not every permutation
    expect(result.constraintSnippet.length).toBeLessThan(500)
  })

  it('disallowedPattern matches raw Tailwind colors', () => {
    const result = getAllowedColorClasses(css)
    expect(result.disallowedPattern.test('bg-blue-500')).toBe(true)
    expect(result.disallowedPattern.test('text-gray-400')).toBe(true)
    expect(result.disallowedPattern.test('border-slate-200')).toBe(true)
  })

  it('disallowedPattern does NOT match allowed semantic classes', () => {
    const result = getAllowedColorClasses(css)
    expect(result.disallowedPattern.test('bg-primary')).toBe(false)
    expect(result.disallowedPattern.test('text-foreground')).toBe(false)
    expect(result.disallowedPattern.test('border-border')).toBe(false)
  })

  it('allows opacity modifiers on semantic classes', () => {
    const result = getAllowedColorClasses(css)
    expect(result.disallowedPattern.test('bg-primary/50')).toBe(false)
    expect(result.disallowedPattern.test('text-muted-foreground/80')).toBe(false)
  })
})
