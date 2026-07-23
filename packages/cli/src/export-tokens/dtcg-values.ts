/**
 * DTCG 2025.10 value converters — turn Coherent's stored token strings into the
 * conformant object-value forms required by the now-stable W3C Design Tokens
 * Format Module (https://www.designtokens.org/tr/2025.10/).
 *
 * Two normative facts drive this file:
 *   - color:     $value MUST be an object { colorSpace, components[, alpha, hex] }.
 *                A bare hex string is NOT conformant (Color module 2025.10).
 *   - dimension: $value MUST be an object { value: number, unit: "px" | "rem" }.
 *                A bare "8px" string is NOT conformant, and `unit` is required
 *                even when `value` is 0.
 *
 * Coherent stores colors as hex and dimensions as CSS length strings, so these
 * cover the real inputs. Each converter returns `null` for anything it cannot
 * faithfully represent (an exotic color function, a `vh`/`%` unit) — the caller
 * falls back to the legacy string form for that one token rather than inventing
 * components or dropping data.
 */

export interface DtcgColorValue {
  colorSpace: 'srgb'
  /** Red, green, blue in the [0, 1] range (per the sRGB color module). */
  components: [number, number, number]
  /** Present only when the source color is not fully opaque. */
  alpha?: number
  /** CSS hex fallback for tools that have not adopted the components form. */
  hex: string
}

export interface DtcgDimensionValue {
  value: number
  unit: 'px' | 'rem'
}

/** Round to 4 decimals — enough to round-trip an 8-bit channel, not noisy. */
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Expand a CSS hex color (#RGB, #RGBA, #RRGGBB, #RRGGBBAA) to [r, g, b, a] with
 * each channel in [0, 255] and alpha in [0, 1]. Returns null for non-hex.
 */
function parseHex(raw: string): { r: number; g: number; b: number; a: number; hex: string } | null {
  const s = raw.trim()
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(s)
  if (!m) return null
  const h = m[1]
  let r: number,
    g: number,
    b: number,
    a = 1
  if (h.length === 3 || h.length === 4) {
    r = parseInt(h[0] + h[0], 16)
    g = parseInt(h[1] + h[1], 16)
    b = parseInt(h[2] + h[2], 16)
    if (h.length === 4) a = parseInt(h[3] + h[3], 16) / 255
  } else if (h.length === 6 || h.length === 8) {
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255
  } else {
    // 5 or 7 hex digits — not a valid CSS hex color.
    return null
  }
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return { r, g, b, a, hex: `#${toHex(r)}${toHex(g)}${toHex(b)}` }
}

/**
 * Parse `rgb()` / `rgba()` with either comma or space syntax and 0-255 or `%`
 * channels. Returns null for anything else (hsl, oklch, named colors) — those
 * are outside the sRGB-components fast path this generator commits to.
 */
function parseRgb(raw: string): { r: number; g: number; b: number; a: number } | null {
  const m = /^rgba?\(\s*([^)]+)\)$/i.exec(raw.trim())
  if (!m) return null
  const parts = m[1].split(/[,/]|\s+/).filter(Boolean)
  if (parts.length < 3) return null
  const chan = (p: string): number | null => {
    if (p.endsWith('%')) {
      const v = Number(p.slice(0, -1))
      return Number.isFinite(v) ? Math.max(0, Math.min(255, (v / 100) * 255)) : null
    }
    const v = Number(p)
    return Number.isFinite(v) ? Math.max(0, Math.min(255, v)) : null
  }
  const r = chan(parts[0])
  const g = chan(parts[1])
  const b = chan(parts[2])
  if (r === null || g === null || b === null) return null
  let a = 1
  if (parts[3] !== undefined) {
    const av = parts[3].endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3])
    if (!Number.isFinite(av)) return null
    a = Math.max(0, Math.min(1, av))
  }
  return { r, g, b, a }
}

/**
 * Convert a CSS color string to the DTCG 2025.10 sRGB object form. Handles hex
 * (3/4/6/8-digit) and rgb()/rgba(); returns null for color functions this
 * generator does not convert (hsl, oklch, lab, named colors).
 */
export function cssColorToDtcg(raw: string): DtcgColorValue | null {
  if (typeof raw !== 'string') return null
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  // Hex carries its own canonical hex string; rgb() synthesizes one from the
  // clamped channels so every conformant token still gets the `hex` fallback.
  const parsed = parseHex(raw)
  const rgb = parsed ?? parseRgb(raw)
  if (!rgb) return null
  const hex = parsed ? parsed.hex : `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
  const value: DtcgColorValue = {
    colorSpace: 'srgb',
    components: [r4(rgb.r / 255), r4(rgb.g / 255), r4(rgb.b / 255)],
    hex,
  }
  // alpha is optional and defaults to 1 — only emit it when the color is not
  // fully opaque, to keep opaque tokens (the overwhelming majority) terse.
  if (rgb.a < 1) value.alpha = r4(rgb.a)
  return value
}

/**
 * Convert a CSS length string to the DTCG 2025.10 dimension object form. Only
 * `px` and `rem` are conformant units; a unitless `0` maps to `{ value: 0,
 * unit: "px" }` (unit is required even at zero). Returns null for any other
 * unit (`em`, `%`, `vh`, …) so the caller can keep the raw string for that
 * token rather than emit a non-conformant dimension.
 */
export function cssDimensionToDtcg(raw: unknown): DtcgDimensionValue | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, unit: 'px' } : null
  }
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  // Unitless zero is a valid CSS length; give it the required unit explicitly.
  if (/^[+-]?0(?:\.0+)?$/.test(s)) return { value: 0, unit: 'px' }
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+))(px|rem)$/i.exec(s)
  if (!m) return null
  const value = Number(m[1])
  if (!Number.isFinite(value)) return null
  return { value, unit: m[2].toLowerCase() as 'px' | 'rem' }
}
