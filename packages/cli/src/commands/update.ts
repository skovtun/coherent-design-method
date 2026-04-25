/**
 * Update Command
 *
 * Applies platform updates to an existing Coherent project without
 * touching user-generated pages or components.
 *
 * What it does:
 *   1. Regenerates platform overlay (design-system viewer, API routes)
 *   2. Runs config migrations if needed (new fields, schema changes)
 *   3. Stamps new coherentVersion in config
 *   4. Regenerates .cursorrules / CLAUDE.md
 *   5. Detects missing CSS variables in globals.css
 *   6. Reports what changed
 *
 * What it NEVER does:
 *   - Modify user pages in app/
 *   - Modify shared components in components/shared/
 *   - Overwrite globals.css
 */

import chalk from 'chalk'
import ora from 'ora'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { DesignSystemManager, CLI_VERSION } from '@getcoherent/core'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import { writeDesignSystemFiles } from '../utils/ds-files.js'
import { writeAllHarnessFiles } from '../utils/harness-context.js'
import { getPendingMigrations, compareSemver } from '../utils/migrations.js'
import { pickPrimaryRoute, replaceWelcomeWithPrimary, type PageLite } from '../utils/welcome-replacement.js'
import { inferPageTypeFromRoute } from '../agents/design-constraints.js'
import { isPlatformInternalEntry } from '../utils/component-integrity.js'
import { loadManifest, saveManifest } from '@getcoherent/core'
import { buildSidebarNavItems } from '../utils/nav-items.js'

interface UpdateReport {
  fromVersion: string | undefined
  toVersion: string
  overlayFiles: number
  migrationsApplied: string[]
  rulesUpdated: boolean
  missingCssVars: string[]
  /** Set when v0.11 backfill replaced a leftover welcome scaffold. */
  welcomeReplacedTo: string | null
  /** Names of platform-internal manifest entries scrubbed by v0.11 backfill (DSButton et al). */
  platformEntriesRemoved: string[]
  /** Number of sidebar nav.items appended by v0.11.1 backfill (multi-turn drop recovery). */
  sidebarItemsBackfilled: number
}

