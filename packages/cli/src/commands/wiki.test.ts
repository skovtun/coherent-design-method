import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { extractFrontmatterAtTop, auditVersionConsistency } from './wiki.js'

describe('extractFrontmatterAtTop', () => {
  it('parses frontmatter at the top of a file', () => {
    const text = `---
id: ADR-0001
status: accepted
date: 2026-04-19
confidence: established
---

# Heading
`
    expect(extractFrontmatterAtTop(text)).toEqual({
      id: 'ADR-0001',
      status: 'accepted',
      date: '2026-04-19',
      confidence: 'established',
    })
  })

  it('returns null when file does not start with ---', () => {
    expect(extractFrontmatterAtTop('# Just a heading\n\nBody.')).toBeNull()
  })

  it('returns null when closing --- is missing', () => {
    expect(extractFrontmatterAtTop('---\nid: ADR-0001\nno-close-marker\n')).toBeNull()
  })

  it('handles list-valued fields as raw strings', () => {
    const fm = extractFrontmatterAtTop(`---
id: ADR-0002
shipped_in: [0.7.2, 0.7.3]
---
`)
    expect(fm?.shipped_in).toBe('[0.7.2, 0.7.3]')
  })
})

describe('auditVersionConsistency', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wiki-version-'))
    mkdirSync(join(dir, 'packages', 'cli'), { recursive: true })
    mkdirSync(join(dir, 'packages', 'core'), { recursive: true })
    mkdirSync(join(dir, 'docs'), { recursive: true })
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const makeCtx = () => ({
    repoRoot: dir,
    journalPath: join(dir, 'docs', 'PATTERNS_JOURNAL.md'),
    profilePath: join(dir, 'docs', 'wiki', 'MODEL_PROFILE.md'),
    backlogPath: join(dir, 'docs', 'wiki', 'IDEAS_BACKLOG.md'),
    rulesMapPath: join(dir, 'docs', 'wiki', 'RULES_MAP.md'),
    patternsDir: join(dir, 'packages', 'cli', 'templates', 'patterns'),
    adrDir: join(dir, 'docs', 'wiki', 'ADR'),
  })

  const writeVersion = (pkg: 'cli' | 'core', version: string) =>
    writeFileSync(join(dir, 'packages', pkg, 'package.json'), JSON.stringify({ name: `@x/${pkg}`, version }))

  const writeChangelog = (topVersion: string) =>
    writeFileSync(join(dir, 'docs', 'CHANGELOG.md'), `# Changelog\n\n## [${topVersion}] — 2026-04-20\n\nEntry.\n`)

  it('is silent when versions match', () => {
    writeVersion('cli', '0.7.21')
    writeVersion('core', '0.7.21')
    writeChangelog('0.7.21')
    expect(auditVersionConsistency(makeCtx())).toEqual([])
  })

  it('emits error on core/cli mismatch', () => {
    writeVersion('cli', '0.7.21')
    writeVersion('core', '0.7.20')
    writeChangelog('0.7.21')
    const issues = auditVersionConsistency(makeCtx())
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].message).toMatch(/core=0\.7\.20 vs cli=0\.7\.21/)
  })

  it('warns when CHANGELOG top entry is behind package version', () => {
    writeVersion('cli', '0.7.21')
    writeVersion('core', '0.7.21')
    writeChangelog('0.7.20')
    const issues = auditVersionConsistency(makeCtx())
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].where).toBe('CHANGELOG.md')
  })

  it('accepts CHANGELOG entries without brackets', () => {
    writeVersion('cli', '0.7.21')
    writeVersion('core', '0.7.21')
    writeFileSync(join(dir, 'docs', 'CHANGELOG.md'), `# Changelog\n\n## 0.7.21 — 2026-04-20\n\nEntry.\n`)
    expect(auditVersionConsistency(makeCtx())).toEqual([])
  })

  it('skips silently when CHANGELOG is missing', () => {
    writeVersion('cli', '0.7.21')
    writeVersion('core', '0.7.21')
    expect(auditVersionConsistency(makeCtx())).toEqual([])
  })
})
