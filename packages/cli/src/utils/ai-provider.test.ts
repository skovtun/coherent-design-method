import { describe, it, expect } from 'vitest'
import { normalizeRequestShape, extractFirstJson } from './ai-provider.js'

describe('extractFirstJson', () => {
  it('returns a clean JSON object unchanged', () => {
    const s = '{"requests":[{"type":"add-page"}]}'
    expect(JSON.parse(extractFirstJson(s))).toEqual({ requests: [{ type: 'add-page' }] })
  })

  it('strips a ```json fence', () => {
    const s = '```json\n{"a":1}\n```'
    expect(JSON.parse(extractFirstJson(s))).toEqual({ a: 1 })
  })

  it('drops trailing content after the JSON value (Sonnet 5 habit)', () => {
    const s = '{"a":1}\n\n```tsx\nimport Link from "next/link"\n```'
    expect(JSON.parse(extractFirstJson(s))).toEqual({ a: 1 })
  })

  it('ignores braces inside string literals', () => {
    const s = '{"code":"function x() { return {a:1} }"}\ntrailing junk'
    expect(JSON.parse(extractFirstJson(s))).toEqual({ code: 'function x() { return {a:1} }' })
  })

  it('handles escaped quotes inside strings', () => {
    const s = '{"q":"she said \\"hi\\" }"}extra'
    expect(JSON.parse(extractFirstJson(s))).toEqual({ q: 'she said "hi" }' })
  })

  it('extracts a leading array and drops trailing text', () => {
    const s = '[{"type":"add-page"}] and then some prose'
    expect(JSON.parse(extractFirstJson(s))).toEqual([{ type: 'add-page' }])
  })

  it('tolerates leading prose before the object', () => {
    const s = 'Here is the result:\n{"a":1}'
    expect(JSON.parse(extractFirstJson(s))).toEqual({ a: 1 })
  })

  it('returns input unchanged when there is no bracket at all', () => {
    // No `{`/`[` → nothing to extract. (Raw TSX that DOES contain braces is not
    // extractJSON's concern — it falls to the caller's parse-error path either
    // way, same as before; the fix for that is a prompt-level output lock.)
    const s = 'just prose, no json here'
    expect(extractFirstJson(s)).toBe(s)
  })
})

describe('normalizeRequestShape', () => {
  it('rehomes flattened page fields into changes (Sonnet 5 shape)', () => {
    const flat = {
      type: 'add-page',
      target: 'new',
      id: 'home',
      name: 'Home',
      route: '/',
      pageCode: 'export default function Home() { return null }',
    }
    const out = normalizeRequestShape(flat) as any
    expect(out.type).toBe('add-page')
    expect(out.target).toBe('new')
    expect(out.changes).toEqual({
      id: 'home',
      name: 'Home',
      route: '/',
      pageCode: 'export default function Home() { return null }',
    })
    // envelope fields must NOT leak into changes
    expect(out.changes.type).toBeUndefined()
    expect(out.changes.target).toBeUndefined()
  })

  it('preserves reason on the envelope, not in changes', () => {
    const out = normalizeRequestShape({
      type: 'add-page',
      reason: 'because',
      pageCode: 'x',
    }) as any
    expect(out.reason).toBe('because')
    expect(out.changes).toEqual({ pageCode: 'x' })
  })

  it('leaves already-nested requests untouched (Sonnet 4 shape)', () => {
    const nested = {
      type: 'add-page',
      target: 'new',
      changes: { id: 'home', pageCode: 'x' },
    }
    expect(normalizeRequestShape(nested)).toBe(nested)
  })

  it('does not fabricate changes for a bare envelope-only request', () => {
    const bare = { type: 'add-page', target: 'new' }
    expect(normalizeRequestShape(bare)).toBe(bare)
  })

  it('passes through non-objects', () => {
    expect(normalizeRequestShape(null)).toBe(null)
    expect(normalizeRequestShape('x')).toBe('x')
    expect(normalizeRequestShape(undefined)).toBe(undefined)
  })
})
