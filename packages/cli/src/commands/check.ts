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
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import { loadManifest, runAudit } from '@getcoherent/core'
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
  autoFixable: number
}

const EXCLUDED_DIRS = new Set(['node_modules', 'design-system'])

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
  } catch { /* ignore */ }
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
    autoFixable: 0,
  }

  // Load config for route validation
  let validRoutes: string[] = []
  try {
    const { DesignSystemManager } = await import('@getcoherent/core')
    const dsm = new DesignSystemManager(project.configPath)
    await dsm.load()
    validRoutes = dsm.getConfig().pages.map((p: any) => p.route).filter(Boolean)
  } catch { /* no config */ }

  // ─── Section 1: Page Quality ────────────────────────────────────────
  if (!skipPages) {
    const appDir = resolve(projectRoot, 'app')
    const files = findTsxFiles(appDir)
    result.pages.total = files.length

    if (!opts.json) console.log(chalk.cyan('\n  📄 Pages') + chalk.dim(` (${files.length} scanned)\n`))

    const autoFixableTypes = new Set([
      'RAW_COLOR', 'NATIVE_BUTTON', 'NATIVE_CHECKBOX', 'NATIVE_INPUT',
      'NATIVE_SELECT', 'NATIVE_TABLE',
    ])

    for (const file of files) {
      const code = readFileSync(file, 'utf-8')
      const relativePath = file.replace(projectRoot + '/', '')
      const baseName = file.split('/').pop() || ''
      const isAuthPage = relativePath.includes('(auth)')
      const isNonPageFile = baseName === 'layout.tsx' || baseName === 'AppNav.tsx'
        || baseName === 'not-found.tsx' || baseName === 'ShowWhenNotAuthRoute.tsx'
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

    // Internal links scan
    const routeSet = new Set(validRoutes)
    routeSet.add('/')
    routeSet.add('#')
    for (const file of files) {
      const code = readFileSync(file, 'utf-8')
      const relativePath = file.replace(projectRoot + '/', '')
      const lines = code.split('\n')
      const linkHrefRe = /href\s*=\s*["'](\/[a-z0-9/-]*)["']/gi
      for (let i = 0; i < lines.length; i++) {
        let match
        while ((match = linkHrefRe.exec(lines[i])) !== null) {
          result.links.total++
          const target = match[1]
          if (target === '/' || target.startsWith('/design-system') || target.startsWith('/api') || target.startsWith('/#')) continue
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
    } catch { /* no manifest */ }
  }

  // ─── Section 2: Shared Components ───────────────────────────────────
  if (!skipShared) {
    try {
      const manifest = await loadManifest(projectRoot)

      if (!opts.json && manifest.shared.length > 0) {
        console.log(chalk.cyan(`\n  🧩 Shared Components`) + chalk.dim(` (${manifest.shared.length} registered)\n`))
      }

      let consistent = 0
      let orphaned = 0
      let unused = 0
      let staleUsedIn = 0
      let nameMismatch = 0

      for (const entry of manifest.shared) {
        const filePath = resolve(projectRoot, entry.file)
        const fileExists = existsSync(filePath)

        if (!fileExists) {
          orphaned++
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
            nameMismatch++
            if (!opts.json) {
              console.log(chalk.yellow(`  ⚠ ${entry.id} — manifest name "${entry.name}" doesn't match export "${actualExports[0]}"`))
              console.log(chalk.dim(`     Fix: coherent sync`))
            }
          }
        } catch { /* skip */ }

        // Check actual usage
        const actualUsedIn = findPagesImporting(projectRoot, entry.name, entry.file)
        const inLayout = isUsedInLayout(projectRoot, entry.name)
        const totalUsage = actualUsedIn.length + (inLayout ? 1 : 0)

        // Check stale usedIn
        const manifestUsedIn = entry.usedIn || []
        const fullActual = inLayout ? [...new Set([...actualUsedIn, 'app/layout.tsx'])] : actualUsedIn
        const isStale = manifestUsedIn.length !== fullActual.length ||
          !manifestUsedIn.every(p => fullActual.includes(p))
        if (isStale) staleUsedIn++

        if (totalUsage === 0) {
          unused++
          if (!opts.json) {
            console.log(chalk.blue(`  ℹ ${entry.id} (${entry.name}) — registered but not used anywhere`))
            console.log(chalk.dim(`     Remove: coherent components shared remove ${entry.id}`))
          }
        } else {
          consistent++
          const usageDesc = inLayout
            ? `layout + ${actualUsedIn.length} page(s)`
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
          console.log(chalk.dim(`     Use shared: import { ${dup.componentName} } from "@/${dup.sharedFile.replace('.tsx', '')}"`))
        }
      }

      result.shared = {
        total: manifest.shared.length,
        consistent,
        unused,
        withInlineDuplicates: inlineDupes.length,
        entries: manifest.shared.map(e => ({
          id: e.id, name: e.name, type: e.type,
          status: existsSync(resolve(projectRoot, e.file)) ? 'ok' : 'unused',
          message: '', suggestions: undefined,
        })),
      }
    } catch { /* no manifest */ }
  }

  // ─── Summary ────────────────────────────────────────────────────────

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2))
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

  console.log(`\n  ${summaryParts.join(' | ')}`)

  if (result.autoFixable > 0) {
    console.log(chalk.cyan(`\n  Auto-fixable: ${result.autoFixable} issues. Run: coherent fix`))
  }

  console.log('')

  const hasErrors = result.pages.withErrors > 0 || result.links.broken.length > 0
  if (hasErrors) process.exit(1)
}
