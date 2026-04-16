import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import {
  readDesignMemory,
  extractDecisionsFromCode,
  appendDecisions,
  upsertPageBlock,
  trimSections,
  formatMemoryForPrompt,
  truncateMemory,
} from './design-memory.js'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(resolve(tmpdir(), 'coherent-memory-'))
})

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true })
})

describe('readDesignMemory', () => {
  it('returns empty string when file missing', () => {
    expect(readDesignMemory(projectRoot)).toBe('')
  })

  it('returns file contents when present', () => {
    const path = resolve(projectRoot, '.coherent/wiki/decisions.md')
    mkdirSync(resolve(projectRoot, '.coherent/wiki'), { recursive: true })
    writeFileSync(path, '# Design Decisions\n')
    expect(readDesignMemory(projectRoot)).toContain('# Design Decisions')
  })
})

describe('extractDecisionsFromCode', () => {
  const samplePage = `
    import { HeroSection } from '@/components/shared/hero-section'
    import { FeatureCard } from '@/components/shared/feature-card'

    export default function Home() {
      return (
        <div>
          <section className="py-20 md:py-28">
            <div className="max-w-6xl mx-auto px-4">
              <h1 className="text-4xl font-bold">Title</h1>
              <p className="text-sm text-muted-foreground">sub</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-muted/50 border-border">
                <HeroSection />
                <FeatureCard />
              </div>
            </div>
          </section>
        </div>
      )
    }
  `

  it('extracts container', () => {
    expect(extractDecisionsFromCode(samplePage).join('\n')).toMatch(/Container: max-w-6xl mx-auto/)
  })

  it('extracts section spacing', () => {
    expect(extractDecisionsFromCode(samplePage).join('\n')).toMatch(/Section spacing: .*py-20/)
  })

  it('extracts typography', () => {
    expect(extractDecisionsFromCode(samplePage).join('\n')).toMatch(/Typography: text-4xl font-bold/)
  })

  it('extracts semantic palette only', () => {
    const palette = extractDecisionsFromCode(samplePage).find(d => d.startsWith('Palette:'))
    expect(palette).toBeDefined()
    expect(palette).toMatch(/bg-muted\/50/)
    expect(palette).toMatch(/border-border/)
  })

  it('extracts grids', () => {
    expect(extractDecisionsFromCode(samplePage).join('\n')).toMatch(/Grids: grid-cols-1 md:grid-cols-3/)
  })

  it('extracts shared component imports', () => {
    const shared = extractDecisionsFromCode(samplePage).find(d => d.startsWith('Shared imports:'))
    expect(shared).toBe('Shared imports: HeroSection, FeatureCard')
  })

  it('returns empty array for empty code', () => {
    expect(extractDecisionsFromCode('')).toEqual([])
  })

  it('ignores raw Tailwind colors in palette', () => {
    const code = '<div className="bg-blue-500 text-gray-900" />'
    const palette = extractDecisionsFromCode(code).find(d => d.startsWith('Palette:'))
    expect(palette).toBeUndefined()
  })
})

