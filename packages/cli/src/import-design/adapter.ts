/**
 * Adapt a `RawImport` (external names/roles) into an `ImportedDesignSeed`
 * (Coherent vocabulary) and record what happened per token.
 *
 * This is NEW mapping code, not a reuse of `token-normalizer.ts` — that file
 * only dedupes already-structured tokens by ΔE; it never translates an external
 * name like `ink`/`canvas`/`hairline` into `foreground`/`background`/`border`.
 *
 * Contrast is NOT evaluated here (it needs the MERGED config, since foreground
 * and background may come from different sources); see `apply.ts`.
 */

import { normalizeHex } from './color-utils.js'
import type { Disposition, ImportedDesignSeed, RawColor, RawImport, TokenReportEntry } from './types.js'

export type ColorTarget =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'background'
  | 'foreground'
  | 'muted'
  | 'border'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'

export const COLOR_TARGETS: ColorTarget[] = [
  'primary',
  'secondary',
  'accent',
  'background',
  'foreground',
  'muted',
  'border',
  'success',
  'warning',
  'error',
  'info',
]

/** Exact external → Coherent aliases (name normalized: lowercased, non-alnum stripped to compare via prefix). */
const ALIASES: Record<string, ColorTarget> = {
  primary: 'primary',
  brand: 'primary',
  main: 'primary',
  cta: 'primary',
  secondary: 'secondary',
  accent: 'accent',
  foreground: 'foreground',
  text: 'foreground',
  ink: 'foreground',
  content: 'foreground',
  body: 'foreground',
  copy: 'foreground',
  fg: 'foreground',
  onsurface: 'foreground',
  onbackground: 'foreground',
  background: 'background',
  bg: 'background',
  canvas: 'background',
  surface: 'background',
  base: 'background',
  paper: 'background',
  page: 'background',
  backdrop: 'background',
  muted: 'muted',
  subtle: 'muted',
  mute: 'muted',
  tertiary: 'muted',
  border: 'border',
  hairline: 'border',
  divider: 'border',
  stroke: 'border',
  outline: 'border',
  line: 'border',
  rule: 'border',
  success: 'success',
  positive: 'success',
  ok: 'success',
  warning: 'warning',
  warn: 'warning',
  caution: 'warning',
  error: 'error',
  danger: 'error',
  destructive: 'error',
  negative: 'error',
  critical: 'error',
  info: 'info',
  information: 'info',
  informational: 'info',
}

/** Coherent-native token names — matching one is `imported`, not `mapped`. */
const NATIVE_NAMES = new Set<string>(COLOR_TARGETS)

/** Derived tokens the CSS generators recompute — never imported, quietly dropped. */
const DERIVED_NAMES = new Set([
  'primaryforeground',
  'secondaryforeground',
  'mutedforeground',
  'accentforeground',
  'destructiveforeground',
  'cardforeground',
  'popoverforeground',
  'card',
  'popover',
  'input',
  'ring',
])

export interface AdaptResult {
  seed: ImportedDesignSeed
  entries: TokenReportEntry[]
  filledColors: Set<ColorTarget>
  filledFonts: Set<'sans' | 'mono'>
}

interface Candidate {
  target: ColorTarget
  kind: 'imported' | 'mapped'
  score: number // higher wins when several colors compete for one target
  color: RawColor
}

export function adaptImport(raw: RawImport): AdaptResult {
  const entries: TokenReportEntry[] = []
  const candidates: Candidate[] = []
  const dropped: Array<{ color: RawColor; note: string }> = []

  for (const color of raw.colors) {
    const c = classify(color, raw.grammar)
    if (c) candidates.push(c)
    else dropped.push({ color, note: unmappableNote(color) })
  }

  // Resolve conflicts: for each target keep the best-scoring candidate (ties
  // broken by parse order — first wins). Losers are dropped as duplicates.
  const winners = new Map<ColorTarget, Candidate>()
  for (const cand of candidates) {
    const existing = winners.get(cand.target)
    if (!existing || cand.score > existing.score) {
      if (existing) dropped.push({ color: existing.color, note: `duplicate of ${cand.target}` })
      winners.set(cand.target, cand)
    } else {
      dropped.push({ color: cand.color, note: `duplicate of ${cand.target}` })
    }
  }

  const colors: Record<string, string> = {}
  const filledColors = new Set<ColorTarget>()
  for (const [target, cand] of winners) {
    colors[target] = cand.color.hex
    filledColors.add(target)
    const repaired = isRepaired(cand.color)
    entries.push({
      token: target,
      disposition: repaired ? 'repaired' : cand.kind,
      from: externalLabel(cand.color, target),
      value: cand.color.hex,
      note: repaired ? `normalized ${cand.color.raw} → ${cand.color.hex}` : undefined,
    })
  }
  for (const d of dropped) {
    entries.push({
      token: d.color.name ?? d.color.role ?? d.color.hex,
      disposition: 'dropped',
      value: d.color.hex,
      note: d.note,
    })
  }

  // Fonts + fresh fallback policy.
  const fontFamily: { sans?: string; mono?: string } = {}
  const filledFonts = new Set<'sans' | 'mono'>()
  if (raw.fontSans) {
    fontFamily.sans = withFallback(raw.fontSans, 'sans')
    filledFonts.add('sans')
    entries.push({
      token: 'fontFamily.sans',
      disposition: fontFamily.sans === raw.fontSans ? 'imported' : 'repaired',
      value: fontFamily.sans,
      note: fontFamily.sans === raw.fontSans ? undefined : 'added generic fallback',
    })
  }
  if (raw.fontMono) {
    fontFamily.mono = withFallback(raw.fontMono, 'mono')
    filledFonts.add('mono')
    entries.push({
      token: 'fontFamily.mono',
      disposition: fontFamily.mono === raw.fontMono ? 'imported' : 'repaired',
      value: fontFamily.mono,
      note: fontFamily.mono === raw.fontMono ? undefined : 'added generic fallback',
    })
  }

  const seed: ImportedDesignSeed = {
    colors: colors as ImportedDesignSeed['colors'],
    fontFamily,
    source: raw.source,
    name: raw.name,
  }
  return { seed, entries, filledColors, filledFonts }
}

