import type { ExtractedColorToken, ExtractedDesignTokens, MotionToken } from './types.js'

const DELTA_E_MERGE_THRESHOLD = 2.0
const MS_GRID = 10

export interface OklchColor {
  L: number
  C: number
  h: number
}

export function hexToOklch(hex: string): OklchColor {
  const { r, g, b } = hexToRgb(hex)
  const lr = srgbToLinear(r / 255)
  const lg = srgbToLinear(g / 255)
  const lb = srgbToLinear(b / 255)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const C = Math.sqrt(a * a + bb * bb)
  const h = Math.atan2(bb, a)
  return { L, C, h }
}

export function deltaE(a: OklchColor, b: OklchColor): number {
  const dL = a.L - b.L
  const ax = a.C * Math.cos(a.h)
  const ay = a.C * Math.sin(a.h)
  const bx = b.C * Math.cos(b.h)
  const by = b.C * Math.sin(b.h)
  const da = ax - bx
  const db = ay - by
  return Math.sqrt(dL * dL + da * da + db * db)
}

export function pickCentroid(group: ExtractedColorToken[], counts: Map<string, number>): ExtractedColorToken {
  const tally = new Map<string, { token: ExtractedColorToken; count: number }>()
  for (const t of group) {
    const k = t.hex
    if (!tally.has(k)) tally.set(k, { token: t, count: counts.get(k) ?? 1 })
  }
  const entries = [...tally.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count
    return a[0].localeCompare(b[0])
  })
  return entries[0][1].token
}

export function normalizeColors(
  colors: ExtractedColorToken[],
  externalCounts?: Map<string, number>,
): ExtractedColorToken[] {
  if (colors.length === 0) return []

  const counts = new Map<string, number>()
  for (const c of colors) counts.set(c.hex, (counts.get(c.hex) ?? 0) + 1)
  if (externalCounts) {
    for (const [hex, n] of externalCounts) counts.set(hex, n)
  }

  const buckets = new Map<string | undefined, ExtractedColorToken[]>()
  for (const c of colors) {
    const arr = buckets.get(c.role) ?? []
    arr.push(c)
    buckets.set(c.role, arr)
  }

  const out: ExtractedColorToken[] = []
  for (const [, items] of buckets) {
    out.push(...mergeWithinRole(items, counts))
  }
  return out
}

function mergeWithinRole(items: ExtractedColorToken[], counts: Map<string, number>): ExtractedColorToken[] {
  const uniqHex = new Map<string, ExtractedColorToken>()
  for (const t of items) if (!uniqHex.has(t.hex)) uniqHex.set(t.hex, t)
  const unique = [...uniqHex.values()]

  const oklch = new Map<string, OklchColor>()
  for (const t of unique) oklch.set(t.hex, hexToOklch(t.hex))

  const sorted = [...unique].sort((a, b) => (counts.get(b.hex) ?? 0) - (counts.get(a.hex) ?? 0))

  const visited = new Set<string>()
  const groups: ExtractedColorToken[][] = []
  for (const seed of sorted) {
    if (visited.has(seed.hex)) continue
    const group: ExtractedColorToken[] = [seed]
    visited.add(seed.hex)
    const seedC = oklch.get(seed.hex)!
    for (const other of sorted) {
      if (visited.has(other.hex)) continue
      const otherC = oklch.get(other.hex)!
      if (deltaE(seedC, otherC) * 100 < DELTA_E_MERGE_THRESHOLD) {
        group.push(other)
        visited.add(other.hex)
      }
    }
    groups.push(group)
  }

  return groups.map(g => pickCentroid(g, counts))
}

export function normalizeSpacing(spacing: ExtractedDesignTokens['spacing']): ExtractedDesignTokens['spacing'] {
  const seen = new Map<number, ExtractedDesignTokens['spacing'][number]>()
  for (const s of spacing) {
    const px = Math.round(s.px)
    if (px <= 0) continue
    if (!seen.has(px)) seen.set(px, { ...s, px })
  }
  return [...seen.values()]
}

export function normalizeRadius(radius: ExtractedDesignTokens['radius']): ExtractedDesignTokens['radius'] {
  const seen = new Map<number, ExtractedDesignTokens['radius'][number]>()
  for (const r of radius) {
    const px = Math.round(r.px)
    if (px < 0) continue
    if (!seen.has(px)) seen.set(px, { ...r, px })
  }
  return [...seen.values()]
}

export function normalizeMotion(tokens: MotionToken[]): MotionToken[] {
  const seen = new Set<string>()
  const out: MotionToken[] = []
  for (const t of tokens) {
    const ms = parseMs(t.duration)
    if (ms === null || ms <= 0) continue
    const snapped = Math.round(ms / MS_GRID) * MS_GRID
    if (snapped <= 0) continue
    const duration = `${snapped}ms`
    const key = `${duration}|${t.easing}|${t.property ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...t, duration })
  }
  return out
}

export interface NormalizeTokensOptions {
  /** Hex occurrence counts gathered from raw samples before upstream dedup, used as centroid tie-breaker. */
  colorOccurrences?: Map<string, number>
}

export function normalizeTokens(
  tokens: ExtractedDesignTokens,
  opts: NormalizeTokensOptions = {},
): ExtractedDesignTokens {
  return {
    ...tokens,
    colors: normalizeColors(tokens.colors, opts.colorOccurrences),
    spacing: normalizeSpacing(tokens.spacing),
    radius: normalizeRadius(tokens.radius),
    motion: { ...tokens.motion, tokens: normalizeMotion(tokens.motion.tokens) },
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map(c => c + c)
      .join('')
  }
  if (h.length === 8) h = h.slice(0, 6)
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function parseMs(value: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)ms$/.exec(value)
  if (!m) return null
  return parseFloat(m[1])
}
