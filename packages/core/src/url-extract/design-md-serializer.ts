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
    // Cap the blockquote at ~200 chars: design-portfolio sites (linear,
    // awwwards, larevoltosa) often concat a multi-line hero into a single
    // largest-text node, dragging product copy + footnotes into the H1. The
    // long form is preserved in the JSON payload; the MD just stays scannable.
    line('> ' + truncateHero(hero.text, 200))
    push()
  }

  // ─── color ────────────────────────────────────────────────────────────────
  if (tokens.colors.length > 0) {
    line('## Color')
    push()
    // Semantic role pins (LLM, post-validated against deterministic palette)
    // OVERRIDE the deterministic role when the `--semantic` pass ran. Role
    // inference from raw CSS usage is exactly what the LLM beats the extractor
    // at (see semantic-inference.ts docstring): the deterministic layer labels
    // a brand color `background` when it observes it as a link-hover fill, so
    // deferring to it defeats the purpose of paying for the semantic pass. When
    // semantic did NOT run, `roleByHex` is empty and the deterministic role is
    // used unchanged — the free path is untouched.
    const roleByHex = new Map<string, string>()
    for (const cr of semantic?.colorRoles ?? []) {
      roleByHex.set(cr.hex.toLowerCase(), cr.role)
    }
    line('| Token | Hex | Role | Usage |')
    line('|-------|-----|------|-------|')
    for (const c of tokens.colors) {
      const role = roleByHex.get(c.hex.toLowerCase()) || c.role || '—'
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
 * Strip / neutralize byte sequences that turn rendered hero text into an
 * attack surface. Page text is untrusted; once it lands in DESIGN.md or the
 * stdout pipeline it can be cat'd to a TTY, fed to an AI agent, or rendered
 * by a Markdown viewer. We close three classes of payload:
 *
 * 1. C0 / C1 control bytes (incl. ESC / OSC / DCS) — ANSI / terminal hijacks
 *    when output is piped to a TTY. Strip outright. Tab / newline are kept
 *    only briefly; whitespace collapse normalizes them away.
 * 2. Bidi override / isolate controls (RLO, LRO, RLI, LRI, FSI, PDI, PDF)
 *    — Trojan-source / spoofed display. Strip outright; legitimate RTL text
 *    works without explicit overrides.
 * 3. Markdown / HTML metacharacters — a hostile hero could inject
 *    `[click](https://attacker)`, `![tracker](url)`, `<script>`, raw HTML,
 *    or `> ` to break out of the blockquote. Backslash-escape so they
 *    render as literals.
 *
 * Exported for tests; called from `truncateHero`.
 */
export function sanitizeHeroText(raw: string): string {
  // 1. C0 controls (\x00-\x1F) except common whitespace, plus DEL (\x7F),
  // and C1 controls (\x80-\x9F).
  let out = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
  // 2. Bidi overrides + isolates: U+202A..U+202E, U+2066..U+2069
  out = out.replace(/[‪-‮⁦-⁩]/g, '')
  // 3. Markdown + HTML metacharacters that can construct links, images,
  // emphasis, code, blockquote breakouts, tags, or attribute injections.
  out = out.replace(/([\\`*_{}\[\]()#+\-!<>|~])/g, '\\$1')
  return out
}

/**
 * Hero-text normalizer for the Markdown blockquote.
 *
 * 1. Sanitize: drop control bytes + bidi overrides; escape MD/HTML metachars.
 * 2. Collapse every whitespace run (newlines, tabs, multi-space — common in
 *    multi-span heroes assembled by build pipelines) to a single space.
 * 3. Trim leading / trailing whitespace.
 * 4. Cap to `max` Unicode CODE POINTS (not UTF-16 code units; emoji and
 *    surrogate pairs are intact at the boundary). Break on word boundary
 *    near the cap when possible, hard-cut otherwise. Add ellipsis when
 *    truncated.
 *
 * Exported for tests; used here only.
 */
export function truncateHero(raw: string, max: number): string {
  const sanitized = sanitizeHeroText(raw)
  const collapsed = sanitized.replace(/\s+/g, ' ').trim()
  // Iterate by code points, not UTF-16 code units, so a 4-byte emoji counts
  // as ONE step and never splits across the boundary as a lone surrogate.
  const codePoints = Array.from(collapsed)
  if (codePoints.length <= max) return collapsed
  const head = codePoints.slice(0, max - 1)
  const lastSpaceIdx = head.lastIndexOf(' ')
  // Word-boundary break only when (a) a space exists, and (b) it's near the
  // tail (within last 20 code points). Otherwise hard-cut at the head end.
  // Index math is on the code-point array, not UTF-16, so a slice never
  // splits an emoji across the boundary.
  const cutPoints = lastSpaceIdx > 0 && lastSpaceIdx > max - 20 ? head.slice(0, lastSpaceIdx) : head
  return cutPoints.join('') + '…'
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
