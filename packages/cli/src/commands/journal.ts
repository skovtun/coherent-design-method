/**
 * Journal Command — read side of the `coherent fix --journal` loop.
 *
 *   journal list       list captured sessions with one-line summary
 *   journal aggregate  rank validators by recurrence across sessions
 *
 * Closes the memory feedback loop: every fix run feeds journal
 * (fix --journal writes YAML) → journal aggregate surfaces recurring
 * patterns → human curates PATTERNS_JOURNAL.md from prioritized data.
 *
 * The YAML shape is emitted by fix.ts in a narrow, stable format we
 * own, so a tiny state-machine parser beats pulling in a YAML library.
 */

import chalk from 'chalk'
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'fs'
import { resolve, join } from 'path'
import { findConfig } from '../utils/find-config.js'

const SESSIONS_DIR = join('.coherent', 'fix-sessions')
const RUNS_DIR = join('.coherent', 'runs')

interface ParsedSession {
  file: string
  timestamp: string
  totals: { errors: number; warnings: number; info: number }
  byType: {
    error: Record<string, { count: number; samples: Array<{ path: string; line: number }> }>
    warning: Record<string, { count: number; samples: Array<{ path: string; line: number }> }>
    info: Record<string, { count: number; samples: Array<{ path: string; line: number }> }>
  }
}

function parseSession(raw: string, file: string): ParsedSession | null {
  const lines = raw.split('\n')
  const session: ParsedSession = {
    file,
    timestamp: '',
    totals: { errors: 0, warnings: 0, info: 0 },
    byType: { error: {}, warning: {}, info: {} },
  }
  let section: 'remaining_errors' | 'remaining_warnings' | 'remaining_info' | null = null
  let currentType: string | null = null
  let currentSeverity: 'error' | 'warning' | 'info' | null = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    const timestampMatch = /^timestamp:\s*(\S+)/.exec(line)
    if (timestampMatch) {
      session.timestamp = timestampMatch[1]
      continue
    }
    const totalMatch = /^\s{2}(errors|warnings|info):\s*(\d+)/.exec(line)
    if (totalMatch) {
      const key = totalMatch[1] as 'errors' | 'warnings' | 'info'
      session.totals[key] = Number(totalMatch[2])
      continue
    }
    if (/^remaining_errors:/.test(line)) {
      section = 'remaining_errors'
      currentSeverity = 'error'
      currentType = null
      continue
    }
    if (/^remaining_warnings:/.test(line)) {
      section = 'remaining_warnings'
      currentSeverity = 'warning'
      currentType = null
      continue
    }
    if (/^remaining_info:/.test(line)) {
      section = 'remaining_info'
      currentSeverity = 'info'
      currentType = null
      continue
    }
    if (section && currentSeverity) {
      const typeMatch = /^\s{2}- type:\s*(\S+)/.exec(line)
      if (typeMatch) {
        currentType = typeMatch[1]
        session.byType[currentSeverity][currentType] = { count: 0, samples: [] }
        continue
      }
      const countMatch = /^\s{4}count:\s*(\d+)/.exec(line)
      if (countMatch && currentType) {
        session.byType[currentSeverity][currentType].count = Number(countMatch[1])
        continue
      }
      const sampleMatch = /^\s{6,}-\s*\{\s*path:\s*"([^"]+)",\s*line:\s*(\d+)\s*\}/.exec(line)
      if (sampleMatch && currentType) {
        session.byType[currentSeverity][currentType].samples.push({
          path: sampleMatch[1],
          line: Number(sampleMatch[2]),
        })
      }
    }
  }

  return session.timestamp ? session : null
}

/**
 * Quality retry telemetry parsed from `.coherent/runs/*.yaml`. v0.15.0+
 * runs include a `qualityRetries:` block per page that hit the AI fix
 * loop. Each entry records initial errors, retry attempts, and whether
 * the page resolved cleanly.
 */
