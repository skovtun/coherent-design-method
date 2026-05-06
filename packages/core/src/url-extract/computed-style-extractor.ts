import type { ComputedStyleSample, ExtractedColorToken, ExtractedDesignTokens } from './types.js'
import { parseBreakpoints, parseGradients, parsePatterns } from './stylesheet-parser.js'
import { normalizeTokens } from './token-normalizer.js'

export interface ExtractDesignTokensOptions {
  /** @media rule text captured by extractMediaQueriesInPage. */
  mediaQueries?: string[]
}

/**
 * Pure transform: ComputedStyleSample[] → ExtractedDesignTokens.
 * No DOM, no Playwright. Easy to fixture-test.
 *
 * Numerical fields come straight from getComputedStyle — no LLM hallucination.
 * Role inference (brand vs accent) is left to the semantic-inference layer.
 *
 * Pass `opts.mediaQueries` to populate breakpoints; otherwise breakpoints
 * stays at strategy:'unknown'.
 */
export function extractDesignTokens(
  samples: ComputedStyleSample[],
  opts: ExtractDesignTokensOptions = {},
): ExtractedDesignTokens {
  const colors = extractColors(samples)
  const typography = extractTypography(samples)
  const spacing = extractSpacingScale(samples)
  const radius = extractRadiusScale(samples)
  const shadows = extractShadows(samples)
  const motion = { tokens: extractMotionTokens(samples) }
  const backgrounds = extractBackgrounds(samples)
  const zIndexScale = extractZIndex(samples)
  const focusRings = extractFocusRings(samples)
  const linkStates = extractLinkStates(samples)
  const formControlStates = extractFormControlStates(samples)
  const containerWidths = extractContainerWidths(samples)
  const borderStyles = extractBorderStyles(samples)
  const glassmorphism = extractGlassmorphism(samples)
  const iconStyle = extractIconStyle(samples)

  return normalizeTokens(
    {
      colors,
      typography,
      spacing,
      radius,
      shadows,
      motion,
      backgrounds,
      gradients: parseGradients(samples),
      patterns: parsePatterns(samples),
      glassmorphism,
      zIndexScale,
      focusRings,
      linkStates,
      formControlStates,
      breakpoints: parseBreakpoints(opts.mediaQueries ?? []),
      containerWidths,
      borderStyles,
      iconStyle,
    },
    { colorOccurrences: countColorOccurrences(samples) },
  )
}

