import { describe, expect, it } from 'vitest'
import {
  EXTRACTED_DESIGN_MD_VERSION,
  buildExtractedDesignMarkdown,
  truncateHero,
  type ExtractedAtmosphereForMd,
} from './design-md-serializer.js'

const baseTokens = (): ExtractedAtmosphereForMd['tokens'] => ({
  colors: [],
  typography: { families: [], scale: [] },
  spacing: [],
  radius: [],
  shadows: [],
  motion: { tokens: [] },
  backgrounds: { solid: [], roles: {} },
  gradients: [],
  patterns: [],
  glassmorphism: null,
  zIndexScale: [],
  focusRings: [],
  linkStates: { default: {}, hover: {} },
  formControlStates: {},
  breakpoints: { strategy: 'unknown', values: [] },
  containerWidths: [],
  borderStyles: [],
  iconStyle: { kind: 'unknown' },
})

const baseInput = (overrides: Partial<ExtractedAtmosphereForMd> = {}): ExtractedAtmosphereForMd => ({
  source: {
    url: 'https://stripe.com',
    finalUrl: 'https://stripe.com/',
    capturedAt: '2026-05-04T20:00:00.000Z',
    mode: 'light',
    title: 'Stripe',
    loadTimeMs: 1500,
  },
  hero: { text: 'Build a real online business', fontSize: 56, source: 'h1', selector: 'h1' },
  tokens: baseTokens(),
  ...overrides,
})

