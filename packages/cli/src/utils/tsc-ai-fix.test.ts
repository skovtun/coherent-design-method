import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { applyAiFixes } from './tsc-ai-fix.js'
import type { TscError } from './tsc-error-parser.js'

const makeError = (file: string, msg = 'some error'): TscError => ({
  file, line: 1, col: 1, code: 'TS2322', message: msg, relatedFiles: [],
})

describe('applyAiFixes', () => {
  it('returns all errors as failed when no AI provider', async () => {
    const errors = [makeError('app/page.tsx')]
    const result = await applyAiFixes(errors, '/tmp/test', new Map(), undefined)
    expect(result.failed).toEqual(errors)
    expect(result.fixed).toEqual([])
  })

  it('returns all errors as failed when editPageCode is undefined', async () => {
    const errors = [makeError('app/page.tsx')]
    const provider = { editPageCode: undefined } as any
    const result = await applyAiFixes(errors, '/tmp/test', new Map(), provider)
    expect(result.failed).toEqual(errors)
    expect(result.fixed).toEqual([])
  })

  it('respects max 5 unique files limit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tsc-ai-'))
    mkdirSync(join(dir, 'app'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    const errors = Array.from({ length: 8 }, (_, i) => {
      const file = `app/page${i}.tsx`
      writeFileSync(join(dir, file), `export default function P${i}() { return <div /> }`)
      return makeError(file)
    })
    const editPageCode = vi.fn().mockResolvedValue(null)
    const provider = { editPageCode } as any
    const result = await applyAiFixes(errors, dir, new Map(), provider)
    expect(editPageCode.mock.calls.length).toBe(5)
    expect(result.failed.length).toBeGreaterThanOrEqual(3)
  })

  it('includes related interface files in prompt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tsc-ai-'))
    mkdirSync(join(dir, 'app'), { recursive: true })
    mkdirSync(join(dir, 'components', 'shared'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'app', 'page.tsx'), 'export default function Page() { return <div /> }')
    writeFileSync(join(dir, 'components', 'shared', 'feed.tsx'), 'export interface ActivityFeedProps { timestamp: string }')

    const errors = [makeError('app/page.tsx', 'Missing prop')]
    errors[0].relatedFiles = ['components/shared/feed.tsx']
    const editPageCode = vi.fn().mockRejectedValue(new Error('test'))
    const provider = { editPageCode } as any
    await applyAiFixes(errors, dir, new Map(), provider)

    expect(editPageCode).toHaveBeenCalled()
    const instruction = editPageCode.mock.calls[0][1] as string
    expect(instruction).toContain('components/shared/feed.tsx')
    expect(instruction).toContain('ActivityFeedProps')
  })

  it('returns metrics with fixed and failed counts', async () => {
    const errors = [makeError('app/page.tsx')]
    const result = await applyAiFixes(errors, '/tmp/nonexistent', new Map(), undefined)
    expect(result).toHaveProperty('fixed')
    expect(result).toHaveProperty('failed')
    expect(Array.isArray(result.fixed)).toBe(true)
    expect(Array.isArray(result.failed)).toBe(true)
  })
})
