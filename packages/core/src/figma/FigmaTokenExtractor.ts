/**
 * Extract Coherent design tokens from Figma intermediate data (Story 3.9).
 * Maps Figma color/text/effect styles to ColorToken, typography, and radius.
 */

import type {
  FigmaIntermediateData,
  FigmaColorStyle,
  FigmaTextStyle,
  FigmaEffectStyle,
  FigmaRgba,
} from '../types/figma.js'
import type { DesignTokens, ColorToken } from '../types/design-system.js'
import { figmaRgbaToHex } from './FigmaParser.js'
import { EXAMPLE_MULTIPAGE_CONFIG } from '../types/design-system.js'

/** Result of token extraction: partial tokens to merge with existing config. */
export interface FigmaTokenExtractionResult {
  /** Partial color tokens (light/dark). Merge with defaults for full ColorToken. */
  colors: { light: Partial<ColorToken>; dark: Partial<ColorToken> }
  /** Optional typography overrides (e.g. fontSize from text styles). */
  typography?: Partial<DesignTokens['typography']>
  /** Optional radius (e.g. from effect styles or first radius-like style). */
  radius?: Partial<DesignTokens['radius']>
}

const DEFAULT_LIGHT = EXAMPLE_MULTIPAGE_CONFIG.tokens.colors.light
const DEFAULT_DARK = EXAMPLE_MULTIPAGE_CONFIG.tokens.colors.dark

/** Normalize style name for matching: lowercase, collapse spaces, remove special chars. */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
}

/** Check if Figma color is a real value (not placeholder 0,0,0). */
function isRealColor(rgba: FigmaRgba): boolean {
  return rgba.r > 0 || rgba.g > 0 || rgba.b > 0
}

/**
 * Map Figma color style name to Coherent token key.
 * Primary/Brand → primary, Error/Danger → error, etc.
 */
function colorStyleNameToTokenKey(name: string): keyof ColorToken | null {
  const n = normalizeName(name)
  if (/^(primary|brand|main)$/.test(n)) return 'primary'
  if (n === 'secondary') return 'secondary'
  if (/^accent$/.test(n)) return 'accent'
  if (/^(success|positive)$/.test(n)) return 'success'
  if (n === 'warning') return 'warning'
  if (/^(error|danger|destructive)$/.test(n)) return 'error'
  if (n === 'info') return 'info'
  if (/^(background|bg)$/.test(n)) return 'background'
  if (/^(foreground|text|fg)$/.test(n)) return 'foreground'
  if (/^(muted|neutral|gray|grey)$/.test(n)) return 'muted'
  if (n === 'border') return 'border'
  return null
}

/**
 * Extract design tokens from Figma intermediate data.
 * Uses style names to map to Coherent semantic tokens; fills missing from defaults.
 */
export function extractTokensFromFigma(
  data: FigmaIntermediateData
): FigmaTokenExtractionResult {
  const light: Partial<ColorToken> = {}
  const dark: Partial<ColorToken> = {}

  for (const style of data.colorStyles as FigmaColorStyle[]) {
    const key = colorStyleNameToTokenKey(style.name)
    if (!key) continue
    const hex = isRealColor(style.color)
      ? figmaRgbaToHex(style.color)
      : key === 'accent'
        ? DEFAULT_LIGHT.accent ?? DEFAULT_LIGHT.muted
        : (DEFAULT_LIGHT as Record<string, string>)[key]
    if (hex) {
      light[key] = hex
      // Dark: use same hue with darker/lighter; for simplicity use default dark for now
      dark[key] = (DEFAULT_DARK as Record<string, string>)[key] ?? hex
    }
  }

  // If no Figma colors matched, we could propose tokens for unnamed frequent colors (optional).
  // For now we only map named styles.

  let typography: FigmaTokenExtractionResult['typography'] | undefined
  const textStyles = data.textStyles as FigmaTextStyle[]
  if (textStyles.length > 0) {
    const fontSize: Record<string, string> = {}
    const fontWeight: Record<string, number> = {}
    for (const ts of textStyles) {
      const n = normalizeName(ts.name)
      if (ts.fontSize != null) {
        if (/^(h1|heading\s*1|display|title\s*large)$/.test(n))
          fontSize['2xl'] = `${ts.fontSize}px`
        else if (/^(h2|heading\s*2)$/.test(n)) fontSize['xl'] = `${ts.fontSize}px`
        else if (/^(body|paragraph|text)$/.test(n)) fontSize.base = `${ts.fontSize}px`
        else if (/^(small|caption)$/.test(n)) fontSize.sm = `${ts.fontSize}px`
      }
      if (ts.fontWeight != null) {
        if (ts.fontWeight >= 700) fontWeight.bold = ts.fontWeight
        else if (ts.fontWeight >= 600) fontWeight.semibold = ts.fontWeight
        else if (ts.fontWeight >= 500) fontWeight.medium = ts.fontWeight
      }
    }
    if (Object.keys(fontSize).length > 0 || Object.keys(fontWeight).length > 0) {
      typography = {
        ...(Object.keys(fontSize).length
          ? { fontSize: { ...EXAMPLE_MULTIPAGE_CONFIG.tokens.typography.fontSize, ...fontSize } }
          : undefined),
        ...(Object.keys(fontWeight).length
          ? { fontWeight: { ...EXAMPLE_MULTIPAGE_CONFIG.tokens.typography.fontWeight, ...fontWeight } }
          : undefined),
      } as FigmaTokenExtractionResult['typography']
    }
  }

  let radius: FigmaTokenExtractionResult['radius'] | undefined
  const effectStyles = data.effectStyles as FigmaEffectStyle[]
  for (const es of effectStyles) {
    const n = normalizeName(es.name)
    if ((/radius|rounded|round/i.test(es.name) || n.includes('radius')) && es.radius != null) {
      const value = `${es.radius}px`
      radius = { md: value }
      break
    }
  }

  return { colors: { light, dark }, typography, radius }
}

/**
 * Merge extracted tokens with default tokens to produce full DesignTokens.colors.
 * Used so buildCssVariables receives a full config.
 */
export function mergeExtractedColorsWithDefaults(
  extracted: FigmaTokenExtractionResult
): { light: ColorToken; dark: ColorToken } {
  const light = { ...DEFAULT_LIGHT, ...extracted.colors.light } as ColorToken
  const dark = { ...DEFAULT_DARK, ...extracted.colors.dark } as ColorToken
  return { light, dark }
}