interface ParsedRetry {
  page: string
  pageType: string
  attempts: number
  resolved: boolean
  initialErrors: { type: string; count: number }[]
  finalErrors: { type: string; count: number }[]
}

interface ParsedRun {
  file: string
  timestamp: string
  retries: ParsedRetry[]
}

/**
 * Tiny state-machine parser for the `qualityRetries:` block in a run
 * YAML. Stops at the first non-list, non-indented line. Tolerant of
 * older runs that don't include the block — returns an empty array.
 */
export function parseRunRetries(raw: string, file: string): ParsedRun | null {
  const lines = raw.split('\n')
  const out: ParsedRun = { file, timestamp: '', retries: [] }
  let inBlock = false
  let cur: ParsedRetry | null = null
  let listSection: 'initialErrors' | 'finalErrors' | null = null
  let pendingType: string | null = null

  const flush = () => {
    if (cur) out.retries.push(cur)
    cur = null
    listSection = null
    pendingType = null
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    const tsMatch = /^timestamp:\s*(\S+)/.exec(line)
    if (tsMatch) {
      out.timestamp = tsMatch[1]
      continue
    }
    if (/^qualityRetries:/.test(line)) {
      inBlock = true
      continue
    }
    if (!inBlock) continue
    if (line.length > 0 && !/^[ \t]/.test(line)) {
      flush()
      inBlock = false
      continue
    }
    const newEntry = /^\s{2}-\s*page:\s*"([^"]*)"/.exec(line)
    if (newEntry) {
      flush()
      cur = { page: newEntry[1], pageType: '', attempts: 0, resolved: false, initialErrors: [], finalErrors: [] }
      continue
    }
    if (!cur) continue
    const ptMatch = /^\s{4}pageType:\s*"([^"]*)"/.exec(line)
    if (ptMatch) {
      cur.pageType = ptMatch[1]
      continue
    }
    const aMatch = /^\s{4}attempts:\s*(\d+)/.exec(line)
    if (aMatch) {
      cur.attempts = Number(aMatch[1])
      continue
    }
    const rMatch = /^\s{4}resolved:\s*(true|false)/.exec(line)
    if (rMatch) {
      cur.resolved = rMatch[1] === 'true'
      continue
    }
    if (/^\s{4}initialErrors:/.test(line)) {
      listSection = /\[\]/.test(line) ? null : 'initialErrors'
      pendingType = null
      continue
    }
    if (/^\s{4}finalErrors:/.test(line)) {
      listSection = /\[\]/.test(line) ? null : 'finalErrors'
      pendingType = null
      continue
    }
    if (listSection) {
      const tMatch = /^\s{6}-\s*type:\s*"([^"]+)"/.exec(line)
      if (tMatch) {
        pendingType = tMatch[1]
        continue
      }
      const cMatch = /^\s{8}count:\s*(\d+)/.exec(line)
      if (cMatch && pendingType) {
        cur[listSection].push({ type: pendingType, count: Number(cMatch[1]) })
        pendingType = null
        continue
      }
    }
  }
  flush()
  return out.timestamp ? out : null
}

function readAllRunRecords(projectRoot: string): ParsedRun[] {
  const dir = resolve(projectRoot, RUNS_DIR)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .sort()
  const runs: ParsedRun[] = []
  for (const f of files) {
    try {
      const raw = readFileSync(resolve(dir, f), 'utf-8')
      const parsed = parseRunRetries(raw, f)
      if (parsed) runs.push(parsed)
    } catch {
      /* skip malformed — same policy as fix-sessions reader */
    }
  }
  return runs
}

function readAllSessions(projectRoot: string): ParsedSession[] {
  const dir = resolve(projectRoot, SESSIONS_DIR)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .sort()
  const sessions: ParsedSession[] = []
  for (const f of files) {
    try {
      const raw = readFileSync(resolve(dir, f), 'utf-8')
      const parsed = parseSession(raw, f)
      if (parsed) sessions.push(parsed)
    } catch {
      /* skip malformed files — don't block aggregate on one bad apple */
    }
  }
  return sessions
}

