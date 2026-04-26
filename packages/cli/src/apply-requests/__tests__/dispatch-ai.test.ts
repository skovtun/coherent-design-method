/**
 * dispatch-ai.ts — unit tests for the AI-case wrapper + applyMode gate.
 *
 * Covers the two contracts this commit delivers:
 *   1. isAi / isAiCasePrepopulated correctly classify the 5 AI types
 *   2. dispatchAi enforces applyMode: 'no-new-ai' by throwing E007 when
 *      an AI-dependent request arrives without pre-populated output
 *
 * NOT covered here: the actual AI generation paths (add-page with code,
 * update-page with code, etc.). Those go through legacy applyModification
 * which has its own thousands of lines of test coverage. We just gate
 * the entry — the bodies move in PR1 #10.
 */

import { describe, expect, it } from 'vitest'
import type { ModificationRequest } from '@getcoherent/core'
import { CoherentError } from '../../errors/CoherentError.js'
import { dispatchAi, isAi, isAiCasePrepopulated } from '../dispatch-ai.js'
import type { ApplyRequestsContext } from '../types.js'

describe('isAi', () => {
  it('returns true for the 5 AI-dependent types', () => {
    const types: ModificationRequest['type'][] = [
      'modify-layout-block',
      'link-shared',
      'promote-and-link',
      'add-page',
      'update-page',
    ]
    for (const type of types) {
      expect(isAi({ type, target: 'x', changes: {} } as ModificationRequest)).toBe(true)
    }
  })

  it('returns false for the 6 deterministic types (symmetric with isDeterministic)', () => {
    const types: ModificationRequest['type'][] = [
      'update-token',
      'add-component',
      'modify-component',
      'update-navigation',
      'delete-page',
      'delete-component',
    ]
    for (const type of types) {
      expect(isAi({ type, target: 'x', changes: {} } as ModificationRequest)).toBe(false)
    }
  })
})

describe('isAiCasePrepopulated', () => {
  it('add-page with non-empty pageCode is pre-populated', () => {
    const req: ModificationRequest = {
      type: 'add-page',
      target: 'pricing',
      changes: { pageCode: 'export default function P(){return null}' },
    }
    expect(isAiCasePrepopulated(req)).toBe(true)
  })

  it('add-page without pageCode is NOT pre-populated', () => {
    const req: ModificationRequest = {
      type: 'add-page',
      target: 'pricing',
      changes: { name: 'Pricing', route: '/pricing' },
    }
    expect(isAiCasePrepopulated(req)).toBe(false)
  })

  it('add-page with empty/whitespace pageCode is NOT pre-populated', () => {
    const req: ModificationRequest = {
      type: 'add-page',
      target: 'pricing',
      changes: { pageCode: '   \n   ' },
    }
    expect(isAiCasePrepopulated(req)).toBe(false)
  })

  it('update-page with non-empty pageCode is pre-populated', () => {
    const req: ModificationRequest = {
      type: 'update-page',
      target: 'home',
      changes: { pageCode: 'export default function H(){return null}' },
    }
    expect(isAiCasePrepopulated(req)).toBe(true)
  })

  it('modify-layout-block with non-empty layoutBlock is pre-populated', () => {
    const req: ModificationRequest = {
      type: 'modify-layout-block',
      target: 'header',
      changes: { layoutBlock: '<header>...</header>' },
    }
    expect(isAiCasePrepopulated(req)).toBe(true)
  })

  it('link-shared is NEVER pre-populatable (always needs AI)', () => {
    const req: ModificationRequest = {
      type: 'link-shared',
      target: 'home',
      changes: { componentId: 'CID-001' },
    }
    expect(isAiCasePrepopulated(req)).toBe(false)
  })

  it('promote-and-link is NEVER pre-populatable (always needs AI)', () => {
    const req: ModificationRequest = {
      type: 'promote-and-link',
      target: 'home',
      changes: { componentName: 'Hero' },
    }
    expect(isAiCasePrepopulated(req)).toBe(false)
  })
})

