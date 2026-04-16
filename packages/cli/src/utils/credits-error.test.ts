import { describe, it, expect } from 'vitest'
import { classifyAIError } from './credits-error.js'

describe('classifyAIError', () => {
  it('detects credit balance exhaustion', () => {
    expect(classifyAIError(new Error('Your credit balance is too low to access the Anthropic API'))).toBe('credits')
  })

  it('detects insufficient credits wording', () => {
    expect(classifyAIError(new Error('insufficient credits'))).toBe('credits')
    expect(classifyAIError(new Error('insufficient_credits'))).toBe('credits')
  })

  it('detects quota exceeded', () => {
    expect(classifyAIError(new Error('quota exceeded'))).toBe('credits')
  })

  it('detects billing required', () => {
    expect(classifyAIError(new Error('billing required'))).toBe('credits')
  })

  it('detects rate limit errors', () => {
    expect(classifyAIError(new Error('rate limit reached'))).toBe('rate-limit')
    expect(classifyAIError(new Error('429 Too Many Requests'))).toBe('rate-limit')
    expect(classifyAIError(new Error('server overloaded'))).toBe('rate-limit')
  })

  it('returns other for unrelated errors', () => {
    expect(classifyAIError(new Error('connection refused'))).toBe('other')
    expect(classifyAIError(new Error('parse error'))).toBe('other')
  })

  it('handles non-Error inputs', () => {
    expect(classifyAIError('credit balance is too low')).toBe('credits')
    expect(classifyAIError(null)).toBe('other')
    expect(classifyAIError(undefined)).toBe('other')
  })
})
