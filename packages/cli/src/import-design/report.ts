/**
 * Human + JSON rendering of the import mapping/repair report.
 *
 * The report is mandatory (F14 item 5): every token is accounted for as
 * imported / mapped / repaired / kept / dropped, plus any accept-with-warning
 * contrast notes and the before→after change diff.
 */

import chalk from 'chalk'
import type { ImportPlan } from './apply.js'
import type { Disposition, TokenReportEntry } from './types.js'

const DISPOSITION_LABELS: Record<Disposition, string> = {
  imported: 'imported',
  mapped: 'mapped',
  repaired: 'repaired',
  kept: 'kept',
  dropped: 'dropped',
}

const DISPOSITION_ORDER: Disposition[] = ['imported', 'mapped', 'repaired', 'kept', 'dropped']

export function renderReport(plan: ImportPlan, fileName: string): void {
  const { report, changes } = plan
  const line = (label: string, value: string) => console.log(`${chalk.dim(label.padEnd(12))} ${value}`)

  console.log('')
  console.log(chalk.bold(`Coherent import — ${report.grammar} grammar`))
  line('File', fileName)
  if (report.name) line('Name', report.name)
  if (report.source) line('Source', report.source)
  console.log('')

  // Counts by disposition.
  const counts = countByDisposition(report.entries)
  const summary = DISPOSITION_ORDER.filter(d => counts[d] > 0)
    .map(d => `${counts[d]} ${DISPOSITION_LABELS[d]}`)
    .join(', ')
  line('Tokens', summary || 'none')
  console.log('')

  // Change diff (what actually moves on disk).
  console.log(chalk.bold('Changes (light theme)'))
  if (changes.length === 0) {
    console.log(chalk.dim('  no changes — imported values match the current config'))
  } else {
    for (const c of changes) {
      console.log(`  ${c.token.padEnd(18)} ${chalk.dim(c.before)} ${chalk.dim('→')} ${chalk.green(c.after)}`)
    }
  }
  console.log('')

  // Per-token details grouped by disposition.
  for (const d of DISPOSITION_ORDER) {
    const rows = report.entries.filter(e => e.disposition === d)
    if (rows.length === 0) continue
    console.log(chalk.bold(DISPOSITION_LABELS[d]))
    for (const e of rows) console.log(`  ${formatEntry(e)}`)
    console.log('')
  }

  // Contrast (accept-with-warning).
  if (report.contrastWarnings.length > 0) {
    console.log(chalk.yellow.bold('⚠ Contrast (palette preserved — review recommended)'))
    for (const w of report.contrastWarnings) {
      const fix = w.suggestion ? ` — suggest ${chalk.cyan(w.suggestion)}` : ''
      console.log(`  ${w.pair} ${w.ratio.toFixed(2)}:1, below AA ${w.required}:1${fix}`)
    }
    console.log('')
  }
}

function formatEntry(e: TokenReportEntry): string {
  const parts: string[] = [e.token]
  if (e.from) parts.push(chalk.dim(`← ${e.from}`))
  if (e.value) parts.push(chalk.dim(e.value))
  if (e.note) parts.push(chalk.dim(`(${e.note})`))
  return parts.join(' ')
}

function countByDisposition(entries: TokenReportEntry[]): Record<Disposition, number> {
  const counts: Record<Disposition, number> = {
    imported: 0,
    mapped: 0,
    repaired: 0,
    kept: 0,
    dropped: 0,
  }
  for (const e of entries) counts[e.disposition]++
  return counts
}

/** Machine-readable report for `--json` (gallery/CI consumers). */
export function reportToJson(plan: ImportPlan, fileName: string): string {
  return JSON.stringify(
    {
      file: fileName,
      grammar: plan.report.grammar,
      name: plan.report.name,
      source: plan.report.source,
      usableFieldCount: plan.report.usableFieldCount,
      changes: plan.changes,
      entries: plan.report.entries,
      contrastWarnings: plan.report.contrastWarnings,
    },
    null,
    2,
  )
}