function countColorOccurrences(samples: ComputedStyleSample[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const s of samples) {
    const fg = rgbToHex(s.styles['color'] || '')
    const bg = rgbToHex(s.styles['background-color'] || '')
    if (fg) counts.set(fg, (counts.get(fg) ?? 0) + 1)
    // Mirror extractColors: skip bg for icon role (icons paint via fg, bg is incidental).
    if (bg && s.role !== 'icon') counts.set(bg, (counts.get(bg) ?? 0) + 1)
  }
  return counts
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const ZERO_RGBA = /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/

export function rgbToHex(rgb: string): string | null {
  if (!rgb || ZERO_RGBA.test(rgb)) return null
  // Already hex
  const hexMatch = rgb.match(/^#([0-9a-fA-F]{3,8})$/)
  if (hexMatch) return rgb.toLowerCase()
  const m = rgb.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  if (!m) return null
  const r = parseInt(m[1], 10)
  const g = parseInt(m[2], 10)
  const b = parseInt(m[3], 10)
  if ([r, g, b].some(n => Number.isNaN(n) || n < 0 || n > 255)) return null
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
}

export function parsePx(value: string | undefined): number | null {
  if (!value) return null
  // Accept "16px", "0", "12.5px" — CSS allows unitless 0
  const m = value.match(/^(-?\d+(?:\.\d+)?)(px)?$/)
  if (!m) return null
  if (!m[2] && parseFloat(m[1]) !== 0) return null // unitless allowed only for 0
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

export function parseMs(value: string | undefined): number | null {
  if (!value) return null
  const m = value.match(/^(-?\d+(?:\.\d+)?)(ms|s)$/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  return m[2] === 's' ? n * 1000 : n
}

/** Splits on commas that are NOT nested inside (...) parens. */
export function splitTopLevelComma(input: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ',' && depth === 0) {
      out.push(input.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = input.slice(start).trim()
  if (last.length > 0) out.push(last)
  return out
}

const dedupe = <T>(xs: T[], keyFn: (x: T) => string): T[] => {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of xs) {
    const k = keyFn(x)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}

// ─── colors ──────────────────────────────────────────────────────────────────

function extractColors(samples: ComputedStyleSample[]): ExtractedColorToken[] {
  const out: ExtractedColorToken[] = []
  for (const s of samples) {
    const fg = rgbToHex(s.styles['color'] || '')
    const bg = rgbToHex(s.styles['background-color'] || '')
    if (fg) out.push({ hex: fg, role: textRoleFor(s.role), usage: `${s.role} text` })
    if (bg && s.role !== 'icon') {
      out.push({ hex: bg, role: bgRoleFor(s.role), usage: `${s.role} background` })
    }
  }
  return dedupe(out, c => `${c.hex}|${c.role}`)
}

function textRoleFor(role: ComputedStyleSample['role']): ExtractedColorToken['role'] {
  if (role === 'a') return 'brand'
  if (role === 'button-primary') return 'brand'
  if (role === 'h1' || role === 'h2' || role === 'h3' || role === 'h4' || role === 'h5' || role === 'h6') return 'text'
  return 'text'
}

function bgRoleFor(role: ComputedStyleSample['role']): ExtractedColorToken['role'] {
  if (role === 'button-primary') return 'brand'
  if (role === 'card' || role === 'section') return 'background'
  return 'background'
}

// ─── typography ──────────────────────────────────────────────────────────────

function extractTypography(samples: ComputedStyleSample[]): ExtractedDesignTokens['typography'] {
  const families = dedupe(
    samples
      .map(s => s.styles['font-family'])
      .filter(Boolean)
      .flatMap(ff => ff.split(',').map(f => f.trim().replace(/^["']|["']$/g, '')))
      .filter(Boolean)
      .map(family => ({ family })),
    f => f.family.toLowerCase(),
  )

  const body = samples.find(s => s.role === 'body' || s.role === 'p')
  const bodySizePx = body ? parsePx(body.styles['font-size']) : null

  const HEADING_ROLES = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
  const headingEntries: ExtractedDesignTokens['typography']['scale'] = []
  // Suspect-landmark filter (issue #98): on h1-less / portfolio sites, the
  // first <h2> element on the page is often a tiny nav label or eyebrow —
  // awwwards.com surfaced h2=14px alongside body=14px, polluting the type
  // scale. A real heading is provably bigger than body copy. Drop any
  // heading whose computed fontSize is not strictly greater than body.
  // Unparseable sizes (`em`, `rem`, `clamp(...)`) survive — we can only
  // drop on hard numerical evidence.
  for (const role of HEADING_ROLES) {
    const sample = samples.find(s => s.role === role)
    if (!sample) continue
    const size = sample.styles['font-size']
    if (!size) continue
    headingEntries.push({
      role,
      fontSize: size,
      lineHeight: sample.styles['line-height'] || undefined,
      fontWeight: parseIntSafe(sample.styles['font-weight']),
      letterSpacing: sample.styles['letter-spacing'] || undefined,
      fontFamily: firstFamily(sample.styles['font-family']),
    })
  }
  const survivors =
    bodySizePx === null
      ? headingEntries
      : headingEntries.filter(e => {
          const px = parsePx(e.fontSize)
          return px === null || px > bodySizePx
        })

  const scale: ExtractedDesignTokens['typography']['scale'] = [...survivors]
  if (body && body.styles['font-size']) {
    scale.push({
      role: 'body',
      fontSize: body.styles['font-size'],
      lineHeight: body.styles['line-height'] || undefined,
      fontWeight: parseIntSafe(body.styles['font-weight']),
      letterSpacing: body.styles['letter-spacing'] || undefined,
      fontFamily: firstFamily(body.styles['font-family']),
    })
  }

  return {
    families,
    scale,
    bodyLineHeight: body?.styles['line-height'] || undefined,
  }
}

function parseIntSafe(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

function firstFamily(ff: string | undefined): string | undefined {
  if (!ff) return undefined
  return ff
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
}

// ─── spacing scale ───────────────────────────────────────────────────────────

function extractSpacingScale(samples: ComputedStyleSample[]): ExtractedDesignTokens['spacing'] {
  const values = new Set<number>()
  for (const s of samples) {
    for (const key of ['padding', 'margin', 'gap']) {
      const v = s.styles[key]
      if (!v) continue
      // shorthand can be "8px 16px 8px 16px" — split by whitespace
      for (const part of v.split(/\s+/)) {
        const n = parsePx(part)
        if (n !== null && n > 0) values.add(n)
      }
    }
  }
  return Array.from(values)
    .sort((a, b) => a - b)
    .slice(0, 12)
    .map(px => ({ px }))
}

// ─── radius / shadows ────────────────────────────────────────────────────────

function extractRadiusScale(samples: ComputedStyleSample[]): ExtractedDesignTokens['radius'] {
  const values = new Set<number>()
  for (const s of samples) {
    const v = s.styles['border-radius']
    if (!v) continue
    for (const part of v.split(/\s+/)) {
      const n = parsePx(part)
      if (n !== null && n >= 0) values.add(n)
    }
  }
  return Array.from(values)
    .sort((a, b) => a - b)
    .map(px => ({ px }))
}

function extractShadows(samples: ComputedStyleSample[]): ExtractedDesignTokens['shadows'] {
  const seen = new Set<string>()
  const out: ExtractedDesignTokens['shadows'] = []
  for (const s of samples) {
    const v = s.styles['box-shadow']
    if (!v || v === 'none') continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push({ value: v })
  }
  return out
}

// ─── motion ──────────────────────────────────────────────────────────────────

function extractMotionTokens(samples: ComputedStyleSample[]): ExtractedDesignTokens['motion']['tokens'] {
  const out: ExtractedDesignTokens['motion']['tokens'] = []
  const seen = new Set<string>()
  for (const s of samples) {
    const dur = s.styles['transition-duration']
    const easing = s.styles['transition-timing-function']
    const property = s.styles['transition-property']
    if (!dur || !easing) continue
    // Split per top-level comma — easing can contain "cubic-bezier(0.45, 0.05, 0.55, 0.95)" with internal commas
    const durs = splitTopLevelComma(dur)
    const eases = splitTopLevelComma(easing)
    const props = splitTopLevelComma(property || '')
    const len = Math.max(durs.length, eases.length)
    for (let i = 0; i < len; i++) {
      const d = parseMs(durs[i] || durs[0])
      const e = eases[i] || eases[0]
      if (d === null || d === 0 || !e) continue
      const key = `${d}|${e}|${props[i] || props[0] || ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ duration: `${d}ms`, easing: e, property: props[i] || props[0] || undefined })
    }
  }
  return out
}

// ─── backgrounds ─────────────────────────────────────────────────────────────

function extractBackgrounds(samples: ComputedStyleSample[]): ExtractedDesignTokens['backgrounds'] {
  const solid: ExtractedDesignTokens['backgrounds']['solid'] = []
  const seen = new Set<string>()
  const roles: ExtractedDesignTokens['backgrounds']['roles'] = {}

  const roleMap: Partial<Record<ComputedStyleSample['role'], 'page' | 'section' | 'card' | 'elevated'>> = {
    body: 'page',
    page: 'page',
    section: 'section',
    card: 'card',
  }

  for (const s of samples) {
    const hex = rgbToHex(s.styles['background-color'] || '')
    if (!hex) continue
    const role = roleMap[s.role]
    if (!seen.has(hex)) {
      seen.add(hex)
      solid.push({ hex, role })
    }
    if (role && !roles[role]) roles[role] = hex
  }
  return { solid, roles }
}

// ─── z-index / containers / glassmorphism ────────────────────────────────────

/**
 * Roles whose semantic name carries layer meaning. Everything else (`a`, `p`,
 * `h1`, `body`, `icon`, …) is just an element that happens to have a z-index;
 * its tag name is not a useful layer label. For those we synthesize `z-${n}`
 * so DESIGN.md "Z-index scale" reads as a real scale instead of a tag dump.
 *
 * Issue #97: awwwards.com produced `{ layer: "a", z: 1 }` from a bare anchor.
 * The Tailwind-style `z-${n}` scheme is the convention readers already expect.
 */
const LAYER_MEANINGFUL_ROLES = new Set<ComputedStyleSample['role']>(['nav', 'footer'])

function extractZIndex(samples: ComputedStyleSample[]): ExtractedDesignTokens['zIndexScale'] {
  const out: ExtractedDesignTokens['zIndexScale'] = []
  const seen = new Set<number>()
  for (const s of samples) {
    const v = s.styles['z-index']
    if (!v || v === 'auto') continue
    const n = parseInt(v, 10)
    if (!Number.isFinite(n)) continue
    if (seen.has(n)) continue
    seen.add(n)
    // Tailwind-style: positive `z-50`, negative `-z-1` (NOT `z--1`).
    // Negative z-index is common for behind-the-flow background layers.
    const layer = LAYER_MEANINGFUL_ROLES.has(s.role) ? s.role : n < 0 ? `-z-${Math.abs(n)}` : `z-${n}`
    out.push({ layer, z: n })
  }
  return out.sort((a, b) => a.z - b.z)
}

function extractContainerWidths(samples: ComputedStyleSample[]): ExtractedDesignTokens['containerWidths'] {
  const out: ExtractedDesignTokens['containerWidths'] = []
  const seen = new Set<string>()
  for (const s of samples) {
    const v = s.styles['max-width']
    if (!v || v === 'none') continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push({ name: s.role, max: v, role: roleToContainerRole(s.role) })
  }
  return out
}

function roleToContainerRole(role: ComputedStyleSample['role']): 'page' | 'prose' | 'media' | 'form' | undefined {
  if (role === 'p') return 'prose'
  if (role === 'card' || role === 'section') return 'page'
  return undefined
}

function extractGlassmorphism(samples: ComputedStyleSample[]): ExtractedDesignTokens['glassmorphism'] {
  const blurs: { blur: string; context?: string }[] = []
  let backdropFilter = ''
  for (const s of samples) {
    const v = s.styles['backdrop-filter']
    if (!v || v === 'none') continue
    backdropFilter = v
    const blur = v.match(/blur\(([^)]+)\)/)
    if (blur) blurs.push({ blur: blur[1].trim(), context: s.role })
  }
  if (blurs.length === 0) return null
  return { backdropFilter, samples: blurs }
}

// ─── focus rings / link / form control state matrices ───────────────────────

function extractFocusRings(samples: ComputedStyleSample[]): ExtractedDesignTokens['focusRings'] {
  const out: ExtractedDesignTokens['focusRings'] = []
  const seen = new Set<string>()
  for (const s of samples) {
    if (s.pseudo !== 'focus' && s.pseudo !== 'focus-visible') continue
    const outline = s.styles['outline']
    const offset = s.styles['outline-offset']
    if (!outline || outline === 'none') continue
    const key = `${outline}|${offset || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ outline, outlineOffset: offset || undefined })
  }
  return out
}

function extractLinkStates(samples: ComputedStyleSample[]): ExtractedDesignTokens['linkStates'] {
  const aDefault = samples.find(s => s.role === 'a' && !s.pseudo)
  const aHover = samples.find(s => s.role === 'a' && s.pseudo === 'hover')
  const aVisited = samples.find(s => s.role === 'a' && s.pseudo === 'visited')
  const styleOf = (s?: ComputedStyleSample) => ({
    color: s?.styles['color'] ? (rgbToHex(s.styles['color']) ?? undefined) : undefined,
    textDecoration: s?.styles['text-decoration'] || undefined,
    fontWeight: s ? parseIntSafe(s.styles['font-weight']) : undefined,
  })
  return {
    default: styleOf(aDefault),
    hover: styleOf(aHover ?? aDefault),
    visited: aVisited ? styleOf(aVisited) : undefined,
  }
}

function extractFormControlStates(samples: ComputedStyleSample[]): ExtractedDesignTokens['formControlStates'] {
  const matrixFor = (role: 'input' | 'button-primary' | 'select') => {
    const find = (pseudo: ComputedStyleSample['pseudo'] | undefined) =>
      samples.find(s => s.role === role && s.pseudo === pseudo)
    const styleOf = (s?: ComputedStyleSample) =>
      s
        ? {
            background: rgbToHex(s.styles['background-color'] || '') ?? undefined,
            color: rgbToHex(s.styles['color'] || '') ?? undefined,
            border: s.styles['border'] || undefined,
            outline: s.styles['outline'] || undefined,
            opacity: parseFloat(s.styles['opacity'] || '1') || undefined,
          }
        : undefined
    const defaultS = styleOf(find(undefined))
    if (!defaultS) return undefined
    return {
      default: defaultS,
      hover: styleOf(find('hover')),
      focus: styleOf(find('focus')) || styleOf(find('focus-visible')),
      active: styleOf(find('active')),
      disabled: styleOf(find('disabled')),
    }
  }
  return {
    input: matrixFor('input'),
    button: matrixFor('button-primary'),
    select: matrixFor('select'),
  }
}

// ─── border styles ───────────────────────────────────────────────────────────

function extractBorderStyles(samples: ComputedStyleSample[]): ExtractedDesignTokens['borderStyles'] {
  const out: ExtractedDesignTokens['borderStyles'] = []
  const seen = new Set<string>()
  for (const s of samples) {
    const v = s.styles['border']
    if (!v || v === 'none' || v.startsWith('0px')) continue
    // shorthand: "1px solid rgb(0,0,0)" or "1px solid #000"
    const m = v.match(/^(\d+(?:\.\d+)?px)\s+(solid|dashed|dotted|double)\s+(.+)$/)
    if (!m) continue
    const key = v
    if (seen.has(key)) continue
    seen.add(key)
    const colorHex = rgbToHex(m[3]) ?? m[3]
    out.push({
      width: m[1],
      color: colorHex,
      style: m[2] as 'solid' | 'dashed' | 'dotted' | 'double',
    })
  }
  return out
}

// ─── icon style ──────────────────────────────────────────────────────────────

function extractIconStyle(samples: ComputedStyleSample[]): ExtractedDesignTokens['iconStyle'] {
  const icon = samples.find(s => s.role === 'icon')
  if (!icon) return { kind: 'unknown' }
  // We don't have direct stroke/fill from getComputedStyle in core sampling — heuristic-only.
  // Width if available via padding-defined area (icon containers often have padding).
  return { kind: 'unknown' }
}
