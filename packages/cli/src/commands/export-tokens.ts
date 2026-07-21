/**
 * `coherent export tokens [--format css|tailwind|json|dtcg]` — export a
 * project's design tokens to framework-ready files (E3/T5).
 *
 * One normalized token model → design-tokens.json + css-variables.css +
 * tailwind-v4.css + design-system.tokens.json (W3C DTCG). Self-serve version
 * of the gallery's per-page artifact set:
 * any user exports THEIR design system to files that drop into any stack.
 */

import { mkdirSync } from 'fs'
import { join, resolve, relative } from 'path'
import chalk from 'chalk'
import { DesignSystemManager } from '@getcoherent/core'
import { findConfig, exitNotCoherent, warnIfVolatile } from '../utils/find-config.js'
import { writeFile } from '../utils/files.js'
import { buildArtifact, TOKEN_FORMATS, type TokenFormat } from '../export-tokens/generate.js'
import { checkEquivalence } from '../export-tokens/equivalence.js'

export interface ExportTokensOptions {
  format?: string
  out?: string
}

export async function exportTokensCommand(opts: ExportTokensOptions = {}): Promise<void> {
  const project = findConfig()
  if (!project) exitNotCoherent()
  warnIfVolatile(project.root)

  const formats = resolveFormats(opts.format)

  const dsm = new DesignSystemManager(project.configPath)
  await dsm.load()
  const config = dsm.getConfig()

  // Belt-and-suspenders for the CI equivalence gate: the emitted formats must
  // agree. If they don't, something upstream diverged — warn loudly, still write.
  const issues = checkEquivalence(config)
  if (issues.length > 0) {
    console.error(
      chalk.yellow(`⚠ Token formats disagree on: ${issues.map(i => i.token).join(', ')} — please report this.`),
    )
  }

  const outDir = opts.out ? resolve(opts.out) : join(project.root, '.coherent', 'tokens')
  mkdirSync(outDir, { recursive: true })

  const written: string[] = []
  for (const format of formats) {
    const { filename, content } = buildArtifact(format, config)
    await writeFile(join(outDir, filename), content)
    written.push(filename)
  }

  const shown = relative(process.cwd(), outDir) || outDir
  console.log(chalk.green(`✓ Exported ${written.length} token file(s) → ${shown}`))
  for (const f of written) console.log(chalk.dim(`  ${f}`))
}

function resolveFormats(format?: string): TokenFormat[] {
  if (!format) return TOKEN_FORMATS
  const f = format.toLowerCase()
  if ((TOKEN_FORMATS as string[]).includes(f)) return [f as TokenFormat]
  console.error(chalk.red(`Unknown format: ${format}. Use one of: ${TOKEN_FORMATS.join(', ')} (or omit for all).`))
  process.exit(1)
}
