/**
 * Extract-style phase (deterministic).
 *
 * Scans the anchor page's TSX source for recurring patterns (colors, spacing,
 * icon treatments, grid/gap choices) and emits a compact "STYLE CONTEXT"
 * string that subsequent page generations must match. This is what makes
 * cross-page visual consistency possible without the AI re-inventing palettes
 * per route.
 *
 * Moved from packages/cli/src/commands/chat/split-generator.ts so both the
 * chat rail and the skill rail run the same extraction.
 */

import type { DeterministicPhase, PhaseContext } from '../phase.js'

/**
 * Pure function. Takes anchor page TSX, returns a style-context string (or
 * empty string when nothing interesting was found).
 *
 * Byte-identical to the previous inline implementation in split-generator.ts
 * — see the intentional ordering of extract steps; changing it shifts which
 * pattern "wins" in the output and can subtly change downstream generation.
 */
export function extractStyleContext(pageCode: string): string {
  const unique = (arr: string[]) => [...new Set(arr)]

  const cardClasses = (pageCode.match(/className="[^"]*(?:rounded|border|shadow|bg-card)[^"]*"/g) || [])
    .map(m => m.replace(/className="|"/g, ''))
    .filter(c => c.includes('rounded') || c.includes('border') || c.includes('card'))
  const sectionSpacing = unique(pageCode.match(/py-\d+(?:\s+md:py-\d+)?/g) || [])
  const headingStyles = unique(pageCode.match(/text-(?:\d*xl|lg)\s+font-(?:bold|semibold|medium)/g) || [])
  const colorPatterns = unique(
    (
      pageCode.match(
        /(?:text|bg|border)-(?:primary|secondary|muted|accent|card|destructive|foreground|background)\S*/g,
      ) || ([] as string[])
    ).concat(
      pageCode.match(
        /(?:text|bg|border)-(?:emerald|blue|violet|rose|amber|zinc|slate|gray|green|red|orange|indigo|purple|teal|cyan)\S*/g,
      ) || [],
    ),
  )
  const iconPatterns = unique(pageCode.match(/(?:rounded-\S+\s+)?p-\d+(?:\.\d+)?\s*(?:bg-\S+)?/g) || []).filter(
    p => p.includes('bg-') || p.includes('rounded'),
  )
  const buttonPatterns = unique(
    (pageCode.match(/className="[^"]*(?:hover:|active:)[^"]*"/g) || [])
      .map(m => m.replace(/className="|"/g, ''))
      .filter(c => c.includes('px-') || c.includes('py-') || c.includes('rounded')),
  )
  const bgPatterns = unique(pageCode.match(/bg-(?:muted|card|background|zinc|slate|gray)\S*/g) || [])
  const gapPatterns = unique(pageCode.match(/gap-\d+/g) || [])
  const gridPatterns = unique(pageCode.match(/grid-cols-\d+|md:grid-cols-\d+|lg:grid-cols-\d+/g) || [])
  const containerPatterns = unique(pageCode.match(/container\s+max-w-\S+|max-w-\d+xl\s+mx-auto/g) || [])

  const lines: string[] = []
  if (containerPatterns.length > 0) {
    lines.push(`Container (MUST match for alignment with header/footer): ${containerPatterns[0]} px-4`)
  }
  if (cardClasses.length > 0) lines.push(`Cards: ${unique(cardClasses).slice(0, 4).join(' | ')}`)
  if (sectionSpacing.length > 0) lines.push(`Section spacing: ${sectionSpacing.join(', ')}`)
  if (headingStyles.length > 0) lines.push(`Headings: ${headingStyles.join(', ')}`)
  if (colorPatterns.length > 0) lines.push(`Colors: ${colorPatterns.slice(0, 15).join(', ')}`)
  if (iconPatterns.length > 0) lines.push(`Icon containers: ${iconPatterns.slice(0, 4).join(' | ')}`)
  if (buttonPatterns.length > 0) lines.push(`Buttons: ${buttonPatterns.slice(0, 3).join(' | ')}`)
  if (bgPatterns.length > 0) lines.push(`Section backgrounds: ${bgPatterns.slice(0, 6).join(', ')}`)
  if (gapPatterns.length > 0) lines.push(`Gaps: ${gapPatterns.join(', ')}`)
  if (gridPatterns.length > 0) lines.push(`Grids: ${gridPatterns.join(', ')}`)

  if (lines.length === 0) return ''

  return `STYLE CONTEXT (match these patterns exactly for visual consistency with the anchor page):
${lines.map(l => `  - ${l}`).join('\n')}`
}

/**
 * `AnchorArtifact` is now defined authoritatively in `./anchor.ts` (the
 * phase that writes it). Re-exported here so existing imports stay green.
 */
import type { AnchorArtifact } from './anchor.js'
export type { AnchorArtifact }

export interface StyleArtifact {
  styleContext: string
}

export interface ExtractStylePhaseOptions {
  /** Artifact name to read anchor pageCode from. Default: `anchor.json`. */
  anchorArtifact?: string
  /** Artifact name to write style context to. Default: `style.json`. */
  styleArtifact?: string
}

/**
 * DeterministicPhase wrapper around {@link extractStyleContext} for use by
 * runPipeline (future Lane C work). Byte-for-byte identical to the inline
 * implementation — same pure function under the hood.
 */
export function createExtractStylePhase(options: ExtractStylePhaseOptions = {}): DeterministicPhase {
  const anchorFile = options.anchorArtifact ?? 'anchor.json'
  const styleFile = options.styleArtifact ?? 'style.json'

  return {
    kind: 'deterministic',
    name: 'extract-style',
    async run(ctx: PhaseContext): Promise<void> {
      const anchorRaw = await ctx.session.readArtifact(ctx.sessionId, anchorFile)
      if (anchorRaw === null) {
        throw new Error(`extract-style: missing required artifact ${JSON.stringify(anchorFile)}`)
      }
      const anchor = JSON.parse(anchorRaw) as AnchorArtifact
      if (typeof anchor.pageCode !== 'string') {
        throw new Error(`extract-style: artifact ${JSON.stringify(anchorFile)} must have a string "pageCode" field`)
      }
      const styleContext = extractStyleContext(anchor.pageCode)
      const out: StyleArtifact = { styleContext }
      await ctx.session.writeArtifact(ctx.sessionId, styleFile, JSON.stringify(out, null, 2))
    },
  }
}
