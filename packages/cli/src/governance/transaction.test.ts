import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beginTransaction, commitTransaction, hashTree, rollbackTransaction, listTransactions } from './transaction.js'

let root: string
const write = (p: string, c: string) => {
  mkdirSync(join(root, p, '..'), { recursive: true })
  writeFileSync(join(root, p), c)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ctx-'))
  write('src/a.tsx', 'A')
  write('src/b.tsx', 'B')
  write('node_modules/x/index.js', 'vendor')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('transactions', () => {
  it('records created, modified and deleted files on commit', () => {
    const tx = beginTransaction(root, 'edit')
    write('src/a.tsx', 'A2')
    rmSync(join(root, 'src/b.tsx'))
    write('src/new/c.tsx', 'C')
    const done = commitTransaction(root, tx)
    expect(done.changes).toEqual({ created: ['src/new/c.tsx'], modified: ['src/a.tsx'], deleted: ['src/b.tsx'] })
    expect(listTransactions(root)).toEqual([tx.id])
  })

  it('rolls back byte-for-byte, removing created files and their empty dirs', () => {
    const before = hashTree(root)
    const tx = beginTransaction(root, 'edit')
    write('src/a.tsx', 'A2')
    rmSync(join(root, 'src/b.tsx'))
    write('src/new/deep/c.tsx', 'C')
    commitTransaction(root, tx)
    rollbackTransaction(root, tx.id)
    expect(hashTree(root)).toEqual(before)
    expect(existsSync(join(root, 'src/new'))).toBe(false)
    expect(readFileSync(join(root, 'src/a.tsx'), 'utf-8')).toBe('A')
  })

  it('rolls back an uncommitted (crashed) transaction', () => {
    const before = hashTree(root)
    const tx = beginTransaction(root, 'crash')
    write('src/a.tsx', 'half-written')
    rollbackTransaction(root, tx.id)
    expect(hashTree(root)).toEqual(before)
  })

  it('refuses to undo an edit that later changes sit on top of, unless forced', () => {
    const t1 = beginTransaction(root, 'first')
    write('src/a.tsx', 'A2')
    commitTransaction(root, t1)
    const t2 = beginTransaction(root, 'second')
    write('src/b.tsx', 'B2')
    commitTransaction(root, t2)
    expect(() => rollbackTransaction(root, t1.id)).toThrow(/changed after edit/)
    rollbackTransaction(root, t2.id)
    rollbackTransaction(root, t1.id)
    expect(readFileSync(join(root, 'src/a.tsx'), 'utf-8')).toBe('A')
  })

  it('does not count compiler/framework artifacts as edit changes', () => {
    const tx = beginTransaction(root, 'build')
    write('tsconfig.tsbuildinfo', '{}')
    write('next-env.d.ts', '/// ref')
    expect(commitTransaction(root, tx).changes).toEqual({ created: [], modified: [], deleted: [] })
  })

  it('ignores vendor directories', () => {
    const tx = beginTransaction(root, 'v')
    write('node_modules/x/index.js', 'changed')
    expect(commitTransaction(root, tx).changes).toEqual({ created: [], modified: [], deleted: [] })
  })
})
