/**
 * Color + WCAG contrast helpers for `coherent import design`.
 *
 * Why this file exists: the codebase has NO WCAG contrast computation (only a
 * crude luminance>0.5 foreground picker in tailwind-version.ts, and prompt-text
 * mentions of "4.5:1"). F14's contrast policy is accept-with-warning — we never
 * mutate an imported palette, but we DO compute the real WCAG ratio so the
 * import report can warn on failing pairs and suggest an accessible alternative.
 *
 * Everything here is pure and deterministic (no Date/random) so it is trivially
 * unit-testable.
 */

/** WCAG AA minimum contrast for normal body text. */
export const WCAG_AA_NORMAL = 4.5
/** WCAG AA minimum for large text / UI chrome (e.g. borders, muted labels). */
export const WCAG_AA_LARGE = 3.0

/**
 * Normalize a raw color string to canonical lowercase `#rrggbb`, or return null
 * if it is not a hex color we accept. Handles `#rgb` → `#rrggbb` expansion and
 * an optional leading `#`. We deliberately do NOT accept rgb()/hsl()/named
 * colors in v1 — imported files use hex, and silently coercing other formats
 * would hide malformed input.
 */
export function normalizeHex(raw: string | undefined | null): string | null {
  if (!raw) return null
  let s = raw.trim().replace(/^#/, '').toLowerCase()
  // Expand shorthand: #rgb → #rrggbb, #rgba → #rrggbbaa.
  if (/^[0-9a-f]{3,4}$/.test(s)) {
    s = s
      .split('')
      .map(c => c + c)
      .join('')
  }
  // Drop an alpha channel (#rrggbbaa) — the config stores opaque hex only.
  if (/^[0-9a-f]{8}$/.test(s)) s = s.slice(0, 6)
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`
  return null
}

function channel(hex: string, start: number): number {
  return parseInt(hex.slice(start, start + 2), 16)
}

/** WCAG relative luminance of an `#rrggbb` color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const norm = normalizeHex(hex)
  if (!norm) return 0
  const srgb = [channel(norm, 1), channel(norm, 3), channel(norm, 5)].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
}

/**
 * WCAG contrast ratio between two colors — always ≥ 1. `(L1 + 0.05) / (L2 +
 * 0.05)` with L1 the lighter luminance. Rounded to 2 decimals for stable,
 * human-readable reporting.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  const ratio = (lighter + 0.05) / (darker + 0.05)
  return Math.round(ratio * 100) / 100
}

/**
 * Suggest an accessible foreground for `fg` against `bg` reaching `target`
 * contrast, WITHOUT changing hue where possible: we blend `fg` toward whichever
 * pole (black/white) already contrasts with the background, in small steps,
 * returning the first hex that clears the bar. Returns null if `fg` already
 * passes (no suggestion needed) or no adjustment reaches the target.
 *
 * This is a recommendation only — the caller never applies it. Accept-with-
 * warning: fidelity to the imported palette wins.
 */
export function suggestAccessibleForeground(fg: string, bg: string, target: number = WCAG_AA_NORMAL): string | null {
  const nfg = normalizeHex(fg)
  const nbg = normalizeHex(bg)
  if (!nfg || !nbg) return null
  if (contrastRatio(nfg, nbg) >= target) return null

  // Pick the pole (black or white) that maximizes contrast against the bg.
  const pole = relativeLuminance(nbg) > 0.5 ? '#000000' : '#ffffff'
  const [fr, fgc, fb] = [channel(nfg, 1), channel(nfg, 3), channel(nfg, 5)]
  const [pr, pg, pb] = [channel(pole, 1), channel(pole, 3), channel(pole, 5)]
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0')

  for (let step = 1; step <= 20; step++) {
    const t = step / 20
    const blended = `#${toHex(fr + (pr - fr) * t)}${toHex(fgc + (pg - fgc) * t)}${toHex(fb + (pb - fb) * t)}`
    if (contrastRatio(blended, nbg) >= target) return blended
  }
  return pole
}
