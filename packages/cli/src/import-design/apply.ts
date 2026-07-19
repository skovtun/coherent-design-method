/**
 * Merge an adapted seed into a project's config, evaluate contrast, and (when
 * not a dry run) write the patch atomically with a backup.
 *
 * Two phases so `--dry-run` is a true no-op:
 *   - `buildPlan()` is pure: it computes the new config, the config/CSS file
 *     contents, the before→after diff, the `kept` report rows, and contrast
 *     warnings — touching nothing on disk.
 *   - `applyPlan()` does the IO: backup, atomic multi-file write (restore-on-
 *     failure via `batchWriteFiles`), CSS regen, and the persistent
 *     recommendations note.
 */

import { basename, join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import type { DesignSystemConfig } from '@getcoherent/core'
import { batchWriteFiles } from '../utils/files.js'
import { createBackup, logBackupCreated, restoreBackup } from '../utils/backup.js'
import { isTailwindV4, generateV4GlobalsCss } from '../utils/tailwind-version.js'
import { fixGlobalsCss } from '../utils/fix-globals-css.js'
import { contrastRatio, suggestAccessibleForeground, WCAG_AA_NORMAL } from './color-utils.js'
import { COLOR_TARGETS, type AdaptResult } from './adapter.js'
import type { ContrastWarning, ImportReport, TokenReportEntry } from './types.js'

export interface ChangeRow {
  token: string
  before: string
  after: string
}

export interface ImportPlan {
  newConfig: DesignSystemConfig
  configContent: string
  globalsPath: string
  globalsContent: string | null // v4: full CSS to write in the batch; v3: null (fixGlobalsCss handles it)
  isV4: boolean
  changes: ChangeRow[]
  report: ImportReport
}

export function buildPlan(
  existing: DesignSystemConfig,
  adapt: AdaptResult,
  projectRoot: string,
  grammar: ImportReport['grammar'],
): ImportPlan {
  const newConfig = structuredClone(existing) as DesignSystemConfig
  const light = newConfig.tokens.colors.light as Record<string, string>
  const existingLight = existing.tokens.colors.light as Record<string, string>
  const changes: ChangeRow[] = []
  const entries: TokenReportEntry[] = [...adapt.entries]

  // Apply mapped colors to the LIGHT palette only. Dark theme is kept as-is
  // (F14 v1: no dark-mode synthesis) unless a grammar ever supplies it.
  for (const target of COLOR_TARGETS) {
    if (!adapt.filledColors.has(target)) continue
    const after = adapt.seed.colors[target]
    if (!after) continue
    const before = existingLight[target]
    // Same color already set (differing only in hex casing) — keep the existing
    // value so an import of an identical palette reports zero changes.
    if (before && before.toLowerCase() === after.toLowerCase()) continue
    light[target] = after
    changes.push({ token: `colors.${target}`, before: before ?? '(unset)', after })
  }

  // `kept` rows: standard targets the file did not provide keep the existing value.
  for (const target of COLOR_TARGETS) {
    if (adapt.filledColors.has(target)) continue
    const value = existingLight[target]
    if (value === undefined) continue // e.g. optional `accent` not present — nothing to keep
    entries.push({ token: `colors.${target}`, disposition: 'kept', value })
  }

  // Fonts.
  const fam = newConfig.tokens.typography.fontFamily as Record<string, string>
  const existingFam = existing.tokens.typography.fontFamily as Record<string, string>
  for (const slot of ['sans', 'mono'] as const) {
    if (adapt.filledFonts.has(slot)) {
      const after = adapt.seed.fontFamily[slot]
      if (!after) continue
      const before = existingFam[slot]
      fam[slot] = after
      if (before !== after) changes.push({ token: `fontFamily.${slot}`, before: before ?? '(unset)', after })
    } else {
      entries.push({ token: `fontFamily.${slot}`, disposition: 'kept', value: existingFam[slot] })
    }
  }

  // Radius — write imported slots, keep the rest.
  if (adapt.seed.radius) {
    const rad = newConfig.tokens.radius as Record<string, string>
    const existingRad = existing.tokens.radius as Record<string, string>
    for (const [slot, after] of Object.entries(adapt.seed.radius)) {
      const before = existingRad[slot]
      rad[slot] = after
      if (before !== after) changes.push({ token: `radius.${slot}`, before: before ?? '(unset)', after })
    }
  }

  // Font weight — write imported anchor weights, keep the rest.
  if (adapt.seed.fontWeight) {
    const fw = newConfig.tokens.typography.fontWeight as Record<string, number>
    const existingFw = existing.tokens.typography.fontWeight as Record<string, number>
    for (const [slot, after] of Object.entries(adapt.seed.fontWeight)) {
      const before = existingFw[slot]
      fw[slot] = after
      if (before !== after)
        changes.push({ token: `fontWeight.${slot}`, before: `${before ?? '(unset)'}`, after: `${after}` })
    }
  }

  // Font size (base) — write imported slot, keep the rest.
  if (adapt.seed.fontSize) {
    const fs = newConfig.tokens.typography.fontSize as Record<string, string>
    const existingFs = existing.tokens.typography.fontSize as Record<string, string>
    for (const [slot, after] of Object.entries(adapt.seed.fontSize)) {
      const before = existingFs[slot]
      fs[slot] = after
      if (before !== after) changes.push({ token: `fontSize.${slot}`, before: before ?? '(unset)', after })
    }
  }

  // Spacing — write imported slots, keep the rest.
  if (adapt.seed.spacing) {
    const sp = newConfig.tokens.spacing as Record<string, string>
    const existingSp = existing.tokens.spacing as Record<string, string>
    for (const [slot, after] of Object.entries(adapt.seed.spacing)) {
      const before = existingSp[slot]
      sp[slot] = after
      if (before !== after) changes.push({ token: `spacing.${slot}`, before: before ?? '(unset)', after })
    }
  }

  const contrastWarnings = evaluateContrast(light)

  const isV4 = isTailwindV4(projectRoot)
  const globalsPath = resolveGlobalsPath(projectRoot)
  const globalsContent = isV4 ? generateV4GlobalsCss(newConfig) : null

  const usableFieldCount =
    adapt.filledColors.size +
    adapt.filledFonts.size +
    adapt.filledRadius.size +
    adapt.filledWeights.size +
    adapt.filledFontSize.size +
    adapt.filledSpacing.size

  const report: ImportReport = {
    grammar,
    source: adapt.seed.source,
    name: adapt.seed.name,
    entries,
    contrastWarnings,
    usableFieldCount,
  }

  return {
    newConfig,
    configContent: serializeConfig(newConfig),
    globalsPath,
    globalsContent,
    isV4,
    changes,
    report,
  }
}

/** Body text (foreground on background) is the one high-signal pair worth an AA check. */
function evaluateContrast(light: Record<string, string>): ContrastWarning[] {
  const warnings: ContrastWarning[] = []
  const fg = light.foreground
  const bg = light.background
  if (fg && bg) {
    const ratio = contrastRatio(fg, bg)
    if (ratio < WCAG_AA_NORMAL) {
      warnings.push({
        pair: 'foreground/background',
        ratio,
        required: WCAG_AA_NORMAL,
        suggestion: suggestAccessibleForeground(fg, bg) ?? undefined,
      })
    }
  }
  return warnings
}

export interface ApplyOutcome {
  /** Path of the backup created before writing, or null if the backup failed. */
  backupPath: string | null
}

export async function applyPlan(plan: ImportPlan, projectRoot: string, configPath: string): Promise<ApplyOutcome> {
  const backupPath = createBackup(projectRoot)
  logBackupCreated(backupPath)

  const writes: Array<{ path: string; content: string }> = [{ path: configPath, content: plan.configContent }]
  if (plan.isV4 && plan.globalsContent) {
    writes.push({ path: plan.globalsPath, content: plan.globalsContent })
  }

  try {
    await batchWriteFiles(writes)
    // Tailwind v3 needs the layout-injection path (not covered by the batch).
    // Reuse the canonical regenerator; if it throws, we restore below so the
    // config and CSS never drift apart.
    if (!plan.isV4) {
      fixGlobalsCss(projectRoot, plan.newConfig)
    }
  } catch (err) {
    if (backupPath) restoreBackup(projectRoot, basename(backupPath))
    throw err
  }

  writeRecommendations(projectRoot, plan.report)
  return { backupPath }
}

/** Prefer `src/app/globals.css` when the project uses the `src/` layout. */
function resolveGlobalsPath(projectRoot: string): string {
  const srcApp = join(projectRoot, 'src', 'app', 'globals.css')
  if (existsSync(srcApp)) return srcApp
  return join(projectRoot, 'app', 'globals.css')
}

/** Persist contrast recommendations so the guidance survives past the terminal. */
export function writeRecommendations(projectRoot: string, report: ImportReport): string | null {
  if (report.contrastWarnings.length === 0) return null
  const lines: string[] = [
    '# Import recommendations',
    '',
    `> Generated by \`coherent import design\`${report.source ? ` from \`${report.source}\`` : ''}.`,
    '> The imported palette was preserved as-is (accept-with-warning). These',
    '> pairs fall below WCAG AA — adjust the tokens if the contrast matters.',
    '',
  ]
  for (const w of report.contrastWarnings) {
    const fix = w.suggestion ? ` — suggest \`${w.suggestion}\`` : ''
    lines.push(`- **${w.pair}** — ${w.ratio.toFixed(2)}:1, below AA ${w.required}:1${fix}`)
  }
  lines.push('')
  const content = lines.join('\n')
  const path = join(projectRoot, '.coherent', 'import-recommendations.md')
  try {
    mkdirSync(join(projectRoot, '.coherent'), { recursive: true })
    writeFileSync(path, content)
    return path
  } catch {
    return null
  }
}

/** Serialize a config to the canonical `export const config = {…} as const` file. */
export function serializeConfig(config: DesignSystemConfig): string {
  return `/**
 * Design System Configuration
 *
 * This file is auto-generated by Coherent Design Method.
 * Do not edit manually - use 'coherent chat' command to modify.
 */

export const config = ${JSON.stringify(config, null, 2)} as const
`
}
