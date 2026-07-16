import { describe, it, expect } from 'vitest'
import { parseDesignMd } from './parse.js'

const COHERENT_EXTRACT = `# stripe.com — Atmosphere

> Extracted by [Coherent](https://getcoherent.design) from \`https://stripe.com\` on 2026-07-15

<!-- coherent-extract: v1 -->

## Color

| Token | Hex | Role | Usage |
|-------|-----|------|-------|
| \`#635bff\` | swatch | brand | Primary CTA |
| \`#0d253d\` | swatch | text | Body copy |
| \`#ffffff\` | swatch | background | Page background |
| \`#e3e8ee\` | swatch | border | Dividers |
| \`#cd3d64\` | swatch | semantic | Error states |

### Backgrounds

- **page** — \`#ffffff\`

## Typography

**Font families**

- Sohne, sans-serif
- SF Mono
`

const COHERENT_CONFIG = `# Acme — Design System

## Color System

Default mode: \`light\`

| Token | Light | Dark |
|-------|-------|------|
| \`background\` | \`#ffffff\` | \`#0a0a0a\` |
| \`foreground\` | \`#0d253d\` | \`#fafafa\` |
| \`primary\` | \`#635bff\` | \`#7c73ff\` |
| \`border\` | \`#e3e8ee\` | \`#27272a\` |
| \`primaryForeground\` | \`#ffffff\` | \`#000000\` |

## Typography

**Font families**

- **sans** — Inter, system-ui, sans-serif
- **mono** — JetBrains Mono, monospace
`

const STITCH = `---
version: "1.0"
name: "Stripe"
source: "https://stripe.com"
colors:
  primary: "#635bff"
  ink: "#0d253d"
  canvas: "#ffffff"
  hairline: "#e3e8ee"
  ruby: "#cd3d64"
typography:
  body-md:
    fontFamily: "Sohne"
  code:
    fontFamily: "Berkeley Mono"
spacing:
  md: 16px
---

# Stripe

## Colors

- **Primary** (\`{colors.primary}\` — \`#111111\`): CTA
`

describe('parseDesignMd — grammar detection', () => {
  it('detects the coherent-extract (Atmosphere) grammar', () => {
    expect(parseDesignMd(COHERENT_EXTRACT).grammar).toBe('coherent-extract')
  })
  it('detects the coherent-config grammar', () => {
    expect(parseDesignMd(COHERENT_CONFIG).grammar).toBe('coherent-config')
  })
  it('detects the stitch grammar', () => {
    expect(parseDesignMd(STITCH).grammar).toBe('stitch')
  })
})

describe('parseDesignMd — coherent-extract', () => {
  const raw = parseDesignMd(COHERENT_EXTRACT)
  it('reads the color table with roles', () => {
    const brand = raw.colors.find(c => c.role === 'brand')
    expect(brand?.hex).toBe('#635bff')
    expect(raw.colors.find(c => c.role === 'text')?.hex).toBe('#0d253d')
    expect(raw.colors.find(c => c.role === 'semantic')?.hex).toBe('#cd3d64')
  })
  it('reads the background bullet as a background role', () => {
    expect(raw.colors.some(c => c.role === 'background' && c.hex === '#ffffff')).toBe(true)
  })
  it('reads unlabeled font bullets and detects mono', () => {
    expect(raw.fontSans).toBe('Sohne, sans-serif')
    expect(raw.fontMono).toBe('SF Mono')
  })
  it('reads the source from the extract blockquote', () => {
    expect(raw.source).toBe('https://stripe.com')
  })
})

describe('parseDesignMd — coherent-config', () => {
  const raw = parseDesignMd(COHERENT_CONFIG)
  it('reads semantic token names from the Light column', () => {
    expect(raw.colors.find(c => c.name === 'primary')?.hex).toBe('#635bff')
    expect(raw.colors.find(c => c.name === 'background')?.hex).toBe('#ffffff')
  })
  it('reads role-labeled font bullets', () => {
    expect(raw.fontSans).toBe('Inter, system-ui, sans-serif')
    expect(raw.fontMono).toBe('JetBrains Mono, monospace')
  })
})

describe('parseDesignMd — stitch', () => {
  const raw = parseDesignMd(STITCH)
  it('reads colors from the frontmatter map', () => {
    expect(raw.colors.find(c => c.name === 'primary')?.hex).toBe('#635bff')
    expect(raw.colors.find(c => c.name === 'ink')?.hex).toBe('#0d253d')
    expect(raw.colors.find(c => c.name === 'hairline')?.hex).toBe('#e3e8ee')
  })
  it('collects fontFamily across typography roles and detects mono', () => {
    expect(raw.fontSans).toBe('Sohne')
    expect(raw.fontMono).toBe('Berkeley Mono')
  })
  it('reads source + name from frontmatter', () => {
    expect(raw.source).toBe('https://stripe.com')
    expect(raw.name).toBe('Stripe')
  })
  it('prefers frontmatter colors over the body bullet fallback', () => {
    expect(raw.colors.find(c => c.hex === '#111111')).toBeUndefined()
  })
})
