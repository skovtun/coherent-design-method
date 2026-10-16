// Light shades are dark enough for white primary-foreground text (WCAG AA);
// dark shades are light enough for dark text on a dark background.
const COLOR_MAP: Record<string, { light: string; dark: string }> = {
  zinc: { light: '#18181b', dark: '#fafafa' },
  emerald: { light: '#059669', dark: '#34d399' },
  indigo: { light: '#4f46e5', dark: '#818cf8' },
  rose: { light: '#e11d48', dark: '#fb7185' },
  amber: { light: '#d97706', dark: '#fbbf24' },
  teal: { light: '#0d9488', dark: '#2dd4bf' },
  violet: { light: '#7c3aed', dark: '#a78bfa' },
  slate: { light: '#475569', dark: '#cbd5e1' },
  // Brand words the planner emits that the original 8 hues missed. An unknown
  // hint silently fell back to default blue (PJ-023: "terracotta" → #3B82F6).
  terracotta: { light: '#b5532f', dark: '#e07a52' },
  rust: { light: '#a8431f', dark: '#e0835c' },
  orange: { light: '#c2410c', dark: '#fb923c' },
  coral: { light: '#c2453b', dark: '#f48b7f' },
  red: { light: '#b91c1c', dark: '#f87171' },
  burgundy: { light: '#7f1d1d', dark: '#f2a3a3' },
  pink: { light: '#be185d', dark: '#f472b6' },
  plum: { light: '#7e3a6e', dark: '#d49ac6' },
  purple: { light: '#7e22ce', dark: '#c084fc' },
  navy: { light: '#1e3a8a', dark: '#93c5fd' },
  sky: { light: '#0369a1', dark: '#7dd3fc' },
  cyan: { light: '#0e7490', dark: '#67e8f9' },
  mint: { light: '#0f766e', dark: '#5eead4' },
  green: { light: '#15803d', dark: '#4ade80' },
  forest: { light: '#2f5d3a', dark: '#7fb38a' },
  sage: { light: '#55705a', dark: '#a3bfa5' },
  olive: { light: '#5f6b2e', dark: '#b5bf7a' },
  lime: { light: '#4d7c0f', dark: '#a3e635' },
  gold: { light: '#a16207', dark: '#facc15' },
  brown: { light: '#6b4226', dark: '#c89f7e' },
  espresso: { light: '#3b2a20', dark: '#d6bfa9' },
  stone: { light: '#44403c', dark: '#e7e5e4' },
  charcoal: { light: '#27272a', dark: '#e4e4e7' },
  black: { light: '#0a0a0a', dark: '#fafafa' },
}

const HEX_RE = /^#[0-9a-f]{6}$/i

export function resolveColorPreset(hint: string): { light: string; dark: string } | null {
  if (!hint) return null
  const h = hint.trim().toLowerCase()
  if (h === 'blue') return null
  if (HEX_RE.test(h)) return { light: h, dark: h }
  return COLOR_MAP[h] ?? COLOR_MAP[h.split(/[\s-]+/).pop() ?? ''] ?? null
}

type SurfaceTokens = {
  background: string
  foreground: string
  muted: string
  accent: string
  border: string
  secondary: string
}

// Atmosphere backgrounds that only shaped class directives before; the tokens
// stayed #FFFFFF / #F3F4F6 with a violet secondary, so "warm editorial" pages
// rendered on cold gray (PJ-023).
const SURFACE_MAP: Record<string, { light: SurfaceTokens; dark: SurfaceTokens }> = {
  'warm-stone': {
    light: {
      background: '#faf8f4',
      foreground: '#1c1917',
      muted: '#f1ece4',
      accent: '#f1ece4',
      border: '#e4ddd2',
      secondary: '#57534e',
    },
    dark: {
      background: '#1c1917',
      foreground: '#f5f5f4',
      muted: '#292524',
      accent: '#292524',
      border: '#3f3a36',
      secondary: '#a8a29e',
    },
  },
  'soft-warm': {
    light: {
      background: '#fffbf5',
      foreground: '#292524',
      muted: '#fbf1e4',
      accent: '#fbf1e4',
      border: '#f0e3d0',
      secondary: '#78716c',
    },
    dark: {
      background: '#1f1b16',
      foreground: '#f5f0e8',
      muted: '#2b251e',
      accent: '#2b251e',
      border: '#40372c',
      secondary: '#a8a29e',
    },
  },
}

export function resolveSurfacePreset(background: string): { light: SurfaceTokens; dark: SurfaceTokens } | null {
  return SURFACE_MAP[background] ?? null
}
