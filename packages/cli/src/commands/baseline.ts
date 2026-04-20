/**
 * Baseline Command
 *
 * Structural regression detection without screenshots or a browser.
 *
 * Why structural, not pixel: Playwright / Puppeteer add ~100MB of Chromium and
 * a brittle pipeline (dev server lifecycle, port juggling, anti-aliasing diffs
 * on different machines). Most regressions surface in the code itself:
 *   - A shared component stopped being imported (StatCard dropped from /dashboard)
 *   - Line count halved (page silently shrank — content loss)
 *   - New validator warnings appeared (chart placeholder snuck in)
 *
 * `coherent baseline` fingerprints each page by (issues, imports, lineCount,
 * shared-component usage). Running it again compares against the latest saved
 * baseline and flags deltas. Useful as a lightweight CI check or a before/after
 * gate for `coherent chat` runs on multi-page projects.
 *
 * Storage: .coherent/visuals/baseline-YYYY-MM-DD-N.json (keeps history, never
 * overwrites — compare mode picks the most recent by mtime).
 */

import chalk from 'chalk'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { resolve, relative } from 'path'
import { CLI_VERSION } from '@getcoherent/core'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import { validatePageQuality } from '../utils/quality-validator.js'

export interface BaselineOptions {
  save?: boolean
  compare?: boolean
}

interface PageFingerprint {
  route: string
  file: string
  lineCount: number
  issues: Record<string, number>
  componentImports: string[]
  sharedImports: string[]
}

interface Baseline {
  date: string
  cliVersion: string
  pages: Record<string, PageFingerprint>
}

export async function baselineCommand(opts: BaselineOptions) {
  const project = findConfig()
  if (!project) exitNotCoherent()
  const projectRoot = project!.root

  const pagesDir = resolve(projectRoot, 'app')
  if (!existsSync(pagesDir)) {
    console.error(chalk.red('❌ app/ directory not found — is this a Next.js project?'))
    process.exit(1)
  }

  const pageFiles = findPageFiles(pagesDir)
  if (pageFiles.length === 0) {
    console.error(chalk.yellow('⚠ No page.tsx files found under app/ — nothing to baseline.'))
    return
  }

  console.log(chalk.cyan(`\n📐 Fingerprinting ${pageFiles.length} pages...\n`))

  const current: Baseline = {
    date: new Date().toISOString().slice(0, 10),
    cliVersion: CLI_VERSION,
    pages: {},
  }

  for (const file of pageFiles) {
    const rel = relative(projectRoot, file)
    const route = routeFromFilePath(rel)
    const code = readFileSync(file, 'utf-8')
    current.pages[route] = fingerprintPage(route, rel, code)
  }

  const baselineDir = resolve(projectRoot, '.coherent', 'visuals')

  // `--compare` is the default; `--save` explicitly records a new baseline.
  // Running with neither flag: compare against latest baseline AND save a new
  // snapshot (typical CI / regression-gate use case).
  const isCompare = opts.compare ?? true
  const isSave = opts.save ?? !opts.compare // save unless caller explicitly asked compare-only

  if (isCompare && existsSync(baselineDir)) {
    const latest = findLatestBaseline(baselineDir)
    if (latest) {
      console.log(
        chalk.dim(
          `Comparing against ${relative(projectRoot, latest.path)} (${latest.baseline.date}, v${latest.baseline.cliVersion})\n`,
        ),
      )
      const regressions = compareBaselines(latest.baseline, current)
      printRegressionReport(regressions)
    } else {
      console.log(chalk.dim('No prior baseline found — first run.\n'))
    }
  }

  if (isSave) {
    mkdirSync(baselineDir, { recursive: true })
    const today = new Date().toISOString().slice(0, 10)
    const existingToday = readdirSync(baselineDir).filter(f => f.startsWith(`baseline-${today}-`))
    const nextN = existingToday.length + 1
    const filename = `baseline-${today}-${nextN}.json`
    const filepath = resolve(baselineDir, filename)
    writeFileSync(filepath, JSON.stringify(current, null, 2))
    console.log(chalk.green(`\n✓ Baseline saved: ${relative(projectRoot, filepath)}`))
    console.log(
      chalk.dim(`   ${Object.keys(current.pages).length} pages, ${totalIssues(current)} total validator issues\n`),
    )
  }
}

function findPageFiles(dir: string): string[] {
  const results: string[] = []
  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      if (entry === 'node_modules' || entry === '.next') continue
      const full = resolve(d, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) walk(full)
      else if (entry === 'page.tsx') results.push(full)
    }
  }
  walk(dir)
  return results.sort()
}

