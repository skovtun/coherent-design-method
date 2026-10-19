import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ open: null as { id: string } | null, rolledBack: [] as string[], undoFails: false }))

vi.mock('../governance/session.js', () => ({
  dsSync: vi.fn(async () => {
    state.open = { id: 'tx-sync' }
    return { session: { txId: 'tx-sync' }, assigned: [], page: 'src/app/design-system/page.tsx' }
  }),
  verifyEdit: vi.fn(async () => {
    throw new Error('render crashed')
  }),
  rollbackEdit: vi.fn((_root: string, o: { txId: string }) => {
    if (state.undoFails) throw new Error('disk full')
    state.rolledBack.push(o.txId)
    state.open = null
  }),
}))
vi.mock('../governance/transaction.js', () => ({ openTransaction: () => state.open }))

import { dsSyncCommand } from './ds-sync.js'

describe('coherent ds sync', () => {
  beforeEach(() => {
    state.open = null
    state.rolledBack = []
    state.undoFails = false
    process.exitCode = undefined
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('rolls back the sync it opened when verification throws', async () => {
    await dsSyncCommand({ dir: '/tmp/x' })
    expect(state.rolledBack).toEqual(['tx-sync'])
    expect(process.exitCode).toBe(1)
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toMatch(/render crashed[\s\S]*rolled back/)
  })

  it('keeps the original error and exits nonzero when the rollback fails too', async () => {
    state.undoFails = true
    await dsSyncCommand({ dir: '/tmp/x' })
    expect(process.exitCode).toBe(1)
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toMatch(/render crashed[\s\S]*disk full/)
    process.exitCode = undefined
  })
})
