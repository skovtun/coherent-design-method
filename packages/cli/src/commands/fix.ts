/**
 * Fix Command
 *
 * Unified self-healing: one command that does everything.
 * Infrastructure (cache, deps) → Components (shadcn) → Syntax → Quality auto-fix → Report remaining.
 *
 * Replaces: doctor + repair
 *
 * Flags:
 *   --dry-run     Show what would be fixed without writing
 *   --no-cache    Skip cache clearing
 *   --no-quality  Skip quality auto-fixes (only infrastructure + components + syntax)
 */

import chalk from 'chalk'
import { readdirSync, readFileSync, existsSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { findConfig } from '../utils/find-config.js'
import {
  DesignSystemManager,
  ComponentManager,
  PageManager,
  ComponentGenerator,
  loadManifest,
} from '@coherent/core'
import { writeFile } from '../utils/files.js'
import { isShadcnComponent, installShadcnComponent } from '../utils/shadcn-installer.js'
import {
  findMissingPackages,
  installPackages,
  sanitizeMetadataStrings,
  ensureUseClientIfNeeded,
  fixEscapedClosingQuotes,
  fixUnescapedLtInJsx,
} from '../utils/self-heal.js'
import { validatePageQuality, formatIssues, autoFixCode } from '../utils/quality-validator.js'

export interface FixOptions {
  dryRun?: boolean
  cache?: boolean
  quality?: boolean
}

function extractComponentIdsFromCode(code: string): Set<string> {
  const ids = new Set<string>()
  const allMatches = code.matchAll(/@\/components\/((?:ui\/)?[a-z0-9-]+)/g)
  for (const m of allMatches) {
    if (!m[1]) continue
    let id = m[1]
    if (id.startsWith('ui/')) id = id.slice(3)
    if (id === 'shared' || id.startsWith('shared/')) continue
    if (id) ids.add(id)
  }
  return ids
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

function listTsxFiles(dir: string): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')) {
        files.push(...listTsxFiles(full))
      } else if (e.isFile() && e.name.endsWith('.tsx')) {
        files.push(full)
      }
    }
  } catch { /* ignore */ }
  return files
}

