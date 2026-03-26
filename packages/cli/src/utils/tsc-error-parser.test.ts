import { describe, it, expect } from 'vitest'
import { parseTscOutput } from './tsc-error-parser.js'

describe('parseTscOutput', () => {
  it('parses a single-line error', () => {
    const output = `app/page.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.`
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      file: 'app/page.tsx',
      line: 10,
      col: 5,
      code: 'TS2322',
      relatedFiles: [],
    })
    expect(errors[0].message).toContain("Type 'string' is not assignable")
  })

  it('parses multi-line error with related file', () => {
    const output = [
      `app/dashboard/page.tsx(171,25): error TS2322: Type '{ time: string; }' is not assignable to type '{ timestamp: string; }'.`,
      `  Property 'timestamp' is missing in type '{ time: string; }' but required in type '{ timestamp: string; }'.`,
      ``,
      `  components/shared/activity-feed.tsx(11,5): error TS2322: 'timestamp' is declared here.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].file).toBe('app/dashboard/page.tsx')
    expect(errors[0].message).toContain('timestamp')
    expect(errors[0].relatedFiles).toContain('components/shared/activity-feed.tsx')
  })

  it('parses error with multiple related files', () => {
    const output = [
      `app/page.tsx(10,5): error TS2322: Type mismatch.`,
      `  components/a.tsx(5,3): 'foo' is declared here.`,
      `  components/b.tsx(8,1): 'bar' is declared here.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].relatedFiles).toContain('components/a.tsx')
    expect(errors[0].relatedFiles).toContain('components/b.tsx')
  })

  it('parses multiple independent errors', () => {
    const output = [
      `app/page.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.`,
      `app/page.tsx(20,10): error TS2741: Property 'onToggle' is missing.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(2)
    expect(errors[0].code).toBe('TS2322')
    expect(errors[1].code).toBe('TS2741')
  })

  it('returns empty array for empty output', () => {
    expect(parseTscOutput('')).toEqual([])
  })

  it('returns empty array for clean compilation', () => {
    expect(parseTscOutput('No errors found.\n')).toEqual([])
  })

  it('handles malformed lines gracefully', () => {
    const output = `Some random warning\napp/page.tsx(10,5): error TS2322: Type mismatch.\nAnother random line`
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('TS2322')
  })

  it('collects continuation lines into message', () => {
    const output = [
      `app/page.tsx(5,3): error TS2322: Type '{ time: string; }[]' is not assignable.`,
      `  Property 'timestamp' is missing in type '{ time: string; }' but required.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('Property')
    expect(errors[0].message).toContain('timestamp')
  })

  it('deduplicates errors by file+line+code', () => {
    const output = [
      `app/page.tsx(10,5): error TS2322: Type 'A' is not assignable to type 'B'.`,
      `app/page.tsx(10,5): error TS2322: Type 'A' is not assignable to type 'B'.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
  })

  it('trims whitespace from related file paths', () => {
    const output = [
      `app/page.tsx(10,5): error TS2322: Type mismatch.`,
      `  components/feed.tsx(11,5): 'timestamp' is declared here.`,
    ].join('\n')
    const errors = parseTscOutput(output)
    expect(errors[0].relatedFiles[0]).toBe('components/feed.tsx')
    expect(errors[0].relatedFiles[0]).not.toMatch(/^\s/)
  })

  it('handles error with named type reference (no inline fields)', () => {
    const output = `app/page.tsx(10,5): error TS2322: Type 'PageData' is not assignable to type 'ActivityFeedProps'.`
    const errors = parseTscOutput(output)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('ActivityFeedProps')
  })
})
