import { describe, it, expect } from 'vitest'
import { parseSettleMs, SettleMsParseError, isStdoutSink } from './extract.js'

describe('parseSettleMs', () => {
  it('returns undefined when raw is undefined', () => {
    expect(parseSettleMs(undefined)).toBeUndefined()
  })

  it('accepts non-negative integer strings', () => {
    expect(parseSettleMs('0')).toBe(0)
    expect(parseSettleMs('1500')).toBe(1500)
    expect(parseSettleMs('  300  ')).toBe(300)
  })

  it('rejects floats — codex P3 (parseInt would silently truncate "1.5" to 1)', () => {
    expect(() => parseSettleMs('1.5')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('1.5')).toThrow(/non-negative integer.*1\.5/)
  })

  it('rejects strings with trailing units — codex P3 (parseInt would accept "1s" as 1)', () => {
    expect(() => parseSettleMs('1s')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('100abc')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('1500ms')).toThrow(SettleMsParseError)
  })

  it('rejects negatives', () => {
    expect(() => parseSettleMs('-100')).toThrow(SettleMsParseError)
  })

  it('rejects empty / whitespace-only', () => {
    expect(() => parseSettleMs('')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('   ')).toThrow(SettleMsParseError)
  })

  it('rejects non-decimal numerics', () => {
    expect(() => parseSettleMs('0x10')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('1e3')).toThrow(SettleMsParseError)
  })
})

describe('isStdoutSink', () => {
  it('matches the canonical stdout sink markers', () => {
    expect(isStdoutSink('-')).toBe(true)
    expect(isStdoutSink('-.json')).toBe(true)
    expect(isStdoutSink('-.md')).toBe(true)
    expect(isStdoutSink('-.markdown')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isStdoutSink('-.MD')).toBe(true)
    expect(isStdoutSink('-.MARKDOWN')).toBe(true)
  })

  it('returns false for file paths and unset', () => {
    expect(isStdoutSink(undefined)).toBe(false)
    expect(isStdoutSink('out.json')).toBe(false)
    expect(isStdoutSink('design.md')).toBe(false)
  })
})