describe('appendDecisions', () => {
  it('creates file with today heading on first append', () => {
    appendDecisions(projectRoot, 'Home', '/', ['Container: max-w-6xl mx-auto', 'Grids: grid-cols-3'])
    const content = readDesignMemory(projectRoot)
    expect(content).toContain('# Design Decisions')
    expect(content).toMatch(/## \d{4}-\d{2}-\d{2}/)
    expect(content).toContain('### Home (/)')
    expect(content).toContain('- Container: max-w-6xl mx-auto')
    expect(content).toContain('- Grids: grid-cols-3')
  })

  it('appends a second page under same date without duplicating date heading', () => {
    appendDecisions(projectRoot, 'Home', '/', ['Container: max-w-6xl mx-auto'])
    appendDecisions(projectRoot, 'Dashboard', '/dashboard', ['Container: max-w-7xl mx-auto'])
    const content = readDesignMemory(projectRoot)
    const dateMatches = content.match(/## \d{4}-\d{2}-\d{2}/g) || []
    expect(dateMatches.length).toBe(1)
    expect(content).toContain('### Home (/)')
    expect(content).toContain('### Dashboard (/dashboard)')
  })

  it('replaces existing page block on same date (idempotent)', () => {
    appendDecisions(projectRoot, 'Home', '/', ['Container: max-w-6xl mx-auto'])
    appendDecisions(projectRoot, 'Home', '/', ['Container: max-w-7xl mx-auto'])
    const content = readDesignMemory(projectRoot)
    expect(content.match(/### Home \(\/\)/g)?.length).toBe(1)
    expect(content).toContain('max-w-7xl')
    expect(content).not.toContain('max-w-6xl')
  })

  it('does nothing when decisions list empty', () => {
    appendDecisions(projectRoot, 'Home', '/', [])
    expect(existsSync(resolve(projectRoot, '.coherent/wiki/decisions.md'))).toBe(false)
  })

  it('creates parent directory if missing', () => {
    appendDecisions(projectRoot, 'Home', '/', ['Container: max-w-6xl mx-auto'])
    expect(existsSync(resolve(projectRoot, '.coherent/wiki/decisions.md'))).toBe(true)
  })
})

describe('upsertPageBlock', () => {
  it('adds new date section when missing', () => {
    const out = upsertPageBlock('', '2026-04-15', 'Home', '### Home (/)\n- x')
    expect(out).toContain('## 2026-04-15')
    expect(out).toContain('### Home (/)')
  })

  it('preserves older sections when adding new date', () => {
    const existing = '# Design Decisions\n\n## 2026-04-10\n\n### Old (/old)\n- fact\n'
    const out = upsertPageBlock(existing, '2026-04-15', 'New', '### New (/new)\n- x')
    expect(out).toContain('## 2026-04-10')
    expect(out).toContain('## 2026-04-15')
    expect(out).toContain('### Old (/old)')
    expect(out).toContain('### New (/new)')
  })
})

describe('trimSections', () => {
  it('keeps all sections when under limit', () => {
    const content = '# Header\n\n## 2026-04-10\n\ndata\n\n## 2026-04-11\n\ndata\n'
    expect(trimSections(content, 5)).toBe(content)
  })

  it('keeps only the most recent N sections', () => {
    const content =
      '# Header\n\n## 2026-04-10\n\nold\n\n## 2026-04-11\n\nmid\n\n## 2026-04-12\n\nnewer\n\n## 2026-04-13\n\nnewest\n'
    const out = trimSections(content, 2)
    expect(out).not.toContain('2026-04-10')
    expect(out).not.toContain('2026-04-11')
    expect(out).toContain('2026-04-12')
    expect(out).toContain('2026-04-13')
  })
})

describe('truncateMemory', () => {
  it('no-ops when file missing', () => {
    truncateMemory(projectRoot, 2)
    expect(existsSync(resolve(projectRoot, '.coherent/wiki/decisions.md'))).toBe(false)
  })

  it('trims file to last N sections', () => {
    const path = resolve(projectRoot, '.coherent/wiki/decisions.md')
    mkdirSync(resolve(projectRoot, '.coherent/wiki'), { recursive: true })
    writeFileSync(path, '# Design Decisions\n\n## 2026-04-10\n\nA\n\n## 2026-04-11\n\nB\n\n## 2026-04-12\n\nC\n')
    truncateMemory(projectRoot, 2)
    const content = readFileSync(path, 'utf-8')
    expect(content).not.toContain('2026-04-10')
    expect(content).toContain('2026-04-11')
    expect(content).toContain('2026-04-12')
  })
})

describe('formatMemoryForPrompt', () => {
  it('returns empty string on empty input', () => {
    expect(formatMemoryForPrompt('')).toBe('')
    expect(formatMemoryForPrompt('   \n\n')).toBe('')
  })

  it('wraps content with DESIGN MEMORY header and coherence reminder', () => {
    const out = formatMemoryForPrompt('## 2026-04-15\n### Home (/)\n- Container: max-w-6xl mx-auto')
    expect(out).toContain('DESIGN MEMORY')
    expect(out).toContain('Container: max-w-6xl')
    expect(out).toMatch(/Maintain the same container width/)
  })

  it('trims to maxLines when content is long', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
    const out = formatMemoryForPrompt(lines, 20)
    expect(out).toContain('...(older entries trimmed)...')
    expect(out).toContain('line 199')
    expect(out).not.toContain('line 10')
  })
})