describe('buildExtractedDesignMarkdown', () => {
  it('emits header with hostname + capturedAt + mode', () => {
    const md = buildExtractedDesignMarkdown(baseInput())
    expect(md).toMatch(/^# stripe\.com — Atmosphere/)
    expect(md).toContain('Mode: `light`')
    expect(md).toContain('captured in 1500ms')
    expect(md).toContain(`<!-- coherent-extract: v${EXTRACTED_DESIGN_MD_VERSION} -->`)
  })

  it('includes hero block with detection method', () => {
    const md = buildExtractedDesignMarkdown(baseInput())
    expect(md).toContain('## Hero')
    expect(md).toContain('Detected via:** `h1`')
    expect(md).toContain('> Build a real online business')
  })

  it('omits sections that have no signal', () => {
    const md = buildExtractedDesignMarkdown(baseInput())
    // Tokens are empty in baseInput; these sections must not appear.
    expect(md).not.toContain('## Color')
    expect(md).not.toContain('## Typography')
    expect(md).not.toContain('## Spacing')
    expect(md).not.toContain('## Motion')
    expect(md).not.toContain('## Gradients')
    expect(md).not.toContain('## Voice')
  })

  it('emits color table with role + hex', () => {
    const md = buildExtractedDesignMarkdown(
      baseInput({
        tokens: {
          ...baseTokens(),
          colors: [
            { hex: '#635bff', role: 'brand', usage: 'button-primary background' },
            { hex: '#000000', role: 'text', usage: 'body text' },
          ],
        },
      }),
    )
    expect(md).toContain('## Color')
    expect(md).toContain('| `#635bff` |')
    expect(md).toContain('| `#000000` |')
    expect(md).toContain('button-primary background')
  })

  it('emits typography scale table', () => {
    const md = buildExtractedDesignMarkdown(
      baseInput({
        tokens: {
          ...baseTokens(),
          typography: {
            families: [{ family: 'Inter Variable' }, { family: 'sans-serif' }],
            scale: [
              { role: 'h1', fontSize: '64px', fontWeight: 510, fontFamily: 'Inter Variable' },
              { role: 'body', fontSize: '16px', fontWeight: 400, lineHeight: '1.6' },
            ],
          },
        },
      }),
    )
    expect(md).toContain('Inter Variable')
    expect(md).toContain('| h1 | `64px` | 510 |')
    expect(md).toContain('| body | `16px` | 400 |')
  })

  it('emits motion table when transitions present', () => {
    const md = buildExtractedDesignMarkdown(
      baseInput({
        tokens: {
          ...baseTokens(),
          motion: {
            tokens: [{ duration: '160ms', easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', property: 'all' }],
          },
        },
      }),
    )
    expect(md).toContain('## Motion')
    expect(md).toContain('`160ms`')
    expect(md).toContain('cubic-bezier(0.25, 0.46, 0.45, 0.94)')
  })

  it('emits breakpoints with strategy', () => {
    const md = buildExtractedDesignMarkdown(
      baseInput({
        tokens: {
          ...baseTokens(),
          breakpoints: {
            strategy: 'mobile-first',
            values: [
              { name: 'sm', px: 640 },
              { name: 'md', px: 768 },
              { name: 'lg', px: 1024 },
            ],
          },
        },
      }),
    )
    expect(md).toContain('## Breakpoints')
    expect(md).toContain('Strategy: `mobile-first`')
    expect(md).toContain('| sm | `640px` |')
  })

  it('emits voice section only when semantic provided', () => {
    const without = buildExtractedDesignMarkdown(baseInput())
    expect(without).not.toContain('## Voice')

    const withVoice = buildExtractedDesignMarkdown(
      baseInput({
        semantic: {
          summary: 'Confident technical precision; building tools for builders.',
          density: 'comfortable',
          voice: {
            tone: ['confident', 'technical', 'precise'],
            samples: [
              { source: 'hero', text: 'Build a real online business' },
              { source: 'cta', text: 'Get started in seconds' },
            ],
          },
        },
      }),
    )
    expect(withVoice).toContain('## Voice')
    expect(withVoice).toContain('`confident` · `technical` · `precise`')
    expect(withVoice).toContain('Build a real online business')
    // summary lifts into header blockquote
    expect(withVoice).toContain('Confident technical precision')
    // density flag in subheader
    expect(withVoice).toContain('density: `comfortable`')
  })

  it('augments color rows with LLM-inferred role when deterministic role is blank', () => {
    const md = buildExtractedDesignMarkdown(
      baseInput({
        tokens: {
          ...baseTokens(),
          colors: [
            { hex: '#635BFF', usage: 'button-primary' }, // no role
            { hex: '#0a2540', role: 'text', usage: 'h1' }, // deterministic role wins
          ],
        },
        semantic: {
          colorRoles: [
            { hex: '#635BFF', role: 'brand' },
            { hex: '#0a2540', role: 'accent' }, // would be ignored — deterministic role wins
          ],
        },
      }),
    )
    // LLM role fills the blank slot
    expect(md).toContain('| `#635BFF` |')
    expect(md).toMatch(/`#635BFF`.*\| brand \|/)
    // deterministic role is preserved over LLM
    expect(md).toMatch(/`#0a2540`.*\| text \|/)
  })

  it('omits "pending LLM pass" footer once semantic has run', () => {
    const without = buildExtractedDesignMarkdown(baseInput())
    expect(without).toContain('Semantic fields')
    expect(without).toContain('pending LLM pass')

    const withSemantic = buildExtractedDesignMarkdown(
      baseInput({
        semantic: { summary: 's', density: 'comfortable' },
      }),
    )
    expect(withSemantic).not.toContain('pending LLM pass')
  })

  it('emits gradients/patterns/borders/focus-rings when present', () => {
    const md = buildExtractedDesignMarkdown(
      baseInput({
        tokens: {
          ...baseTokens(),
          gradients: [
            {
              kind: 'linear',
              angle: '135deg',
              stops: [
                { color: '#635bff', position: '0%' },
                { color: '#00d4ff', position: '100%' },
              ],
              raw: 'linear-gradient(135deg, #635bff 0%, #00d4ff 100%)',
            },
          ],
          patterns: [{ kind: 'noise', raw: '/textures/noise-low.png' }],
          borderStyles: [{ width: '1px', color: '#e5e7eb', style: 'solid' }],
          focusRings: [{ outline: '2px solid #635bff', outlineOffset: '2px' }],
          glassmorphism: { backdropFilter: 'blur(12px)', samples: [{ blur: '12px', context: 'section' }] },
        },
      }),
    )
    expect(md).toContain('## Gradients')
    expect(md).toContain('linear-gradient(135deg')
    expect(md).toContain('## Patterns')
    expect(md).toContain('noise')
    expect(md).toContain('## Borders')
    expect(md).toContain('1px solid #e5e7eb')
    expect(md).toContain('## Focus rings')
    expect(md).toContain('outline: 2px solid #635bff · offset 2px')
    expect(md).toContain('## Glassmorphism')
    expect(md).toContain('backdrop-filter: blur(12px)')
  })

  it('escapes / falls back gracefully on malformed source URL', () => {
    const md = buildExtractedDesignMarkdown(baseInput({ source: { ...baseInput().source, url: 'not-a-url' } }))
    // host fallback prints url as-is in the H1
    expect(md).toMatch(/^# not-a-url — Atmosphere/)
  })

  it('output is deterministic for fixed input (snapshot-style stability)', () => {
    const a = buildExtractedDesignMarkdown(baseInput())
    const b = buildExtractedDesignMarkdown(baseInput())
    expect(a).toBe(b)
  })

  it('caps hero blockquote and collapses whitespace (long multi-span heroes)', () => {
    // Reproduce the linear/awwwards pattern: largest visible text node is a
    // concat of nav + hero + footnote + tagline run together by the build.
    const heroBlob =
      'Build the product\n  the\n\n team\twants to use.    ' +
      'Then ship it before competitors. ' +
      'Then iterate twenty more times before the year is out, ' +
      'because shipping fast is the moat that compounds and that no one will outwork you on if you do it right.'
    const md = buildExtractedDesignMarkdown(
      baseInput({
        hero: { text: heroBlob, fontSize: 64, source: 'largest-visible-text', selector: 'div' },
      }),
    )
    // Find the hero blockquote, not the header `> Extracted by Coherent...`.
    // It's the `> ` line that immediately follows `## Hero` + detection-method.
    const lines = md.split('\n')
    const heroIdx = lines.findIndex(l => l === '## Hero')
    expect(heroIdx).toBeGreaterThan(-1)
    const heroLine = lines.slice(heroIdx).find(l => l.startsWith('> ')) || ''
    // Whitespace collapsed (no double spaces, no \n, no \t).
    expect(heroLine).not.toMatch(/\s{2,}/)
    expect(heroLine).not.toContain('\n')
    expect(heroLine).not.toContain('\t')
    // Capped (200 chars + leading "> " = 202; tolerate ellipsis).
    expect(heroLine.length).toBeLessThanOrEqual(204)
    expect(heroLine.endsWith('…')).toBe(true)
  })
})

describe('truncateHero', () => {
  it('returns string unchanged when under cap', () => {
    expect(truncateHero('Build a real online business', 200)).toBe('Build a real online business')
  })

  it('collapses whitespace runs to single space', () => {
    expect(truncateHero('a   b\nc\td', 200)).toBe('a b c d')
  })

  it('trims leading and trailing whitespace', () => {
    expect(truncateHero('  hello  ', 200)).toBe('hello')
  })

  it('breaks on word boundary near the cap', () => {
    const long = 'one two three four five six seven eight nine ten'
    const out = truncateHero(long, 22)
    // 22 chars: "one two three four fiv" — last space at "four" → cut there
    expect(out).toBe('one two three four…')
    expect(out.length).toBeLessThanOrEqual(22)
  })

  it('hard-cuts when no word boundary exists in the trailing 20 chars', () => {
    const noSpaces = 'a'.repeat(50)
    const out = truncateHero(noSpaces, 30)
    // 29 chars + ellipsis
    expect(out).toBe('a'.repeat(29) + '…')
  })

  it('handles non-breaking space and other Unicode whitespace', () => {
    expect(truncateHero('a b c', 200)).toBe('a b c')
  })
})
