/**
 * Status Command
 * 
 * Shows information about the current Coherent project.
 */

import chalk from 'chalk'
import { basename } from 'path'
import { findConfig } from '../utils/find-config.js'
import { readRecentChanges, formatTimeAgo } from '../utils/recent-changes.js'
import { DesignSystemManager } from '@getcoherent/core'

/**
 * Count design tokens recursively
 */
function countTokens(tokens: any): number {
  let count = 0
  function countObj(obj: any): void {
    if (!obj || typeof obj !== 'object') {
      return
    }
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        countObj(obj[key])
      } else {
        count++
      }
    }
  }
  countObj(tokens)
  return count
}

/**
 * Status command implementation
 */
export async function statusCommand() {
  const project = findConfig()

  if (!project) {
    console.log(chalk.yellow('⚠️  Not in a Coherent project\n'))
    console.log('Initialize a project:')
    console.log(chalk.white('  $ coherent init\n'))
    return
  }

  console.log(chalk.cyan('\n✨ Current Project\n'))

  console.log(chalk.gray('📁 Location: ') + chalk.white(project.root))
  console.log(chalk.gray('📄 Config: ') + chalk.white(basename(project.configPath)))
  console.log('')

  // Load config
  try {
    const manager = new DesignSystemManager(project.configPath)
    await manager.load()
    const config = manager.getConfig()

    console.log(chalk.cyan('📊 Statistics:\n'))

    // Count pages (can be array or object)
    const pageCount = Array.isArray(config.pages) ? config.pages.length : Object.keys(config.pages || {}).length
    console.log(chalk.gray('   Pages: ') + chalk.white(String(pageCount)))

    // Count components (can be array or object)
    const componentCount = Array.isArray(config.components)
      ? config.components.length
      : Object.keys(config.components || {}).length
    console.log(chalk.gray('   Components: ') + chalk.white(String(componentCount)))

    // Count tokens
    const tokenCount = countTokens(config.tokens)
    console.log(chalk.gray('   Design tokens: ') + chalk.white(String(tokenCount)))
    console.log('')

    // Recent changes
    const recent = readRecentChanges(project.root)
    if (recent.length > 0) {
      console.log(chalk.cyan('📝 Recent changes:\n'))
      recent.slice(0, 5).forEach(change => {
        const ago = formatTimeAgo(change.timestamp)
        console.log(chalk.gray('   • ') + chalk.white(change.description) + chalk.gray(` (${ago})`))
      })
      console.log('')
    }

    console.log(chalk.cyan('🚀 Quick actions:\n'))
    console.log(chalk.white('   $ coherent chat "add new page"'))
    console.log(chalk.white('   $ coherent preview'))
    console.log(chalk.white('   $ coherent export'))
    console.log('')
  } catch (error) {
    console.error(chalk.red('Error loading config:'))
    if (error instanceof Error) {
      console.error(chalk.red(`   ${error.message}`))
    } else {
      console.error(chalk.red('   Unknown error'))
    }
    console.log('')
  }
}