export async function journalListCommand(): Promise<void> {
  const project = findConfig()
  if (!project) {
    console.log(chalk.yellow('\u26A0 Not in a Coherent project\n'))
    process.exit(1)
  }
  const sessions = readAllSessions(project.root)
  if (sessions.length === 0) {
    console.log(chalk.dim('\n  No journal sessions yet. Run: coherent fix --journal\n'))
    return
  }
  console.log(chalk.cyan(`\n  ${sessions.length} fix session(s) captured\n`))
  for (const s of sessions) {
    const parts: string[] = []
    if (s.totals.errors > 0) parts.push(chalk.red(`${s.totals.errors}E`))
    if (s.totals.warnings > 0) parts.push(chalk.yellow(`${s.totals.warnings}W`))
    if (s.totals.info > 0) parts.push(chalk.dim(`${s.totals.info}i`))
    const summary = parts.join(' ') || chalk.green('clean')
    console.log(`  ${chalk.dim(s.timestamp)}  ${summary}  ${chalk.dim(s.file)}`)
  }
  console.log(chalk.cyan(`\n  Run: coherent journal aggregate\n`))
}

export async function journalAggregateCommand(): Promise<void> {
  const project = findConfig()
  if (!project) {
    console.log(chalk.yellow('\u26A0 Not in a Coherent project\n'))
    process.exit(1)
  }
  const sessions = readAllSessions(project.root)
  const runs = readAllRunRecords(project.root)
  const allRetries = runs.flatMap(r => r.retries)

  // v0.15.1 fix: Only bail when BOTH data sources are empty. Previously
  // returned early on missing fix-sessions, which silently hid retry
  // telemetry from .coherent/runs/.
  if (sessions.length === 0 && allRetries.length === 0) {
    console.log(chalk.dim('\n  No journal sessions or run records yet. Run: coherent chat / coherent fix --journal\n'))
    return
  }

  interface AggRow {
    type: string
    severity: 'error' | 'warning' | 'info'
    totalCount: number
    sessionCount: number
    firstSeen: string
    lastSeen: string
    samplePaths: Set<string>
  }
  // v0.15.1: wrap fix-sessions render in `if (sessions.length > 0)` so retry
  // telemetry below still renders on projects that only ran `coherent chat`.
  if (sessions.length > 0) {
    const agg: Record<string, AggRow> = {}
    const sessionTimestamps = sessions.map(s => s.timestamp).sort()
    for (const session of sessions) {
      for (const severity of ['error', 'warning', 'info'] as const) {
        for (const [type, info] of Object.entries(session.byType[severity])) {
          const key = `${severity}:${type}`
          if (!agg[key]) {
            agg[key] = {
              type,
              severity,
              totalCount: 0,
              sessionCount: 0,
              firstSeen: session.timestamp,
              lastSeen: session.timestamp,
              samplePaths: new Set(),
            }
          }
          agg[key].totalCount += info.count
          agg[key].sessionCount += 1
          if (session.timestamp < agg[key].firstSeen) agg[key].firstSeen = session.timestamp
          if (session.timestamp > agg[key].lastSeen) agg[key].lastSeen = session.timestamp
          for (const sample of info.samples) agg[key].samplePaths.add(sample.path)
        }
      }
    }

    const severityRank = { error: 0, warning: 1, info: 2 } as const
    const rows = Object.values(agg).sort((a, b) => {
      if (severityRank[a.severity] !== severityRank[b.severity]) {
        return severityRank[a.severity] - severityRank[b.severity]
      }
      return b.totalCount - a.totalCount
    })

    console.log(
      chalk.cyan(
        `\n  Aggregating ${sessions.length} session(s) (${sessionTimestamps[0]} \u2192 ${sessionTimestamps[sessionTimestamps.length - 1]})\n`,
      ),
    )

    const render = (severity: 'error' | 'warning' | 'info', heading: string, color: (s: string) => string) => {
      const filtered = rows.filter(r => r.severity === severity).slice(0, 10)
      if (filtered.length === 0) return
      console.log(color(`  ${heading}`))
      for (const row of filtered) {
        const samples = [...row.samplePaths].slice(0, 3).join(', ')
        const more = row.samplePaths.size > 3 ? ` +${row.samplePaths.size - 3} more` : ''
        const label = `${row.type.padEnd(22)}\u00D7${row.totalCount}`
        const sessionsStr = row.sessionCount > 1 ? chalk.dim(` (${row.sessionCount} sessions)`) : ''
        console.log(`    ${chalk.dim(label)}${sessionsStr}  ${samples}${more}`)
      }
      console.log('')
    }

    render('error', `Top errors (persistent across ${sessions.length} session(s)):`, chalk.red)
    render('warning', 'Top warnings:', chalk.yellow)
    render('info', 'Top info:', chalk.dim)

    const recurring = rows.filter(r => r.sessionCount >= 3 && r.severity !== 'info')
    if (recurring.length > 0) {
      console.log(
        chalk.cyan(
          `  ${recurring.length} validator type(s) recurring in 3+ sessions \u2014 candidates for PATTERNS_JOURNAL.md`,
        ),
      )
      console.log(chalk.dim('  (Manually draft a PJ-NNN entry with confidence: hypothesis for each.)\n'))
    }
  } // end of `if (sessions.length > 0)` \u2014 v0.15.1 fix-sessions render scope

  // v0.15.0 \u2014 retry telemetry from .coherent/runs. v0.15.1: runs/allRetries
  // moved to top of function so we can bail-or-render based on either source.
  if (allRetries.length === 0) return

  interface RetryAgg {
    type: string
    totalRetryCount: number // sum of initialErrors[].count where this validator fired
    pageCount: number // pages where this validator triggered the retry loop
    resolvedPageCount: number // pages where retry succeeded
    avgAttempts: number
    sumAttempts: number
  }
  const retryAgg: Record<string, RetryAgg> = {}
  for (const retry of allRetries) {
    const seenInitial = new Set<string>()
    for (const ie of retry.initialErrors) {
      if (seenInitial.has(ie.type)) continue
      seenInitial.add(ie.type)
      if (!retryAgg[ie.type]) {
        retryAgg[ie.type] = {
          type: ie.type,
          totalRetryCount: 0,
          pageCount: 0,
          resolvedPageCount: 0,
          avgAttempts: 0,
          sumAttempts: 0,
        }
      }
      retryAgg[ie.type].totalRetryCount += ie.count
      retryAgg[ie.type].pageCount += 1
      retryAgg[ie.type].sumAttempts += retry.attempts
      if (retry.resolved) retryAgg[ie.type].resolvedPageCount += 1
    }
  }
  const retryRows = Object.values(retryAgg).map(r => ({
    ...r,
    avgAttempts: r.pageCount > 0 ? r.sumAttempts / r.pageCount : 0,
  }))

  console.log(chalk.cyan(`  Retry telemetry \u2014 ${runs.length} run(s), ${allRetries.length} retry event(s)\n`))

  // Validators most often needing retry
  const byCount = [...retryRows].sort((a, b) => b.pageCount - a.pageCount).slice(0, 5)
  if (byCount.length > 0) {
    console.log(chalk.yellow('  Top validators needing AI retry:'))
    for (const r of byCount) {
      const resolveRate = r.pageCount > 0 ? Math.round((r.resolvedPageCount / r.pageCount) * 100) : 0
      console.log(
        `    ${chalk.dim(r.type.padEnd(34))} ${r.pageCount} page(s)  avg ${r.avgAttempts.toFixed(1)} attempts  ${resolveRate}% resolved`,
      )
    }
    console.log('')
  }

  // Validators unresolved after retry \u2014 highest signal for PJ candidates
  const stubborn = retryRows
    .filter(r => r.pageCount - r.resolvedPageCount > 0)
    .sort((a, b) => b.pageCount - b.resolvedPageCount - (a.pageCount - a.resolvedPageCount))
    .slice(0, 5)
  if (stubborn.length > 0) {
    console.log(chalk.red('  Validators AI failed to self-fix:'))
    for (const r of stubborn) {
      const failed = r.pageCount - r.resolvedPageCount
      console.log(
        `    ${chalk.dim(r.type.padEnd(34))} ${failed}/${r.pageCount} unresolved  avg ${r.avgAttempts.toFixed(1)} attempts`,
      )
    }
    console.log(chalk.dim('  (These are PJ-NNN candidates \u2014 AI knows the rule but cannot apply it.)\n'))
  }
}

