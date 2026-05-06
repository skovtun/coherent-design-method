import type { ExtractedDesignTokens, HeroDetection, VoiceSchema } from './types.js'
import type { z } from 'zod'

export const EXTRACTED_DESIGN_MD_VERSION = '1' as const

export interface ExtractedAtmosphereForMd {
  source: {
    url: string
    finalUrl?: string
    capturedAt: string
    mode: 'light' | 'dark' | 'cream'
    title?: string
    loadTimeMs?: number
  }
  hero: HeroDetection
  tokens: ExtractedDesignTokens
  /** Optional semantic layer. Empty when LLM pass hasn't run yet. */
  semantic?: {
    summary?: string
    voice?: z.infer<typeof VoiceSchema>
    density?: 'compact' | 'comfortable' | 'spacious'
    /**
     * LLM-inferred color roles, pinned to the deterministic palette by
     * `pinColorRolesToPalette` before reaching here. Hex values match those in
     * `tokens.colors`; the role label augments the role-less deterministic
     * extraction.
     */
    colorRoles?: Array<{
      hex: string
      role: 'brand' | 'accent' | 'neutral' | 'semantic' | 'text' | 'border' | 'background'
    }>
  }
}

/**
 * Pure: ExtractedAtmosphere → DESIGN.md. Same artifact shape as
 * `coherent chat` output (v0.18.0) so AI tools can consume both
 * interchangeably. Sections with no signal are omitted entirely.
 */
