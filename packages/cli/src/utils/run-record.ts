/**
 * Generation outcome record — one YAML per `coherent chat` invocation.
 *
 * Writes to `.coherent/runs/<timestamp>.yaml`. Enables "did memory help?"
 * analysis over time: compare runs with/without atmosphere overrides,
 * identify which kinds of intents succeed, track duration + error rate.
 *
 * Design choices:
 *  - One file per run (no append, no merge) — avoids locking + lets users
 *    delete one without touching others. Matches `.coherent/fix-sessions/` convention.
 *  - Raw YAML by hand (no `yaml` dependency) — keeps the CLI tree slim.
 *    Matches `packages/cli/src/commands/fix.ts` journaling style.
 *  - v1 captures what's cheap: timestamp, options, atmosphere, outcome, duration.
 *    Future enrichment (validator outcomes, wiki retrieval hits, user accept/reject)
 *    is additive — consumers of the YAML should tolerate missing fields.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join, resolve, relative } from 'path'

export interface RunRecordOptions {
  atmosphere?: string | null
  atmosphereOverride?: boolean
  page?: string | null
  component?: string | null
  newComponent?: string | null
  dryRun?: boolean
  interactive?: boolean
}

export interface RunRecordAtmosphere {
  background: string
  heroLayout: string
  spacing: string
  accents: string
  fontStyle: string
  primaryHint: string
  moodPhrase?: string
}

/** Per-page validator outcome. `types` lists each QualityIssue.type that fired, with count. */
export interface RunRecordValidator {
  page: string
  issues: { type: string; severity: 'error' | 'warning' | 'info'; count: number }[]
}

/** Aggregate validator counts across all generated files. */
export interface RunRecordValidatorSummary {
  errors: number
  warnings: number
  infos: number
}

export interface RunRecord {
  /** ISO 8601 timestamp at run start. */
  timestamp: string
  /** Value of `@getcoherent/cli` version at runtime. */
  coherentVersion: string
  /** The user-supplied message / intent passed to `coherent chat`. */
  intent: string
  /** Options flags the user passed (only fields present are written). */
  options: RunRecordOptions
  /** Final `plan.atmosphere` after merge or preset override. Null when no plan. */
  atmosphere: RunRecordAtmosphere | null
  /** Paths (relative to project root) of TSX page files written during this run. */
  pagesWritten: string[]
  /** Paths (relative to project root) of shared component TSX files written. */
  sharedComponentsWritten: string[]
  /** Post-generation validator outcomes per page. Empty/absent when no checks ran. */
  validators?: RunRecordValidator[]
  /** Aggregate validator counts. Absent when validators didn't run. */
  validatorSummary?: RunRecordValidatorSummary
  /** Milliseconds from chat command entry to finally-block. */
  durationMs: number
  /**
   * How the run exited. `success` is implicitly pending user verdict;
   * `kept` / `rejected` are set retroactively via `coherent chat --mark-kept` /
   * `--mark-rejected` and feed "did memory help?" telemetry.
   */
  outcome: 'success' | 'error' | 'aborted' | 'kept' | 'rejected'
  /** Error message for `outcome: error` runs. Omit otherwise. */
  error?: string
}

/**
 * Collapse a list of QualityIssue-shaped items into the compact
 * `RunRecordValidator.issues` shape (one row per type × severity).
 */
export function aggregateValidatorIssues(
  items: Array<{ type: string; severity: 'error' | 'warning' | 'info' }>,
): RunRecordValidator['issues'] {
  const bucket = new Map<string, RunRecordValidator['issues'][number]>()
  for (const it of items) {
    const key = `${it.type}::${it.severity}`
    const existing = bucket.get(key)
    if (existing) existing.count += 1
    else bucket.set(key, { type: it.type, severity: it.severity, count: 1 })
  }
  return Array.from(bucket.values()).sort((a, b) => {
    if (a.severity !== b.severity) {
      const order = { error: 0, warning: 1, info: 2 }
      return order[a.severity] - order[b.severity]
    }
    return a.type.localeCompare(b.type)
  })
}

/**
 * Sum severities across all per-page validator entries.
 */
export function summarizeValidators(
  validators: RunRecordValidator[] | undefined,
): RunRecordValidatorSummary | undefined {
  if (!validators || validators.length === 0) return undefined
  let errors = 0
  let warnings = 0
  let infos = 0
  for (const v of validators) {
    for (const iss of v.issues) {
      if (iss.severity === 'error') errors += iss.count
      else if (iss.severity === 'warning') warnings += iss.count
      else infos += iss.count
    }
  }
  return { errors, warnings, infos }
}

const yamlEscape = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

const renderOptions = (opts: RunRecordOptions): string[] => {
  const lines: string[] = []
  lines.push('options:')
  if (opts.atmosphere != null) lines.push(`  atmosphere: ${yamlEscape(opts.atmosphere)}`)
  else lines.push('  atmosphere: null')
  if (typeof opts.atmosphereOverride === 'boolean') lines.push(`  atmosphereOverride: ${opts.atmosphereOverride}`)
  if (opts.page) lines.push(`  page: ${yamlEscape(opts.page)}`)
  if (opts.component) lines.push(`  component: ${yamlEscape(opts.component)}`)
  if (opts.newComponent) lines.push(`  newComponent: ${yamlEscape(opts.newComponent)}`)
  if (opts.dryRun) lines.push(`  dryRun: true`)
  if (opts.interactive) lines.push(`  interactive: true`)
  return lines
}