describe('dispatchAi — applyMode contract', () => {
  // Minimal stub context — real DSM/CM/PM unnecessary because the gate
  // throws BEFORE delegation, and tests for the AI bodies live elsewhere.
  const stubCtx = { projectRoot: '/tmp/stub' } as unknown as ApplyRequestsContext

  it('returns null for deterministic types (caller hands off to dispatchDeterministic)', async () => {
    const req: ModificationRequest = { type: 'update-token', target: 'x', changes: {} }
    const result = await dispatchAi(req, stubCtx, 'with-ai')
    expect(result).toBeNull()
  })

  describe("applyMode: 'no-new-ai' (skill rail)", () => {
    it('throws E007 for add-page without pageCode', async () => {
      const req: ModificationRequest = {
        type: 'add-page',
        target: 'pricing',
        changes: { name: 'Pricing', route: '/pricing' },
      }
      await expect(dispatchAi(req, stubCtx, 'no-new-ai')).rejects.toThrow(CoherentError)
      await expect(dispatchAi(req, stubCtx, 'no-new-ai')).rejects.toThrow(/no-new-ai.*add-page.*pre-populated/i)
    })

    it('throws E007 for update-page without pageCode', async () => {
      const req: ModificationRequest = {
        type: 'update-page',
        target: 'home',
        changes: { description: 'updated' },
      }
      await expect(dispatchAi(req, stubCtx, 'no-new-ai')).rejects.toThrow(CoherentError)
    })

    it('throws E007 for modify-layout-block without layoutBlock', async () => {
      const req: ModificationRequest = {
        type: 'modify-layout-block',
        target: 'header',
        changes: { instruction: 'add a search box' },
      }
      await expect(dispatchAi(req, stubCtx, 'no-new-ai')).rejects.toThrow(CoherentError)
    })

    it('throws E007 for link-shared (never pre-populatable)', async () => {
      const req: ModificationRequest = {
        type: 'link-shared',
        target: 'home',
        changes: { componentId: 'CID-001' },
      }
      await expect(dispatchAi(req, stubCtx, 'no-new-ai')).rejects.toThrow(CoherentError)
    })

    it('throws E007 for promote-and-link (never pre-populatable)', async () => {
      const req: ModificationRequest = {
        type: 'promote-and-link',
        target: 'home',
        changes: { componentName: 'Hero' },
      }
      await expect(dispatchAi(req, stubCtx, 'no-new-ai')).rejects.toThrow(CoherentError)
    })

    it('the thrown CoherentError carries E007 code with usable fix text', async () => {
      const req: ModificationRequest = { type: 'add-page', target: 'x', changes: {} }
      try {
        await dispatchAi(req, stubCtx, 'no-new-ai')
        expect.fail('expected throw')
      } catch (err) {
        expect(err).toBeInstanceOf(CoherentError)
        const ce = err as CoherentError
        expect(ce.code).toBe('COHERENT_E007')
        expect(ce.fix).toMatch(/skill rail|with-ai|producer/i)
        expect(ce.docsUrl).toMatch(/E007$/)
      }
    })
  })

  describe("applyMode: 'with-ai' (API rail)", () => {
    // For with-ai mode the gate is a no-op. We can't easily test the
    // delegation path without spinning up a real AI provider — that's
    // covered transitively by the existing applyModification test suite.
    // What we CAN pin here: the gate does NOT throw, regardless of pre-
    // population state.
    it('does NOT throw for non-pre-populated add-page (gate is no-op)', () => {
      const req: ModificationRequest = { type: 'add-page', target: 'x', changes: {} }
      // We expect the call to attempt delegation — which will fail because
      // stubCtx is missing dsm/cm/pm. What we're asserting is that the
      // failure is NOT a CoherentError E007 (which would mean the gate
      // tripped). Any other failure mode means the gate let it through.
      return dispatchAi(req, stubCtx, 'with-ai')
        .then(() => {
          // Delegation might also resolve (unlikely with stub) — also fine.
        })
        .catch(err => {
          if (err instanceof CoherentError) {
            expect(err.code).not.toBe('COHERENT_E007')
          }
          // Any other error is fine — proves gate let it through to delegation.
        })
    })
  })
})
