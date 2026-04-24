import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { inferProviderFromKey, readAuthStatus, readEnvFileKey, removeApiKey, writeApiKey } from './auth-env.js'

describe('inferProviderFromKey', () => {
  it('recognizes Anthropic sk-ant- prefix', () => {
    expect(inferProviderFromKey('sk-ant-abcdef')).toBe('anthropic')
    expect(inferProviderFromKey('  sk-ant-xyz  ')).toBe('anthropic')
  })

  it('defaults generic sk- keys to openai', () => {
    expect(inferProviderFromKey('sk-proj-foo')).toBe('openai')
    expect(inferProviderFromKey('sk-abcdef')).toBe('openai')
  })

  it('returns null for unrecognized prefixes', () => {
    expect(inferProviderFromKey('')).toBe(null)
    expect(inferProviderFromKey('hello')).toBe(null)
    expect(inferProviderFromKey('ant-keys')).toBe(null)
  })
})

describe('writeApiKey / removeApiKey / readEnvFileKey', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'coherent-auth-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('creates .env with a single trailing newline when writing to a fresh project', () => {
    writeApiKey(root, 'anthropic', 'sk-ant-test')
    const body = readFileSync(join(root, '.env'), 'utf-8')
    expect(body).toBe('ANTHROPIC_API_KEY=sk-ant-test\n')
    expect(readEnvFileKey(root, 'anthropic')).toBe('sk-ant-test')
  })

  it('replaces existing line without touching other vars', () => {
    writeFileSync(
      join(root, '.env'),
      ['# comment', 'FOO=bar', 'ANTHROPIC_API_KEY=old-key', 'BAZ=qux', ''].join('\n'),
      'utf-8',
    )
    writeApiKey(root, 'anthropic', 'sk-ant-new')
    const body = readFileSync(join(root, '.env'), 'utf-8')
    expect(body).toContain('# comment')
    expect(body).toContain('FOO=bar')
    expect(body).toContain('BAZ=qux')
    expect(body).toContain('ANTHROPIC_API_KEY=sk-ant-new')
    expect(body).not.toContain('old-key')
  })

  it('appends when no matching line exists', () => {
    writeFileSync(join(root, '.env'), 'FOO=bar\n', 'utf-8')
    writeApiKey(root, 'openai', 'sk-proj-xyz')
    const body = readFileSync(join(root, '.env'), 'utf-8')
    expect(body).toBe('FOO=bar\nOPENAI_API_KEY=sk-proj-xyz\n')
  })

  it('trims whitespace from the key on write', () => {
    writeApiKey(root, 'anthropic', '  sk-ant-spaced  ')
    expect(readEnvFileKey(root, 'anthropic')).toBe('sk-ant-spaced')
  })

  it('removeApiKey deletes matching line + returns true', () => {
    writeFileSync(join(root, '.env'), 'FOO=bar\nANTHROPIC_API_KEY=k\nBAZ=qux\n', 'utf-8')
    expect(removeApiKey(root, 'anthropic')).toBe(true)
    const body = readFileSync(join(root, '.env'), 'utf-8')
    expect(body).toBe('FOO=bar\nBAZ=qux\n')
  })

  it('removeApiKey returns false when nothing to remove', () => {
    writeFileSync(join(root, '.env'), 'FOO=bar\n', 'utf-8')
    expect(removeApiKey(root, 'anthropic')).toBe(false)
    expect(readFileSync(join(root, '.env'), 'utf-8')).toBe('FOO=bar\n')
  })

  it('removeApiKey on missing .env returns false', () => {
    expect(removeApiKey(root, 'anthropic')).toBe(false)
  })

  it('readEnvFileKey returns null when .env is absent or key unset', () => {
    expect(readEnvFileKey(root, 'anthropic')).toBe(null)
    writeFileSync(join(root, '.env'), 'FOO=bar\n', 'utf-8')
    expect(readEnvFileKey(root, 'anthropic')).toBe(null)
  })
})

describe('readAuthStatus', () => {
  const originalAnthropic = process.env.ANTHROPIC_API_KEY
  const originalOpenAI = process.env.OPENAI_API_KEY
  let root: string

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
    root = mkdtempSync(join(tmpdir(), 'coherent-auth-status-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalAnthropic
    if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalOpenAI
  })

  it('reports absent when neither env nor .env has keys', () => {
    const s = readAuthStatus(root)
    expect(s.anthropic.present).toBe(false)
    expect(s.anthropic.source).toBe(null)
    expect(s.openai.present).toBe(false)
  })

  it('detects key from process.env', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-xyz'
    const s = readAuthStatus(root)
    expect(s.anthropic.present).toBe(true)
    expect(s.anthropic.source).toBe('process-env')
  })

  it('detects key from .env file', () => {
    writeFileSync(join(root, '.env'), 'OPENAI_API_KEY=sk-openai\n', 'utf-8')
    const s = readAuthStatus(root)
    expect(s.openai.present).toBe(true)
    expect(s.openai.source).toBe('.env')
  })

  it('process.env wins over .env when both present', () => {
    process.env.ANTHROPIC_API_KEY = 'from-process'
    writeFileSync(join(root, '.env'), 'ANTHROPIC_API_KEY=from-file\n', 'utf-8')
    const s = readAuthStatus(root)
    expect(s.anthropic.source).toBe('process-env')
  })
})
