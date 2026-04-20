import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { tokenize, scanWiki, buildIndex, retrieve, saveIndex, loadIndex } from './wiki-index.js'

describe('tokenize', () => {
  it('splits on word boundaries and lowercases', () => {
    expect(tokenize('Filter Bar layout')).toEqual(['filter', 'bar', 'layout'])
  })

  it('preserves kebab-case identifiers (React / Tailwind)', () => {
    expect(tokenize('bg-primary text-muted-foreground')).toEqual(['bg-primary', 'text-muted-foreground'])
  })

  it('drops common stopwords', () => {
    expect(tokenize('the filter is in the bar')).toEqual(['filter', 'bar'])
  })

  it('drops tokens shorter than 2 chars', () => {
    expect(tokenize('a b filter')).toEqual(['filter'])
  })

  it('strips markdown noise (backticks, asterisks, hashes)', () => {
    expect(tokenize('### `DialogContent` **max-w-lg**')).toEqual(['dialogcontent', 'max-w-lg'])
  })
})

describe('scanWiki + buildIndex + retrieve', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wiki-test-'))
    mkdirSync(join(dir, 'docs'))
    mkdirSync(join(dir, 'docs', 'wiki'))
    mkdirSync(join(dir, 'docs', 'wiki', 'ADR'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('retrieves filter-bar entry when query mentions filter', () => {
    writeFileSync(
      join(dir, 'docs', 'PATTERNS_JOURNAL.md'),
      `# Patterns Journal\n\n### PJ-006 — Filter bar failures\n\nFilter bar got 3 regressions: duplicate Categories, heights mismatched, search icon misplaced.`,
    )
    writeFileSync(
      join(dir, 'docs', 'wiki', 'MODEL_PROFILE.md'),
      `# Model Profile\n\n### Icon placement\n\nClaude places icons as siblings not absolute-positioned.`,
    )

    const entries = scanWiki({
      wikiDir: join(dir, 'docs', 'wiki'),
      journalFile: join(dir, 'docs', 'PATTERNS_JOURNAL.md'),
    })
    expect(entries.length).toBeGreaterThan(0)

    const index = buildIndex(entries)
    const results = retrieve(index, 'filter bar search icon', 3)
    expect(results[0].entry.id).toBe('PJ-006')
  })

  it('returns empty for query with only stopwords', () => {
    writeFileSync(join(dir, 'docs', 'PATTERNS_JOURNAL.md'), `### PJ-001\n\ncontent`)
    const index = buildIndex(
      scanWiki({ wikiDir: join(dir, 'docs', 'wiki'), journalFile: join(dir, 'docs', 'PATTERNS_JOURNAL.md') }),
    )
    expect(retrieve(index, 'the is a')).toEqual([])
  })

  it('indexes ADR files as whole documents', () => {
    writeFileSync(
      join(dir, 'docs', 'wiki', 'ADR', '0001-golden-patterns.md'),
      `# ADR 0001 — Golden patterns over word rules\n\nContext: filter bar failures.`,
    )
    const entries = scanWiki({
      wikiDir: join(dir, 'docs', 'wiki'),
      journalFile: join(dir, 'docs', 'nonexistent.md'),
    })
    const adr = entries.find(e => e.type === 'adr')
    expect(adr).toBeDefined()
    expect(adr!.title).toContain('Golden patterns')
  })

  it('splits MODEL_PROFILE by ### section', () => {
    writeFileSync(
      join(dir, 'docs', 'wiki', 'MODEL_PROFILE.md'),
      `# Model Profile\n\n### Icon siblings\n\nObservation 1.\n\n### Truncation\n\nObservation 2.`,
    )
    const entries = scanWiki({
      wikiDir: join(dir, 'docs', 'wiki'),
      journalFile: join(dir, 'docs', 'nonexistent.md'),
    })
    const modelNotes = entries.filter(e => e.type === 'model-note')
    expect(modelNotes.length).toBe(2)
  })

  it('ranks exact-term matches higher', () => {
    writeFileSync(
      join(dir, 'docs', 'PATTERNS_JOURNAL.md'),
      `### PJ-001 — Filter bar issues\n\nfilter bar issues\n\n### PJ-002 — Chart placeholders\n\nchart placeholder issues`,
    )
    const index = buildIndex(
      scanWiki({ wikiDir: join(dir, 'docs', 'wiki'), journalFile: join(dir, 'docs', 'PATTERNS_JOURNAL.md') }),
    )
    const results = retrieve(index, 'filter', 5)
    expect(results[0].entry.id).toBe('PJ-001')
  })

  it('persists and reloads index', () => {
    writeFileSync(join(dir, 'docs', 'PATTERNS_JOURNAL.md'), `### PJ-001 — Filter bar\n\nfilter bar`)
    const index = buildIndex(
      scanWiki({ wikiDir: join(dir, 'docs', 'wiki'), journalFile: join(dir, 'docs', 'PATTERNS_JOURNAL.md') }),
    )
    const path = join(dir, '.cache', 'wiki-index.json')
    saveIndex(path, index)
    const reloaded = loadIndex(path)
    expect(reloaded).not.toBeNull()
    expect(reloaded!.entries.length).toBe(index.entries.length)
    const r1 = retrieve(index, 'filter')
    const r2 = retrieve(reloaded!, 'filter')
    expect(r1[0].entry.id).toBe(r2[0].entry.id)
    expect(Math.abs(r1[0].score - r2[0].score)).toBeLessThan(0.0001)
  })

  it('parses YAML frontmatter into entry.frontmatter', () => {
    writeFileSync(
      join(dir, 'docs', 'PATTERNS_JOURNAL.md'),
      `---\nid: PJ-006\ntype: bug\nconfidence: verified\n---\n\n### PJ-006 — Filter bar\n\ncontent`,
    )
    const entries = scanWiki({
      wikiDir: join(dir, 'docs', 'wiki'),
      journalFile: join(dir, 'docs', 'PATTERNS_JOURNAL.md'),
    })
    expect(entries[0].frontmatter.confidence).toBe('verified')
    expect(entries[0].frontmatter.type).toBe('bug')
  })
})