const renderAtmosphere = (a: RunRecordAtmosphere | null): string[] => {
  if (a == null) return ['atmosphere: null']
  const lines = ['atmosphere:']
  lines.push(`  background: ${yamlEscape(a.background)}`)
  lines.push(`  heroLayout: ${yamlEscape(a.heroLayout)}`)
  lines.push(`  spacing: ${yamlEscape(a.spacing)}`)
  lines.push(`  accents: ${yamlEscape(a.accents)}`)
  lines.push(`  fontStyle: ${yamlEscape(a.fontStyle)}`)
  lines.push(`  primaryHint: ${yamlEscape(a.primaryHint)}`)
  if (a.moodPhrase) lines.push(`  moodPhrase: ${yamlEscape(a.moodPhrase)}`)
  return lines
}

const renderList = (header: string, items: string[]): string[] => {
  if (items.length === 0) return [`${header}: []`]
  return [`${header}:`, ...items.map(item => `  - ${yamlEscape(item)}`)]
}

const renderValidators = (validators: RunRecordValidator[] | undefined): string[] => {
  if (!validators || validators.length === 0) return ['validators: []']
  const lines: string[] = ['validators:']
  for (const v of validators) {
    lines.push(`  - page: ${yamlEscape(v.page)}`)
    if (v.issues.length === 0) {
      lines.push('    issues: []')
      continue
    }
    lines.push('    issues:')
    for (const iss of v.issues) {
      lines.push(`      - type: ${yamlEscape(iss.type)}`)
      lines.push(`        severity: ${iss.severity}`)
      lines.push(`        count: ${iss.count}`)
    }
  }
  return lines
}

const renderValidatorSummary = (summary: RunRecordValidatorSummary | undefined): string[] => {
  if (!summary) return []
  return [
    'validatorSummary:',
    `  errors: ${summary.errors}`,
    `  warnings: ${summary.warnings}`,
    `  infos: ${summary.infos}`,
  ]
}

export function renderRunRecordYaml(record: RunRecord): string {
  const lines: string[] = [
    '# coherent chat run — generation outcome record',
    '# Generated by `coherent chat`. One file per invocation. Do not edit by hand.',
    `timestamp: ${record.timestamp}`,
    `coherentVersion: ${yamlEscape(record.coherentVersion)}`,
    `intent: ${yamlEscape(record.intent)}`,
    ...renderOptions(record.options),
    ...renderAtmosphere(record.atmosphere),
    ...renderList('pagesWritten', record.pagesWritten),
    ...renderList('sharedComponentsWritten', record.sharedComponentsWritten),
    ...renderValidators(record.validators),
    ...renderValidatorSummary(record.validatorSummary),
    `durationMs: ${record.durationMs}`,
    `outcome: ${record.outcome}`,
  ]
  if (record.error) lines.push(`error: ${yamlEscape(record.error)}`)
  lines.push('')
  return lines.join('\n')
}

function timestampFilename(isoTimestamp: string): string {
  return isoTimestamp.replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z')
}

/**
 * Write the run record to `.coherent/runs/<timestamp>.yaml` under `projectRoot`.
 * Creates the directory if missing. Returns the absolute path of the written file.
 * Never throws on filesystem errors — caller can ignore the return value when
 * failure to journal is acceptable (most chat invocations).
 */
export function writeRunRecord(projectRoot: string, record: RunRecord): string | null {
  try {
    const dir = resolve(projectRoot, '.coherent', 'runs')
    mkdirSync(dir, { recursive: true })
    const path = resolve(dir, `${timestampFilename(record.timestamp)}.yaml`)
    writeFileSync(path, renderRunRecordYaml(record), 'utf-8')
    return path
  } catch {
    return null
  }
}

/**
 * Relative-path convenience — returns the `.coherent/runs/<file>` form
 * (useful for printing to users without leaking absolute paths).
 */
export function writeRunRecordRel(projectRoot: string, record: RunRecord): string | null {
  const abs = writeRunRecord(projectRoot, record)
  return abs ? relative(projectRoot, abs) : null
}

/** Resolve the most-recently-modified `.coherent/runs/*.yaml`, or null. */
export function findLatestRunRecord(projectRoot: string): string | null {
  const dir = resolve(projectRoot, '.coherent', 'runs')
  if (!existsSync(dir)) return null
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.yaml'))
      .map(f => ({ path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    return files[0]?.path ?? null
  } catch {
    return null
  }
}

/**
 * Retroactively mark the latest run record as `kept` or `rejected`. Rewrites
 * only the `outcome:` line; leaves other fields untouched. Returns the relative
 * path of the updated file, or null on failure / no run found. Safe to call
 * multiple times — idempotent for the same signal.
 */
export function markLatestRunOutcome(
  projectRoot: string,
  signal: 'kept' | 'rejected',
): { rel: string; previous: RunRecord['outcome'] } | null {
  const abs = findLatestRunRecord(projectRoot)
  if (!abs) return null
  try {
    const content = readFileSync(abs, 'utf-8')
    const match = content.match(/^outcome:\s*(\w+)/m)
    if (!match) return null
    const previous = match[1] as RunRecord['outcome']
    const updated = content.replace(/^outcome:\s*\w+/m, `outcome: ${signal}`)
    writeFileSync(abs, updated, 'utf-8')
    return { rel: relative(projectRoot, abs), previous }
  } catch {
    return null
  }
}