export async function fixCommand(opts: FixOptions = {}) {
  const dryRun = opts.dryRun ?? false
  const skipCache = opts.cache === false
  const skipQuality = opts.quality === false

  const project = findConfig()
  if (!project) {
    console.log(chalk.red('Not a Coherent project.'))
    console.log(chalk.dim('  Run from a project with design-system.config.ts'))
    console.log(chalk.dim('  $ coherent init   # in an empty folder first\n'))
    process.exit(1)
  }

  const projectRoot = project.root
  const fixes: string[] = []
  const remaining: string[] = []

  if (dryRun) {
    console.log(chalk.cyan('\ncoherent fix --dry-run\n'))
  } else {
    console.log(chalk.cyan('\ncoherent fix\n'))
  }

  // ─── Step 1: Clear build cache ──────────────────────────────────────
  if (!skipCache) {
    const nextDir = join(projectRoot, '.next')
    if (existsSync(nextDir)) {
      if (!dryRun) rmSync(nextDir, { recursive: true, force: true })
      fixes.push('Cleared build cache')
      console.log(chalk.green('  ✔ Cleared build cache'))
    }
  }

  // ─── Step 2: Install missing npm packages ───────────────────────────
  const missingPkgs = await findMissingPackages(projectRoot)
  if (missingPkgs.length > 0) {
    if (dryRun) {
      fixes.push(`Would install packages: ${missingPkgs.join(', ')}`)
      console.log(chalk.green(`  ✔ Would install packages: ${missingPkgs.join(', ')}`))
    } else {
      const ok = await installPackages(projectRoot, missingPkgs)
      if (ok) {
        fixes.push(`Installed missing packages: ${missingPkgs.join(', ')}`)
        console.log(chalk.green(`  ✔ Installed missing packages: ${missingPkgs.join(', ')}`))
      } else {
        remaining.push(`Failed to install: ${missingPkgs.join(', ')}. Run: npm install ${missingPkgs.join(' ')}`)
        console.log(chalk.yellow(`  ⚠ Could not install: ${missingPkgs.join(', ')}`))
      }
    }
  }

  // ─── Step 3: Install missing shadcn components ──────────────────────
  const appDir = resolve(projectRoot, 'app')
  const allTsxFiles = listTsxFiles(appDir)
  const componentsTsxFiles = listTsxFiles(resolve(projectRoot, 'components'))

  const allComponentIds = new Set<string>()
  for (const file of [...allTsxFiles, ...componentsTsxFiles]) {
    const content = readFileSync(file, 'utf-8')
    extractComponentIdsFromCode(content).forEach(id => allComponentIds.add(id))
  }

  let dsm: DesignSystemManager | null = null
  let cm: ComponentManager | null = null
  let pm: PageManager | null = null

  if (allComponentIds.size > 0) {
    dsm = new DesignSystemManager(project.configPath)
    await dsm.load()
    const config = dsm.getConfig()
    cm = new ComponentManager(config)
    pm = new PageManager(config, cm)

    const missingComponents: string[] = []
    const missingFiles: string[] = []
    for (const id of allComponentIds) {
      if (!cm.read(id)) {
        missingComponents.push(id)
      } else {
        const fileName = toKebabCase(id) + '.tsx'
        const filePath = resolve(projectRoot, 'components', 'ui', fileName)
        if (!existsSync(filePath)) missingFiles.push(id)
      }
    }

    const toInstall = [...new Set([...missingComponents, ...missingFiles])].filter(id => isShadcnComponent(id))

    if (toInstall.length > 0) {
      if (dryRun) {
        fixes.push(`Would install components: ${toInstall.join(', ')}`)
        console.log(chalk.green(`  ✔ Would install components: ${toInstall.join(', ')}`))
      } else {
        let installed = 0
        for (const componentId of toInstall) {
          try {
            const shadcnDef = await installShadcnComponent(componentId, projectRoot)
            if (!shadcnDef) continue
            if (!cm.read(componentId)) {
              const result = await cm.register(shadcnDef)
              if (!result.success) continue
              dsm.updateConfig(result.config)
              cm.updateConfig(result.config)
              pm!.updateConfig(result.config)
            }
            const updatedConfig = dsm.getConfig()
            const component = updatedConfig.components.find(c => c.id === componentId)
            if (component) {
              const generator = new ComponentGenerator(updatedConfig)
              const code = await generator.generate(component)
              const fileName = toKebabCase(component.name) + '.tsx'
              const filePath = resolve(projectRoot, 'components', 'ui', fileName)
              mkdirSync(resolve(projectRoot, 'components', 'ui'), { recursive: true })
              await writeFile(filePath, code)
              installed++
            }
          } catch { /* skip */ }
        }
        if (installed > 0) {
          await dsm.save()
          fixes.push(`Installed missing components: ${toInstall.join(', ')}`)
          console.log(chalk.green(`  ✔ Installed missing components: ${toInstall.join(', ')}`))
        }
      }
    }
  }

  // ─── Step 4: Fix syntax in all page files ───────────────────────────
  const userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))
  let syntaxFixed = 0
  for (const file of userTsxFiles) {
    const content = readFileSync(file, 'utf-8')
    const fixed = fixUnescapedLtInJsx(fixEscapedClosingQuotes(sanitizeMetadataStrings(ensureUseClientIfNeeded(content))))
    if (fixed !== content) {
      if (!dryRun) writeFileSync(file, fixed, 'utf-8')
      syntaxFixed++
    }
  }
  if (syntaxFixed > 0) {
    const verb = dryRun ? 'Would fix' : 'Fixed'
    fixes.push(`${verb} syntax in ${syntaxFixed} file(s)`)
    console.log(chalk.green(`  ✔ ${verb} syntax: ${syntaxFixed} file(s) (use client, metadata, quotes)`))
  }

  // ─── Step 5: Auto-fix quality issues ────────────────────────────────
  if (!skipQuality) {
    let qualityFixCount = 0
    const qualityFixDetails: string[] = []
    for (const file of userTsxFiles) {
      const content = readFileSync(file, 'utf-8')
      const { code: autoFixed, fixes: fileFixes } = autoFixCode(content)
      if (autoFixed !== content) {
        if (!dryRun) writeFileSync(file, autoFixed, 'utf-8')
        qualityFixCount++
        qualityFixDetails.push(...fileFixes)
      }
    }
    if (qualityFixCount > 0) {
      const uniqueFixes = [...new Set(qualityFixDetails)]
      const verb = dryRun ? 'Would fix' : 'Fixed'
      fixes.push(`${verb} quality in ${qualityFixCount} file(s)`)
      console.log(chalk.green(`  ✔ ${verb} ${uniqueFixes.length} quality issue type(s): ${uniqueFixes.join(', ')}`))
    }
  }

  // ─── Step 6: Validate remaining issues (read-only report) ──────────
  let totalErrors = 0
  let totalWarnings = 0
  const fileIssues: Array<{ path: string; report: string }> = []

  for (const file of allTsxFiles) {
    const code = dryRun ? readFileSync(file, 'utf-8') : readFileSync(file, 'utf-8')
    const relativePath = file.replace(projectRoot + '/', '')
    const baseName = file.split('/').pop() || ''
    const isAuthPage = relativePath.includes('(auth)')
    const isNonPageFile = baseName === 'layout.tsx' || baseName === 'AppNav.tsx'
      || baseName === 'not-found.tsx' || baseName === 'ShowWhenNotAuthRoute.tsx'
    const isHomePage = relativePath === 'app/page.tsx'
    const isDesignSystem = relativePath.includes('design-system')
    if (isDesignSystem) continue

    const issues = validatePageQuality(code)
    const suppressH1 = isNonPageFile || isAuthPage
    const filteredIssues = issues.filter(i => {
      if (suppressH1 && (i.type === 'NO_H1' || i.type === 'MULTIPLE_H1')) return false
      if (isHomePage && i.type === 'NO_EMPTY_STATE') return false
      return true
    })

    if (filteredIssues.length === 0) continue

    const errors = filteredIssues.filter(i => i.severity === 'error').length
    const warnings = filteredIssues.filter(i => i.severity === 'warning').length
    totalErrors += errors
    totalWarnings += warnings
    const report = formatIssues(filteredIssues)
    fileIssues.push({ path: relativePath, report })
  }

  try {
    const manifest = await loadManifest(project.root)
    if (manifest.shared.length > 0) {
      for (const entry of manifest.shared) {
        const fullPath = resolve(project.root, entry.file)
        if (!existsSync(fullPath)) {
          remaining.push(`Missing shared component file: ${entry.id} (${entry.file})`)
          totalErrors++
        }
      }
    }
  } catch { /* no manifest */ }

  // ─── Output summary ────────────────────────────────────────────────

  if (fixes.length === 0 && totalErrors === 0 && totalWarnings === 0 && remaining.length === 0) {
    console.log(chalk.green('\n  ✅ Everything looks good — no issues found\n'))
    console.log(chalk.cyan('  Run: coherent preview\n'))
    return
  }

  if (fixes.length > 0) console.log('')

  if (totalErrors > 0 || totalWarnings > 0 || remaining.length > 0) {
    console.log(chalk.dim('  ─'.repeat(25)))
    console.log(chalk.yellow(`\n  Remaining (need manual fix or AI):`))
    for (const { path, report } of fileIssues) {
      console.log(chalk.dim(`  📄 ${path}`))
      console.log(report)
    }
    for (const r of remaining) {
      console.log(chalk.yellow(`  ⚠ ${r}`))
    }
    console.log('')
    const parts = []
    if (totalErrors > 0) parts.push(chalk.red(`❌ ${totalErrors} error(s)`))
    if (totalWarnings > 0) parts.push(chalk.yellow(`⚠ ${totalWarnings} warning(s)`))
    if (parts.length > 0) console.log(`  ${parts.join('  ')}`)
  }

  console.log(chalk.cyan('\n  Run: coherent preview\n'))
}
