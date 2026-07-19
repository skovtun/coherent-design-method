/**
 * Types + schema for `coherent import design`.
 *
 * The `ImportedDesignSeed` is a DEDICATED partial schema, not a reuse of
 * `ExtractedDesignTokensSchema` (which requires ~18 always-present categories:
 * shadows, motion, breakpoints, focus rings, glassmorphism, …). An imported
 * Stitch/Coherent DESIGN.md only carries colors + fonts in v1, so forcing it
 * through the full extract schema would demand fabricating a dozen empty
 * categories. This seed keeps every field optional and maps 1:1 onto the
 * Coherent color/typography vocabulary (see `packages/core` design-system.ts).
 */

import { z } from 'zod'

const Hex = z.string().regex(/^#[0-9a-f]{6}$/, 'must be normalized lowercase #rrggbb')

/**
 * The Coherent color vocabulary, minus the derived tokens (primaryForeground,
 * card, popover, ring, input…) which the CSS generators compute. These are the
 * only colors an import is allowed to set. All optional — a file may carry any
 * subset.
 */
export const ImportedColorsSchema = z
  .object({
    primary: Hex.optional(),
    secondary: Hex.optional(),
    accent: Hex.optional(),
    background: Hex.optional(),
    foreground: Hex.optional(),
    muted: Hex.optional(),
    border: Hex.optional(),
    success: Hex.optional(),
    warning: Hex.optional(),
    error: Hex.optional(),
    info: Hex.optional(),
  })
  .default({})

export type ImportedColors = z.infer<typeof ImportedColorsSchema>

/** Coherent stores font-family as named slots (sans/mono), not a role scale. */
export const ImportedFontsSchema = z
  .object({
    sans: z.string().optional(),
    mono: z.string().optional(),
  })
  .default({})

export type ImportedFonts = z.infer<typeof ImportedFontsSchema>

export const ImportedDesignSeedSchema = z.object({
  colors: ImportedColorsSchema,
  fontFamily: ImportedFontsSchema,
  /** Radius tokens (config names → CSS value), e.g. { full: '9999px', none: '0' }. */
  radius: z.record(z.string(), z.string()).optional(),
  /** Weight tokens (config names → numeric weight), e.g. { bold: 800, normal: 400 }. */
  fontWeight: z.record(z.string(), z.number()).optional(),
  /** fontSize tokens (config names → CSS value), e.g. { base: '1.125rem' }. */
  fontSize: z.record(z.string(), z.string()).optional(),
  /** spacing tokens (config names → CSS value), e.g. { md: '1rem' }. */
  spacing: z.record(z.string(), z.string()).optional(),
  /** Optional gallery-attribution token (`source:` frontmatter or extract URL). */
  source: z.string().optional(),
  /** Design-system name if the file declares one (Stitch `name:` frontmatter). */
  name: z.string().optional(),
})

export type ImportedDesignSeed = z.infer<typeof ImportedDesignSeedSchema>

/** The grammar the parser recognized the file as. */
export type Grammar = 'coherent-extract' | 'coherent-config' | 'stitch'

/**
 * Raw, pre-mapping output of the parser. Colors here still carry their EXTERNAL
 * names/roles (e.g. `ink`, `canvas`, `brand`, or an Atmosphere role like
 * `text`/`neutral`); the adapter turns these into the Coherent vocabulary and
 * records what happened per token.
 */
export interface RawColor {
  /** External token name (Stitch/config) — e.g. `ink`, `primary`, `hairline`. */
  name?: string
  /** Semantic role (Atmosphere grammar) — brand/accent/neutral/semantic/text/background/border. */
  role?: string
  /** Normalized `#rrggbb`. */
  hex: string
  /** The value exactly as written in the file (before normalization), for repaired-detection. */
  raw?: string
  /** Free-text usage hint (Atmosphere `Usage` column), if any. */
  usage?: string
}

export interface RawImport {
  grammar: Grammar
  colors: RawColor[]
  fontSans?: string
  fontMono?: string
  /** Distinct corner radii in px, as parsed from the `## Radius` scale. */
  radiiPx?: number[]
  /** Distinct font weights, as parsed from the `## Typography` scale table. */
  fontWeights?: number[]
  /** Body text size in px, from the `body` row of the `## Typography` scale. */
  bodyFontSizePx?: number
  /** Distinct spacing steps in px, from the `## Spacing` scale. */
  spacingPx?: number[]
  source?: string
  name?: string
}

/** What the adapter decided for one token, for the mapping/repair report. */
export type Disposition =
  | 'imported' // exact Coherent name matched → applied as-is
  | 'mapped' // external name/role translated to a Coherent token → applied
  | 'kept' // target absent in the file → existing project value retained
  | 'repaired' // value normalized (e.g. #abc → #aabbcc, case) before applying
  | 'dropped' // parsed but unmappable / duplicate target already filled

export interface TokenReportEntry {
  /** Coherent target token (or the external name, for `dropped`). */
  token: string
  disposition: Disposition
  /** External source name/role, when different from `token`. */
  from?: string
  /** The value applied (hex or font stack). */
  value?: string
  note?: string
}

export interface ContrastWarning {
  pair: string
  ratio: number
  required: number
  suggestion?: string
}

export interface ImportReport {
  grammar: Grammar
  source?: string
  name?: string
  entries: TokenReportEntry[]
  contrastWarnings: ContrastWarning[]
  /** Count of colors + fonts actually applied (imported/mapped/repaired). */
  usableFieldCount: number
}
