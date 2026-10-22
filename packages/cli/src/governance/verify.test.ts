import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { copyRoot, nextMajor, previewDir, shotName, sourceTypeErrors } from './verify.js'

describe('shotName', () => {
  it('keeps routes that slug alike apart', () => {
    expect(shotName('/foo-bar', 'desktop')).not.toBe(shotName('/foo/bar', 'desktop'))
    expect(shotName('/', 'mobile')).toMatch(/^root-[0-9a-f]{8}-mobile\.png$/)
  })
})

describe('sourceTypeErrors', () => {
  it('drops stale Next.js route types under .next/, keeps source errors', () => {
    const out = [
      ".next/types/validator.ts(302,39): error TS2307: Cannot find module '../../src/app/x/page.js'",
      ".next/dev/types/validator.ts(311,69): error TS2344: Type 'X' does not satisfy the constraint 'never'.",
      "src/app/page.tsx(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      'Found 3 errors.',
    ].join('\n')
    expect(sourceTypeErrors(out)).toEqual([
      "src/app/page.tsx(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    ])
  })
})

describe('previewDir', () => {
  const made: string[] = []
  afterEach(() => made.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })))
  const app = (nextVersion: string) => {
    const root = mkdtempSync(join(tmpdir(), 'coh-pv-'))
    made.push(root)
    mkdirSync(join(root, 'node_modules', 'next'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'next', 'package.json'), JSON.stringify({ version: nextVersion }))
    for (const d of ['app', '.next/server', '.git', '.coherent/tx']) mkdirSync(join(root, d), { recursive: true })
    writeFileSync(join(root, 'app', 'page.tsx'), 'export default () => null')
    writeFileSync(join(root, '.next', 'server', 'x.js'), 'dev output')
    writeFileSync(join(root, 'package.json'), '{}')
    return root
  }

  it('builds Next 15 in a copy with node_modules linked, leaving the dev server .next alone', () => {
    const root = app('15.5.2')
    expect(nextMajor(root)).toBe(15)
    const p = previewDir(root)
    try {
      expect(p.isolated).toBe(true)
      expect(p.dir).not.toBe(root)
      expect(readFileSync(join(p.dir, 'app', 'page.tsx'), 'utf-8')).toContain('export default')
      expect(existsSync(join(p.dir, '.next'))).toBe(false)
      expect(existsSync(join(p.dir, '.git'))).toBe(false)
      expect(existsSync(join(p.dir, '.coherent'))).toBe(false)
      expect(lstatSync(join(p.dir, 'node_modules')).isSymbolicLink()).toBe(true)
    } finally {
      p.cleanup()
    }
    expect(existsSync(p.dir)).toBe(false)
    expect(readFileSync(join(root, '.next', 'server', 'x.js'), 'utf-8')).toBe('dev output')
  })

  it('builds Next 16 in place (dev output lives in .next/dev; Turbopack rejects an outside node_modules)', () => {
    const root = app('16.0.1')
    const p = previewDir(root)
    expect(p).toMatchObject({ dir: root, isolated: false })
  })

  it('copies the whole workspace for a monorepo app, keeping its path and linking every node_modules', () => {
    const ws = mkdtempSync(join(tmpdir(), 'coh-ws-'))
    made.push(ws)
    writeFileSync(join(ws, 'pnpm-workspace.yaml'), 'packages: [apps/*, packages/*]')
    mkdirSync(join(ws, 'node_modules', 'next'), { recursive: true })
    writeFileSync(join(ws, 'node_modules', 'next', 'package.json'), JSON.stringify({ version: '15.0.0' }))
    const web = join(ws, 'apps', 'web')
    mkdirSync(join(web, 'node_modules', '@ui'), { recursive: true })
    mkdirSync(join(web, '.next'), { recursive: true })
    writeFileSync(join(web, 'package.json'), '{}')
    mkdirSync(join(ws, 'packages', 'ui'), { recursive: true })
    writeFileSync(join(ws, 'packages', 'ui', 'index.ts'), 'export const x = 1')
    expect(copyRoot(web)).toBe(ws)
    const p = previewDir(web)
    try {
      expect(p.isolated).toBe(true)
      expect(p.dir.endsWith(join('apps', 'web'))).toBe(true)
      expect(readFileSync(join(p.dir, '..', '..', 'packages', 'ui', 'index.ts'), 'utf-8')).toContain('x = 1')
      expect(lstatSync(join(p.dir, 'node_modules')).isSymbolicLink()).toBe(true)
      expect(lstatSync(join(p.dir, '..', '..', 'node_modules')).isSymbolicLink()).toBe(true)
      expect(existsSync(join(p.dir, '.next'))).toBe(false)
    } finally {
      p.cleanup()
    }
  })

  it('builds in place when the config reaches outside an app that is not in a workspace', () => {
    const root = app('15.5.2')
    expect(copyRoot(root)).not.toBeNull()
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@x/*': ['../shared/*'] } } }),
    )
    expect(copyRoot(root)).toBeNull()
    expect(previewDir(root)).toMatchObject({ dir: root, isolated: false })
  })
})
