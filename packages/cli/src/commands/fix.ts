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
import { readdirSync, readFileSync, existsSync, rmSync, mkdirSync } from 'fs'
import { resolve, join, relative, basename } from 'path'
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
import { validatePageQuality, formatIssues, autoFixCode, verifyIncrementalEdit } from '../utils/quality-validator.js'
import { safeWrite, isValidTsx } from './fix-validation.js'
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
  const backups = new Map<string, string>()
  const modifiedFiles: string[] = []

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
  let allTsxFiles = listTsxFiles(appDir)
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

  // ─── Step 3b: Ensure DSM loaded unconditionally ──────────────────
  if (!dsm && existsSync(project.configPath)) {
    dsm = new DesignSystemManager(project.configPath)
    await dsm.load()
  }

  // ─── Step 3c: Replace "My App" placeholder ──────────────────
  if (dsm && dsm.getConfig().name === 'My App') {
    const { toTitleCase } = await import('../utils/strings.js')
    let derivedName: string | null = null
    try {
      const pkgPath = resolve(projectRoot, 'package.json')
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        if (typeof pkg.name === 'string' && pkg.name) {
          derivedName = toTitleCase(pkg.name)
        }
      }
    } catch {
      /* ignore */
    }
    if (!derivedName) derivedName = toTitleCase(basename(projectRoot))

    if (derivedName !== 'My App') {
      if (dryRun) {
        fixes.push(`Would replace placeholder "My App" with "${derivedName}" in config`)
        console.log(chalk.green(`  ✔ Would replace "My App" with "${derivedName}" in config`))
      } else {
        const cfg = dsm.getConfig()
        dsm.updateConfig({ ...cfg, name: derivedName })
        await dsm.save()
        fixes.push(`Replaced placeholder "My App" with "${derivedName}" in config`)
        console.log(chalk.green(`  ✔ Replaced "My App" with "${derivedName}" in config`))
      }
    }
  }

  // ─── Step 3d: Sync CSS variables ──────────────────
  if (dsm && !dryRun) {
    try {
      const { fixGlobalsCss } = await import('../utils/fix-globals-css.js')
      fixGlobalsCss(projectRoot, dsm.getConfig())
      fixes.push('Synced CSS variables')
      console.log(chalk.green('  ✔ Synced CSS variables'))
    } catch (e) {
      console.log(chalk.yellow(`  ⚠ CSS sync: ${e instanceof Error ? e.message : 'unknown error'}`))
    }
  } else if (dryRun && dsm) {
    fixes.push('Would sync CSS variables')
  }

  // ─── Step 3e: Replace "My App" in (app)/layout.tsx and shared components ──
  if (dsm) {
    const configName = dsm.getConfig().name
    if (configName && configName !== 'My App') {
      const appLayoutPath = resolve(projectRoot, 'app', '(app)', 'layout.tsx')
      if (existsSync(appLayoutPath)) {
        let appLayoutCode = readFileSync(appLayoutPath, 'utf-8')
        if (appLayoutCode.includes('My App')) {
          appLayoutCode = appLayoutCode.replace(/My App/g, configName)
          if (!dryRun) {
            const appResult = safeWrite(appLayoutPath, appLayoutCode, projectRoot, backups)
            if (appResult.ok) {
              modifiedFiles.push(appLayoutPath)
              fixes.push(`Replaced "My App" with "${configName}" in (app)/layout.tsx`)
              console.log(chalk.green(`  ✔ Replaced "My App" with "${configName}" in (app)/layout.tsx`))
            } else {
              console.log(chalk.yellow('  ⚠ (app)/layout.tsx update rolled back (parse error)'))
            }
          } else {
            fixes.push(`Would replace "My App" with "${configName}" in (app)/layout.tsx`)
          }
        }
      }

      const sharedDir = resolve(projectRoot, 'components', 'shared')
      if (existsSync(sharedDir)) {
        try {
          for (const f of readdirSync(sharedDir).filter(n => n.endsWith('.tsx'))) {
            const sharedPath = join(sharedDir, f)
            const sharedCode = readFileSync(sharedPath, 'utf-8')
            if (sharedCode.includes('My App')) {
              const updated = sharedCode.replace(/My App/g, configName)
              if (!dryRun) {
                const sharedResult = safeWrite(sharedPath, updated, projectRoot, backups)
                if (sharedResult.ok) {
                  modifiedFiles.push(sharedPath)
                  fixes.push(`Replaced "My App" with "${configName}" in components/shared/${f}`)
                  console.log(chalk.green(`  ✔ Replaced "My App" with "${configName}" in components/shared/${f}`))
                }
              } else {
                fixes.push(`Would replace "My App" with "${configName}" in components/shared/${f}`)
              }
            }
          }
        } catch {
          /* shared dir read error */
        }
      }
    }
  }

  // ─── Step 4: Fix syntax in all page files ───────────────────────────
  let userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))
  let syntaxFixed = 0
  for (const file of userTsxFiles) {
    try {
      const content = readFileSync(file, 'utf-8')
      const fixed = fixUnescapedLtInJsx(
        fixEscapedClosingQuotes(sanitizeMetadataStrings(ensureUseClientIfNeeded(content))),
      )
      if (fixed !== content) {
        if (!dryRun) {
          const result = safeWrite(file, fixed, projectRoot, backups)
          if (result.ok) {
            modifiedFiles.push(file)
            syntaxFixed++
          } else {
            console.log(chalk.yellow(`  ⚠ Syntax fix rolled back for ${relative(projectRoot, file)} (parse error)`))
          }
        } else {
          syntaxFixed++
        }
      }
    } catch (err) {
      remaining.push(
        `${relative(projectRoot, file)}: syntax fix error — ${err instanceof Error ? err.message : 'unknown'}`,
      )
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
        // Install shadcn sidebar component first (required by AppSidebar)
        const sidebarUiPath = resolve(projectRoot, 'components', 'ui', 'sidebar.tsx')
        const sidebarProvider = getComponentProvider()
        if (!existsSync(sidebarUiPath) && sidebarProvider.has('sidebar')) {
          try {
            await sidebarProvider.installComponent('sidebar', projectRoot)
            console.log(chalk.green('  ✔ Auto-installed Sidebar UI component'))
          } catch {
            console.log(chalk.yellow('  ⚠ Could not install Sidebar UI component'))
          }
        }

        if (!dsm) {
          dsm = new DesignSystemManager(project.configPath)
          await dsm.load()
        }
        const { PageGenerator } = await import('@getcoherent/core')
        const generator = new PageGenerator(dsm.getConfig())
        const sidebarCode = generator.generateSharedSidebarCode()
        mkdirSync(resolve(projectRoot, 'components', 'shared'), { recursive: true })
        const sidebarResult = safeWrite(sidebarPath, sidebarCode, projectRoot, backups)
        if (sidebarResult.ok) {
          fixes.push('Generated AppSidebar component (components/shared/sidebar.tsx)')
          console.log(chalk.green('  ✔ Generated AppSidebar component'))
        } else {
          console.log(chalk.yellow('  ⚠ AppSidebar generation failed validation'))
        }
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
              .replace(/<ShowWhenNotAuthRoute>[\s\S]*?<\/ShowWhenNotAuthRoute>/g, match => {
                const inner = match.replace(/<\/?ShowWhenNotAuthRoute>/g, '').trim()
                return inner
              })
              .replace(/\s*<Header\s*\/>\s*/g, '\n')
              .replace(/\s*<Footer\s*\/>\s*/g, '\n')
            rootCode = rootCode.replace(/min-h-screen flex flex-col/g, 'min-h-svh')
            rootCode = rootCode.replace(/"flex-1 flex flex-col"/g, '"flex-1"')
            const rootResult = safeWrite(rootLayoutPath, rootCode, projectRoot, backups)
            if (rootResult.ok) {
              fixes.push('Stripped Header/Footer from root layout (sidebar mode)')
              console.log(chalk.green('  ✔ Stripped Header/Footer from root layout (sidebar mode)'))
            } else {
              console.log(chalk.yellow('  ⚠ Root layout update rolled back (parse error)'))
            }
          }
        }

        const publicLayoutPath = resolve(projectRoot, 'app', '(public)', 'layout.tsx')
        const publicExists = existsSync(publicLayoutPath)
        const needsPublicLayout = !publicExists || !readFileSync(publicLayoutPath, 'utf-8').includes('<Header')
        if (needsPublicLayout) {
          const { buildPublicLayoutCodeForSidebar } = await import('./chat/code-generator.js')
          mkdirSync(resolve(projectRoot, 'app', '(public)'), { recursive: true })
          const publicResult = safeWrite(publicLayoutPath, buildPublicLayoutCodeForSidebar(), projectRoot, backups)
          if (publicResult.ok) {
            fixes.push('Added Header/Footer to (public) layout')
            console.log(chalk.green('  ✔ Added Header/Footer to (public) layout'))
          } else {
            console.log(chalk.yellow('  ⚠ Public layout generation failed validation'))
          }
        }

        const sidebarComponentPath2 = resolve(projectRoot, 'components', 'shared', 'sidebar.tsx')
        if (existsSync(sidebarComponentPath2)) {
          const existingSidebarCode = readFileSync(sidebarComponentPath2, 'utf-8')
          const sidebarConfigName = dsm?.getConfig().name ?? ''
          const hasWrongName = existingSidebarCode.includes('My App') && sidebarConfigName !== 'My App'
          const hasTrigger = existingSidebarCode.includes('SidebarTrigger')
          const isBroken = !isValidTsx(existingSidebarCode, projectRoot)
          if (hasWrongName || hasTrigger || isBroken) {
            if (!dsm) {
              dsm = new DesignSystemManager(project.configPath)
              await dsm.load()
            }
            const { PageGenerator } = await import('@getcoherent/core')
            const gen = new PageGenerator(dsm.getConfig())
            const sidebarResult2 = safeWrite(
              sidebarComponentPath2,
              gen.generateSharedSidebarCode(),
              projectRoot,
              backups,
            )
            if (sidebarResult2.ok) {
              fixes.push('Regenerated sidebar component')
              console.log(chalk.green('  ✔ Regenerated sidebar component'))
            } else {
              console.log(chalk.yellow('  ⚠ Sidebar regeneration failed validation — restored original'))
            }
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
          const themeResult = safeWrite(themeTogglePath, generateThemeToggleCode(), projectRoot, backups)
          if (themeResult.ok) {
            fixes.push('Generated ThemeToggle component (components/shared/theme-toggle.tsx)')
            console.log(chalk.green('  ✔ Generated ThemeToggle component'))
          } else {
            console.log(chalk.yellow('  ⚠ ThemeToggle generation failed validation'))
          }
        }
      }
    }
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Layout repair skipped: ${err instanceof Error ? err.message : 'unknown error'}`))
  }

  // ─── Step 4c: Repair minimal/broken (app) layout ──────────────────
  const appLayoutRepairPath = resolve(projectRoot, 'app', '(app)', 'layout.tsx')
  if (existsSync(appLayoutRepairPath) && dsm) {
    const appLayoutCode = readFileSync(appLayoutRepairPath, 'utf-8')
    const isMinimal =
      appLayoutCode.length < 500 &&
      !appLayoutCode.includes('Header') &&
      !appLayoutCode.includes('Footer') &&
      !appLayoutCode.includes('Sidebar') &&
      !appLayoutCode.includes('SidebarProvider') &&
      !appLayoutCode.includes('SidebarTrigger') &&
      !appLayoutCode.includes('Sheet')

    const navType = dsm.getConfig().navigation?.type || 'header'
    if (isMinimal && navType !== 'none') {
      const { buildAppLayoutCode, buildGroupLayoutCode } = await import('./chat/code-generator.js')
      const isSidebar = navType === 'sidebar' || navType === 'both'
      const newLayout = isSidebar
        ? buildAppLayoutCode(navType, dsm.getConfig().name)
        : buildGroupLayoutCode('header', dsm.getConfig().pages?.map((p: any) => p.name) || [], dsm.getConfig().name)
      if (!dryRun) {
        const layoutResult = safeWrite(appLayoutRepairPath, newLayout, projectRoot, backups)
        if (layoutResult.ok) {
          modifiedFiles.push(appLayoutRepairPath)
          fixes.push(`Regenerated minimal (app) layout with ${navType} navigation`)
          console.log(chalk.green(`  ✔ Regenerated (app) layout with ${navType} navigation`))
        }
      } else {
        fixes.push(`Would regenerate minimal (app) layout with ${navType} navigation`)
      }
    }
  }

  // ─── Step 4d: Stale nav links → regen shared Header/Sidebar ────────
  // After delete-page (or manual config edit), hrefs inside
  // components/shared/header.tsx and sidebar.tsx may point at routes that no
  // longer exist, producing 404s on click. Regen from current config.
  if (!dsm) {
    try {
      dsm = new DesignSystemManager(project.configPath)
      await dsm.load()
    } catch {
      dsm = null
    }
  }
  if (dsm) {
    const config = dsm.getConfig()
    const validRouteSet = new Set<string>(
      (config.pages || [])
        .map((p: any) => p.route)
        .filter((r: any): r is string => typeof r === 'string' && r.length > 0),
    )
    validRouteSet.add('/')
    // Keep auth routes: they live outside config.pages (login/signup/reset)
    // but are emitted by the Header generator via an allowlist.
    const ALWAYS_VALID_NAV = new Set<string>([
      '/login',
      '/signin',
      '/sign-in',
      '/signup',
      '/sign-up',
      '/register',
      '/forgot-password',
      '/reset-password',
    ])
    // Prune stale navigation.items before regen — otherwise the sweep just
    // re-emits the dead links that already exist in the config.
    const currentNav: any = (config as any).navigation
    if (currentNav?.items?.length) {
      const filteredItems = currentNav.items.filter(
        (it: any) => validRouteSet.has(it.route) || ALWAYS_VALID_NAV.has(it.route),
      )
      const staleNavItems = currentNav.items.filter(
        (it: any) => !validRouteSet.has(it.route) && !ALWAYS_VALID_NAV.has(it.route),
      )
      if (staleNavItems.length > 0) {
        if (dryRun) {
          fixes.push(
            `Would prune ${staleNavItems.length} stale nav item(s): ${staleNavItems.map((i: any) => i.route).join(', ')}`,
          )
          console.log(
            chalk.green(
              `  ${'\u2714'} Would prune stale nav items: ${staleNavItems.map((i: any) => i.route).join(', ')}`,
            ),
          )
        } else {
          dsm.updateConfig({ ...config, navigation: { ...currentNav, items: filteredItems } } as any)
          try {
            await dsm.save()
          } catch (err) {
            console.log(
              chalk.yellow(
                `  ${'\u26A0'} Could not persist pruned nav items: ${err instanceof Error ? err.message : String(err)}`,
              ),
            )
          }
          fixes.push(`Pruned ${staleNavItems.length} stale nav item(s) from config`)
          console.log(
            chalk.green(
              `  ${'\u2714'} Pruned stale nav items from config: ${staleNavItems.map((i: any) => i.route).join(', ')}`,
            ),
          )
        }
      }
    }
    const sharedDir = resolve(projectRoot, 'components', 'shared')
    const navFiles = [
      { path: resolve(sharedDir, 'header.tsx'), kind: 'header' as const },
      { path: resolve(sharedDir, 'sidebar.tsx'), kind: 'sidebar' as const },
    ]
    const hrefRe = /href\s*=\s*["'](\/[^"'#?]*)["']/g
    for (const { path, kind } of navFiles) {
      if (!existsSync(path)) continue
      const code = readFileSync(path, 'utf-8')
      const staleHrefs: string[] = []
      let hm
      while ((hm = hrefRe.exec(code)) !== null) {
        const href = hm[1]
        if (href.startsWith('/design-system') || href.startsWith('/api')) continue
        if (!validRouteSet.has(href)) staleHrefs.push(href)
      }
      if (staleHrefs.length === 0) continue
      const sample = [...new Set(staleHrefs)].slice(0, 3).join(', ')
      if (dryRun) {
        fixes.push(`Would regen ${kind} (stale links: ${sample})`)
        console.log(chalk.green(`  ${'\u2714'} Would regen ${kind} (stale links: ${sample})`))
        continue
      }
      try {
        const { PageGenerator } = await import('@getcoherent/core')
        // Must re-read config — the pruning step above replaced it via
        // dsm.updateConfig(), which leaves our local `config` const pointing
        // at the old (stale) object. Generating from `config` would bring
        // the pruned nav items back.
        const freshConfig = dsm.getConfig()
        const gen = new PageGenerator(freshConfig)
        const newCode = kind === 'header' ? gen.generateSharedHeaderCode() : gen.generateSharedSidebarCode()
        const navResult = safeWrite(path, newCode, projectRoot, backups)
        if (navResult.ok) {
          modifiedFiles.push(path)
          fixes.push(`Regenerated ${kind} (removed ${staleHrefs.length} stale nav link(s))`)
          console.log(chalk.green(`  ${'\u2714'} Regenerated ${kind} - removed stale links: ${sample}`))
        } else {
          console.log(chalk.yellow(`  ${'\u26A0'} ${kind} regen failed validation - kept original`))
        }
      } catch (err) {
        console.log(
          chalk.yellow(`  ${'\u26A0'} Could not regen ${kind}: ${err instanceof Error ? err.message : String(err)}`),
        )
      }
    }
  }

  // ─── Rebuild file lists after mutations ──────────────────
  allTsxFiles = listTsxFiles(appDir)
  userTsxFiles = allTsxFiles.filter(f => !f.includes('/design-system/'))

  const sharedTsxFiles = listTsxFiles(resolve(projectRoot, 'components', 'shared'))
  const allValidationFiles = [...userTsxFiles, ...sharedTsxFiles]

  // ─── Step 5: Auto-fix quality issues ────────────────────────────────
  if (!skipQuality) {
    let qualityFixCount = 0
    const qualityFixDetails: string[] = []
    for (const file of allValidationFiles) {
      try {
        const content = readFileSync(file, 'utf-8')
        const { code: autoFixed, fixes: fileFixes } = await autoFixCode(content)
        if (autoFixed !== content) {
          if (!dryRun) {
            const qResult = safeWrite(file, autoFixed, projectRoot, backups)
            if (qResult.ok) {
              modifiedFiles.push(file)
              qualityFixCount++
              qualityFixDetails.push(...fileFixes)
            } else {
              console.log(chalk.yellow(`  ⚠ Quality fix rolled back for ${relative(projectRoot, file)} (parse error)`))
            }
          } else {
            qualityFixCount++
            qualityFixDetails.push(...fileFixes)
          }
        }
      } catch (err) {
        remaining.push(
          `${relative(projectRoot, file)}: quality fix error — ${err instanceof Error ? err.message : 'unknown'}`,
        )
      }
    }
    if (qualityFixCount > 0) {
      const uniqueFixes = [...new Set(qualityFixDetails)]
      const verb = dryRun ? 'Would fix' : 'Fixed'
      fixes.push(`${verb} quality in ${qualityFixCount} file(s)`)
      console.log(chalk.green(`  ✔ ${verb} ${uniqueFixes.length} quality issue type(s): ${uniqueFixes.join(', ')}`))
    }
  }

  // ─── Step 5b: Validate mock data ──────────────────
  try {
    const { validateMockData, applyMockDataFixes } = await import('../utils/mock-data-validator.js')
    let mockFixed = 0
    for (const file of allValidationFiles) {
      try {
        const content = readFileSync(file, 'utf-8')
        const mockIssues = validateMockData(content)
        if (mockIssues.length > 0) {
          const fixed = applyMockDataFixes(content, mockIssues)
          if (fixed !== content && !dryRun) {
            const result = safeWrite(file, fixed, projectRoot, backups)
            if (result.ok) {
              mockFixed++
              modifiedFiles.push(file)
            }
          } else if (dryRun) {
            mockFixed++
          }
        }
      } catch (fileErr) {
        remaining.push(
          `${relative(projectRoot, file)}: mock data fix error — ${fileErr instanceof Error ? fileErr.message : 'unknown'}`,
        )
      }
    }
    if (mockFixed > 0) {
      const verb = dryRun ? 'Would fix' : 'Fixed'
      fixes.push(`${verb} mock data in ${mockFixed} file(s)`)
      console.log(chalk.green(`  ✔ ${verb} mock data: ${mockFixed} file(s)`))
    }
  } catch (importErr) {
    console.log(chalk.dim('  ⊘ mock-data-validator not available, skipping'))
  }

  // ─── Step 5c: Verify incremental edits ──────────────────────────────
  // Shared components (components/shared/*) use named exports by design —
  // the `missing-default-export` check is meaningful for app/**/page.tsx
  // only, not for reusable library pieces.
  for (const file of modifiedFiles) {
    if (!backups.has(file)) continue
    const before = backups.get(file)!
    const after = readFileSync(file, 'utf-8')
    const rel = relative(projectRoot, file)
    const isSharedComponent = rel.startsWith('components/shared/') || rel.startsWith('components/ui/')
    const issues = verifyIncrementalEdit(before, after).filter(i =>
      isSharedComponent ? i.type !== 'missing-default-export' : true,
    )
    if (issues.length > 0) {
      for (const issue of issues) {
        remaining.push(`${relative(projectRoot, file)}: ${issue.message}`)
      }
    }
  }

  // ─── Step 6: Validate remaining issues (read-only report) ──────────
  let totalErrors = 0
  let totalWarnings = 0
  const fileIssues: Array<{ path: string; report: string }> = []

  for (const file of allValidationFiles) {
    try {
      const code = readFileSync(file, 'utf-8')
      const relativePath = file.replace(projectRoot + '/', '')
      const baseName = file.split('/').pop() || ''
      const isAuthPage = relativePath.includes('(auth)')
      const isSharedComponent = relativePath.includes('components/shared/')
      const isNonPageFile =
        baseName === 'layout.tsx' ||
        baseName === 'AppNav.tsx' ||
        baseName === 'not-found.tsx' ||
        baseName === 'ShowWhenNotAuthRoute.tsx'
      const isHomePage = relativePath === 'app/page.tsx'
      const isDesignSystem = relativePath.includes('design-system')
      if (isDesignSystem) continue

      const validRoutesForCheck = dsm
        ? ((dsm.getConfig().pages || []) as any[]).map(p => p.route).filter((r): r is string => !!r)
        : undefined
      const issues = validatePageQuality(code, validRoutesForCheck)
      const suppressH1 = isNonPageFile || isAuthPage || isSharedComponent
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
    } catch (err) {
      remaining.push(
        `${relative(projectRoot, file)}: validation error — ${err instanceof Error ? err.message : 'unknown'}`,
      )
    }
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
      const layoutPaths = isUsedInLayout(project.root, entry.name)
      const fullActual = [...new Set([...actualUsedIn, ...layoutPaths])]

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
      const layoutPaths2 = isUsedInLayout(project.root, entry.name)
      if (actualUsedIn.length === 0 && layoutPaths2.length === 0) {
        remaining.push(`${entry.id} (${entry.name}) — unused. Remove: coherent components shared remove ${entry.id}`)
      }
    }
  } catch (err) {
    const isNotFound = err instanceof Error && 'code' in err && (err as any).code === 'ENOENT'
    if (!isNotFound) {
      console.log(
        chalk.yellow(`  ⚠ Component manifest check skipped: ${err instanceof Error ? err.message : 'unknown error'}`),
      )
    }
  }

  // ─── Step 7: TypeScript compile check + auto-fix ─────────────
  try {
    const tsconfigPath = resolve(projectRoot, 'tsconfig.json')
    if (existsSync(tsconfigPath)) {
      const { runTscCheck, applyDeterministicFixes } = await import('../utils/tsc-autofix.js')
      const { applyAiFixes } = await import('../utils/tsc-ai-fix.js')

      const tscErrors = runTscCheck(projectRoot)

      if (tscErrors.length === 0) {
        fixes.push('TypeScript compilation clean')
        console.log(chalk.green('  ✔ TypeScript compilation clean'))
      } else {
        const detResult = await applyDeterministicFixes(tscErrors, projectRoot, backups)
        if (detResult.fixed.length > 0) {
          fixes.push(`TypeScript: fixed ${detResult.fixed.length} file(s) deterministically`)
          console.log(chalk.green(`  ✔ TypeScript: fixed ${detResult.fixed.length} file(s) deterministically`))
        }

        if (detResult.remaining.length > 0) {
          let aiProvider
          try {
            const { createAIProvider } = await import('../utils/ai-provider.js')
            aiProvider = await createAIProvider('auto')
          } catch {
            /* no API key — AI fixes will be skipped */
          }

          if (aiProvider?.editPageCode) {
            console.log(chalk.dim(`  ⏳ Using AI to fix ${detResult.remaining.length} TypeScript error(s)...`))
            const aiResult = await applyAiFixes(detResult.remaining, projectRoot, backups, aiProvider)
            if (aiResult.fixed.length > 0) {
              fixes.push(`TypeScript: fixed ${aiResult.fixed.length} file(s) via AI`)
              console.log(chalk.green(`  ✔ TypeScript: fixed ${aiResult.fixed.length} file(s) via AI`))
            }
            if (aiResult.failed.length > 0) {
              for (const e of aiResult.failed.slice(0, 10)) {
                remaining.push(`${e.file}(${e.line}): [${e.code}] ${e.message.split('\n')[0]}`)
              }
              if (aiResult.failed.length > 10) {
                remaining.push(`... and ${aiResult.failed.length - 10} more TypeScript errors`)
              }
              console.log(chalk.yellow(`  ⚠ TypeScript: ${aiResult.failed.length} error(s) remaining`))
            }
          } else {
            for (const e of detResult.remaining.slice(0, 10)) {
              remaining.push(`${e.file}(${e.line}): [${e.code}] ${e.message.split('\n')[0]}`)
            }
            if (detResult.remaining.length > 10) {
              remaining.push(`... and ${detResult.remaining.length - 10} more TypeScript errors`)
            }
            console.log(
              chalk.yellow(
                `  ⚠ TypeScript: ${detResult.remaining.length} error(s) remaining. Configure API key for auto-fix.`,
              ),
            )
          }
        }

        const finalErrors = runTscCheck(projectRoot)
        if (finalErrors.length === 0) {
          console.log(chalk.green('  ✔ TypeScript compilation now clean'))
        }
      }
    }
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ TypeScript check skipped: ${err instanceof Error ? err.message : 'unknown error'}`))
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
