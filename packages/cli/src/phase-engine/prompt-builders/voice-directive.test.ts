import { describe, it, expect } from 'vitest'
import { renderVoiceDirective } from './voice-directive.js'

describe('renderVoiceDirective', () => {
  it('returns empty string when voice is undefined', () => {
    expect(renderVoiceDirective(undefined)).toBe('')
  })

  it('returns empty string when voice is empty object', () => {
    expect(renderVoiceDirective({})).toBe('')
  })

  it('renders tone alone', () => {
    const out = renderVoiceDirective({ tone: 'confident-direct' })
    expect(out).toContain('## VOICE DIRECTIVE')
    expect(out).toContain('Tone: confident-direct')
  })

  it('renders ctaStyle alone', () => {
    const out = renderVoiceDirective({ ctaStyle: 'imperative-action' })
    expect(out).toContain('CTA style: imperative-action')
  })

  it('renders copyRules as bulleted list', () => {
    const out = renderVoiceDirective({
      copyRules: ['Plain English. No hedging.', 'Lead with the value.'],
    })
    expect(out).toContain('Copywriting rules (follow verbatim):')
    expect(out).toContain('• Plain English. No hedging.')
    expect(out).toContain('• Lead with the value.')
  })

  it('renders transparencyRules as bulleted list', () => {
    const out = renderVoiceDirective({
      transparencyRules: ['Show the cost upfront.', 'Quiet confidence over hype.'],
    })
    expect(out).toContain('Transparency / trust:')
    expect(out).toContain('• Show the cost upfront.')
    expect(out).toContain('• Quiet confidence over hype.')
  })

  it('renders avoidWords as quoted hard-ban list', () => {
    const out = renderVoiceDirective({
      avoidWords: ['amazing', 'revolutionary', 'delve'],
    })
    expect(out).toContain('Banned words/phrases (do NOT generate):')
    expect(out).toContain('"amazing"')
    expect(out).toContain('"revolutionary"')
    expect(out).toContain('"delve"')
  })

  it('renders all fields together', () => {
    const out = renderVoiceDirective({
      tone: 'confident-direct',
      ctaStyle: 'imperative-action',
      copyRules: ['Plain English'],
      avoidWords: ['amazing'],
      transparencyRules: ['Show cost upfront'],
    })
    expect(out).toContain('## VOICE DIRECTIVE')
    expect(out).toContain('Tone: confident-direct')
    expect(out).toContain('CTA style: imperative-action')
    expect(out).toContain('Plain English')
    expect(out).toContain('Show cost upfront')
    expect(out).toContain('"amazing"')
  })

  it('skips empty/whitespace-only fields', () => {
    const out = renderVoiceDirective({
      tone: '',
      ctaStyle: '   ',
      copyRules: [],
      avoidWords: [],
      transparencyRules: [],
    })
    expect(out).toBe('')
  })

  it('skips empty entries within array fields', () => {
    const out = renderVoiceDirective({
      copyRules: ['Real rule', '', '  ', 'Another rule'],
    })
    expect(out).toContain('• Real rule')
    expect(out).toContain('• Another rule')
    // No bullets for empty entries
    expect((out.match(/•/g) || []).length).toBe(2)
  })

  it('block ends with trailing newline (caller-friendly concat)', () => {
    const out = renderVoiceDirective({ tone: 'X' })
    expect(out.endsWith('\n')).toBe(true)
  })
})
