import { describe, it, expect } from 'vitest'
import { PHASE_ENGINE_PROTOCOL, resolvePhase, SINGLE_FACTORY_NAMES } from '../phase-registry.js'

describe('resolvePhase', () => {
  it('resolves each single-factory phase to an instance with the right kind', () => {
    const expected: Record<string, 'ai' | 'deterministic'> = {
      plan: 'ai',
      anchor: 'ai',
      components: 'ai',
      'extract-style': 'deterministic',
      'log-run': 'deterministic',
    }
    for (const name of SINGLE_FACTORY_NAMES) {
      const phase = resolvePhase(name)
      expect(phase.name, name).toBeTruthy()
      expect(phase.kind, name).toBe(expected[name])
    }
  })

  it('resolves page:<pageId> via the page factory', () => {
    const phase = resolvePhase('page:pricing')
    expect(phase.kind).toBe('ai')
    expect(phase.name).toBe('page:pricing')
  })

  it('rejects page: without a pageId', () => {
    expect(() => resolvePhase('page:')).toThrow(/requires a pageId/)
  })

  it('rejects unknown names with a known-name hint', () => {
    expect(() => resolvePhase('nope')).toThrow(/Unknown phase.*"nope".*Known:/)
  })
})

describe('PHASE_ENGINE_PROTOCOL', () => {
  it('is an integer ≥ 1', () => {
    expect(Number.isInteger(PHASE_ENGINE_PROTOCOL)).toBe(true)
    expect(PHASE_ENGINE_PROTOCOL).toBeGreaterThanOrEqual(1)
  })
})
