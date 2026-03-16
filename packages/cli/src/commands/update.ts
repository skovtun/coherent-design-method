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
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { DesignSystemManager, CLI_VERSION } from '@getcoherent/core'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import { writeDesignSystemFiles } from '../utils/ds-files.js'
import { writeCursorRules } from '../utils/cursor-rules.js'
import { getPendingMigrations, compareSemver } from '../utils/migrations.js'

interface UpdateReport {
  fromVersion: string | undefined
  toVersion: string
  overlayFiles: number
  migrationsApplied: string[]
  rulesUpdated: boolean
  missingCssVars: string[]
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
    const rulesResult = await writeCursorRules(project.root)
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

  const { writeFileSync } = require('fs') as typeof import('fs')
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