export async function updateCommand(opts: { patchGlobals?: boolean }) {
  const project = findConfig()
  if (!project) {
    exitNotCoherent()
  }

  const spinner = ora('Loading project configuration...').start()

  try {
    const dsm = new DesignSystemManager(project.configPath)
    await dsm.load()
    const config = dsm.getConfig()
    const projectVersion = config.coherentVersion || '0.0.0'

    if (compareSemver(projectVersion, CLI_VERSION) === 0) {
      spinner.succeed('Project is already up to date')
      console.log(chalk.gray(`   Version: v${CLI_VERSION}\n`))
      return
    }

    if (compareSemver(projectVersion, CLI_VERSION) > 0) {
      spinner.warn('Project was created with a newer CLI version')
      console.log(chalk.yellow(`   Project: v${projectVersion} → CLI: v${CLI_VERSION}`))
      console.log(chalk.yellow('   Update your CLI: npm install -g @getcoherent/cli@latest\n'))
      return
    }

    const report: UpdateReport = {
      fromVersion: projectVersion === '0.0.0' ? undefined : projectVersion,
      toVersion: CLI_VERSION,
      overlayFiles: 0,
      migrationsApplied: [],
      rulesUpdated: false,
      missingCssVars: [],
      welcomeReplacedTo: null,
      platformEntriesRemoved: [],
      sidebarItemsBackfilled: 0,
    }

    // Step 1: Config migrations
    spinner.text = 'Running config migrations...'
    const pendingMigrations = getPendingMigrations(projectVersion, CLI_VERSION)

    if (pendingMigrations.length > 0) {
      let rawConfig = config as unknown as Record<string, unknown>
      for (const migration of pendingMigrations) {
        rawConfig = migration.migrate(rawConfig)
        report.migrationsApplied.push(migration.description)
      }
    }

    // Step 2: Stamp new version and save
    spinner.text = 'Updating project version...'
    ;(config as Record<string, unknown>).coherentVersion = CLI_VERSION
    await dsm.save()

    // Step 3: Regenerate platform overlay
    spinner.text = 'Regenerating platform overlay...'
    const overlayFiles = await writeDesignSystemFiles(project.root, config)
    report.overlayFiles = overlayFiles.length

    // Step 4: Regenerate .cursorrules / CLAUDE.md
    spinner.text = 'Updating .cursorrules and CLAUDE.md...'
    const rulesResult = await writeAllHarnessFiles(project.root)
    report.rulesUpdated = rulesResult.written

    // Step 5: Check globals.css for missing CSS variables
    spinner.text = 'Checking globals.css...'
    report.missingCssVars = checkMissingCssVars(project.root)

    // Step 6: Optionally patch globals.css
    if (opts.patchGlobals && report.missingCssVars.length > 0) {
      spinner.text = 'Patching globals.css...'
      patchGlobalsCss(project.root, report.missingCssVars)
      report.missingCssVars = []
    }

    // Step 7: Welcome-scaffold backfill (v0.11).
    //
    // Projects scaffolded in v0.9–v0.10 that ran their first chat with a
    // plan that did not include `/` are stuck on the welcome scaffold +
    // generated pages mismatch (CLI redraws sidebar/Header per generated
    // pages, but `/` still serves the marketing-toggle landing). Detect
    // and fix on update — lazy: only fires when the placeholder flag is
    // still true AND the on-disk file passes `isWelcomeScaffold` (so user
    // edits are never trampled).
    if (config.settings.homePagePlaceholder) {
      spinner.text = 'Checking welcome scaffold...'

      // Source pages from `config.pages`, filtering the init-seeded `/`
      // Home so it can't short-circuit `pickPrimaryRoute` (codex P1 #1).
      // For backfill this is safe: any other `/` entry in config.pages
      // would mean the user actually generated a `/` page, in which case
      // `homePagePlaceholder` would already have been flipped on first
      // chat and we wouldn't be in this branch.
      const realPages: PageLite[] = config.pages
        .filter(p => p.route !== '/')
        .map(p => ({ route: p.route, pageType: inferPageTypeFromRoute(p.route) }))

      const primary = pickPrimaryRoute(realPages)
      if (primary) {
        const result = replaceWelcomeWithPrimary({ projectRoot: project.root, primaryRoute: primary })
        if (result.replaced) {
          config.settings.homePagePlaceholder = false
          dsm.updateConfig(config)
          await dsm.save()
          report.welcomeReplacedTo = primary
        }
      }
    }

    // Step 8: Scrub Coherent platform widgets from the shared-components
    // manifest (v0.11). Older `coherent fix` runs auto-registered
    // `DSButton` (and similar platform internals) into
    // `coherent.components.json` because the step-6c scanner didn't know
    // they belonged to the platform overlay. The /design-system viewer
    // ended up showing them alongside the user's own components. Lazy
    // backfill: only entries with `source === 'extracted'` (auto-
    // registered) are removed; any user-curated DSButton entry is left
    // alone.
    try {
      const manifest = await loadManifest(project.root)
      const before = manifest.shared.length
      const removed = manifest.shared.filter(isPlatformInternalEntry)
      if (removed.length > 0) {
        manifest.shared = manifest.shared.filter(s => !isPlatformInternalEntry(s))
        await saveManifest(project.root, manifest)
        report.platformEntriesRemoved = removed.map(r => r.name)
        if (process.env.COHERENT_DEBUG === '1') {
          console.log(chalk.dim(`  Scrubbed ${before - manifest.shared.length} platform entries from manifest`))
        }
      }
    } catch {
      // No manifest, unreadable manifest, or write failure — best-effort.
    }

    // Step 9: Sidebar nav.items backfill (v0.11.1).
    //
    // The v0.11.0 pages applier sourced sidebar routes from the current
    // session's pagesQueue instead of the registered config.pages, which
    // dropped chat-#1 routes whenever a chat-#2 ran on a sidebar-nav
    // project. Pages were preserved, but navigation.items lost the
    // earlier entries — sidebar rendered with only the most recently
    // generated route. This backfill walks every config.pages entry
    // tagged requiresAuth (the existing app-page proxy) and runs it
    // through the same `buildSidebarNavItems` helper the applier uses,
    // append-only and idempotent, so projects that lost items recover
    // exactly the right set on `coherent update` without any chat.
    //
    // Gated on navigation.type ∈ {sidebar, both} so header-nav projects
    // don't accumulate sidebar entries they wouldn't otherwise have.
    if (config.navigation && (config.navigation.type === 'sidebar' || config.navigation.type === 'both')) {
      spinner.text = 'Checking sidebar navigation...'
      const registeredAppRoutes = (config.pages || [])
        .filter(p => p.requiresAuth && p.route && p.route !== '/')
        .map(p => p.route)
      const before = config.navigation.items?.length ?? 0
      const nextItems = buildSidebarNavItems(registeredAppRoutes, config.navigation.items)
      if (nextItems.length !== before) {
        const next = {
          ...config,
          navigation: { ...config.navigation, items: nextItems },
          updatedAt: new Date().toISOString(),
        }
        dsm.updateConfig(next)
        await dsm.save()
        report.sidebarItemsBackfilled = nextItems.length - before
      }
    }

    // Report
    spinner.stop()
    printReport(report)
  } catch (err) {
    spinner.fail('Update failed')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

function printReport(report: UpdateReport) {
  const from = report.fromVersion ? `v${report.fromVersion}` : 'unknown'
  console.log(chalk.green(`\n✔ Project updated: ${from} → v${report.toVersion}\n`))

  if (report.overlayFiles > 0) {
    console.log(chalk.white(`  ✔ Regenerated platform overlay (${report.overlayFiles} files)`))
  }

  if (report.migrationsApplied.length > 0) {
    for (const desc of report.migrationsApplied) {
      console.log(chalk.white(`  ✔ Migrated config: ${desc}`))
    }
  }

  if (report.rulesUpdated) {
    console.log(chalk.white('  ✔ Updated .cursorrules and CLAUDE.md'))
  }

  if (report.welcomeReplacedTo) {
    console.log(
      chalk.white(`  ✔ Replaced leftover welcome scaffold → redirect("${report.welcomeReplacedTo}") at app/page.tsx`),
    )
  }

  if (report.platformEntriesRemoved.length > 0) {
    const list = report.platformEntriesRemoved.join(', ')
    console.log(chalk.white(`  ✔ Cleaned platform widgets from shared-components manifest (${list})`))
  }

  if (report.sidebarItemsBackfilled > 0) {
    const n = report.sidebarItemsBackfilled
    console.log(
      chalk.white(`  ✔ Recovered ${n} dropped sidebar nav ${n === 1 ? 'entry' : 'entries'} (v0.11.1 backfill)`),
    )
  }

  if (report.missingCssVars.length > 0) {
    console.log('')
    console.log(chalk.yellow('  ⚠ New CSS variables available in globals.css:'))
    for (const v of report.missingCssVars.slice(0, 10)) {
      console.log(chalk.gray(`    ${v}`))
    }
    if (report.missingCssVars.length > 10) {
      console.log(chalk.gray(`    ... and ${report.missingCssVars.length - 10} more`))
    }
    console.log('')
    console.log(chalk.cyan('  To add them automatically:'))
    console.log(chalk.white('    coherent update --patch-globals\n'))
  }

  console.log('')
  console.log(chalk.dim('  Your pages and components were NOT modified.'))
  console.log(chalk.dim('  Run `coherent check` to check existing pages against new rules.\n'))
}

/**
 * Known CSS variables that Coherent projects should have.
 * Extend this list when adding new design tokens.
 */
const EXPECTED_CSS_VARS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--radius',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--sidebar-background',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
]

function checkMissingCssVars(projectRoot: string): string[] {
  const globalsPath = join(projectRoot, 'app', 'globals.css')
  if (!existsSync(globalsPath)) return []

  try {
    const content = readFileSync(globalsPath, 'utf-8')
    return EXPECTED_CSS_VARS.filter(v => !content.includes(v))
  } catch {
    return []
  }
}

function patchGlobalsCss(projectRoot: string, missingVars: string[]) {
  const globalsPath = join(projectRoot, 'app', 'globals.css')
  if (!existsSync(globalsPath) || missingVars.length === 0) return

  let content = readFileSync(globalsPath, 'utf-8')

  const defaultValues: Record<string, string> = {
    '--chart-1': '220 70% 50%',
    '--chart-2': '160 60% 45%',
    '--chart-3': '30 80% 55%',
    '--chart-4': '280 65% 60%',
    '--chart-5': '340 75% 55%',
    '--sidebar-background': '0 0% 98%',
    '--sidebar-foreground': '240 5.3% 26.1%',
    '--sidebar-primary': '240 5.9% 10%',
    '--sidebar-primary-foreground': '0 0% 98%',
    '--sidebar-accent': '240 4.8% 95.9%',
    '--sidebar-accent-foreground': '240 5.9% 10%',
    '--sidebar-border': '220 13% 91%',
    '--sidebar-ring': '217.2 91.2% 59.8%',
  }

  const lines: string[] = []
  for (const v of missingVars) {
    const val = defaultValues[v]
    if (val) {
      lines.push(`    ${v}: ${val};`)
    }
  }

  if (lines.length === 0) return

  const injection = lines.join('\n')

  const lightSectionEnd = content.indexOf('}')
  if (lightSectionEnd > 0) {
    content = content.slice(0, lightSectionEnd) + '\n' + injection + '\n' + content.slice(lightSectionEnd)

    writeFileSync(globalsPath, content, 'utf-8')
  }
}
