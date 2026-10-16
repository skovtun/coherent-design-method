/**
 * PJ-025 — one failing request must not abort the rest of the batch.
 */
import { describe, it, expect, vi } from 'vitest'
import type { ModificationRequest } from '@getcoherent/core'
import { CoherentError } from '../../errors/CoherentError.js'
import type { ApplyRequestsContext } from '../types.js'

vi.mock('../dispatch.js', () => ({
  isDeterministic: () => true,
  dispatchDeterministic: vi.fn(async (req: ModificationRequest) => {
    if (req.target === 'bad') throw new Error('pages.8.route: Must be a valid route\nmore detail')
    if (req.target === 'contract') throw new CoherentError({ code: 'COHERENT_E007', message: 'contract', fix: 'n/a' })
    return { success: true, message: `ok ${req.target}`, modified: [req.target] }
  }),
}))

const { applyRequests } = await import('../index.js')
const ctx = {} as ApplyRequestsContext
const req = (target: string) => ({ type: 'add-page', target, changes: {} }) as unknown as ModificationRequest

describe('applyRequests — failure isolation (PJ-025)', () => {
  it('records a thrown request as failed and applies the ones after it', async () => {
    const results = await applyRequests([req('a'), req('bad'), req('c')], ctx, 'with-ai')
    expect(results.map(r => r.success)).toEqual([true, false, true])
    expect(results[1].message).toContain('Must be a valid route')
    expect(results[1].message).not.toContain('more detail')
  })

  it('still propagates typed CoherentErrors', async () => {
    await expect(applyRequests([req('contract')], ctx, 'with-ai')).rejects.toBeInstanceOf(CoherentError)
  })
})
