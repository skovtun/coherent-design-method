/**
 * Check Command
 *
 * Read-only diagnostics: shows all problems without changing anything.
 * Pages quality + Shared components consistency + Internal links.
 *
 * Replaces: validate + audit
 *
 * Flags:
 *   --json    Output as JSON
 *   --pages   Only check pages, skip shared components
 *   --shared  Only check shared components, skip pages
 */

import chalk from 'chalk'
import { resolve } from 'path'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { validatePageQuality, formatIssues } from '../utils/quality-validator.js'
import { validateCrossPage, type PageFile } from '../utils/cross-page-validator.js'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import { loadManifest } from '@getcoherent/core'
import { resolvePageByFuzzyMatch } from './chat/utils.js'
import {
  findPagesImporting,
  isUsedInLayout,
  findUnregisteredComponents,
  findInlineDuplicates,
  extractExportedComponentNames,
} from '../utils/component-integrity.js'

export interface CheckOptions {
  json?: boolean
  pages?: boolean
  shared?: boolean
  /**
   * Check one specific page by id/name/route. Uses the same fuzzy match as
   * `coherent chat --page X` so users get consistent behavior across commands.
   */
  page?: string
}

interface CheckResult {
  pages: {
    total: number
    clean: number
    withErrors: number
    withWarnings: number
    files: Array<{
      path: string
      errors: number
      warnings: number
      issues: Array<{ line: number; type: string; message: string; severity: string }>
    }>
  }
  shared: {
    total: number
    consistent: number
    unused: number
    withInlineDuplicates: number
    entries: Array<{
      id: string
      name: string
      type: string
      status: string
      message: string
      suggestions?: string[]
    }>
  }
  links: {
    total: number
    broken: Array<{ file: string; line: number; href: string }>
  }
  /**
   * Config routes with no backing page.tsx on disk. Previously invisible:
   * `validRoutes` came from config, so a route whose page generation was
   * dropped (double-failed page) still passed link validation and shipped a
   * runtime 404. Audit finding.
   */
  deadRoutes: string[]
  crossPage: {
    issues: Array<{ type: string; severity: string; message: string }>
  }
  autoFixable: number
}

/**
 * Quality score (0–100) from a check result. Single source of truth for the
 * console and `--json` paths, which previously computed it with *different*
 * weights (and no dead-route term in JSON).
 *
 * Each category's contribution is CAPPED so no single dimension can zero an
 * otherwise-healthy app. The prior formula charged 15 points per broken link
 * with no cap, so ~7 broken links dropped a 7/7-clean-page project to 0/100 —
 * "Critical" for an app whose pages were all fine, just linking to a couple of
 * routes that didn't generate. Caps keep the score honest: page-level errors
 * (broken code) weigh most; links/dead-routes (fixable by regenerating a page)
 * weigh less and saturate. A genuinely broken project can still reach 0 (the
 * caps sum to 125), but a good-pages-bad-links app now lands in the 70s, not 0.
 */
export function computeQualityScore(result: CheckResult): number {
  const errorPenalty = Math.min(result.pages.withErrors * 10, 40)
  const warningPenalty = Math.min(result.pages.withWarnings * 3, 15)
  const linkPenalty = Math.min(result.links.broken.length * 6, 24)
  const deadRoutePenalty = Math.min(result.deadRoutes.length * 6, 24)
  const unusedPenalty = Math.min(result.shared.unused * 2, 10)
  const crossPagePenalty = Math.min(result.crossPage.issues.length * 3, 12)
  const total = errorPenalty + warningPenalty + linkPenalty + deadRoutePenalty + unusedPenalty + crossPagePenalty
  return Math.max(0, Math.min(100, 100 - total))
}

const EXCLUDED_DIRS = new Set(['node_modules', 'design-system'])

/**
 * Map a scanned page file (repo-relative, e.g. `app/(app)/analytics/page.tsx`)
 * to its Next.js route (`/analytics`). Route-group segments `(name)` are
 * stripped; `app/page.tsx` is the root `/`. Returns null for non-page files.
 */
