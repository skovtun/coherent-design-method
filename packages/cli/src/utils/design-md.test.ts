import { describe, it, expect } from 'vitest'
import { EXAMPLE_MULTIPAGE_CONFIG, type DesignSystemConfig, type SharedComponentsManifest } from '@getcoherent/core'
import { buildDesignMarkdown, DESIGN_MD_FILENAME } from './design-md.js'
import type { Atmosphere } from '../commands/chat/plan-generator.js'

const baseConfig: DesignSystemConfig = EXAMPLE_MULTIPAGE_CONFIG

describe('buildDesignMarkdown', () => {
  it('exports the canonical filename', () => {
    expect(DESIGN_MD_FILENAME).toBe('DESIGN.md')
  })

  it('produces a valid markdown document with required sections', () => {
    const md = buildDesignMarkdown({ config: baseConfig })
    expect(md).toContain(`# ${baseConfig.name} — Design System`)
    expect(md).toContain('## Color System')
    expect(md).toContain('## Typography')
    expect(md).toContain('## Spacing')
    expect(md).toContain('## Border Radius')
    expect(md).toMatch(/coherent design-md/)
  })

  it('includes the Coherent attribution + version', () => {
    const cfg: DesignSystemConfig = { ...baseConfig, coherentVersion: '0.18.0' }
    const md = buildDesignMarkdown({ config: cfg })
    expect(md).toContain('Coherent Design Method')
    expect(md).toContain('v0.18.0')
  })

  it('omits Atmosphere section when no atmosphere supplied', () => {
    const md = buildDesignMarkdown({ config: baseConfig })
    expect(md).not.toContain('## Atmosphere')
  })

  it('renders Atmosphere section when atmosphere supplied', () => {
    const atmosphere: Atmosphere = {
      moodPhrase: 'Editorial calm — serif headlines, generous whitespace',
      background: 'warm-stone',
      heroLayout: 'left-editorial',
      spacing: 'wide',
      accents: 'editorial',
      fontStyle: 'serif-headings',
      primaryHint: 'stone',
    }
    const md = buildDesignMarkdown({ config: baseConfig, atmosphere })
    expect(md).toContain('## Atmosphere')
    expect(md).toContain('Editorial calm')
    expect(md).toContain('| Background | `warm-stone` |')
    expect(md).toContain('| Primary hint | `stone` |')
  })

  it('renders the Color System table with light + dark side-by-side', () => {
    const md = buildDesignMarkdown({ config: baseConfig })
    expect(md).toMatch(/\| Token \| Light \| Dark \|/)
    expect(md).toContain('`primary`')
    expect(md).toContain('`background`')
    expect(md).toContain('`foreground`')
  })

  it('renders Color usage notes when tokenUsage provided', () => {
    const cfg: DesignSystemConfig = {
      ...baseConfig,
      tokenUsage: { colors: { primary: 'Primary actions, focus rings, active nav' } },
    }
    const md = buildDesignMarkdown({ config: cfg })
    expect(md).toContain('### Color usage notes')
    expect(md).toContain('**primary** — Primary actions, focus rings, active nav')
  })

  it('omits Voice section when voice profile absent', () => {
    const md = buildDesignMarkdown({ config: baseConfig })
    expect(md).not.toContain('## Voice')
  })

  it('renders Voice section when voice profile provided', () => {
    const cfg: DesignSystemConfig = {
      ...baseConfig,
      voice: {
        tone: 'confident-direct',
        copyRules: ['Plain English. No hedging.'],
        avoidWords: ['delve', 'robust'],
        ctaStyle: 'imperative-action',
      },
    }
    const md = buildDesignMarkdown({ config: cfg })
    expect(md).toContain('## Voice')
    expect(md).toContain('confident-direct')
    expect(md).toContain('Plain English. No hedging.')
    expect(md).toContain('`delve`')
    expect(md).toContain('imperative-action')
  })

  it('omits Shared Components section when manifest empty or missing', () => {
    expect(buildDesignMarkdown({ config: baseConfig })).not.toContain('## Shared Components')

    const emptyManifest: SharedComponentsManifest = { shared: [], nextId: 1 }
    expect(buildDesignMarkdown({ config: baseConfig, manifest: emptyManifest })).not.toContain('## Shared Components')
  })

  it('renders Shared Components table with CID-XXX ids and @-syntax hint', () => {
    const manifest: SharedComponentsManifest = {
      shared: [
        {
          id: 'CID-001',
          name: 'Header',
          type: 'layout',
          file: 'components/shared/Header.tsx',
          usedIn: ['app/page.tsx'],
          dependencies: [],
          description: 'Top header with logo + nav',
        },
        {
          id: 'CID-002',
          name: 'PricingTable',
          type: 'section',
          file: 'components/shared/PricingTable.tsx',
          usedIn: ['app/pricing/page.tsx'],
          dependencies: [],
          description: 'Three-tier pricing card grid',
        },
      ],
      nextId: 3,
    }
    const md = buildDesignMarkdown({ config: baseConfig, manifest })
    expect(md).toContain('## Shared Components')
    expect(md).toContain('@<id>')
    expect(md).toContain('| `CID-001` | **Header** | layout | Top header with logo + nav |')
    expect(md).toContain('| `CID-002` | **PricingTable** | section | Three-tier pricing card grid |')
  })

  it('renders Pages table when pages exist', () => {
    const md = buildDesignMarkdown({ config: baseConfig })
    if (baseConfig.pages.length > 0) {
      expect(md).toContain('## Pages')
      expect(md).toContain('| Route | Name | Description |')
    }
  })

  it('escapes pipe characters in description fields', () => {
    const cfg: DesignSystemConfig = {
      ...baseConfig,
      pages: [
        {
          ...baseConfig.pages[0],
          description: 'Has | pipe in description',
        },
      ],
    }
    const md = buildDesignMarkdown({ config: cfg })
    expect(md).toContain('Has \\| pipe')
  })

  it('is deterministic for identical inputs (snapshot stability)', () => {
    const md1 = buildDesignMarkdown({ config: baseConfig })
    const md2 = buildDesignMarkdown({ config: baseConfig })
    expect(md1).toBe(md2)
  })

  it('handles a minimal config without crashing', () => {
    const minimal = {
      ...baseConfig,
      voice: undefined,
      tokenUsage: undefined,
    }
    const md = buildDesignMarkdown({ config: minimal })
    expect(md.length).toBeGreaterThan(100)
    expect(md).toContain('# ')
  })
})
