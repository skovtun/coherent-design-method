/**
 * Unit tests for quality-validator: checkLines, autoFixCode, multi-line comments.
 */

import { describe, it, expect } from 'vitest'
import { validatePageQuality, autoFixCode, checkDesignConsistency, verifyIncrementalEdit } from './quality-validator.js'

describe('validatePageQuality', () => {
  it('detects native <button> in JSX', () => {
    const code = `export default function Page() {\n  return <button>Click</button>\n}`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'NATIVE_BUTTON')).toBe(true)
  })

  it('does NOT flag <button in single-line comment', () => {
    const code = `export default function Page() {\n  // Use <button> for actions\n  return <div>OK</div>\n}`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'NATIVE_BUTTON')).toBe(false)
  })

  it('does NOT flag <button inside a string literal', () => {
    const code = `const hint = "Use <button> component"\nexport default function Page() { return <div>{hint}</div> }`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'NATIVE_BUTTON')).toBe(false)
  })

  it('does NOT flag <button inside multi-line comment', () => {
    const code = `/*\n * <button> should not be used directly\n */\nexport default function Page() { return <div>OK</div> }`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'NATIVE_BUTTON')).toBe(false)
  })

  it('detects raw color classes', () => {
    const code = `<div className="bg-blue-500 text-sm">Hello</div>`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'RAW_COLOR')).toBe(true)
  })

  it('detects text-base usage', () => {
    const code = `<p className="text-base">Text</p>`
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'TEXT_BASE')).toBe(true)
  })
})

describe('autoFixCode', () => {
  it('replaces text-base with text-sm in className', async () => {
    const code = `<p className="text-base leading-relaxed">Text</p>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('text-sm')
    expect(fixed).not.toContain('text-base')
    expect(fixes).toContain('text-base → text-sm')
  })

  it('removes large text from CardTitle', async () => {
    const code = `<CardTitle className="text-lg font-bold">Title</CardTitle>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).not.toContain('text-lg')
    expect(fixes.some(f => f.includes('CardTitle'))).toBe(true)
  })

  it('replaces heavy shadow with shadow-sm', async () => {
    const code = `<div className="shadow-lg rounded-md">Card</div>`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('shadow-sm')
    expect(fixed).not.toContain('shadow-lg')
    expect(fixes).toContain('heavy shadow → shadow-sm')
  })

  it('adds use client when hooks are detected', async () => {
    const code = `import { useState } from 'react'\nexport default function Page() { const [x, setX] = useState(0); return <div>{x}</div> }`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed.trimStart().startsWith("'use client'")).toBe(true)
    expect(fixes.some(f => f.includes('use client'))).toBe(true)
  })

  it('does NOT add duplicate use client', async () => {
    const code = `'use client'\nimport { useState } from 'react'\nexport default function Page() { const [x, setX] = useState(0); return <div>{x}</div> }`
    const { code: fixed } = await autoFixCode(code)
    const count = (fixed.match(/'use client'/g) || []).length
    expect(count).toBe(1)
  })

  it('cleans up double spaces in className', async () => {
    const code = `<div className="text-sm  leading-relaxed  font-bold">X</div>`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).not.toContain('  ')
  })

  it('fixes &lt;= in JS code (HTML entity in comparison)', async () => {
    const code = `'use client'\nfunction filter(x: number) { return x &lt;= 200 }`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('x <= 200')
    expect(fixed).not.toContain('&lt;')
    expect(fixes.some(f => f.includes('syntax'))).toBe(true)
  })

  it('fixes &lt; in JS code (budget < 200 pattern)', async () => {
    const code = `'use client'\nconst ok = budget &lt; 200`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('budget < 200')
  })

  it('fixes &amp;&amp; in JS code', async () => {
    const code = `'use client'\nconst ok = a &amp;&amp; b`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('a && b')
  })

  it('fixes &gt;= in JS code', async () => {
    const code = `'use client'\nconst ok = budget &gt;= 200`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('budget >= 200')
  })

  it('replaces /api/placeholder/ URLs with picsum', async () => {
    const code = `'use client'\nconst img = "/api/placeholder/40/40"`
    const { code: fixed, fixes } = await autoFixCode(code)
    expect(fixed).toContain('https://picsum.photos/40/40?random=')
    expect(fixed).not.toContain('/api/placeholder/')
    expect(fixes.some(f => f.includes('placeholder images'))).toBe(true)
  })

  it('replaces /placeholder-avatar-*.jpg with pravatar', async () => {
    const code = `'use client'\nconst img = "/placeholder-avatar-1.jpg"`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('https://i.pravatar.cc/150?u=')
    expect(fixed).not.toContain('/placeholder-avatar')
  })

  it('replaces via.placeholder.com URLs with picsum', async () => {
    const code = `'use client'\nconst img = "https://via.placeholder.com/800x400"`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('https://picsum.photos/800/400?random=')
  })

  it('replaces /images/*.jpg with picsum', async () => {
    const code = `'use client'\nconst img = "/images/hero-banner.jpg"`
    const { code: fixed } = await autoFixCode(code)
    expect(fixed).toContain('https://picsum.photos/800/400?random=')
    expect(fixed).not.toContain('/images/hero-banner.jpg')
  })
})

describe('design system consistency', () => {
  it('warns on hardcoded hex colors', () => {
    const code = 'className="bg-[#FF5733] text-white"'
    const warnings = checkDesignConsistency(code)
    expect(warnings).toContainEqual(expect.objectContaining({ type: 'hardcoded-color' }))
  })

  it('does not warn on CSS variable colors', () => {
    const code = 'className="bg-primary text-foreground"'
    const warnings = checkDesignConsistency(code)
    expect(warnings.filter(w => w.type === 'hardcoded-color')).toHaveLength(0)
  })

  it('warns on arbitrary pixel values in spacing', () => {
    const code = 'className="p-[13px] mt-[47px]"'
    const warnings = checkDesignConsistency(code)
    expect(warnings).toContainEqual(expect.objectContaining({ type: 'arbitrary-spacing' }))
  })
})

describe('AI output verification for incremental edits', () => {
  it('detects removed imports that are still used', () => {
    const before = `import { Button } from '@/components/ui/button'\nimport { Card } from '@/components/ui/card'\nexport default function Page() { return <Card><Button>Click</Button></Card> }`
    const after = `import { Button } from '@/components/ui/button'\nexport default function Page() { return <Card><Button>Click</Button></Card> }`
    const issues = verifyIncrementalEdit(before, after)
    expect(issues).toContainEqual(expect.objectContaining({ type: 'missing-import', symbol: 'Card' }))
  })

  it('detects missing use client when hooks are present', () => {
    const code = `import { useState } from 'react'\nexport default function Page() { const [x, setX] = useState(0); return <div>{x}</div> }`
    const issues = verifyIncrementalEdit('', code)
    expect(issues).toContainEqual(expect.objectContaining({ type: 'missing-use-client' }))
  })

  it('passes clean incremental edit', () => {
    const before = `'use client'\nimport { Button } from '@/components/ui/button'\nexport default function Page() { return <Button>Old</Button> }`
    const after = `'use client'\nimport { Button } from '@/components/ui/button'\nexport default function Page() { return <Button>New</Button> }`
    const issues = verifyIncrementalEdit(before, after)
    expect(issues).toHaveLength(0)
  })
})
