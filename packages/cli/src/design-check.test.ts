import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from './design-check.js'

let dir: string
const write = (p: string, c: string) => {
  mkdirSync(join(dir, p, '..'), { recursive: true })
  writeFileSync(join(dir, p), c)
}
const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' })
let out: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'coherent-dc-'))
  write('package.json', '{"name":"fixture","private":true}')
  symlinkSync(resolve(__dirname, '../node_modules'), join(dir, 'node_modules'))
  write(
    'app/globals.css',
    '@import "tailwindcss";\n@theme inline { --color-positive: var(--positive); }\n:root { --positive: #10b981; }\n',
  )
  write('components/badge.tsx', 'export const Badge = () => <span className="text-positive" />\n')
  git('init', '-q')
  git('add', '-A')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base')
  out = []
  vi.spyOn(console, 'log').mockImplementation((m: string) => void out.push(m))
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('design-check', () => {
  it('passes a clean tree', async () => {
    expect(await main([], dir)).toBe(0)
    expect(out.join('\n')).toContain('ok')
  })

  it('fails on a class of a token that does not exist, in the changed lines only', async () => {
    write(
      'components/delta.tsx',
      'export const tone = (up: boolean) => (up ? "text-success" : "text-positive")\nexport const D = () => <b className="text-[13px]" />\n',
    )
    expect(await main([], dir)).toBe(1)
    const text = out.join('\n')
    expect(text).toContain('error  components/delta.tsx:1 text-success compiles to no CSS')
    expect(text).toContain('warn   components/delta.tsx:2 text-[13px]')
    expect(text).not.toContain('badge.tsx')
  })
})
