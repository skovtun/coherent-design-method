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
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import {
  removeOrphanedEntries,
  findPagesImporting,
  isUsedInLayout,
  findUnregisteredComponents,
  findComponentFileByExportName,
  arraysEqual,
} from '../utils/component-integrity.js'
import {
  DesignSystemManager,
  ComponentManager,
  PageManager,
  ComponentGenerator,
  loadManifest,
  saveManifest,
} from '@getcoherent/core'
import { writeFile } from '../utils/files.js'
import { getComponentProvider } from '../providers/index.js'
import {
  findMissingPackages,
  installPackages,
  sanitizeMetadataStrings,
  ensureUseClientIfNeeded,
  fixEscapedClosingQuotes,
  fixUnescapedLtInJsx,
} from '../utils/self-heal.js'
import { validatePageQuality, formatIssues, autoFixCode } from '../utils/quality-validator.js'
import { toKebabCase } from '../utils/strings.js'

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
  } catch {
    /* ignore */
  }
  return files
}

export async function fixCommand(opts: FixOptions = {}) {
  const dryRun = opts.dryRun ?? false
  const skipCache = opts.cache === false
  const skipQuality = opts.quality === false

  const project = findConfig()
  if (!project) {
    exitNotCoherent()
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

    const provider = getComponentProvider()
    const toInstall = [...new Set([...missingComponents, ...missingFiles])].filter(id => provider.has(id))

    if (toInstall.length > 0) {
      if (dryRun) {
        fixes.push(`Would install components: ${toInstall.join(', ')}`)
        console.log(chalk.green(`  ✔ Would install components: ${toInstall.join(', ')}`))
      } else {
        let installed = 0
        for (const componentId of toInstall) {
          try {
            const result = await provider.installComponent(componentId, projectRoot)
            if (!result.success) continue
            if (result.componentDef && !cm.read(componentId)) {
              const regResult = await cm.register(result.componentDef)
              if (!regResult.success) continue
              dsm.updateConfig(regResult.config)
              cm.updateConfig(regResult.config)
              pm!.updateConfig(regResult.config)
            }

            if (result.componentDef?.source !== 'shadcn') {
              const updatedConfig = dsm.getConfig()
              const component = updatedConfig.components.find(c => c.id === componentId)
              if (component) {
                const generator = new ComponentGenerator(updatedConfig)
                const code = await generator.generate(component)
                const fileName = toKebabCase(component.name) + '.tsx'
                const filePath = resolve(projectRoot, 'components', 'ui', fileName)
                mkdirSync(resolve(projectRoot, 'components', 'ui'), { recursive: true })
                await writeFile(filePath, code)
              }
            }
            installed++
          } catch (err) {
            console.log(
              chalk.yellow(`  ⚠ Failed to install ${componentId}: ${err instanceof Error ? err.message : 'unknown'}`),
            )
          }
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
    const fixed = fixUnescapedLtInJsx(
      fixEscapedClosingQuotes(sanitizeMetadataStrings(ensureUseClientIfNeeded(content))),
    )
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

  // ─── Step 4b: Repair group layouts from saved plan ──────────────────
  try {
    const { loadPlan } = await import('./chat/plan-generator.js')
    const { ensurePlanGroupLayouts } = await import('./chat/code-generator.js')
    const plan = loadPlan(projectRoot)
    if (plan) {
      if (!dsm) {
        dsm = new DesignSystemManager(project.configPath)
        await dsm.load()
      }
      await ensurePlanGroupLayouts(projectRoot, plan, {}, dsm.getConfig())
      const layoutTypes = plan.groups.map(g => `${g.id}:${g.layout}`).join(', ')
      fixes.push(`Verified group layouts (${layoutTypes})`)
      console.log(chalk.green(`  ✔ Verified group layouts: ${layoutTypes}`))

      const hasSidebar = plan.groups.some(g => g.layout === 'sidebar' || g.layout === 'both')
      const sidebarPath = resolve(projectRoot, 'components', 'shared', 'sidebar.tsx')
      if (hasSidebar && !existsSync(sidebarPath) && !dryRun) {
        if (!dsm) {
          dsm = new DesignSystemManager(project.configPath)
          await dsm.load()
        }
        const { PageGenerator } = await import('@getcoherent/core')
        const generator = new PageGenerator(dsm.getConfig())
        const sidebarCode = generator.generateSharedSidebarCode()
        mkdirSync(resolve(projectRoot, 'components', 'shared'), { recursive: true })
        writeFileSync(sidebarPath, sidebarCode, 'utf-8')
        fixes.push('Generated AppSidebar component (components/shared/sidebar.tsx)')
        console.log(chalk.green('  ✔ Generated AppSidebar component'))
      }

      if (hasSidebar && !dryRun) {
        const rootLayoutPath = resolve(projectRoot, 'app', 'layout.tsx')
        if (existsSync(rootLayoutPath)) {
          let rootCode = readFileSync(rootLayoutPath, 'utf-8')
          if (rootCode.includes('<Header')) {
            rootCode = rootCode
              .replace(/import\s*\{[^}]*Header[^}]*\}[^;\n]*[;\n]?\s*/g, '')
              .replace(/import\s*\{[^}]*Footer[^}]*\}[^;\n]*[;\n]?\s*/g, '')
              .replace(/import\s+ShowWhenNotAuthRoute[^;\n]*[;\n]?\s*/g, '')
              .replace(/<ShowWhenNotAuthRoute>[\s\S]*?<\/ShowWhenNotAuthRoute>/g, (match) => {
                const inner = match.replace(/<\/?ShowWhenNotAuthRoute>/g, '').trim()
                return inner
              })
              .replace(/\s*<Header\s*\/>\s*/g, '\n')
              .replace(/\s*<Footer\s*\/>\s*/g, '\n')
            rootCode = rootCode.replace(/min-h-screen flex flex-col/g, 'min-h-svh')
            rootCode = rootCode.replace(/"flex-1 flex flex-col"/g, '"flex-1"')
            writeFileSync(rootLayoutPath, rootCode, 'utf-8')
            fixes.push('Stripped Header/Footer from root layout (sidebar mode)')
            console.log(chalk.green('  ✔ Stripped Header/Footer from root layout (sidebar mode)'))
          }
        }

        const publicLayoutPath = resolve(projectRoot, 'app', '(public)', 'layout.tsx')
        const publicExists = existsSync(publicLayoutPath)
        const needsPublicLayout = !publicExists || !readFileSync(publicLayoutPath, 'utf-8').includes('<Header')
        if (needsPublicLayout) {
          const { buildPublicLayoutCodeForSidebar } = await import('./chat/code-generator.js')
          mkdirSync(resolve(projectRoot, 'app', '(public)'), { recursive: true })
          writeFileSync(publicLayoutPath, buildPublicLayoutCodeForSidebar(), 'utf-8')
          fixes.push('Added Header/Footer to (public) layout')
          console.log(chalk.green('  ✔ Added Header/Footer to (public) layout'))
        }

        const appLayoutPath = resolve(projectRoot, 'app', '(app)', 'layout.tsx')
        if (existsSync(appLayoutPath) && dsm) {
          let appLayoutCode = readFileSync(appLayoutPath, 'utf-8')
          const configName = dsm.getConfig().name
          if (configName && configName !== 'My App' && appLayoutCode.includes('My App')) {
            appLayoutCode = appLayoutCode.replace(/My App/g, configName)
            writeFileSync(appLayoutPath, appLayoutCode, 'utf-8')
            fixes.push(`Replaced "My App" with "${configName}" in (app)/layout.tsx`)
            console.log(chalk.green(`  ✔ Replaced "My App" with "${configName}" in (app)/layout.tsx`))
          }
        }

        const sidebarComponentPath2 = resolve(projectRoot, 'components', 'shared', 'sidebar.tsx')
        if (existsSync(sidebarComponentPath2)) {
          const sidebarCode = readFileSync(sidebarComponentPath2, 'utf-8')
          if (sidebarCode.includes('SidebarTrigger')) {
            if (!dsm) {
              dsm = new DesignSystemManager(project.configPath)
              await dsm.load()
            }
            const { PageGenerator } = await import('@getcoherent/core')
            const gen = new PageGenerator(dsm.getConfig())
            writeFileSync(sidebarComponentPath2, gen.generateSharedSidebarCode(), 'utf-8')
            fixes.push('Regenerated sidebar component (removed duplicate SidebarTrigger)')
            console.log(chalk.green('  ✔ Regenerated sidebar component (removed duplicate SidebarTrigger)'))
          }
        }

        const rootPagePath = resolve(projectRoot, 'app', 'page.tsx')
        const publicPagePath = resolve(projectRoot, 'app', '(public)', 'page.tsx')
        if (existsSync(rootPagePath) && !existsSync(publicPagePath)) {
          const { renameSync } = await import('fs')
          mkdirSync(resolve(projectRoot, 'app', '(public)'), { recursive: true })
          renameSync(rootPagePath, publicPagePath)
          fixes.push('Moved app/page.tsx → app/(public)/page.tsx (sidebar mode)')
          console.log(chalk.green('  ✔ Moved app/page.tsx → app/(public)/page.tsx (gets Header/Footer)'))
        }

        const themeTogglePath = resolve(projectRoot, 'components', 'shared', 'theme-toggle.tsx')
        if (!existsSync(themeTogglePath)) {
          const { generateThemeToggleCode } = await import('./chat/code-generator.js')
          mkdirSync(resolve(projectRoot, 'components', 'shared'), { recursive: true })
          writeFileSync(themeTogglePath, generateThemeToggleCode(), 'utf-8')
          fixes.push('Generated ThemeToggle component (components/shared/theme-toggle.tsx)')
          console.log(chalk.green('  ✔ Generated ThemeToggle component'))
        }
      }
    }
  } catch {
    /* no plan or layout error — skip */
  }

  // ─── Step 5: Auto-fix quality issues ────────────────────────────────
  if (!skipQuality) {
    let qualityFixCount = 0
    const qualityFixDetails: string[] = []
    for (const file of userTsxFiles) {
      const content = readFileSync(file, 'utf-8')
      const { code: autoFixed, fixes: fileFixes } = await autoFixCode(content)
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
    const isNonPageFile =
      baseName === 'layout.tsx' ||
      baseName === 'AppNav.tsx' ||
      baseName === 'not-found.tsx' ||
      baseName === 'ShowWhenNotAuthRoute.tsx'
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

  // ─── Step 6: Shared component integrity ─────────────────────────
  try {
    let manifest = await loadManifest(project.root)
    let manifestModified = false

    // 6a. Remove orphaned entries (file deleted)
    const { manifest: cleaned, removed: orphaned } = removeOrphanedEntries(project.root, manifest)
    if (orphaned.length > 0) {
      manifest = cleaned
      manifestModified = true
      for (const o of orphaned) {
        // Check if file moved
        const newPath = findComponentFileByExportName(project.root, o.name)
        if (newPath) {
          const entry = manifest.shared.find(s => s.id === o.id)
          if (entry) entry.file = newPath
          if (dryRun) {
            fixes.push(`Would update ${o.id} path to ${newPath}`)
          } else {
            console.log(chalk.green(`  ✔ Updated ${o.id} (${o.name}) path → ${newPath}`))
          }
        } else {
          if (dryRun) {
            fixes.push(`Would remove orphaned ${o.id} (${o.name})`)
          } else {
            console.log(chalk.green(`  ✔ Removed orphaned ${o.id} (${o.name}) — file missing`))
          }
        }
      }
    }

    // 6b. Update stale usedIn
    for (const entry of manifest.shared) {
      const actualUsedIn = findPagesImporting(project.root, entry.name, entry.file)
      const inLayout = isUsedInLayout(project.root, entry.name)
      const fullActual = inLayout ? [...new Set([...actualUsedIn, 'app/layout.tsx'])] : actualUsedIn

      if (!arraysEqual(fullActual, entry.usedIn || [])) {
        entry.usedIn = fullActual
        manifestModified = true
        if (!dryRun) {
          console.log(chalk.green(`  ✔ Updated ${entry.id} usedIn: ${fullActual.join(', ') || 'none'}`))
        }
      }
    }

    // 6c. Register unregistered components
    const unregistered = findUnregisteredComponents(project.root, manifest)
    for (const comp of unregistered) {
      const id = `CID-${String(manifest.nextId).padStart(3, '0')}`
      if (!dryRun) {
        manifest.shared.push({
          id,
          name: comp.name,
          type: comp.type,
          file: comp.file,
          usedIn: comp.usedIn,
          description: 'Auto-registered by fix',
          createdAt: new Date().toISOString(),
          dependencies: [],
          source: 'extracted' as const,
        })
        manifest.nextId++
        console.log(chalk.green(`  ✔ Registered ${id} (${comp.name}) from ${comp.file}`))
      } else {
        fixes.push(`Would register ${comp.name} from ${comp.file}`)
      }
      manifestModified = true
    }

    if (manifestModified && !dryRun) {
      await saveManifest(project.root, manifest)
      fixes.push('Shared component manifest updated')
    }

    // 6d. Report unused components (need user decision)
    for (const entry of manifest.shared) {
      const actualUsedIn = findPagesImporting(project.root, entry.name, entry.file)
      const inLayout = isUsedInLayout(project.root, entry.name)
      if (actualUsedIn.length === 0 && !inLayout) {
        remaining.push(`${entry.id} (${entry.name}) — unused. Remove: coherent components shared remove ${entry.id}`)
      }
    }
  } catch {
    /* no manifest */
  }

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
