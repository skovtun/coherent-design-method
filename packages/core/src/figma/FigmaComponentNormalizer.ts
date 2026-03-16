/**
 * Normalize Figma components to Coherent base (Button, Card, Input) or new shared (CID-XXX).
 * Story 3.10: name-based mapping, valid TSX with Tailwind for shared.
 */

import type { FigmaIntermediateData, FigmaComponentData, FigmaLayout } from '../types/figma.js'

/** Known base component ids in @/components/ui (shadcn-style). */
export const FIGMA_BASE_IDS = ['button', 'card', 'input', 'textarea', 'badge', 'label'] as const
export type FigmaBaseId = (typeof FIGMA_BASE_IDS)[number]

/** Result for one Figma component: mapped to base or to new shared. */
export type FigmaNormalizedEntry =
  | {
      figmaId: string
      figmaKey: string
      figmaName: string
      kind: 'base'
      baseId: FigmaBaseId
    }
  | {
      figmaId: string
      figmaKey: string
      figmaName: string
      kind: 'shared'
      suggestedName: string
      suggestedTsx: string
    }

/** Full result: entries + mapping figmaId → baseId or shared (cid filled by CLI after manifest write). */
export interface FigmaNormalizationResult {
  entries: FigmaNormalizedEntry[]
  /** figmaId → baseId for base; figmaId → cid for shared (set after creating shared component). */
  figmaToCoherent: Map<
    string,
    { kind: 'base'; baseId: FigmaBaseId } | { kind: 'shared'; cid: string; name: string; file: string }
  >
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
}

/**
 * Map Figma component name to Coherent base component id, or null if unknown.
 * Normalize to Coherent patterns: Button/btn → button, Card → card, Input/TextField → input.
 */
export function figmaComponentNameToBaseId(name: string): FigmaBaseId | null {
  const n = normalizeName(name)
  if (/^(button|btn|cta|primary\s*button|secondary\s*button)$/.test(n)) return 'button'
  if (/^(card|cards?|tile)$/.test(n)) return 'card'
  if (/^(input|text\s*field|textfield|text\s*input|search\s*input)$/.test(n)) return 'input'
  if (/^(textarea|text\s*area|multiline)$/.test(n)) return 'textarea'
  if (/^(badge|tag|pill)$/.test(n)) return 'badge'
  if (n === 'label') return 'label'
  return null
}

/** PascalCase for component name; safe for TSX. */
function toPascalCase(name: string): string {
  return (
    name
      .trim()
      .replace(/(?:^|\s|[-_])(\w)/g, (_, c) => c.toUpperCase())
      .replace(/[^A-Za-z0-9]/g, '') || 'Block'
  )
}

/** Kebab-case file name for shared component. */
function toSharedFileName(name: string): string {
  return (
    toPascalCase(name)
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '') || 'block'
  )
}

/**
 * Generate valid TSX for a shared component from Figma.
 * Uses Tailwind; layout from FigmaLayout or default flex. Normalizes to Coherent patterns (no pixel-perfect).
 */
export function generateSharedComponentTsx(displayName: string, layout?: FigmaLayout | null): string {
  const name = toPascalCase(displayName)
  const isVertical = layout?.layoutMode !== 'HORIZONTAL'
  const gapClass = layout?.itemSpacing != null && layout.itemSpacing <= 8 ? 'gap-2' : 'gap-4'
  const flexDir = isVertical ? 'flex-col' : 'flex-row'
  const labelExpr = JSON.stringify(displayName)
  return `'use client'

export function ${name}() {
  return (
    <div className="flex ${flexDir} ${gapClass} p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
      <span className="text-sm font-medium">{${labelExpr}}</span>
      <p className="text-sm text-muted-foreground">Content placeholder.</p>
    </div>
  )
}
`
}

/**
 * Normalize all Figma components: map to base or shared with suggested TSX.
 */
export function normalizeFigmaComponents(data: FigmaIntermediateData): FigmaNormalizationResult {
  const entries: FigmaNormalizedEntry[] = []
  const figmaToCoherent = new Map<
    string,
    { kind: 'base'; baseId: FigmaBaseId } | { kind: 'shared'; cid: string; name: string; file: string }
  >()

  for (const comp of data.components as FigmaComponentData[]) {
    const baseId = figmaComponentNameToBaseId(comp.name)
    if (baseId !== null) {
      const entry: FigmaNormalizedEntry = {
        figmaId: comp.id,
        figmaKey: comp.key,
        figmaName: comp.name,
        kind: 'base',
        baseId,
      }
      entries.push(entry)
      figmaToCoherent.set(comp.id, { kind: 'base', baseId })
      continue
    }

    const suggestedName = toPascalCase(comp.name) || `Component_${comp.id.slice(-4)}`
    const suggestedTsx = generateSharedComponentTsx(comp.name, comp.layout)
    const entry: FigmaNormalizedEntry = {
      figmaId: comp.id,
      figmaKey: comp.key,
      figmaName: comp.name,
      kind: 'shared',
      suggestedName,
      suggestedTsx,
    }
    entries.push(entry)
    // cid/name/file will be set by CLI after createEntry
    figmaToCoherent.set(comp.id, {
      kind: 'shared',
      cid: '',
      name: suggestedName,
      file: `components/shared/${toSharedFileName(suggestedName)}.tsx`,
    })
  }

  return { entries, figmaToCoherent }
}

/** After creating a shared component in manifest, update the map with real cid and file. */
export function setSharedMapping(
  result: FigmaNormalizationResult,
  figmaId: string,
  cid: string,
  name: string,
  file: string,
): void {
  const cur = result.figmaToCoherent.get(figmaId)
  if (cur?.kind === 'shared') {
    result.figmaToCoherent.set(figmaId, { kind: 'shared', cid, name, file })
  }
}
