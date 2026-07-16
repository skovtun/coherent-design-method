/**
 * Parse an external DESIGN.md into a `RawImport` (external names/roles intact).
 *
 * Grammar priority (F14 item 0): the Coherent formats come FIRST (gallery M1
 * files depend on the extract serializer's output), Stitch second.
 *
 *   1. coherent-extract — the URL-extract "Atmosphere" serializer output.
 *      Signal: `<!-- coherent-extract: vN -->` comment or `# X — Atmosphere` H1.
 *      Colors live in a `## Color` table `| Token | Hex | Role | Usage |` where
 *      the Token column is the hex; roles are brand/accent/neutral/semantic/…
 *   2. coherent-config — the `coherent chat` DESIGN.md (our config serializer).
 *      Signal: `# X — Design System` H1 or a `| Token | Light | Dark |` table.
 *      Token column holds Coherent's own semantic names.
 *   3. stitch — Google Stitch / awesome-design-md. Machine-readable YAML
 *      frontmatter (`colors:` flat map, `typography:` per-role maps) is the
 *      source of truth; a body `## Colors` bullet list is the fallback.
 *
 * The `source:` frontmatter token (gallery attribution) is read for ANY grammar.
 */

import { extractFrontmatter } from './safe-yaml.js'
import { normalizeHex } from './color-utils.js'
import type { Grammar, RawColor, RawImport } from './types.js'

const MONO_RE = /mono|consol|courier|menlo|cascadia|source\s*code|fira\s*code|roboto\s*mono|jetbrains|\bcode\b/i

export function parseDesignMd(content: string): RawImport {
  const { data: frontmatter, body } = extractFrontmatter(content)
  const grammar = detectGrammar(body, frontmatter)

  let result: RawImport
  switch (grammar) {
    case 'coherent-extract':
      result = parseCoherentExtract(body)
      break
    case 'coherent-config':
      result = parseCoherentConfig(body)
      break
    default:
      result = parseStitch(body, frontmatter)
      break
  }

  // Attribution: prefer an explicit frontmatter `source:`, then the extract
  // serializer's `> ... from \`url\`` blockquote.
  const fmSource = frontmatter && typeof frontmatter.source === 'string' ? frontmatter.source : undefined
  const fmName = frontmatter && typeof frontmatter.name === 'string' ? frontmatter.name : undefined
  result.source = fmSource ?? result.source ?? extractBlockquoteSource(body)
  result.name = result.name ?? fmName ?? extractTitle(body)
  return result
}

function detectGrammar(body: string, frontmatter: Record<string, unknown> | null): Grammar {
  if (/<!--\s*coherent-extract:/i.test(body) || /^#\s+.*—\s*Atmosphere\s*$/m.test(body)) {
    return 'coherent-extract'
  }
  // A frontmatter `colors:` map is the Stitch machine-readable source of truth —
  // it wins over a body table so a Stitch file whose prose happens to contain a
  // `| Token | Light | Dark |` example is not misrouted to the config parser.
  const fmColors = frontmatter?.colors
  if (fmColors && typeof fmColors === 'object' && !Array.isArray(fmColors)) {
    return 'stitch'
  }
  if (/^#\s+.*—\s*Design System\s*$/m.test(body) || /\|\s*Token\s*\|\s*Light\s*\|\s*Dark\s*\|/i.test(body)) {
    return 'coherent-config'
  }
  return 'stitch'
}

// ─── coherent-extract (Atmosphere) ──────────────────────────────────────────

