/**
 * Unit tests for quality-validator: checkLines, autoFixCode, multi-line comments.
 */

import { describe, it, expect } from 'vitest'
import { validatePageQuality, autoFixCode } from './quality-validator.js'

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
})
