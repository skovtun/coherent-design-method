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
import { findConfig } from '../utils/find-config.js'
import { loadManifest, runAudit } from '@coherent/core'

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
    console.log(chalk.red('Not a Coherent project.'))
    console.log(chalk.dim('  Run from a project with design-system.config.ts'))
    process.exit(1)
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
    const { DesignSystemManager } = await import('@coherent/core')
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
      const auditResult = await runAudit(projectRoot)
      result.shared = {
        total: auditResult.summary.total,
        consistent: auditResult.summary.consistent,
        unused: auditResult.summary.unused,
        withInlineDuplicates: auditResult.summary.withInlineDuplicates,
        entries: auditResult.shared.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          status: e.status,
          message: e.message,
          suggestions: e.suggestions,
        })),
      }

      if (!opts.json && auditResult.summary.total > 0) {
        console.log(chalk.cyan(`\n  🧩 Shared Components`) + chalk.dim(` (${auditResult.summary.total} registered)\n`))

        for (const e of auditResult.shared) {
          const icon = e.status === 'ok' ? chalk.green('✔') :
            e.status === 'unused' ? chalk.blue('ℹ') : chalk.yellow('⚠')
          console.log(`  ${icon} ${e.id} ${e.name}` + chalk.dim(` (${e.type}) — ${e.message}`))
          if (e.suggestions?.length) {
            e.suggestions.forEach(s => console.log(chalk.dim(`    → ${s}`)))
          }
        }
      }
    } catch { /* no audit data */ }
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
