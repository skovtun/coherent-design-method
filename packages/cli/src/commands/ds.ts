/**
 * Design System commands: regenerate all DS pages from current config.
 */

import chalk from 'chalk'
import ora from 'ora'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import { DesignSystemManager } from '@getcoherent/core'
import { writeDesignSystemFiles } from '../utils/ds-files.js'

export async function dsRegenerateCommand() {
  const project = findConfig()
  if (!project) {
    exitNotCoherent()
  }

  const spinner = ora('Loading config and regenerating Design System pages...').start()
  try {
    const dsm = new DesignSystemManager(project.configPath)
    await dsm.load()
    const config = dsm.getConfig()
    const written = await writeDesignSystemFiles(project.root, config)
    spinner.succeed(`Regenerated ${written.length} Design System file(s)`)
    console.log(chalk.gray('   app/design-system/* and app/api/design-system/*\n'))
    console.log(chalk.cyan('   Open /design-system in the app to view.\n'))
  } catch (err) {
    spinner.fail('Failed to regenerate')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