export function buildExtractedDesignMarkdown(input: ExtractedAtmosphereForMd): string {
  const { source, hero, tokens, semantic } = input
  const L: string[] = []
  const push = (s = '') => L.push(s)
  const line = (s: string) => push(s)

  // ─── header ───────────────────────────────────────────────────────────────
  const host = safeHost(source.url)
  line(`# ${host || source.url} — Atmosphere`)
  push()
  if (semantic?.summary) {
    line(`> ${semantic.summary}`)
    push()
  }
  line(
    `> Extracted by [Coherent](https://getcoherent.design) from \`${source.url}\` on ${humanDate(source.capturedAt)}.`,
  )
  line(
    `> Mode: \`${source.mode}\`${source.loadTimeMs ? ` · captured in ${source.loadTimeMs}ms` : ''}${
      semantic?.density ? ` · density: \`${semantic.density}\`` : ''
    }`,
  )
  push()
  line(`<!-- coherent-extract: v${EXTRACTED_DESIGN_MD_VERSION} -->`)
  push()

  // ─── hero ─────────────────────────────────────────────────────────────────
  if (hero.text) {
    line('## Hero')
    push()
    line(`**Detected via:** \`${hero.source}\`${hero.fontSize ? ` (${hero.fontSize}px)` : ''}`)
    push()
    line('> ' + hero.text.replace(/\n/g, ' '))
    push()
  }

  // ─── color ────────────────────────────────────────────────────────────────
  if (tokens.colors.length > 0) {
    line('## Color')
    push()
    // Semantic role pins (LLM, post-validated against deterministic palette)
    // augment the role column when the deterministic extractor left it blank.
    const roleByHex = new Map<string, string>()
    for (const cr of semantic?.colorRoles ?? []) {
      roleByHex.set(cr.hex.toLowerCase(), cr.role)
    }
    line('| Token | Hex | Role | Usage |')
    line('|-------|-----|------|-------|')
    for (const c of tokens.colors) {
      const role = c.role || roleByHex.get(c.hex.toLowerCase()) || '—'
      line(`| \`${c.hex}\` | ${swatch(c.hex)} | ${role} | ${c.usage || '—'} |`)
    }
    push()
    if (tokens.backgrounds.solid.length > 0) {
      line('### Backgrounds')
      push()
      const r = tokens.backgrounds.roles
      const rows: [string, string | undefined][] = [
        ['page', r.page],
        ['section', r.section],
        ['card', r.card],
        ['elevated', r.elevated],
      ]
      for (const [role, hex] of rows) {
        if (hex) line(`- **${role}** — \`${hex}\``)
      }
      push()
    }
  }

  // ─── typography ───────────────────────────────────────────────────────────
  if (tokens.typography.families.length > 0 || tokens.typography.scale.length > 0) {
    line('## Typography')
    push()
    if (tokens.typography.families.length > 0) {
      line('**Font families**')
      push()
      for (const f of tokens.typography.families.slice(0, 6)) {
        line(`- ${f.family}`)
      }
      push()
    }
    if (tokens.typography.scale.length > 0) {
      line('**Scale**')
      push()
      line('| Role | Size | Weight | Line height | Family |')
      line('|------|------|--------|-------------|--------|')
      for (const s of tokens.typography.scale) {
        line(
          `| ${s.role} | \`${s.fontSize}\` | ${s.fontWeight ?? '—'} | \`${s.lineHeight ?? '—'}\` | ${s.fontFamily ?? '—'} |`,
        )
      }
      push()
    }
  }

  // ─── spacing / radius / shadows ───────────────────────────────────────────
  if (tokens.spacing.length > 0) {
    line('## Spacing')
    push()
    line('Scale: ' + tokens.spacing.map(s => `\`${s.px}px\``).join(' · '))
    push()
  }
  if (tokens.radius.length > 0) {
    line('## Radius')
    push()
    line('Scale: ' + tokens.radius.map(r => `\`${r.px}px\``).join(' · '))
    push()
  }
  if (tokens.shadows.length > 0) {
    line('## Shadows')
    push()
    for (const s of tokens.shadows) {
      line(`- \`${s.value}\``)
    }
    push()
  }

  // ─── motion ───────────────────────────────────────────────────────────────
  if (tokens.motion.tokens.length > 0) {
    line('## Motion')
    push()
    line('| Duration | Easing | Property |')
    line('|----------|--------|----------|')
    for (const m of tokens.motion.tokens) {
      line(`| \`${m.duration}\` | \`${m.easing}\` | ${m.property ?? '—'} |`)
    }
    push()
  }

  // ─── gradients / patterns ─────────────────────────────────────────────────
  if (tokens.gradients.length > 0) {
    line('## Gradients')
    push()
    for (const g of tokens.gradients) {
      line(`- **${g.kind}** — \`${g.raw}\``)
    }
    push()
  }
  if (tokens.patterns.length > 0) {
    line('## Patterns')
    push()
    for (const p of tokens.patterns) {
      line(`- **${p.kind}** — \`${truncate(p.raw, 100)}\``)
    }
    push()
  }

  // ─── breakpoints / containers ─────────────────────────────────────────────
  if (tokens.breakpoints.values.length > 0) {
    line('## Breakpoints')
    push()
    line(`Strategy: \`${tokens.breakpoints.strategy}\``)
    push()
    line('| Name | Min/Max width |')
    line('|------|---------------|')
    for (const b of tokens.breakpoints.values) {
      line(`| ${b.name} | \`${b.px}px\` |`)
    }
    push()
  }
  if (tokens.containerWidths.length > 0) {
    line('## Container widths')
    push()
    for (const c of tokens.containerWidths) {
      line(`- **${c.name}** (${c.role ?? 'unspecified'}) — \`${c.max}\``)
    }
    push()
  }

  // ─── borders / focus rings / z-index / glassmorphism ──────────────────────
  if (tokens.borderStyles.length > 0) {
    line('## Borders')
    push()
    for (const b of tokens.borderStyles) {
      line(`- \`${b.width} ${b.style} ${b.color}\``)
    }
    push()
  }
  if (tokens.focusRings.length > 0) {
    line('## Focus rings')
    push()
    for (const f of tokens.focusRings) {
      line(`- \`outline: ${f.outline}${f.outlineOffset ? ` · offset ${f.outlineOffset}` : ''}\``)
    }
    push()
  }
  if (tokens.zIndexScale.length > 0) {
    line('## Z-index scale')
    push()
    for (const z of tokens.zIndexScale) {
      line(`- **${z.layer}** — \`${z.z}\``)
    }
    push()
  }
  if (tokens.glassmorphism) {
    line('## Glassmorphism')
    push()
    line(`\`backdrop-filter: ${tokens.glassmorphism.backdropFilter}\``)
    push()
  }

  // ─── voice (semantic) ─────────────────────────────────────────────────────
  if (semantic?.voice && (semantic.voice.tone.length > 0 || semantic.voice.samples.length > 0)) {
    line('## Voice')
    push()
    if (semantic.voice.tone.length > 0) {
      line(`Tone: ${semantic.voice.tone.map(t => `\`${t}\``).join(' · ')}`)
      push()
    }
    for (const s of semantic.voice.samples) {
      line(`- *(${s.source})* "${s.text}"`)
    }
    push()
  }

  // ─── footer ───────────────────────────────────────────────────────────────
  push()
  line(`---`)
  line(
    `Captured deterministically from computed CSS. Numerical fields (color, motion, spacing) reflect the live site at extraction time.${
      semantic ? '' : ' Semantic fields (voice, density, color roles) pending LLM pass.'
    }`,
  )
  push()

  return L.join('\n')
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function humanDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
  } catch {
    return iso
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/**
 * Inline color swatch for GitHub-rendered tables. We use a tiny SVG data URL
 * encoded as a markdown image. Renders as a colored square ~12px next to hex.
 * Falls back to plain text on platforms that strip SVG.
 */
function swatch(hex: string): string {
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex
  const safe = cleaned
    .replace(/[^0-9a-fA-F]/g, '')
    .slice(0, 6)
    .padEnd(6, '0')
  // GitHub renders inline SVG images from data URLs in markdown tables.
  return `![#${safe}](https://placehold.co/16x16/${safe}/${safe}.png)`
}
