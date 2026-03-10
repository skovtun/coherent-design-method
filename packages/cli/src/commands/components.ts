/**
 * Components Command
 *
 * List and manage design system components (UI) and shared components (Epic 2).
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'
import {
  DesignSystemManager,
  ComponentManager,
  loadManifest,
  generateSharedComponent,
  integrateSharedLayoutIntoRootLayout,
} from '@coherent/core'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { writeDesignSystemFiles } from '../utils/ds-files.js'
import { listShadcnComponents } from '../utils/shadcn-installer.js'
import { writeCursorRules } from '../utils/cursor-rules.js'

export function createComponentsCommand(): Command {
  const cmd = new Command('components').description(
    'Manage design system components and shared components (Epic 2)'
  )

  cmd
    .command('list')
    .description('List all components')
    .action(async () => {
      const project = findConfig()

      if (!project) exitNotCoherent()

      const dsm = new DesignSystemManager(project.configPath)
      await dsm.load()
      const config = dsm.getConfig()
      const cm = new ComponentManager(config)

      const installed = cm.getAllComponents()
      const availableShadcn = listShadcnComponents()
      const installedIds = new Set(installed.map(c => c.id))
      const notInstalled = availableShadcn.filter(id => !installedIds.has(id))

      console.log(chalk.bold('\n📦 Component Registry\n'))

      if (installed.length === 0) {
        console.log(chalk.yellow('   No components installed yet\n'))
      } else {
        console.log(chalk.cyan(`📦 Installed Components (${installed.length}):`))
        installed.forEach(comp => {
          const variantsCount = comp.variants.length
          const sizesCount = comp.sizes.length
          const usageCount = comp.usedInPages.length
          const source =
            comp.source === 'shadcn' ? chalk.gray('(built-in)') : chalk.gray('(custom)')

          console.log(chalk.white(`   ✓ ${comp.name} ${source}`))
          console.log(
            chalk.gray(
              `     ${variantsCount} variants, ${sizesCount} sizes - used in ${usageCount} page(s)`
            )
          )
        })
        console.log('')
      }

      if (notInstalled.length > 0) {
        console.log(
          chalk.cyan(`📚 Available components (${notInstalled.length} more):`)
        )
        const grouped = notInstalled.reduce(
          (acc, id, i) => {
            if (i % 5 === 0) acc.push([])
            acc[acc.length - 1].push(id)
            return acc
          },
          [] as string[][]
        )

        grouped.forEach(group => {
          console.log(chalk.gray(`   ○ ${group.join(', ')}`))
        })
        console.log('')
      }

      console.log(chalk.cyan('💡 Install components:'))
      console.log(chalk.white(`   coherent chat "add [component-name]"`))
      console.log(chalk.gray('   Example: coherent chat "add button"\n'))
    })

  cmd
    .command('add <name>')
    .description('Install a specific component')
    .action(async (name: string) => {
      console.log(chalk.yellow(`\n💡 Use: coherent chat "add ${name} component"\n`))
    })

  // Epic 2: Shared Components (coherent.components.json)
  const sharedCmd = cmd
    .command('shared')
    .description('List or add shared components (Header, Footer, etc.)')
  sharedCmd
    .option('--json', 'Machine-readable JSON output')
    .option('--verbose', 'Show file paths and usage details')
    .action(async (opts: { json?: boolean; verbose?: boolean }) => {
      const project = findConfig()
      if (!project) exitNotCoherent()

      const manifest = await loadManifest(project.root)

      if (opts.json) {
        console.log(JSON.stringify(manifest, null, 2))
        return
      }

      console.log(chalk.bold('\n📦 Shared Components\n'))

      if (manifest.shared.length === 0) {
        console.log(chalk.yellow('   No shared components yet.\n'))
        console.log(
          chalk.gray('   Create via chat: coherent chat "add a page with header and footer"\n')
        )
        return
      }

      // Order: layout first, then section, then widget
      const order = { layout: 0, section: 1, widget: 2 }
      const sorted = [...manifest.shared].sort(
        (a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name)
      )

      sorted.forEach(entry => {
        const usedIn =
          entry.usedIn.length === 0
            ? chalk.gray('(not used yet)')
            : entry.usedIn.length === 1 && entry.usedIn[0] === 'app/layout.tsx'
              ? chalk.gray('layout.tsx (all pages)')
              : chalk.gray(`used in: ${entry.usedIn.join(', ')}`)
        console.log(chalk.cyan(`  ${entry.id}`), chalk.white(entry.name), chalk.gray(entry.type))
        if (opts.verbose) {
          console.log(chalk.gray(`    file: ${entry.file}`))
          if (entry.description) console.log(chalk.gray(`    ${entry.description}`))
        }
        console.log(chalk.gray(`    ${usedIn}`))
        console.log('')
      })

      console.log(chalk.cyan('💡 Modify by ID:'), chalk.white('coherent chat "in CID-001 add a search button"\n'))
    })

  sharedCmd
    .command('add <name>')
    .description('Create a shared component (layout/section/widget) and register in manifest')
    .option('-t, --type <type>', 'Type: layout | section | widget', 'layout')
    .option('-d, --description <desc>', 'Description')
    .action(async (name: string, opts: { type?: string; description?: string }) => {
      const project = findConfig()
      if (!project) exitNotCoherent()
      const type = (opts.type === 'section' || opts.type === 'widget' ? opts.type : 'layout') as 'layout' | 'section' | 'widget'
      const result = await generateSharedComponent(project.root, {
        name: name.trim(),
        type,
        description: opts.description,
        usedIn: type === 'layout' ? ['app/layout.tsx'] : [],
      })
      console.log(chalk.green(`\n✅ Created ${result.id} (${result.name}) at ${result.file}\n`))
      if (type === 'layout') {
        const updated = await integrateSharedLayoutIntoRootLayout(project.root)
        if (updated) console.log(chalk.cyan('   Updated app/layout.tsx to use shared layout components.\n'))
      }
      // Zero-friction: if DS shared pages don't exist yet, generate them
      const sharedPagePath = resolve(project.root, 'app/design-system/shared/page.tsx')
      if (!existsSync(sharedPagePath)) {
        try {
          const dsm = new DesignSystemManager(project.configPath)
          await dsm.load()
          const config = dsm.getConfig()
          const written = await writeDesignSystemFiles(project.root, config, { sharedOnly: true })
          if (written.length > 0) {
            console.log(chalk.cyan('   Added Design System shared pages: /design-system/shared\n'))
          }
        } catch (e) {
          if (process.env.COHERENT_DEBUG === '1') console.error(chalk.dim('DS shared pages write failed:'), e)
        }
      }
      try {
        await writeCursorRules(project.root)
      } catch (e) {
        if (process.env.COHERENT_DEBUG === '1') console.error(chalk.dim('Could not update .cursorrules:'), e)
      }
    })

  return cmd
}