function routeFromFilePath(relPath: string): string {
  // app/(app)/dashboard/page.tsx → /dashboard
  // app/page.tsx → /
  // app/(auth)/login/page.tsx → /login
  return (
    (
      '/' +
      relPath
        .replace(/^app\//, '')
        .replace(/\/page\.tsx$/, '')
        .replace(/\([^)]*\)\//g, '')
    ) // strip route groups
      .replace(/\/$/, '') || '/'
  )
}

function fingerprintPage(route: string, file: string, code: string): PageFingerprint {
  const issues = validatePageQuality(code)
  const issueCounts: Record<string, number> = {}
  for (const issue of issues) {
    issueCounts[issue.type] = (issueCounts[issue.type] ?? 0) + 1
  }

  // Extract all imports — gives us a picture of which components the page relies on.
  const importMatches = code.matchAll(/import\s*\{\s*([^}]+)\s*\}\s*from\s*["']([^"']+)["']/g)
  const componentImports = new Set<string>()
  const sharedImports = new Set<string>()
  for (const m of importMatches) {
    const names = m[1].split(',').map(n => n.trim().replace(/\s+as\s+\w+/, ''))
    const from = m[2]
    if (from.startsWith('@/components/ui/')) {
      for (const n of names) componentImports.add(n)
    } else if (from.startsWith('@/components/shared/')) {
      for (const n of names) sharedImports.add(n)
    }
  }

  return {
    route,
    file,
    lineCount: code.split('\n').length,
    issues: issueCounts,
    componentImports: [...componentImports].sort(),
    sharedImports: [...sharedImports].sort(),
  }
}

function findLatestBaseline(dir: string): { path: string; baseline: Baseline } | null {
  const files = readdirSync(dir)
    .filter(f => f.startsWith('baseline-') && f.endsWith('.json'))
    .map(f => ({ name: f, full: resolve(dir, f), mtime: statSync(resolve(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  if (files.length === 0) return null
  try {
    const baseline = JSON.parse(readFileSync(files[0].full, 'utf-8')) as Baseline
    return { path: files[0].full, baseline }
  } catch {
    return null
  }
}

interface Regression {
  route: string
  added: Array<{ kind: 'issue' | 'removed-component' | 'removed-shared'; detail: string }>
  lineDelta: number
}

export function compareBaselines(prior: Baseline, current: Baseline): Regression[] {
  const regressions: Regression[] = []
  for (const [route, currPage] of Object.entries(current.pages)) {
    const priorPage = prior.pages[route]
    if (!priorPage) continue // new page, nothing to regress from
    const added: Regression['added'] = []

    // New validator issues that weren't there before OR have grown in count.
    for (const [type, count] of Object.entries(currPage.issues)) {
      const prev = priorPage.issues[type] ?? 0
      if (count > prev) {
        added.push({ kind: 'issue', detail: `${type} ×${count - prev}` })
      }
    }

    // Component imports that disappeared.
    const priorUi = new Set(priorPage.componentImports)
    for (const comp of priorUi) {
      if (!currPage.componentImports.includes(comp)) {
        added.push({ kind: 'removed-component', detail: comp })
      }
    }
    const priorShared = new Set(priorPage.sharedImports)
    for (const shared of priorShared) {
      if (!currPage.sharedImports.includes(shared)) {
        added.push({ kind: 'removed-shared', detail: shared })
      }
    }

    const lineDelta = currPage.lineCount - priorPage.lineCount
    // Significant shrink = possible content loss. 30% drop is the threshold —
    // below that, normal refactor noise; above, worth flagging.
    const significantShrink = lineDelta < 0 && Math.abs(lineDelta) / priorPage.lineCount > 0.3

    if (added.length > 0 || significantShrink) {
      regressions.push({ route, added, lineDelta })
    }
  }
  return regressions
}

function printRegressionReport(regressions: Regression[]): void {
  if (regressions.length === 0) {
    console.log(chalk.green('✓ No regressions vs prior baseline.\n'))
    return
  }
  console.log(chalk.yellow(`⚠ ${regressions.length} page(s) with regressions:\n`))
  for (const r of regressions) {
    console.log(chalk.bold(`  ${r.route}`))
    for (const a of r.added) {
      const icon =
        a.kind === 'issue' ? chalk.red('✗') : a.kind === 'removed-component' ? chalk.yellow('−') : chalk.yellow('⊖')
      const label =
        a.kind === 'issue'
          ? 'new issue'
          : a.kind === 'removed-component'
            ? 'dropped UI component'
            : 'dropped shared component'
      console.log(`    ${icon} ${label}: ${a.detail}`)
    }
    if (r.lineDelta < 0) {
      console.log(chalk.yellow(`    ⇩ line count: ${r.lineDelta} lines (significant shrink)`))
    }
  }
  console.log()
}

function totalIssues(b: Baseline): number {
  let total = 0
  for (const page of Object.values(b.pages)) {
    for (const count of Object.values(page.issues)) total += count
  }
  return total
}
