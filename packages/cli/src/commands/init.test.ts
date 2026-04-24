import { describe, it, expect } from 'vitest'
import { resolveInitMode } from './init.js'

describe('resolveInitMode', () => {
  const noSignals = { hasClaudeCode: false, hasApiKey: false }

  describe('explicit flags win over auto-detect', () => {
    it('--both returns both', () => {
      expect(resolveInitMode({ both: true }, { hasClaudeCode: true, hasApiKey: true })).toBe('both')
    })

    it('--skill-mode returns skill even when api key present', () => {
      expect(resolveInitMode({ skillMode: true }, { hasClaudeCode: false, hasApiKey: true })).toBe('skill')
    })

    it('--api-mode returns api even when claude code detected', () => {
      expect(resolveInitMode({ apiMode: true }, { hasClaudeCode: true, hasApiKey: false })).toBe('api')
    })

    it('conflicting flags: --both beats --skill-mode beats --api-mode', () => {
      expect(resolveInitMode({ both: true, skillMode: true, apiMode: true }, noSignals)).toBe('both')
      expect(resolveInitMode({ skillMode: true, apiMode: true }, noSignals)).toBe('skill')
    })
  })

  describe('auto-detect when no flag is given', () => {
    it('both signals present → both', () => {
      expect(resolveInitMode({}, { hasClaudeCode: true, hasApiKey: true })).toBe('both')
    })

    it('claude code only → skill', () => {
      expect(resolveInitMode({}, { hasClaudeCode: true, hasApiKey: false })).toBe('skill')
    })

    it('api key only → api', () => {
      expect(resolveInitMode({}, { hasClaudeCode: false, hasApiKey: true })).toBe('api')
    })

    it('neither signal → api (default to existing behavior)', () => {
      expect(resolveInitMode({}, noSignals)).toBe('api')
    })
  })
})