function parseCoherentExtract(body: string): RawImport {
  const colors: RawColor[] = []
  const section = extractSection(body, /^##\s+Color\s*$/m)
  for (const cells of tableRows(section)) {
    // | `#hex` | <swatch> | role | usage |
    if (cells.length < 3) continue
    const raw = stripBackticks(cells[0])
    const hex = normalizeHex(raw)
    if (!hex) continue
    const role = cells[2] && cells[2] !== '—' ? cells[2].toLowerCase() : undefined
    const usage = cells[3] && cells[3] !== '—' ? cells[3] : undefined
    colors.push({ hex, raw, role, usage })
  }
  // `### Backgrounds` bullets — page/section/card/elevated → background role.
  for (const line of section.split('\n')) {
    const m = line.match(/^\s*-\s+\*\*(page|section|card|elevated)\*\*\s+—\s+`(#?[0-9a-fA-F]{3,6})`/)
    if (m) {
      const hex = normalizeHex(m[2])
      if (hex) colors.push({ hex, raw: m[2], role: m[1] === 'page' ? 'background' : 'surface', name: m[1] })
    }
  }

  const { sans, mono } = parseFontBullets(extractSection(body, /^##\s+Typography\s*$/m), false)
  return { grammar: 'coherent-extract', colors, fontSans: sans, fontMono: mono }
}

// ─── coherent-config (chat DESIGN.md) ───────────────────────────────────────

function parseCoherentConfig(body: string): RawImport {
  const colors: RawColor[] = []
  const section = extractSection(body, /^##\s+Color System\s*$/m)
  for (const cells of tableRows(section)) {
    // | `name` | `#light` | `#dark` |
    if (cells.length < 2) continue
    const name = stripBackticks(cells[0]).toLowerCase()
    const raw = stripBackticks(cells[1])
    const hex = normalizeHex(raw)
    if (!name || !hex) continue
    colors.push({ hex, raw, name })
  }
  const { sans, mono } = parseFontBullets(extractSection(body, /^##\s+Typography\s*$/m), true)
  return { grammar: 'coherent-config', colors, fontSans: sans, fontMono: mono }
}

// ─── stitch (frontmatter-first) ─────────────────────────────────────────────

function parseStitch(body: string, frontmatter: Record<string, unknown> | null): RawImport {
  const colors: RawColor[] = []

  const fmColors = frontmatter?.colors
  if (fmColors && typeof fmColors === 'object' && !Array.isArray(fmColors)) {
    for (const [name, value] of Object.entries(fmColors as Record<string, unknown>)) {
      if (typeof value !== 'string') continue
      const hex = normalizeHex(value)
      if (hex) colors.push({ hex, raw: value, name: name.toLowerCase() })
    }
  }

  // Body fallback if frontmatter carried no colors: `- **Name** (`{token}` — `#HEX`): role`
  if (colors.length === 0) {
    const section = extractSection(body, /^##\s+Colors?(?:\s+Palette.*)?\s*$/m)
    for (const line of section.split('\n')) {
      const bullet = line.match(/^\s*-\s+\*\*([^*]+)\*\*.*?`?(#[0-9a-fA-F]{3,6})`?/)
      if (bullet) {
        const hex = normalizeHex(bullet[2])
        if (hex) colors.push({ hex, raw: bullet[2], name: bullet[1].trim().toLowerCase() })
      }
    }
  }

  const fonts = collectStitchFonts(frontmatter, body)
  return { grammar: 'stitch', colors, fontSans: fonts.sans, fontMono: fonts.mono }
}

function collectStitchFonts(
  frontmatter: Record<string, unknown> | null,
  body: string,
): { sans?: string; mono?: string } {
  const families: string[] = []
  const walk = (node: unknown, key?: string): void => {
    if (typeof node === 'string') {
      if (key === 'fontFamily' || key === 'font-family') families.push(node)
      return
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, k)
    }
  }
  if (frontmatter?.typography) walk(frontmatter.typography, 'typography')

  // Body fallback: `### Font Family` heading followed by a bold name / prose.
  if (families.length === 0) {
    const m =
      body.match(/^###?\s*Font\s*Family[^\n]*\n+\s*(?:[-*]\s*)?\*\*([^*\n]+)\*\*/im) ||
      body.match(/\*\*Font\s*Family:?\*\*\s*([^\n]+)/i)
    if (m) families.push(m[1].trim())
  }

  const mono = families.find(f => MONO_RE.test(f))
  const sans = mostFrequent(families.filter(f => f !== mono)) ?? families.find(f => f !== mono)
  return { sans, mono }
}

// ─── shared helpers ─────────────────────────────────────────────────────────

/** Return the body slice from a heading match up to (not including) the next `## ` heading. */
function extractSection(body: string, headingRe: RegExp): string {
  const match = body.match(headingRe)
  if (!match || match.index === undefined) return ''
  const rest = body.slice(match.index + match[0].length)
  const next = rest.search(/^##\s+/m)
  return next === -1 ? rest : rest.slice(0, next)
}

/** Parse markdown table body rows (skips the header + `|---|` separator). */
function tableRows(section: string): string[][] {
  const rows: string[][] = []
  let sawHeader = false
  for (const line of section.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    if (/^\|[\s|:-]+\|?$/.test(t)) continue // separator row
    const cells = t
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim())
    if (!sawHeader) {
      sawHeader = true // first pipe row is the header
      continue
    }
    rows.push(cells)
  }
  return rows
}

/**
 * Parse a `**Font families**` bullet block. `roleLabelled` distinguishes the
 * config grammar (`- **sans** — family`) from the extract grammar (`- family`).
 */
function parseFontBullets(section: string, roleLabelled: boolean): { sans?: string; mono?: string } {
  const families: Array<{ role?: string; family: string }> = []
  let inFonts = false
  for (const line of section.split('\n')) {
    if (/\*\*Font families\*\*/i.test(line)) {
      inFonts = true
      continue
    }
    if (inFonts && /^\*\*/.test(line.trim())) break // next bold sub-heading ends the block
    if (!inFonts) continue
    if (roleLabelled) {
      const m = line.match(/^\s*-\s+\*\*([^*]+)\*\*\s+—\s+(.+)$/)
      if (m) families.push({ role: m[1].trim().toLowerCase(), family: m[2].trim() })
    } else {
      const m = line.match(/^\s*-\s+(.+)$/)
      if (m) families.push({ family: m[1].trim() })
    }
  }
  if (roleLabelled) {
    const sans = families.find(f => f.role === 'sans')?.family ?? families.find(f => f.role !== 'mono')?.family
    const mono = families.find(f => f.role === 'mono')?.family
    return { sans, mono }
  }
  const all = families.map(f => f.family)
  const mono = all.find(f => MONO_RE.test(f))
  const sans = all.find(f => f !== mono)
  return { sans, mono }
}

function stripBackticks(s: string | undefined): string {
  return (s ?? '').replace(/`/g, '').trim()
}

function extractBlockquoteSource(body: string): string | undefined {
  const m = body.match(/from\s+`([^`]+)`/i)
  return m ? m[1] : undefined
}

function extractTitle(body: string): string | undefined {
  const m = body.match(/^#\s+(.+?)(?:\s+—.*)?$/m)
  return m ? m[1].trim() : undefined
}

function mostFrequent(items: string[]): string | undefined {
  if (items.length === 0) return undefined
  const counts = new Map<string, number>()
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1)
  let best: string | undefined
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}