function classify(color: RawColor, grammar: RawImport['grammar']): Candidate | null {
  // Role-based grammar (Atmosphere): map by semantic role.
  if (grammar === 'coherent-extract') {
    const t = classifyByRole(color)
    return t ? { target: t.target, kind: 'mapped', score: t.score, color } : null
  }

  // Name-based grammars (config, stitch).
  const key = normalizeName(color.name)
  if (!key) return null
  if (DERIVED_NAMES.has(key)) return null
  if (NATIVE_NAMES.has(key)) {
    return { target: key as ColorTarget, kind: 'imported', score: 3, color }
  }
  if (ALIASES[key]) {
    return { target: ALIASES[key], kind: 'mapped', score: 2, color }
  }
  // First-segment match: `primary-deep` → `primary`, `ink-secondary` → `ink`,
  // `canvas-soft` → `canvas`. Split on the ORIGINAL separators so we match a
  // real token segment, not an arbitrary prefix — `linear`/`basecolor`/`okactive`
  // (single segment, not an alias) correctly DON'T match. Lower score so an
  // exact `primary` always wins the slot.
  const firstSegment = (color.name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)[0]
  if (firstSegment && firstSegment !== key && ALIASES[firstSegment]) {
    return { target: ALIASES[firstSegment], kind: 'mapped', score: 1, color }
  }
  return null
}

function classifyByRole(color: RawColor): { target: ColorTarget; score: number } | null {
  const role = (color.role ?? '').toLowerCase()
  switch (role) {
    case 'brand':
      return { target: 'primary', score: 3 }
    case 'accent':
      return { target: 'accent', score: 3 }
    case 'text':
      return { target: 'foreground', score: 3 }
    case 'background':
      return { target: 'background', score: 3 }
    case 'border':
      return { target: 'border', score: 3 }
    case 'neutral':
      return { target: 'muted', score: 2 }
    case 'semantic': {
      const t = classifySemantic(color)
      return t ? { target: t, score: 3 } : null
    }
    default:
      return null
  }
}

/** Classify a `semantic` extract color into a status token via usage keyword, then hue. */
function classifySemantic(color: RawColor): ColorTarget | null {
  const hint = `${color.usage ?? ''} ${color.name ?? ''}`.toLowerCase()
  if (/error|danger|destruct|negativ|critical|fail/.test(hint)) return 'error'
  if (/warn|caution|alert/.test(hint)) return 'warning'
  if (/success|positive|confirm|valid/.test(hint)) return 'success'
  if (/info|notice|neutral/.test(hint)) return 'info'
  return classifyHue(color.hex)
}

function classifyHue(hex: string): ColorTarget | null {
  const norm = normalizeHex(hex)
  if (!norm) return null
  const r = parseInt(norm.slice(1, 3), 16) / 255
  const g = parseInt(norm.slice(3, 5), 16) / 255
  const b = parseInt(norm.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta < 0.08) return null // grayscale — not a status color
  let h = 0
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h = (h * 60 + 360) % 360
  if (h < 15 || h >= 345) return 'error'
  if (h < 65) return 'warning'
  if (h < 170) return 'success'
  if (h < 260) return 'info'
  return 'error' // magenta/pink → treat as error-adjacent
}

/**
 * Fresh font-fallback policy (no such policy existed in `extract`). A bare
 * family name (no comma, i.e. not already a stack) gets a sensible generic
 * appended so the CSS never dead-ends on a single unavailable face.
 */
function withFallback(family: string, slot: 'sans' | 'mono'): string {
  const f = family.trim()
  if (f.includes(',')) return f // already a stack — respect the author's choice
  if (slot === 'mono') return `${f}, monospace`
  if (/serif/i.test(f) && !/sans/i.test(f)) return `${f}, serif`
  return `${f}, system-ui, sans-serif`
}

function normalizeName(name: string | undefined): string | null {
  if (!name) return null
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isRepaired(color: RawColor): boolean {
  if (!color.raw) return false
  const asWritten = color.raw.trim().toLowerCase()
  const withHash = asWritten.startsWith('#') ? asWritten : `#${asWritten}`
  return withHash !== color.hex
}

function externalLabel(color: RawColor, target: ColorTarget): string | undefined {
  const ext = color.name ?? color.role
  if (!ext) return undefined
  return normalizeName(ext) === target ? undefined : ext
}

function unmappableNote(color: RawColor): string {
  const key = normalizeName(color.name)
  if (key && DERIVED_NAMES.has(key)) return 'derived token, recomputed by Coherent'
  if (color.role) return `role "${color.role}" has no Coherent target`
  return 'unrecognized token name'
}

/** Disposition ordering for stable, readable report grouping. */
export const DISPOSITION_ORDER: Disposition[] = ['imported', 'mapped', 'repaired', 'kept', 'dropped']
