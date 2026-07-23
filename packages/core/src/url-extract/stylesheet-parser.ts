import type { ComputedStyleSample, ExtractedDesignTokens, GradientToken } from './types.js'
import { splitTopLevelComma } from './computed-style-extractor.js'

/**
 * Parse @media rule text into a normalized breakpoints schema.
 * Strategy heuristic: count min-width vs max-width occurrences across rules.
 */
export function parseBreakpoints(mediaQueries: string[]): ExtractedDesignTokens['breakpoints'] {
  let minCount = 0
  let maxCount = 0
  const values: { name: string; px: number }[] = []
  const seen = new Set<number>()

  for (const mq of mediaQueries) {
    const minMatches = mq.matchAll(/\(\s*min-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/g)
    for (const m of minMatches) {
      minCount++
      const px = Math.round(parseFloat(m[1]))
      if (!seen.has(px) && px > 0) {
        seen.add(px)
        values.push({ name: nameForBreakpoint(px), px })
      }
    }
    const maxMatches = mq.matchAll(/\(\s*max-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)/g)
    for (const m of maxMatches) {
      maxCount++
      const px = Math.round(parseFloat(m[1]))
      if (!seen.has(px) && px > 0) {
        seen.add(px)
        values.push({ name: nameForBreakpoint(px), px })
      }
    }
  }

  values.sort((a, b) => a.px - b.px)

  let strategy: ExtractedDesignTokens['breakpoints']['strategy']
  if (minCount === 0 && maxCount === 0) strategy = 'unknown'
  else if (minCount >= maxCount) strategy = 'mobile-first'
  else strategy = 'desktop-first'

  return { strategy, values }
}

/** Bucket common Tailwind-shaped names; otherwise label by px. */
function nameForBreakpoint(px: number): string {
  if (px <= 480) return 'sm'
  if (px <= 768) return 'md'
  if (px <= 1024) return 'lg'
  if (px <= 1280) return 'xl'
  if (px <= 1536) return '2xl'
  return `${px}px`
}

// ─── gradients / patterns ────────────────────────────────────────────────────

const GRADIENT_KIND_RE = /(linear|radial|conic)-gradient\s*\(/g

/**
 * Walk computed-style samples for `background` / `background-image` declarations
 * containing gradient or pattern signatures. Pure.
 */
export function parseGradients(samples: ComputedStyleSample[]): GradientToken[] {
  const out: GradientToken[] = []
  const seen = new Set<string>()
  for (const s of samples) {
    const sources = [s.styles['background'], s.styles['background-image']].filter(Boolean) as string[]
    for (const src of sources) {
      for (const grad of extractGradientStringsFrom(src)) {
        if (seen.has(grad.raw)) continue
        seen.add(grad.raw)
        out.push(grad)
      }
    }
  }
  // Cap: the broad DOM harvest can surface many one-off gradients; a specimen
  // wants the signature few, not every decorative fill on the page.
  return out.slice(0, 10)
}

/** Internal: pull each `(linear|radial|conic)-gradient(...)` substring respecting paren depth. */
export function extractGradientStringsFrom(value: string): GradientToken[] {
  const out: GradientToken[] = []
  let m: RegExpExecArray | null
  GRADIENT_KIND_RE.lastIndex = 0
  while ((m = GRADIENT_KIND_RE.exec(value)) !== null) {
    const kind = m[1] as GradientToken['kind']
    const start = m.index + m[0].length // position right after the opening paren of the gradient
    let depth = 1
    let i = start
    for (; i < value.length && depth > 0; i++) {
      const c = value[i]
      if (c === '(') depth++
      else if (c === ')') depth--
    }
    if (depth !== 0) break // malformed
    const innerEnd = i - 1
    const inner = value.slice(start, innerEnd).trim()
    const raw = `${kind}-gradient(${inner})`
    out.push(parseGradientInner(kind, inner, raw))
    GRADIENT_KIND_RE.lastIndex = i
  }
  return out
}

function parseGradientInner(kind: GradientToken['kind'], inner: string, raw: string): GradientToken {
  const parts = splitTopLevelComma(inner)
  let angle: string | undefined
  let center: string | undefined
  const stops: GradientToken['stops'] = []

  for (const [idx, part] of parts.entries()) {
    if (idx === 0) {
      // For linear: first part may be an angle ("135deg", "to right") OR a color stop
      if (kind === 'linear') {
        if (/^(?:to\s+|-?\d|\.\d|var\(|calc\()/i.test(part)) {
          angle = part
          continue
        }
      } else if (kind === 'radial' || kind === 'conic') {
        // First part may be shape/position spec
        if (/^(circle|ellipse|at\s|from\s|closest|farthest)/i.test(part)) {
          center = part
          continue
        }
      }
    }
    // Otherwise treat as color stop. Format: "<color> [position]"
    const stopMatch = part.match(/^(.+?)(?:\s+(\d+(?:\.\d+)?(?:%|px|rem|em)))?$/)
    if (stopMatch) {
      stops.push({ color: stopMatch[1].trim(), position: stopMatch[2] })
    } else {
      stops.push({ color: part })
    }
  }

  return { kind, angle, center, stops, raw }
}

const NOISE_HINT_RE = /(noise|grain|fractal|turbulence)/i
const DOT_HINT_RE = /(circle|fill="[^"]+"\s*\/?>\s*<\/?(circle|ellipse))/i

export function parsePatterns(samples: ComputedStyleSample[]): ExtractedDesignTokens['patterns'] {
  const out: ExtractedDesignTokens['patterns'] = []
  const seen = new Set<string>()
  for (const s of samples) {
    const sources = [s.styles['background'], s.styles['background-image']].filter(Boolean) as string[]
    for (const src of sources) {
      for (const url of extractUrls(src)) {
        if (seen.has(url)) continue
        seen.add(url)
        out.push({ kind: classifyPatternUrl(url), raw: url })
      }
    }
  }
  return out.slice(0, 10)
}

/** Pull every `url("…")` (or unquoted) substring. */
export function extractUrls(value: string): string[] {
  const out: string[] = []
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    out.push(m[2])
  }
  return out
}

function classifyPatternUrl(url: string): ExtractedDesignTokens['patterns'][number]['kind'] {
  const lower = url.toLowerCase()
  if (NOISE_HINT_RE.test(lower)) return 'noise'
  if (lower.startsWith('data:image/svg')) {
    if (DOT_HINT_RE.test(decodeURIComponent(lower))) return 'dot'
    if (/path\s+d="[^"]*[Mm]\s*\d+[ ,]\d+\s+[Hh]/.test(decodeURIComponent(lower))) return 'grid'
    return 'svg'
  }
  if (lower.endsWith('.svg')) return 'svg'
  return 'unknown'
}