export interface PruneResult {
  scanned: number
  kept: number
  deleted: string[]
  cutoff: Date
}

/**
 * Delete fix-session files older than `keepDays` days.
 *
 * Pure / testable: reads only the sessions directory, never the project
 * outside it. Callers pass an absolute project root. Does NOT rely on
 * `mtime` — derives age from the filename timestamp (ISO-like shape emitted
 * by `fix --journal`) to stay stable across git clones / archive restores.
 * Files that don't parse as timestamps are always kept (conservative).
 *
 * When `dryRun` is true, returns the list of files that would be deleted but
 * does not touch the filesystem.
 */
export function pruneJournalSessions(
  projectRoot: string,
  keepDays: number,
  opts: { dryRun?: boolean; now?: Date } = {},
): PruneResult {
  const dir = resolve(projectRoot, SESSIONS_DIR)
  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000)
  const result: PruneResult = { scanned: 0, kept: 0, deleted: [], cutoff }
  if (!existsSync(dir)) return result
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.yaml')) continue
    result.scanned += 1
    const stem = f.replace(/\.yaml$/, '')
    // Expected shape: 2026-04-20T120000Z or 2026-04-20T12-00-00Z — filename
    // timestamps emitted by fix.ts. Reformat to ISO before Date parse.
    const iso = stem.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-?(\d{2})-?(\d{2})Z?$/, '$1-$2-$3T$4:$5:$6Z')
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
      // Can't parse → keep (unknown file, don't destroy user data)
      result.kept += 1
      continue
    }
    if (date >= cutoff) {
      result.kept += 1
      continue
    }
    const path = resolve(dir, f)
    if (!opts.dryRun) {
      try {
        unlinkSync(path)
      } catch {
        // Silently skip — don't block prune on one permission error
        continue
      }
    }
    result.deleted.push(f)
  }
  return result
}

