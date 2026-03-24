import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isValidTsx, safeWrite } from './fix-validation.js'
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('isValidTsx', () => {
  const projectRoot = process.cwd().replace(/\/packages\/cli$/, '')

  it('returns true for valid TSX', () => {
    const code = `'use client'\nexport default function Page() {\n  return <div>Hello</div>\n}\n`
    expect(isValidTsx(code, projectRoot)).toBe(true)
  })

  it('returns false for broken JSX tag', () => {
    const code = `'use client'\nexport default function Page() {\n  return (\n    <\n    />\n  )\n}\n`
    expect(isValidTsx(code, projectRoot)).toBe(false)
  })

  it('returns false for unbalanced braces', () => {
    const code = `export default function Page() {\n  return <div>{unclosed</div>\n`
    expect(isValidTsx(code, projectRoot)).toBe(false)
  })

  it('returns true when typescript is not resolvable', () => {
    expect(isValidTsx('broken <', '/nonexistent/path')).toBe(true)
  })

  it('skips validation for non-TSX content', () => {
    const css = `:root { --primary: #000; }`
    expect(isValidTsx(css, projectRoot, '.css')).toBe(true)
  })
})

describe('safeWrite', () => {
  const tmpDir = join(tmpdir(), 'fix-validation-test')
  const projectRoot = process.cwd().replace(/\/packages\/cli$/, '')

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes valid content successfully', () => {
    const filePath = join(tmpDir, 'good.tsx')
    writeFileSync(filePath, 'export default function Old() { return <div/> }', 'utf-8')
    const backups = new Map<string, string>()
    const result = safeWrite(filePath, 'export default function New() { return <div/> }', projectRoot, backups)
    expect(result.ok).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toContain('New')
  })

  it('rolls back broken content and restores original', () => {
    const filePath = join(tmpDir, 'bad.tsx')
    const original = 'export default function Page() { return <div/> }'
    writeFileSync(filePath, original, 'utf-8')
    const backups = new Map<string, string>()
    const result = safeWrite(filePath, '<\n />', projectRoot, backups)
    expect(result.ok).toBe(false)
    expect(readFileSync(filePath, 'utf-8')).toBe(original)
  })

  it('captures backup only on first write', () => {
    const filePath = join(tmpDir, 'multi.tsx')
    writeFileSync(filePath, 'const a = 1', 'utf-8')
    const backups = new Map<string, string>()
    safeWrite(filePath, 'export default function A() { return <div/> }', projectRoot, backups)
    safeWrite(filePath, 'export default function B() { return <div/> }', projectRoot, backups)
    expect(backups.get(filePath)).toBe('const a = 1')
  })
})