export function fileToRoute(relativePath: string): string | null {
  if (!/(^|\/)page\.tsx$/.test(relativePath)) return null
  const segments = relativePath
    .replace(/^app\//, '')
    .replace(/\/?page\.tsx$/, '')
    .split('/')
    .filter(seg => seg && !/^\(.*\)$/.test(seg))
  return '/' + segments.join('/')
}

function findTsxFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const full = resolve(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory() && !entry.startsWith('.') && !EXCLUDED_DIRS.has(entry)) {
        results.push(...findTsxFiles(full))
      } else if (entry.endsWith('.tsx')) {
        results.push(full)
      }
    }
  } catch {
    /* ignore */
  }
  return results
}

export async function checkCommand(opts: CheckOptions = {}) {
  const project = findConfig()
  if (!project) {
    exitNotCoherent()
  }

  const projectRoot = project.root
  const skipPages = opts.shared === true && !opts.pages
  const skipShared = opts.pages === true && !opts.shared

  const result: CheckResult = {
    pages: { total: 0, clean: 0, withErrors: 0, withWarnings: 0, files: [] },
    shared: { total: 0, consistent: 0, unused: 0, withInlineDuplicates: 0, entries: [] },
    links: { total: 0, broken: [] },
    deadRoutes: [],
    crossPage: { issues: [] },
    autoFixable: 0,
  }

  // Load config for route validation
  let validRoutes: string[] = []
  try {
    const { DesignSystemManager } = await import('@getcoherent/core')
    const dsm = new DesignSystemManager(project.configPath)
    await dsm.load()
    validRoutes = dsm
      .getConfig()
      .pages.map((p: any) => p.route)
      .filter(Boolean)
  } catch {
    /* no config */
  }

  // ─── Section 1: Page Quality ────────────────────────────────────────
  if (!skipPages) {
    const appDir = resolve(projectRoot, 'app')
    let files = findTsxFiles(appDir)

    // --page X → filter to a single page via fuzzy match against config.pages.
    // Uses the same resolver as `coherent chat --page X` for consistent behavior.
    if (opts.page) {
      const cfgPages = validRoutes.map(r => ({ id: r.replace(/^\//, '') || 'home', name: r, route: r }))
      const matched = resolvePageByFuzzyMatch(cfgPages, opts.page)
      if (!matched) {
        console.error(chalk.yellow(`\n⚠ Page "${opts.page}" not found in project.`))
        console.log(chalk.dim('   Available: ' + cfgPages.map(p => p.route).join(', ') + '\n'))
        return
      }
      const targetRoute = matched.route
      const routeSlug = targetRoute.replace(/^\//, '') || ''
      files = files.filter(f => {
        const rel = f.replace(projectRoot + '/', '')
        // app/(app)/dashboard/page.tsx OR app/page.tsx (for /)
        if (routeSlug === '') return rel === 'app/page.tsx'
        return rel.endsWith(`/${routeSlug}/page.tsx`) || rel === `app/${routeSlug}/page.tsx`
      })
      if (files.length === 0) {
        console.error(chalk.yellow(`\n⚠ No page.tsx file found for "${targetRoute}".\n`))
        return
      }
      if (!opts.json) console.log(chalk.dim(`Filtered to --page ${opts.page} → ${targetRoute}`))
    }

    result.pages.total = files.length

    if (!opts.json) console.log(chalk.cyan('\n  📄 Pages') + chalk.dim(` (${files.length} scanned)\n`))

    const autoFixableTypes = new Set([
      'RAW_COLOR',
      'NATIVE_BUTTON',
      'NATIVE_CHECKBOX',
      'NATIVE_INPUT',
      'NATIVE_SELECT',
      'NATIVE_TABLE',
    ])

    // Cache file contents to avoid double reads (quality check + link scan)
    const fileContents = new Map<string, string>()
    for (const file of files) {
      fileContents.set(file, readFileSync(file, 'utf-8'))
    }

    for (const file of files) {
      const code = fileContents.get(file)!
      const relativePath = file.replace(projectRoot + '/', '')
      const baseName = file.split('/').pop() || ''
      const isAuthPage = relativePath.includes('(auth)')
      const isNonPageFile =
        baseName === 'layout.tsx' ||
        baseName === 'AppNav.tsx' ||
        baseName === 'not-found.tsx' ||
        baseName === 'ShowWhenNotAuthRoute.tsx'
      const isHomePage = relativePath === 'app/page.tsx'
      const suppressH1 = isNonPageFile || isAuthPage

      const issues = validatePageQuality(code, validRoutes)
      const filteredIssues = issues.filter(i => {
        if (suppressH1 && (i.type === 'NO_H1' || i.type === 'MULTIPLE_H1')) return false
        if (isHomePage && i.type === 'NO_EMPTY_STATE') return false
        return true
      })

      const errors = filteredIssues.filter(i => i.severity === 'error').length
      const warnings = filteredIssues.filter(i => i.severity === 'warning').length
      const fileAutoFixable = filteredIssues.filter(i => autoFixableTypes.has(i.type)).length
      result.autoFixable += fileAutoFixable

      if (filteredIssues.length === 0) {
        result.pages.clean++
        if (!opts.json) console.log(chalk.green(`  ✔ ${relativePath}`) + chalk.dim(' — clean'))
        continue
      }

      if (errors > 0) result.pages.withErrors++
      if (warnings > 0) result.pages.withWarnings++

      result.pages.files.push({
        path: relativePath,
        errors,
        warnings,
        issues: filteredIssues.map(i => ({ line: i.line, type: i.type, message: i.message, severity: i.severity })),
      })

      if (!opts.json) {
        const parts = []
        if (errors > 0) parts.push(chalk.red(`${errors} error(s)`))
        if (warnings > 0) parts.push(chalk.yellow(`${warnings} warning(s)`))
        console.log(chalk.yellow(`  ⚠ ${relativePath}`) + chalk.dim(` — ${parts.join(', ')}`))
        console.log(formatIssues(filteredIssues))
      }
    }

    // Dead-route detection: a config route with no backing page.tsx ships a
    // runtime 404. Because `validRoutes` comes from config, such a route would
    // otherwise pass link validation (and links to it would look valid). Map
    // each scanned page file to its route, then flag config routes with no file.
    const routesWithFiles = new Set<string>()
    for (const file of files) {
      const r = fileToRoute(file.replace(projectRoot + '/', ''))
      if (r) routesWithFiles.add(r)
    }
    result.deadRoutes = validRoutes.filter(r => r !== '/' && !routesWithFiles.has(r))

    // Internal links scan
    const routeSet = new Set(validRoutes)
    routeSet.add('/')
    routeSet.add('#')
    // Links pointing at a dead route are broken too — drop them from the valid set.
    for (const dead of result.deadRoutes) routeSet.delete(dead)
    for (const file of files) {
      const code = fileContents.get(file)!
      const relativePath = file.replace(projectRoot + '/', '')
      const lines = code.split('\n')
      const linkHrefRe = /href\s*=\s*["'](\/[a-z0-9/-]*)["']/gi
      for (let i = 0; i < lines.length; i++) {
        let match
        while ((match = linkHrefRe.exec(lines[i])) !== null) {
          result.links.total++
          const target = match[1]
          if (
            target === '/' ||
            target.startsWith('/design-system') ||
            target.startsWith('/api') ||
            target.startsWith('/#')
          )
            continue
          if (!routeSet.has(target)) {
            result.links.broken.push({ file: relativePath, line: i + 1, href: target })
          }
        }
      }
    }

    if (!opts.json && result.links.broken.length > 0) {
      console.log(chalk.yellow(`\n  🔗 Internal Links`) + chalk.dim(` (${result.links.total} scanned)\n`))
      for (const b of result.links.broken) {
        console.log(chalk.red(`  ✗ ${b.file}:${b.line}`) + chalk.dim(` → ${b.href} (route does not exist)`))
      }
    } else if (!opts.json && result.links.total > 0) {
      console.log(chalk.green(`\n  🔗 Internal Links`) + chalk.dim(` — all ${result.links.total} links resolve ✓`))
    }

    if (!opts.json && result.deadRoutes.length > 0) {
      console.log(chalk.yellow(`\n  🚫 Dead Routes`) + chalk.dim(` (${result.deadRoutes.length})\n`))
      for (const r of result.deadRoutes) {
        console.log(chalk.red(`  ✗ ${r}`) + chalk.dim(' — in config/navigation but no page.tsx exists (runtime 404)'))
      }
      console.log(chalk.dim(`\n  Fix: coherent chat "regenerate ${result.deadRoutes[0]}" — or remove the route.`))
    }

    // Cross-page consistency — only run on multi-page scans (not --page X).
    // Scope to actual page.tsx files: layout/nav/shared components live under
    // app/ too but aren't "pages" for drift-detection purposes, and mixing
    // them in can create phantom minority clusters.
    if (!opts.page) {
      const pageOnlyFiles = files.filter(f => /\/page\.tsx$/.test(f))
      if (pageOnlyFiles.length >= 2) {
        const pageFiles: PageFile[] = pageOnlyFiles.map(f => ({
          path: f.replace(projectRoot + '/', ''),
          code: fileContents.get(f)!,
        }))
        let crossIssues: ReturnType<typeof validateCrossPage> = []
        try {
          crossIssues = validateCrossPage(pageFiles)
        } catch {
          // Cross-page is best-effort — a single bad page or malformed
          // file shouldn't block the whole `coherent check` run.
          crossIssues = []
        }
        result.crossPage.issues = crossIssues.map(i => ({
          type: i.type,
          severity: i.severity,
          message: i.message,
        }))
        if (!opts.json && crossIssues.length > 0) {
          console.log(chalk.yellow(`\n  🔀 Cross-Page Consistency`) + chalk.dim(` (${crossIssues.length} issue(s))\n`))
          for (const issue of crossIssues) {
            console.log(chalk.yellow(`  ⚠ ${issue.type}`))
            console.log(chalk.dim(`    ${issue.message}`))
          }
        }
        // Intentionally no "no drift detected" message: clusters are only
        // meaningful with 3+ stat cards total across pages. Printing a
        // green tick when the validator didn't actually cluster would be
        // misleading — silence is honest.
      }
    }

    // Shared manifest file check
    try {
      const manifest = await loadManifest(project.root)
      if (manifest.shared.length > 0) {
        for (const entry of manifest.shared) {
          const fullPath = resolve(project.root, entry.file)
          if (!existsSync(fullPath)) {
            result.pages.withErrors++
            if (!opts.json) console.log(chalk.red(`\n  ✗ Missing shared component file: ${entry.id} (${entry.file})`))
          }
        }
      }
    } catch {
      /* no manifest */
    }
  }

  // ─── Section 2: Shared Components ───────────────────────────────────
  if (!skipShared) {
    try {
      const manifest = await loadManifest(projectRoot)

      if (!opts.json && manifest.shared.length > 0) {
        console.log(chalk.cyan(`\n  🧩 Shared Components`) + chalk.dim(` (${manifest.shared.length} registered)\n`))
      }

      let consistent = 0
      let _orphaned = 0
      let unused = 0
      let _staleUsedIn = 0
      let _nameMismatch = 0

      for (const entry of manifest.shared) {
        const filePath = resolve(projectRoot, entry.file)
        const fileExists = existsSync(filePath)

        if (!fileExists) {
          _orphaned++
          if (!opts.json) {
            console.log(chalk.red(`  ❌ ${entry.id} (${entry.name}) — file missing: ${entry.file}`))
            console.log(chalk.dim(`     Fix: coherent fix  or  coherent sync`))
          }
          continue
        }

        // Check export name matches
        try {
          const code = readFileSync(filePath, 'utf-8')
          const actualExports = extractExportedComponentNames(code)
          if (actualExports.length > 0 && !actualExports.includes(entry.name)) {
            _nameMismatch++
            if (!opts.json) {
              console.log(
                chalk.yellow(
                  `  ⚠ ${entry.id} — manifest name "${entry.name}" doesn't match export "${actualExports[0]}"`,
                ),
              )
              console.log(chalk.dim(`     Fix: coherent sync`))
            }
          }
        } catch {
          /* skip */
        }

        // Check actual usage
        const actualUsedIn = findPagesImporting(projectRoot, entry.name, entry.file)
        const layoutPaths = isUsedInLayout(projectRoot, entry.name)
        const totalUsage = actualUsedIn.length + layoutPaths.length

        // Check stale usedIn
        const manifestUsedIn = entry.usedIn || []
        const fullActual = [...new Set([...actualUsedIn, ...layoutPaths])]
        const isStale =
          manifestUsedIn.length !== fullActual.length || !manifestUsedIn.every(p => fullActual.includes(p))
        if (isStale) _staleUsedIn++

        if (totalUsage === 0) {
          unused++
          if (!opts.json) {
            console.log(chalk.blue(`  ℹ ${entry.id} (${entry.name}) — registered but not used anywhere`))
            console.log(chalk.dim(`     Remove: coherent components shared remove ${entry.id}`))
          }
        } else {
          consistent++
          const usageDesc =
            layoutPaths.length > 0
              ? `layout(${layoutPaths.length}) + ${actualUsedIn.length} page(s)`
              : `${actualUsedIn.length} page(s)`
          if (!opts.json) {
            const staleNote = isStale ? chalk.yellow(' [usedIn stale]') : ''
            console.log(chalk.green(`  ✔ ${entry.id} (${entry.name})`) + chalk.dim(` — ${usageDesc}`) + staleNote)
          }
        }
      }

      // Find unregistered components
      const unregistered = findUnregisteredComponents(projectRoot, manifest)
      if (unregistered.length > 0 && !opts.json) {
        console.log(chalk.cyan(`\n  📦 Unregistered components found:`))
        for (const comp of unregistered) {
          console.log(chalk.blue(`  ℹ ${comp.name}`) + chalk.dim(` — ${comp.file} (not in manifest)`))
          console.log(chalk.dim(`     Register: coherent sync`))
        }
      }

      // Find inline duplicates
      const inlineDupes = findInlineDuplicates(projectRoot, manifest)
      if (inlineDupes.length > 0 && !opts.json) {
        console.log(chalk.cyan(`\n  🔍 Inline duplicates:`))
        for (const dup of inlineDupes) {
          console.log(chalk.yellow(`  ⚠ ${dup.pageFile}`) + chalk.dim(` has inline ${dup.componentName}`))
          console.log(
            chalk.dim(
              `     Use shared: import { ${dup.componentName} } from "@/${dup.sharedFile.replace('.tsx', '')}"`,
            ),
          )
        }
      }

      result.shared = {
        total: manifest.shared.length,
        consistent,
        unused,
        withInlineDuplicates: inlineDupes.length,
        entries: manifest.shared.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          status: existsSync(resolve(projectRoot, e.file)) ? 'ok' : 'unused',
          message: '',
          suggestions: undefined,
        })),
      }
    } catch {
      /* no manifest */
    }
  }

  // ─── Section 3: Reuse Validation ─────────────────────────────────────
  if (!skipShared) {
    try {
      const { validateReuse } = await import('../utils/reuse-validator.js')
      const { inferPageTypeFromRoute } = await import('../agents/design-constraints.js')
      const { loadPlanFromDisk } = await import('../utils/layout-integrity.js')
      const manifest = await loadManifest(projectRoot)
      const plan = loadPlanFromDisk(projectRoot)

      const plannedByRoute = new Map<string, Set<string>>()
      if (plan?.sharedComponents) {
        for (const comp of plan.sharedComponents) {
          for (const route of comp.usedBy ?? []) {
            if (!plannedByRoute.has(route)) plannedByRoute.set(route, new Set())
            plannedByRoute.get(route)!.add(comp.name)
          }
        }
      }

      const appDir = resolve(projectRoot, 'app')
      const allTsx = existsSync(appDir) ? findTsxFiles(appDir) : []
      const pageFiles = allTsx.filter(f => /\/page\.tsx$/.test(f))

      if (manifest.shared.length > 0 && pageFiles.length > 0) {
        const reuseWarnings: Array<{ file: string; message: string }> = []
        const planExists = !!plan?.sharedComponents

        for (const file of pageFiles) {
          const code = readFileSync(file, 'utf-8')
          const relativePath = file.replace(projectRoot + '/', '')
          const routeRaw = relativePath
            .replace(/^app\//, '')
            .replace(/\/?page\.tsx$/, '')
            .replace(/^\(.*?\)\/?/, '')
          const normalizedRoute = routeRaw === '' ? '/' : '/' + routeRaw.replace(/\/$/, '')
          const pageType = inferPageTypeFromRoute(normalizedRoute)
          const plannedNames = planExists ? (plannedByRoute.get(normalizedRoute) ?? new Set<string>()) : undefined
          const warnings = validateReuse(manifest, code, pageType, undefined, plannedNames)

          for (const w of warnings) {
            reuseWarnings.push({ file: relativePath, message: w.message })
          }
        }

        if (reuseWarnings.length > 0 && !opts.json) {
          console.log(chalk.yellow(`\n  🔄 Reuse Warnings`) + chalk.dim(` (${reuseWarnings.length} found)\n`))
          for (const w of reuseWarnings.slice(0, 10)) {
            console.log(chalk.yellow(`  ⚠ ${w.file}:`) + chalk.dim(` ${w.message}`))
          }
          if (reuseWarnings.length > 10) {
            console.log(chalk.dim(`  ... and ${reuseWarnings.length - 10} more`))
          }
        }
      }
    } catch {
      // best-effort
    }
  }

  // ─── Layout Integrity (plan vs filesystem) ──────────────────────────
  const { validateLayoutIntegrity, loadPlanFromDisk } = await import('../utils/layout-integrity.js')
  const plan = loadPlanFromDisk(projectRoot)
  if (plan && !opts.json) {
    const layoutIssues = validateLayoutIntegrity(projectRoot, plan)
    if (layoutIssues.length > 0) {
      console.log(chalk.cyan(`\n  🏗  Layout Integrity`) + chalk.dim(` (${layoutIssues.length} issue(s))\n`))
      for (const issue of layoutIssues) {
        const icon = issue.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠')
        const file = issue.file ? chalk.dim(` [${issue.file}]`) : ''
        console.log(`  ${icon} [${issue.type}]${file} ${issue.message}`)
        if (issue.severity === 'error') result.pages.withErrors++
      }
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────

  if (opts.json) {
    console.log(JSON.stringify({ ...result, score: computeQualityScore(result) }, null, 2))
    return
  }

  console.log(chalk.dim('\n  ' + '─'.repeat(50)))

  const summaryParts: string[] = []
  if (!skipPages) {
    summaryParts.push(`${chalk.green(`${result.pages.clean} clean`)} pages`)
    if (result.pages.withErrors > 0) summaryParts.push(chalk.red(`${result.pages.withErrors} with errors`))
    if (result.pages.withWarnings > 0) summaryParts.push(chalk.yellow(`${result.pages.withWarnings} with warnings`))
  }
  if (!skipShared && result.shared.total > 0) {
    summaryParts.push(`${result.shared.consistent} healthy shared`)
    if (result.shared.unused > 0) summaryParts.push(`${result.shared.unused} unused`)
  }
  if (result.links.broken.length > 0) {
    summaryParts.push(chalk.red(`${result.links.broken.length} broken link(s)`))
  }
  if (result.deadRoutes.length > 0) {
    summaryParts.push(chalk.red(`${result.deadRoutes.length} dead route(s)`))
  }
  if (result.crossPage.issues.length > 0) {
    summaryParts.push(chalk.yellow(`${result.crossPage.issues.length} cross-page drift`))
  }

  console.log(`\n  ${summaryParts.join(' | ')}`)

  // Quality score: 0-100 (capped per-category — see computeQualityScore).
  const score = computeQualityScore(result)

  const scoreColor = score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red
  const scoreLabel = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'Critical'
  console.log(`\n  Quality Score: ${scoreColor(`${score}/100`)} ${chalk.dim(`(${scoreLabel})`)}`)

  if (result.autoFixable > 0) {
    console.log(chalk.cyan(`\n  Auto-fixable: ${result.autoFixable} issues. Run: coherent fix`))
  }

  // Generate design recommendations
  try {
    const { generateDesignRecommendations } = await import('../utils/design-recommendations.js')
    const { writeFileSync } = await import('fs')
    const recsContent = generateDesignRecommendations(projectRoot)
    if (recsContent) {
      writeFileSync(resolve(projectRoot, 'recommendations.md'), recsContent, 'utf-8')
      const recCount = (recsContent.match(/^🔴|^🟡|^💡/gm) || []).length
      if (recCount > 0) {
        console.log(chalk.cyan(`  📋 ${recCount} design recommendation(s) → recommendations.md`))
        console.log(chalk.dim(`     View at /design-system/recommendations\n`))
      }
    }
  } catch (err) {
    if (process.env.COHERENT_DEBUG === '1') {
      console.error(chalk.dim(`  ⚠ Design recommendations failed: ${err instanceof Error ? err.message : String(err)}`))
    }
  }

  console.log('')

  const hasErrors = result.pages.withErrors > 0 || result.links.broken.length > 0 || result.deadRoutes.length > 0
  if (hasErrors) process.exit(1)
}