export async function journalPruneCommand(opts: { keepDays?: string; dryRun?: boolean } = {}): Promise<void> {
  const project = findConfig()
  if (!project) {
    console.log(chalk.yellow('\u26A0 Not in a Coherent project\n'))
    process.exit(1)
  }
  const keepDays = Math.max(1, parseInt(opts.keepDays ?? '30', 10) || 30)
  const result = pruneJournalSessions(project.root, keepDays, { dryRun: Boolean(opts.dryRun) })

  if (result.scanned === 0) {
    console.log(chalk.dim('\n  No journal sessions to prune.\n'))
    return
  }

  const verb = opts.dryRun ? 'Would delete' : 'Deleted'
  const cutoffISO = result.cutoff.toISOString().slice(0, 10)
  console.log(chalk.cyan(`\n  Scanned ${result.scanned} sessions, keeping ${result.kept} (cutoff: ${cutoffISO})\n`))
  if (result.deleted.length === 0) {
    console.log(chalk.green('  ✓ Nothing to prune.\n'))
    return
  }
  console.log(chalk.yellow(`  ${verb} ${result.deleted.length} session(s):`))
  for (const f of result.deleted) {
    console.log(chalk.dim(`    ${f}`))
  }
  if (opts.dryRun) {
    console.log(chalk.dim('\n  Dry run \u2014 no files deleted. Re-run without --dry-run to apply.\n'))
  } else {
    console.log('')
  }
}
