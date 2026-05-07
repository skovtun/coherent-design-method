import { describe, it, expect } from 'vitest'
import { extractValidatorTypes, extractConstraintBlocks } from './generate-rules-map.mjs'

describe('extractValidatorTypes (AST)', () => {
  it('extracts a basic issues.push type/message pair', () => {
    const source = `
      function check(code, issues) {
        issues.push({
          line: 0,
          type: 'NO_H1',
          message: 'Page missing top-level h1 heading',
          severity: 'error',
        })
      }
    `
    const out = extractValidatorTypes(source)
    expect(out).toEqual([{ type: 'NO_H1', message: 'Page missing top-level h1 heading' }])
  })

  it('extracts when comments are placed BETWEEN type and message (M18 regression)', () => {
    // The regex implementation broke here — comments split the field group and
    // the rule silently disappeared from RULES_MAP.md. AST walk is comment-immune.
    const source = `
      issues.push({
        line: 0,
        type: 'STUCK_ON_SELECTION',
        // promoted warning → error 2026-05-06 because benchmark scan
        // surfaced 3 pages with this issue and AI fix loop only retries
        // on severity === 'error'
        message: 'Unconditional selection background inside .map()',
        severity: 'error',
      })
    `
    const out = extractValidatorTypes(source)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      type: 'STUCK_ON_SELECTION',
      message: 'Unconditional selection background inside .map()',
    })
  })

  it('handles message as template literal (no substitutions)', () => {
    const source = `
      issues.push({
        type: 'PLACEHOLDER',
        message: \`Placeholder name banned in JSX text\`,
      })
    `
    const out = extractValidatorTypes(source)
    expect(out).toEqual([{ type: 'PLACEHOLDER', message: 'Placeholder name banned in JSX text' }])
  })

  it('approximates message with substitutions (interpolation → "…")', () => {
    const source = `
      issues.push({
        type: 'CLICKABLE_DIV',
        message: \`<\${tag} onClick> without role\`,
      })
    `
    const out = extractValidatorTypes(source)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('CLICKABLE_DIV')
    expect(out[0].message).toContain('onClick')
    expect(out[0].message).toContain('…')
  })

  it('skips objects missing type or message', () => {
    const source = `
      const opts = { line: 0, severity: 'error' }
      const partial = { type: 'WHATEVER' }
      const onlyMessage = { message: 'help' }
    `
    const out = extractValidatorTypes(source)
    expect(out).toEqual([])
  })

  it('rejects type values that are not validator-shape (lowercase, dashes, etc.)', () => {
    const source = `
      const opts = { type: 'someEvent', message: 'click' }
      const dashes = { type: 'data-attr', message: 'foo' }
      const ok = { type: 'VALID_TYPE', message: 'bar' }
    `
    const out = extractValidatorTypes(source)
    expect(out).toEqual([{ type: 'VALID_TYPE', message: 'bar' }])
  })

  it('first occurrence wins (does not double-count duplicate types)', () => {
    const source = `
      issues.push({ type: 'DUPED', message: 'first' })
      issues.push({ type: 'DUPED', message: 'second' })
    `
    const out = extractValidatorTypes(source)
    expect(out).toEqual([{ type: 'DUPED', message: 'first' }])
  })

  it('finds rules nested inside helper functions and conditionals', () => {
    const source = `
      function checkOverlay(code, issues) {
        if (something) {
          issues.push({
            type: 'DIALOG_FULL_WIDTH',
            message: 'Dialog without max-w-* default',
            severity: 'error',
          })
        }
      }
      function helper() {
        return { type: 'NESTED_RULE', message: 'helper return' }
      }
    `
    const out = extractValidatorTypes(source)
    const types = out.map(o => o.type).sort()
    expect(types).toEqual(['DIALOG_FULL_WIDTH', 'NESTED_RULE'])
  })

  it('truncates messages over 140 chars to keep table cells readable', () => {
    const long = 'x'.repeat(200)
    const source = `issues.push({ type: 'LONG_MSG', message: '${long}' })`
    const out = extractValidatorTypes(source)
    expect(out).toHaveLength(1)
    expect(out[0].message.length).toBeLessThanOrEqual(140)
  })
})

describe('extractConstraintBlocks', () => {
  it('extracts export-const template-literal blocks with first non-empty line', () => {
    const source = [
      'export const CORE_CONSTRAINTS = `',
      '## CORE rules',
      '- Always use semantic tokens.',
      'A long body so the lazy regex consumes its 200-char window before the next export.',
      'B'.repeat(220),
      '`',
      'export const RULES_FORMS = `',
      'Forms must have labels.',
      '`',
    ].join('\n')
    const out = extractConstraintBlocks(source)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ name: 'CORE_CONSTRAINTS', preview: '## CORE rules' })
    expect(out[1].name).toBe('RULES_FORMS')
  })
})
