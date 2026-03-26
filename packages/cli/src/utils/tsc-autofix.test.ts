import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fixFieldRename, fixUnionType, fixMissingEventHandler, applyDeterministicFixes } from './tsc-autofix.js'
import type { TscError } from './tsc-error-parser.js'

const err = (overrides: Partial<TscError> = {}): TscError => ({
  file: 'test.tsx',
  line: 1,
  col: 1,
  code: 'TS2322',
  message: '',
  relatedFiles: [],
  ...overrides,
})

describe('fixFieldRename', () => {
  it('renames field when substring match exists (time → timestamp)', () => {
    const code = `const items = [{ id: '1', time: '2024-01-01' }]`
    const result = fixFieldRename(
      code,
      err({
        message: `Property 'timestamp' is missing in type '{ id: string; time: string; }' but required in type '{ id: string; timestamp: string; }'.`,
      }),
      1,
    )
    expect(result).not.toBeNull()
    expect(result!.code).toContain('timestamp:')
    expect(result!.code).not.toContain('time:')
  })

  it('returns null when no close match found', () => {
    const code = `const items = [{ id: '1', foo: 'bar' }]`
    const result = fixFieldRename(
      code,
      err({
        message: `Property 'timestamp' is missing in type '{ id: string; foo: string; }'.`,
      }),
      1,
    )
    expect(result).toBeNull()
  })

  it('rejects short-name false positives (url vs name, distance > threshold)', () => {
    const code = `const items = [{ id: '1', url: 'http://...' }]`
    const result = fixFieldRename(
      code,
      err({
        message: `Property 'name' is missing in type '{ id: string; url: string; }'.`,
      }),
      1,
    )
    expect(result).toBeNull()
  })

  it('only renames field on lines near the error line, not globally', () => {
    const lines: string[] = []
    lines.push(`const a = { time: 'header' }`) // line 1: should NOT be renamed (far from error)
    for (let i = 0; i < 10; i++) lines.push(`// padding ${i}`) // lines 2-11
    lines.push(`const b = [{ time: '2024-01-01' }]`) // line 12: error line, SHOULD be renamed
    for (let i = 0; i < 10; i++) lines.push(`// padding ${i}`) // lines 13-22
    lines.push(`const c = { time: 'footer' }`) // line 23: should NOT be renamed (far from error)
    const code = lines.join('\n')
    const result = fixFieldRename(
      code,
      err({
        line: 12,
        message: `Property 'timestamp' is missing in type '{ time: string; }'.`,
      }),
      12,
    )
    expect(result).not.toBeNull()
    const resultLines = result!.code.split('\n')
    expect(resultLines[0]).toContain('time:') // line 1 unchanged
    expect(resultLines[11]).toContain('timestamp:') // line 12 fixed
    expect(resultLines[22]).toContain('time:') // line 23 unchanged
  })

  it('reads field names from source when not in error message', () => {
    const code = `const items = [{ time: '2024-01-01', name: 'Test' }]`
    const result = fixFieldRename(
      code,
      err({
        message: `Property 'timestamp' is missing in type but required in type 'Activity'.`,
      }),
      1,
    )
    expect(result).not.toBeNull()
    expect(result!.code).toContain('timestamp:')
  })
})

describe('fixUnionType', () => {
  it('fixes case-insensitive union match', () => {
    const code = `const items = [{ status: 'Active' }]`
    const result = fixUnionType(
      code,
      err({
        message: `Type 'string' is not assignable to type '"active" | "completed" | "paused"'.`,
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.code).toContain("'active'")
  })

  it('returns null when value matches no variant', () => {
    const code = `const items = [{ status: 'unknown' }]`
    const result = fixUnionType(
      code,
      err({
        message: `Type 'string' is not assignable to type '"active" | "completed"'.`,
      }),
    )
    expect(result).toBeNull()
  })
})

describe('fixMissingEventHandler', () => {
  it('adds no-op handler for on* props', () => {
    const code = `<TaskItem key="1" id="1" title="Test" />`
    const result = fixMissingEventHandler(
      code,
      err({
        code: 'TS2741',
        message: `Property 'onToggle' is missing in type '{ key: string; id: string; title: string; }' but required in type 'TaskItemProps'.`,
      }),
    )
    expect(result).not.toBeNull()
    expect(result!.code).toContain('onToggle={() => {}}')
  })

  it('returns null for non-event props', () => {
    const code = `<TaskItem key="1" />`
    const result = fixMissingEventHandler(
      code,
      err({
        code: 'TS2741',
        message: `Property 'title' is missing in type '{ key: string; }' but required in type 'TaskItemProps'.`,
      }),
    )
    expect(result).toBeNull()
  })
})

describe('applyDeterministicFixes', () => {
  let dir: string
  let backups: Map<string, string>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tsc-fix-'))
    mkdirSync(join(dir, 'app'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    backups = new Map()
  })

  it('fixes field rename and writes to disk', async () => {
    writeFileSync(
      join(dir, 'app', 'page.tsx'),
      `export default function Page() {\n  const items = [{ time: '2024-01-01' }]\n  return <div />\n}`,
    )
    const errors: TscError[] = [
      err({
        file: 'app/page.tsx',
        line: 2,
        message: `Property 'timestamp' is missing in type '{ time: string; }' but required.`,
      }),
    ]
    const result = await applyDeterministicFixes(errors, dir, backups)
    expect(result.fixed).toContain('app/page.tsx')
    const content = readFileSync(join(dir, 'app', 'page.tsx'), 'utf-8')
    expect(content).toContain('timestamp')
  })

  it('deduplicates errors before fixing', async () => {
    writeFileSync(
      join(dir, 'app', 'page.tsx'),
      `export default function Page() {\n  const a = [{ time: 'x' }]\n  return <div />\n}`,
    )
    const duped: TscError[] = [
      err({ file: 'app/page.tsx', line: 2, message: `Property 'timestamp' is missing in type '{ time: string; }'.` }),
      err({ file: 'app/page.tsx', line: 2, message: `Property 'timestamp' is missing in type '{ time: string; }'.` }),
    ]
    const result = await applyDeterministicFixes(duped, dir, backups)
    expect(result.fixed).toContain('app/page.tsx')
  })

  it('puts unfixable errors into remaining', async () => {
    writeFileSync(join(dir, 'app', 'page.tsx'), `export default function P() { return <div /> }`)
    const errors: TscError[] = [
      err({
        file: 'app/page.tsx',
        line: 1,
        message: `Some exotic error that no fixer handles.`,
      }),
    ]
    const result = await applyDeterministicFixes(errors, dir, backups)
    expect(result.remaining).toHaveLength(1)
    expect(result.fixed).toHaveLength(0)
  })
})
