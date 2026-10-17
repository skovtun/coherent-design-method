import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const vis = vi.hoisted(() => ({ diff: 0.1 }))

// Fake compiler: one error per line containing BROKEN, positioned like tsc output.
vi.mock('../governance/verify.js', async orig => {
  const fs = await import('fs')
  const path = await import('path')
  return {
    ...(await orig<typeof import('../governance/verify.js')>()),
    // Rendering is faked: each shot "differs" by vis.diff.
    shotsForTree: async (_r: string, key: string, targets: { route: string }[]) =>
      targets.flatMap(t => ['desktop', 'mobile'].map(viewport => ({ route: t.route, viewport, path: key }))),
    diffMany: async (pairs: unknown[]) => pairs.map(() => vis.diff),
    typecheck: (root: string) => {
      const errors: string[] = []
      for (const f of ['src/app/page.tsx', 'src/lib/old.ts']) {
        const p = path.join(root, f)
        if (!fs.existsSync(p)) continue
        fs.readFileSync(p, 'utf-8')
          .split('\n')
          .forEach((l, i) => {
            if (l.includes('BROKEN')) errors.push(`${f}(${i + 1},1): error TS2304: Cannot find name 'BROKEN'.`)
          })
      }
      return { ok: !errors.length, errors }
    },
  }
})
vi.mock('../governance/privacy.js', async orig => {
  const real = await orig<typeof import('../governance/privacy.js')>()
  return {
    ...real,
    scanLeaks: (g: Parameters<typeof real.scanLeaks>[0]) =>
      real.scanLeaks(g, [{ kind: 'email', value: 'ada@example.dev', severity: 'error' }]),
  }
})

import { introducedLeaksOf, newTypeErrors, runEdit } from './edit.js'
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
    const r = await runEdit(
      'x',
      opts(),
      llm(
        plan([PAGE], ['src/components/new.tsx']),
        files({ [PAGE]: 'BROKEN', 'src/components/new.tsx': 'x' }),
        files({ [PAGE]: 'still BROKEN', 'src/components/new.tsx': 'x' }),
      ),
    )
    expect(r!.verdict).toBe('failed')
    expect(r!.rolledBack).toBe(true)
    expect(hashTree(root)).toEqual(before)
    expect(listTransactions(root, { active: true })).toEqual([])
  })

  it('keeps a failed edit with --keep', async () => {
    const r = await runEdit(
      'x',
      opts({ keep: true }),
      llm(plan([PAGE]), files({ [PAGE]: 'BROKEN a' }), files({ [PAGE]: 'BROKEN b' })),
    )
    expect(r!.verdict).toBe('failed')
    expect(r!.rolledBack).toBe(false)
    expect(readFileSync(join(root, PAGE), 'utf-8')).toBe('BROKEN b\n')
  })

  it('does not blame the edit for type errors that were already there', async () => {
    write('src/lib/old.ts', 'export const x = BROKEN\n')
    const r = await runEdit('x', opts(), llm(plan([PAGE]), files({ [PAGE]: 'export default () => <h1>Hey</h1>' })))
    expect(r!.typecheck).toMatchObject({ ok: true, errors: [], baselineErrors: 1 })
    expect(r!.verdict).toBe('blocked_by_preexisting_failure')
  })

  it('tracks a planned file even when git ignores it, so undo restores it', async () => {
    const { execFileSync } = await import('child_process')
    execFileSync('git', ['init', '-q'], { cwd: root })
    write('.gitignore', 'src/generated/\n')
    write('src/generated/tokens.css', ':root{--a:1}\n')
    const before = hashTree(root, ['src/generated/tokens.css'])
    const r = await runEdit(
      'x',
      opts(),
      llm(plan(['src/generated/tokens.css']), files({ 'src/generated/tokens.css': ':root{--a:2}' })),
    )
    expect(r!.changes.modified).toEqual(['src/generated/tokens.css'])
    const { rollbackTransaction } = await import('../governance/transaction.js')
    rollbackTransaction(root, r!.txId)
    expect(hashTree(root, ['src/generated/tokens.css'])).toEqual(before)
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

describe('introducedLeaksOf', () => {
  const leak = (file: string, line: number, excerpt: string) => ({
    file,
    line,
    excerpt,
    identity: { kind: 'email' as const, value: 'ada@example.dev', severity: 'error' as const },
  })
  it('counts occurrences, so restyling a line that already had the identity is not a new leak', () => {
    const before = [leak('a.tsx', 3, '<p>ada@example.dev</p>')]
    const restyled = [leak('a.tsx', 5, '<p className="x">ada@example.dev</p>')]
    expect(introducedLeaksOf(before, restyled, new Set(['a.tsx']))).toEqual([])
    const added = [...restyled, leak('a.tsx', 9, 'ada@example.dev')]
    expect(introducedLeaksOf(before, added, new Set(['a.tsx']))).toHaveLength(1)
    expect(introducedLeaksOf([], added, new Set(['b.tsx']))).toEqual([])
  })
})

describe('newTypeErrors', () => {
  it('ignores baseline errors whose position moved, keeps new ones', () => {
    const base = ["a.ts(3,1): error TS2304: Cannot find name 'X'."]
    const after = ["a.ts(7,1): error TS2304: Cannot find name 'X'.", 'b.ts(1,1): error TS2322: bad']
    expect(newTypeErrors(base, after)).toEqual(['b.ts(1,1): error TS2322: bad'])
  })
})

describe('verified means every affected route was rendered', () => {
  beforeEach(() => {
    write('src/components/card.tsx', 'export function Card() {\n  return <div />\n}\n')
    write(PAGE, "import { Card } from '../components/card'\nexport default function P() {\n  return <Card />\n}\n")
    write(
      'src/app/items/[id]/page.tsx',
      "import { Card } from '../../../components/card'\nexport default function I() {\n  return <Card />\n}\n",
    )
    vis.diff = 0.1
  })
  const edit = (file: string) =>
    runEdit(
      'x',
      { dir: root, yes: true },
      llm(
        JSON.stringify({ scope: 'component', modify: [file], create: [], rationale: 'r' }),
        files({ [file]: 'export function Card() {\n  return <span />\n}' }),
      ),
    )

  it('is partial when an affected dynamic route had no preview params', async () => {
    const r = await edit('src/components/card.tsx')
    expect(r!.unverifiedRoutes).toEqual(['/items/[id]'])
    expect(r!.verdict).toBe('partially_verified')
  })

  it('is verified once every affected route is rendered and the edit lands', async () => {
    write('.coherent/preview-params.json', '{"/items/[id]": "/items/1"}')
    const r = await edit('src/components/card.tsx')
    expect(r!.unverifiedRoutes).toEqual([])
    expect(r!.verdict).toBe('verified')
  })

  it('fails when nothing visibly changed', async () => {
    write('.coherent/preview-params.json', '{"/items/[id]": "/items/1"}')
    vis.diff = 0
    const r = await edit('src/components/card.tsx')
    expect(r!.landed).toBe(false)
    expect(r!.verdict).toBe('failed')
  })
})
