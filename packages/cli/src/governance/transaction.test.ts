import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  beginTransaction,
  commitTransaction,
  hashTree,
  listTransactions,
  loadTransaction,
  normalizeRelPath,
  openTransaction,
  rollbackTransaction,
  safeRelPath,
} from './transaction.js'

let root: string
const write = (p: string, c: string) => {
  mkdirSync(join(root, p, '..'), { recursive: true })
  writeFileSync(join(root, p), c)
}
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ctx-'))
  write('src/a.tsx', 'A')
  write('src/b.tsx', 'B')
  write('node_modules/x/index.js', 'vendor')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('transactions', () => {
  it('records created, modified and deleted files on commit', () => {
    const tx = beginTransaction(root, 'edit', ['src/a.tsx', 'src/b.tsx', 'src/new/c.tsx'])
    write('src/a.tsx', 'A2')
    rmSync(join(root, 'src/b.tsx'))
    write('src/new/c.tsx', 'C')
    const done = commitTransaction(root, tx, 'verified')
    expect(done.changes).toEqual({ created: ['src/new/c.tsx'], modified: ['src/a.tsx'], deleted: ['src/b.tsx'] })
    expect(done.status).toBe('committed')
    expect(done.verdict).toBe('verified')
    expect(listTransactions(root)).toEqual([tx.id])
  })

  it('rolls back byte-for-byte, removing created files and their empty dirs', () => {
    const before = hashTree(root)
    const tx = beginTransaction(root, 'edit', ['src/a.tsx', 'src/b.tsx', 'src/new/deep/c.tsx'])
    write('src/a.tsx', 'A2')
    rmSync(join(root, 'src/b.tsx'))
    write('src/new/deep/c.tsx', 'C')
    commitTransaction(root, tx)
    rollbackTransaction(root, tx.id)
    expect(hashTree(root)).toEqual(before)
    expect(existsSync(join(root, 'src/new'))).toBe(false)
    expect(read('src/a.tsx')).toBe('A')
    expect(loadTransaction(root, tx.id).status).toBe('rolled_back')
    expect(listTransactions(root, { active: true })).toEqual([])
    expect(() => rollbackTransaction(root, tx.id)).toThrow(/already rolled back/)
  })

  it('rolls back an open (crashed) transaction without touching edits outside its write set', () => {
    const tx = beginTransaction(root, 'crash', ['src/a.tsx', 'src/new.tsx'])
    write('src/a.tsx', 'half-written')
    write('src/new.tsx', 'partial')
    // Meanwhile the user edits another file in their IDE.
    write('src/b.tsx', 'B from the IDE')
    write('src/notes.md', 'mine')
    const res = rollbackTransaction(root, tx.id)
    expect(read('src/a.tsx')).toBe('A')
    expect(existsSync(join(root, 'src/new.tsx'))).toBe(false)
    expect(read('src/b.tsx')).toBe('B from the IDE')
    expect(read('src/notes.md')).toBe('mine')
    expect(res.untouched.sort()).toEqual(['src/b.tsx', 'src/notes.md'])
  })

  it('allows one open transaction per project and survives a restart', () => {
    const tx = beginTransaction(root, 'first', ['src/a.tsx'])
    expect(() => beginTransaction(root, 'second', ['src/b.tsx'])).toThrow(/still open/)
    // A new process finds it from disk.
    expect(openTransaction(root)?.allowed).toEqual(['src/a.tsx'])
    commitTransaction(root, tx)
    expect(openTransaction(root)).toBeNull()
    expect(() => commitTransaction(root, tx)).toThrow(/not open/)
    beginTransaction(root, 'second', ['src/b.tsx'])
  })

  it('undoes an edit under later disjoint edits, refuses when its own files changed since', () => {
    const t1 = beginTransaction(root, 'first', ['src/a.tsx'])
    write('src/a.tsx', 'A2')
    commitTransaction(root, t1)
    const t2 = beginTransaction(root, 'second', ['src/b.tsx'])
    write('src/b.tsx', 'B2')
    commitTransaction(root, t2)
    const t3 = beginTransaction(root, 'third', ['src/a.tsx'])
    write('src/a.tsx', 'A3')
    commitTransaction(root, t3)
    expect(() => rollbackTransaction(root, t1.id)).toThrow(/changed after it/)
    rollbackTransaction(root, t3.id)
    rollbackTransaction(root, t1.id)
    expect(read('src/a.tsx')).toBe('A')
    expect(read('src/b.tsx')).toBe('B2')
  })

  it('does not count compiler/framework artifacts as edit changes', () => {
    const tx = beginTransaction(root, 'build', ['src/a.tsx'])
    write('tsconfig.tsbuildinfo', '{}')
    write('next-env.d.ts', '/// ref')
    expect(commitTransaction(root, tx).changes).toEqual({ created: [], modified: [], deleted: [] })
  })

  it('ignores vendor directories', () => {
    const tx = beginTransaction(root, 'v', ['src/a.tsx'])
    write('node_modules/x/index.js', 'changed')
    expect(commitTransaction(root, tx).changes).toEqual({ created: [], modified: [], deleted: [] })
  })

  it('never copies secrets into the snapshot and keeps snapshots out of git', () => {
    write('.env.local', 'API_KEY=sk-secret')
    const tx = beginTransaction(root, 'env', ['.env.local'])
    expect(tx.unsaved).toEqual(['.env.local'])
    expect(existsSync(join(root, '.coherent/tx', tx.id, 'files/.env.local'))).toBe(false)
    expect(read('.coherent/tx/.gitignore')).toBe('*\n')
    write('.env.local', 'API_KEY=changed')
    commitTransaction(root, tx)
    expect(rollbackTransaction(root, tx.id).unrestorable).toEqual(['.env.local'])
  })
})

describe('agent state', () => {
  it('is not part of the app: tools writing it mid-edit change nothing', () => {
    const before = hashTree(root)
    write('.claude/settings.local.json', '{}')
    write('.gstack/claude-available.json', '{}')
    write('.cursor/state.json', '{}')
    expect(hashTree(root)).toEqual(before)
  })
})

describe('path safety', () => {
  it('rejects paths outside the project or inside tool dirs', () => {
    for (const p of [
      '../x.tsx',
      'src/../../x.tsx',
      '/etc/passwd',
      'C:/x.tsx',
      'node_modules/a.js',
      '.git/config',
      '.claude/settings.local.json',
      '',
    ])
      expect(() => normalizeRelPath(p), p).toThrow(/Unsafe path/)
    expect(normalizeRelPath('src/./a.tsx')).toBe('src/a.tsx')
    expect(normalizeRelPath('src\\b.tsx')).toBe('src/b.tsx')
  })

  it('rejects writes through a symlink that leads outside the project', () => {
    const outside = mkdtempSync(join(tmpdir(), 'ctx-out-'))
    try {
      symlinkSync(outside, join(root, 'src', 'linked'))
      expect(() => safeRelPath(root, 'src/linked/x.tsx')).toThrow(/symlink/)
      expect(() => beginTransaction(root, 'esc', ['src/linked/x.tsx'])).toThrow(/symlink/)
      expect(safeRelPath(root, 'src/new/dir/x.tsx')).toBe('src/new/dir/x.tsx')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
