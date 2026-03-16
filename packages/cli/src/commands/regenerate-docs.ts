/**
 * Regenerate Docs Command
 *
 * Overwrites app/design-system/docs/* with current templates (layout, index, components,
 * tokens, for-designers, recommendations). Use this to fix navigation duplication or
 * update docs after generator changes, without re-running full init.
 *
 * Note: Documentation *content* (component list, token values) is already dynamic:
 * docs pages and the Design System viewer read from design-system.config at request
 * time, so changes via coherent chat or Cursor are reflected on refresh. This
 * command only updates the docs *template* (structure/layout), not the data.
 */

import chalk from 'chalk'
import ora from 'ora'
import { findConfig } from '../utils/find-config.js'
import { DesignSystemManager } from '@getcoherent/core'
import { ProjectScaffolder } from '@getcoherent/core'

export async function regenerateDocsCommand() {
  try {
    const project = findConfig()

    if (!project) {
      console.log(chalk.yellow('⚠️  Not in a Coherent project\n'))
      console.log('Run this command from a project root that has design-system.config.ts')
      console.log(chalk.white('  $ coherent init   # in an empty folder first\n'))
      process.exit(1)
    }

    const spinner = ora('Regenerating documentation pages...').start()

    try {
      const manager = new DesignSystemManager(project.configPath)
      await manager.load()
      const config = manager.getConfig()

      const scaffolder = new ProjectScaffolder(config, project.root)
      await scaffolder.generateDocsPages()

      spinner.succeed('Documentation pages updated')
      console.log(
        chalk.gray(
          '\nUpdated: app/design-system/docs/ (layout, page, components, tokens, for-designers, recommendations)\n',
        ),
      )
    } catch (err) {
      spinner.fail('Failed to regenerate docs')
      console.error(chalk.red(err instanceof Error ? err.message : String(err)))
      process.exit(1)
    }
  } catch (error) {
    console.error(chalk.red('❌ Command failed:'), error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  }
}
