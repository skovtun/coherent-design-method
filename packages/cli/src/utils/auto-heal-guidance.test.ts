import { describe, it, expect } from 'vitest'
import { AUTO_HEAL_GUIDANCE, buildFixInstruction } from './auto-heal-guidance.js'

describe('buildFixInstruction', () => {
  it('produces per-type guidance sections for each issue type', () => {
    const out = buildFixInstruction([{ type: 'DIALOG_FULL_WIDTH', line: 10, message: 'DialogContent without max-w-*' }])
    expect(out).toContain('## DIALOG_FULL_WIDTH')
    expect(out).toContain('Add max-w-lg')
  })

  it('groups multiple issues of the same type into one section', () => {
    const out = buildFixInstruction([
      { type: 'CHART_PLACEHOLDER', line: 12, message: 'Chart visualization would go here' },
      { type: 'CHART_PLACEHOLDER', line: 45, message: 'Graph coming soon' },
    ])
    expect(out.match(/## CHART_PLACEHOLDER/g)).toHaveLength(1)
    expect(out).toContain('Line 12:')
    expect(out).toContain('Line 45:')
  })

  it('includes scope limit at the end (prevents unrelated refactors)', () => {
    const out = buildFixInstruction([{ type: 'TEXT_BASE', line: 5, message: 'text-base detected' }])
    expect(out).toContain('Fix ONLY the listed issues')
  })

  it('falls back to issue message when type is unknown', () => {
    const out = buildFixInstruction([{ type: 'WEIRD_NEW_ISSUE', line: 1, message: 'something broke' }])
    expect(out).toContain('## WEIRD_NEW_ISSUE')
    expect(out).toContain('something broke')
    // no `FIX:` line since guidance is missing, but original message suffices.
  })
})

describe('AUTO_HEAL_GUIDANCE coverage', () => {
  it('has entries for all new 0.7.x validators', () => {
    const required = [
      'CHART_PLACEHOLDER',
      'CHART_EMPTY_BOX',
      'RAW_NUMBER_FORMAT',
      'DOUBLE_SIGN',
      'INLINE_MOCK_DATA',
      'TABLE_COLUMN_MISMATCH',
      'FILTER_DUPLICATE',
      'FILTER_HEIGHT_MISMATCH',
      'SEARCH_ICON_MISPLACED',
      'DIALOG_FULL_WIDTH',
      'DIALOG_CUSTOM_OVERLAY',
      'ALERT_DIALOG_NON_DESTRUCTIVE',
    ]
    for (const type of required) {
      expect(AUTO_HEAL_GUIDANCE[type]).toBeDefined()
      expect(AUTO_HEAL_GUIDANCE[type].length).toBeGreaterThan(20)
    }
  })
})
