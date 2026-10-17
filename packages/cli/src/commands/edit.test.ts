import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const tc = vi.hoisted(() => ({ ok: true }))
vi.mock('../governance/verify.js', async orig => ({
  ...(await orig<typeof import('../governance/verify.js')>()),
  typecheck: () => (tc.ok ? { ok: true, errors: [] } : { ok: false, errors: ['a.tsx(1,1): error TS2304: x'] }),
}))
vi.mock('../governance/privacy.js', async orig => {
  const real = await orig<typeof import('../governance/privacy.js')>()
  return {
    ...real,
    scanLeaks: (g: Parameters<typeof real.scanLeaks>[0]) =>
      real.scanLeaks(g, [{ kind: 'email', value: 'ada@example.dev', severity: 'error' }]),
  }
})

import { runEdit } from './edit.js'
import { hashTree, listTransactions, loadTransaction } from '../governance/transaction.js'

let root: string
const write = (p: string, c: string) => {
  mkdirSync(join(root, p, '..'), { recursive: true })
  writeFileSync(join(root, p), c)
}
const PAGE = 'src/app/page.tsx'
const plan = (modify: string[], create: string[] = []) =>
  JSON.stringify({ scope: 'page', modify, create, rationale: 'r' })
const files = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([p, c]) => `<file path="${p}">\n${c}\n</file>`)
    .join('\n')
const llm = (...replies: string[]) => {
  const q = [...replies]
  return async () => q.shift() ?? ''
}
const quiet = () => vi.spyOn(console, 'log').mockImplementation(() => {})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cedit-'))
  write('tsconfig.json', '{"compilerOptions":{"jsx":"preserve"}}')
  write(PAGE, 'export default function P() {\n  return <h1>Hi</h1>\n}\n')
  tc.ok = true
  quiet()
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const opts = (o: object = {}) => ({ dir: root, yes: true, visual: false, ...o })

describe('runEdit', () => {
  it('never reports an edit without a rendered check as verified', async () => {
    const r = await runEdit('x', opts(), llm(plan([PAGE]), files({ [PAGE]: 'export default () => <h1>Hey</h1>' })))
    expect(r!.verdict).toBe('verified_without_visual')
    expect(r!.ok).toBe(false)
    expect(loadTransaction(root, r!.txId).status).toBe('committed')
  })

  it('rolls back an edit that fails verification, leaving the project byte-identical', async () => {
    const before = hashTree(root)
    tc.ok = false
    const r = await runEdit(
      'x',
      opts(),
      llm(
        plan([PAGE], ['src/components/new.tsx']),
        files({ [PAGE]: 'broken', 'src/components/new.tsx': 'x' }),
        files({ [PAGE]: 'still broken', 'src/components/new.tsx': 'x' }),
      ),
    )
    expect(r!.verdict).toBe('failed')
    expect(r!.rolledBack).toBe(true)
    expect(hashTree(root)).toEqual(before)
    expect(listTransactions(root, { active: true })).toEqual([])
  })

  it('keeps a failed edit with --keep', async () => {
    tc.ok = false
    const r = await runEdit(
      'x',
      opts({ keep: true }),
      llm(plan([PAGE]), files({ [PAGE]: 'a' }), files({ [PAGE]: 'b' })),
    )
    expect(r!.verdict).toBe('failed')
    expect(r!.rolledBack).toBe(false)
    expect(readFileSync(join(root, PAGE), 'utf-8')).toBe('b\n')
  })

  it('fails an edit that introduces an identity leak, but not for leaks already there', async () => {
    const leaky = 'export default () => <input defaultValue="ada@example.dev" />'
    const r = await runEdit('x', opts(), llm(plan([PAGE]), files({ [PAGE]: leaky })))
    expect(r!.introducedLeaks.map(l => l.file)).toEqual([PAGE])
    expect(r!.verdict).toBe('failed')

    write(PAGE, leaky + '\n')
    const r2 = await runEdit('x', opts(), llm(plan([PAGE]), files({ [PAGE]: leaky + '\nexport const n = 1' })))
    expect(r2!.introducedLeaks).toEqual([])
    expect(r2!.verdict).toBe('verified_without_visual')
  })

  it('leaves the project untouched when the model writes outside the plan', async () => {
    const before = hashTree(root)
    await expect(
      runEdit('x', opts(), llm(plan([PAGE]), files({ [PAGE]: 'a', 'src/app/other.tsx': 'sneaky' }))),
    ).rejects.toThrow(/outside the plan/)
    expect(hashTree(root)).toEqual(before)
    expect(listTransactions(root, { active: true })).toEqual([])
  })
})
