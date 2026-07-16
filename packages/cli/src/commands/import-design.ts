/**
 * `coherent import design <file>` — import an external DESIGN.md (Coherent
 * extract format or Google Stitch) into an initialized project's tokens.
 *
 * F14 v1: colors + font-family only. Standalone command (NOT `chat --design`).
 * Mandatory `--dry-run`. Backup + before/after diff. Mapping/repair report with
 * a minimum-usable-fields floor. Contrast is accept-with-warning (palette never
 * mutated). It resolves + verifies the project explicitly and REFUSES to fall
 * back to cwd — unlike the Figma importer.
 */

import { existsSync, statSync, readFileSync } from 'fs'
import { createInterface } from 'readline'
import chalk from 'chalk'
import { DesignSystemManager } from '@getcoherent/core'
import { findConfig, exitNotCoherent, warnIfVolatile } from '../utils/find-config.js'
import { CoherentError } from '../errors/CoherentError.js'
import { COHERENT_ERROR_CODES } from '../errors/codes.js'
import { parseDesignMd } from '../import-design/parse.js'
import { adaptImport } from '../import-design/adapter.js'
import { buildPlan, applyPlan } from '../import-design/apply.js'
import { renderReport, reportToJson } from '../import-design/report.js'
import { SafeYamlError } from '../import-design/safe-yaml.js'

export interface ImportDesignOptions {
  dryRun?: boolean
  yes?: boolean
  json?: boolean
}

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MIN_USABLE_FIELDS = 1

export async function importDesignCommand(file: string, opts: ImportDesignOptions = {}): Promise<void> {
  const project = findConfig()
  if (!project) exitNotCoherent()
  warnIfVolatile(project.root)

  // ── read the file ──
  if (!existsSync(file)) {
    throw new CoherentError({
      code: COHERENT_ERROR_CODES.E009_IMPORT_UNPARSEABLE,
      message: `Design file not found: ${file}`,
      cause: 'coherent import design reads a DESIGN.md file from disk.',
      fix: 'Pass the path to an existing DESIGN.md (Coherent extract or Stitch format)',
    })
  }
  if (!statSync(file).isFile()) {
    throw new CoherentError({
      code: COHERENT_ERROR_CODES.E009_IMPORT_UNPARSEABLE,
      message: `Not a file: ${file}`,
      cause: 'coherent import design expects a path to a DESIGN.md file, not a directory.',
      fix: 'Pass the path to the DESIGN.md file itself',
    })
  }
  if (statSync(file).size > MAX_FILE_BYTES) {
    throw new CoherentError({
      code: COHERENT_ERROR_CODES.E009_IMPORT_UNPARSEABLE,
      message: `Design file is too large (> ${MAX_FILE_BYTES / (1024 * 1024)}MB): ${file}`,
      cause: 'A DESIGN.md carries tokens + prose; multi-megabyte files are not valid input.',
      fix: 'Check you passed the right file',
    })
  }
  const content = readFileSync(file, 'utf-8')

  // ── parse ──
  let raw
  try {
    raw = parseDesignMd(content)
  } catch (err) {
    const detail = err instanceof SafeYamlError ? err.message : err instanceof Error ? err.message : 'unknown error'
    throw new CoherentError({
      code: COHERENT_ERROR_CODES.E009_IMPORT_UNPARSEABLE,
      message: `Could not parse design file: ${detail}`,
      cause: 'The file is not a recognized DESIGN.md grammar, or its frontmatter uses unsafe YAML.',
      fix: 'Use a Coherent extract DESIGN.md or a Stitch-format file with plain frontmatter',
    })
  }

  // ── adapt + threshold ──
  const adapt = adaptImport(raw)
  const usable = adapt.filledColors.size + adapt.filledFonts.size
  if (usable < MIN_USABLE_FIELDS) {
    throw new CoherentError({
      code: COHERENT_ERROR_CODES.E010_IMPORT_NO_USABLE_TOKENS,
      message: 'Import produced no usable tokens',
      cause: `Parsed the file as ${raw.grammar} grammar but no color mapped to a Coherent slot and no font was found.`,
      fix: 'Check the file has a color palette or font-family the importer recognizes (run with --dry-run)',
    })
  }

  // ── plan ──
  const dsm = new DesignSystemManager(project.configPath)
  await dsm.load()
  const existing = dsm.getConfig()
  const plan = buildPlan(existing, adapt, project.root, raw.grammar)

  // ── output ──
  if (opts.json) {
    console.log(reportToJson(plan, file))
    if (opts.dryRun) return
  } else {
    renderReport(plan, file)
  }

  if (opts.dryRun) {
    if (!opts.json) console.log(chalk.dim('Dry run — no files written. Re-run without --dry-run to apply.'))
    return
  }

  if (plan.changes.length === 0) {
    if (!opts.json) console.log(chalk.dim('Nothing to write — config already matches the imported tokens.'))
    return
  }

  // ── confirm ──
  if (opts.yes !== true) {
    // In --json mode (or a non-interactive shell) never prompt — that would put
    // non-JSON on stdout / block a script. Require --yes to write.
    if (opts.json || !process.stdin.isTTY) {
      console.error(
        chalk.yellow('Refusing to write without confirmation. Re-run with --yes (or --dry-run to preview).'),
      )
      return
    }
    const ok = await promptYesNo(`Apply ${plan.changes.length} change(s) to ${project.configPath}?`)
    if (!ok) {
      console.log(chalk.dim('Aborted — no files written.'))
      return
    }
  }

  // ── apply ──
  const outcome = await applyPlan(plan, project.root, project.configPath)
  if (!opts.json) {
    const backupNote = outcome.backupPath ? ' Backup saved under .coherent/backups/' : ' (backup could not be created)'
    console.log(chalk.green(`✓ Imported ${plan.changes.length} change(s).${backupNote}`))
    if (plan.report.contrastWarnings.length > 0) {
      console.log(chalk.dim('  Contrast notes written to .coherent/import-recommendations.md'))
    }
    if (outcome.backupPath) console.log(chalk.dim('  Run `coherent undo` to revert.'))
  }
}

function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(`${question} ${chalk.dim('[y/N]')} `, answer => {
      rl.close()
      resolve(/^y(es)?$/i.test(answer.trim()))
    })
  })
}
