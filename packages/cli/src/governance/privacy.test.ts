import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildGraph } from './graph.js'
import { scanLeaks, type Identity } from './privacy.js'

const root = mkdtempSync(join(tmpdir(), 'cpv-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('scanLeaks', () => {
  it('flags environment identities in source, ignoring partial-word matches', () => {
    mkdirSync(join(root, 'src/app'), { recursive: true })
    writeFileSync(
      join(root, 'src/app/page.tsx'),
      'export default function P() {\n  return <input defaultValue="ada@example.dev" />\n}\n// Adaptive copy\nconst who = "Ada L."\n',
    )
    const ids: Identity[] = [
      { kind: 'email', value: 'ada@example.dev', severity: 'error' },
      { kind: 'first-name', value: 'Ada', severity: 'warning' },
    ]
    const leaks = scanLeaks(buildGraph(root), ids)
    expect(leaks.map(l => [l.identity.kind, l.line])).toEqual([
      ['email', 2],
      ['first-name', 5],
    ])
  })
})
