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

export function pickCentroid<T extends { hex: string }>(group: T[], counts: Map<string, number>): T {
  const tally = new Map<string, { token: T; count: number }>()
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

/**
 * Cluster items by ΔE_OK with COMPLETE LINKAGE: a candidate joins a group only
 * if it's within DELTA_E_MERGE_THRESHOLD of EVERY existing member, not just the
 * seed. Single-link merging would silently widen groups beyond the threshold
 * along chains (A↔B<2, B↔C<2, A↔C≈3.6 → all merged at seed=B).
 *
 * Returns the cluster groups (each a list of input items sharing a hex bucket).
 */
function clusterByDeltaE<T extends { hex: string }>(items: T[], counts: Map<string, number>): T[][] {
  const uniqHex = new Map<string, T>()
  for (const t of items) if (!uniqHex.has(t.hex)) uniqHex.set(t.hex, t)
  const unique = [...uniqHex.values()]

  const oklch = new Map<string, OklchColor>()
  for (const t of unique) oklch.set(t.hex, hexToOklch(t.hex))

  const sorted = [...unique].sort((a, b) => (counts.get(b.hex) ?? 0) - (counts.get(a.hex) ?? 0))

  const visited = new Set<string>()
  const groups: T[][] = []
  for (const seed of sorted) {
    if (visited.has(seed.hex)) continue
    const group: T[] = [seed]
    visited.add(seed.hex)
    for (const other of sorted) {
      if (visited.has(other.hex)) continue
      const otherC = oklch.get(other.hex)!
      let joins = true
      for (const member of group) {
        if (deltaE(oklch.get(member.hex)!, otherC) * 100 >= DELTA_E_MERGE_THRESHOLD) {
          joins = false
          break
        }
      }
      if (joins) {
        group.push(other)
        visited.add(other.hex)
      }
    }
    groups.push(group)
  }

  return groups
}

function mergeWithinRole(items: ExtractedColorToken[], counts: Map<string, number>): ExtractedColorToken[] {
  return clusterByDeltaE(items, counts).map(g => pickCentroid(g, counts))
}

/** A trailing value more than this many times its predecessor is a one-off gap, not part of the rhythm. */
const SPACING_OUTLIER_RATIO = 4
/** Never trim a spacing scale below this many values — a short scale has no confident outlier. */
const SPACING_MIN_KEEP = 4

export function normalizeSpacing(spacing: ExtractedDesignTokens['spacing']): ExtractedDesignTokens['spacing'] {
  const seen = new Map<number, ExtractedDesignTokens['spacing'][number]>()
  for (const s of spacing) {
    const px = Math.round(s.px)
    if (px <= 0) continue
    if (!seen.has(px)) seen.set(px, { ...s, px })
  }
  const sorted = [...seen.values()].sort((a, b) => a.px - b.px)
  // Trim trailing outliers: a value >4× its predecessor is a section-gap /
  // one-off (e.g. a 208px hero margin sitting next to a 4–40px content ramp),
  // not part of the spacing rhythm — it reads as junk in the DESIGN.md scale.
  // Keep at least SPACING_MIN_KEEP so a legitimately short scale is never gutted,
  // and only trim the tail so a wide-but-continuous scale (8→272) is preserved.
  while (sorted.length > SPACING_MIN_KEEP) {
    const last = sorted[sorted.length - 1].px
    const prev = sorted[sorted.length - 2].px
    if (prev > 0 && last / prev > SPACING_OUTLIER_RATIO) sorted.pop()
    else break
  }
  return sorted
}

export function normalizeBreakpoints(
  breakpoints: ExtractedDesignTokens['breakpoints'],
): ExtractedDesignTokens['breakpoints'] {
  // The raw capture emits one entry per distinct media-query width — often 20+
  // rows: many widths bucketed under the same name (8× `sm`) plus scraped
  // one-offs whose "name" is literally the width (`2300px`). Collapse to one
  // representative per named bucket (the smallest width = the bucket's entry
  // point) and drop digit-named junk, so DESIGN.md shows a real breakpoint set.
  const perName = new Map<string, number>()
  for (const b of breakpoints.values) {
    if (/\d/.test(b.name)) continue // drop width-named one-offs (e.g. "2300px")
    const cur = perName.get(b.name)
    if (cur === undefined || b.px < cur) perName.set(b.name, b.px)
  }
  const values = [...perName.entries()].map(([name, px]) => ({ name, px })).sort((a, b) => a.px - b.px)
  return { ...breakpoints, values }
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
    breakpoints: normalizeBreakpoints(tokens.breakpoints),
    motion: { ...tokens.motion, tokens: normalizeMotion(tokens.motion.tokens) },
    backgrounds: normalizeBackgrounds(tokens.backgrounds, opts.colorOccurrences),
  }
}

/**
 * Cluster background.solid hexes the same way as colors, then remap
 * background.roles values to the canonical centroid hex. Without this,
 * design-md-serializer prints a single normalized solid in the color table
 * while leaving the dropped variant referenced under role labels — DESIGN.md
 * looks self-contradictory.
 */
export function normalizeBackgrounds(
  backgrounds: ExtractedDesignTokens['backgrounds'],
  externalCounts?: Map<string, number>,
): ExtractedDesignTokens['backgrounds'] {
  if (backgrounds.solid.length === 0) {
    return backgrounds
  }

  const counts = new Map<string, number>()
  for (const s of backgrounds.solid) counts.set(s.hex, (counts.get(s.hex) ?? 0) + 1)
  if (externalCounts) {
    for (const [hex, n] of externalCounts) counts.set(hex, n)
  }

  const buckets = new Map<string | undefined, ExtractedDesignTokens['backgrounds']['solid']>()
  for (const s of backgrounds.solid) {
    const arr = buckets.get(s.role) ?? []
    arr.push(s)
    buckets.set(s.role, arr)
  }

  const hexMap = new Map<string, string>()
  const solid: ExtractedDesignTokens['backgrounds']['solid'] = []
  for (const [, items] of buckets) {
    const groups = clusterByDeltaE(items, counts)
    for (const g of groups) {
      const centroid = pickCentroid(g, counts)
      solid.push(centroid)
      for (const member of g) hexMap.set(member.hex, centroid.hex)
    }
  }

  const remap = (hex: string | undefined): string | undefined =>
    hex === undefined ? undefined : (hexMap.get(hex) ?? hex)

  return {
    solid,
    roles: {
      page: remap(backgrounds.roles.page),
      section: remap(backgrounds.roles.section),
      card: remap(backgrounds.roles.card),
      elevated: remap(backgrounds.roles.elevated),
    },
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
