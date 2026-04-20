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
import { existsSync, readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'
import { findConfig } from '../utils/find-config.js'

const SESSIONS_DIR = join('.coherent', 'fix-sessions')

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
  if (sessions.length === 0) {
    console.log(chalk.dim('\n  No journal sessions yet. Run: coherent fix --journal\n'))
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
}
