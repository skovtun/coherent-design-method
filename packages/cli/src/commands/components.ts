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
} from '@getcoherent/core'
import type { SharedComponentType } from '@getcoherent/core'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { writeDesignSystemFiles } from '../utils/ds-files.js'
import { listShadcnComponents } from '../utils/shadcn-installer.js'
import { writeCursorRules } from '../utils/cursor-rules.js'

export function createComponentsCommand(): Command {
  const cmd = new Command('components').description('Manage design system components and shared components (Epic 2)')

  cmd
    .command('list')
    .description('List all components (shared + UI)')
    .option('--json', 'Machine-readable JSON output')
    .action(async (opts: { json?: boolean }) => {
      const project = findConfig()

      if (!project) exitNotCoherent()

      const dsm = new DesignSystemManager(project.configPath)
      await dsm.load()
      const config = dsm.getConfig()
      const cm = new ComponentManager(config)
      const manifest = await loadManifest(project.root)

      if (opts.json) {
        const installed = cm.getAllComponents()
        console.log(JSON.stringify({ shared: manifest.shared, ui: installed }, null, 2))
        return
      }

      // Shared components
      console.log(chalk.bold('\n📦 Shared Components'))
      if (manifest.shared.length === 0) {
        console.log(chalk.gray('   None yet. Generate pages with header/footer to create them.\n'))
      } else {
        const order: Record<string, number> = {
          layout: 0,
          navigation: 1,
          'data-display': 2,
          form: 3,
          feedback: 4,
          section: 5,
          widget: 6,
        }
        const sorted = [...manifest.shared].sort(
          (a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.name.localeCompare(b.name),
        )
        console.log('')
        sorted.forEach(entry => {
          const usage =
            entry.usedIn.length === 0
              ? chalk.gray('unused')
              : entry.usedIn.includes('app/layout.tsx')
                ? chalk.green('all pages')
                : chalk.gray(entry.usedIn.join(', '))
          console.log(
            `   ${chalk.cyan(entry.id.padEnd(8))} ${chalk.white(entry.name.padEnd(18))} ${chalk.gray(entry.type.padEnd(9))} ${usage}`,
          )
        })
        console.log('')
      }

      // UI components (shadcn)
      const installed = cm.getAllComponents()
      const availableShadcn = listShadcnComponents()
      const installedIds = new Set(installed.map(c => c.id))
      const notInstalled = availableShadcn.filter(id => !installedIds.has(id))

      console.log(chalk.bold('🧩 UI Components (shadcn)'))
      if (installed.length === 0) {
        console.log(chalk.gray('   None installed yet.\n'))
      } else {
        const names = installed.map(c => c.name).sort()
        console.log(chalk.green(`   Installed (${names.length}): `) + chalk.white(names.join(', ')))
      }

      if (notInstalled.length > 0) {
        console.log(chalk.gray(`   Available (${notInstalled.length}):  `) + chalk.gray(notInstalled.join(', ')))
      }
      console.log('')

      console.log(chalk.cyan('💡 Commands:'))
      console.log(chalk.white('   coherent chat "add a testimonial component"'))
      console.log(chalk.white('   coherent chat --component "Header" "add a search button"'))
      console.log('')
    })

  cmd
    .command('add <name>')
    .description('Install a specific component')
    .action(async (name: string) => {
      console.log(chalk.yellow(`\n💡 Use: coherent chat "add ${name} component"\n`))
    })

  // Epic 2: Shared Components (coherent.components.json)
  const sharedCmd = cmd.command('shared').description('List or add shared components (Header, Footer, etc.)')
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
        console.log(chalk.gray('   Create via chat: coherent chat "add a page with header and footer"\n'))
        return
      }

      const order: Record<string, number> = {
        layout: 0,
        navigation: 1,
        'data-display': 2,
        form: 3,
        feedback: 4,
        section: 5,
        widget: 6,
      }
      const sorted = [...manifest.shared].sort(
        (a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.name.localeCompare(b.name),
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
    .option('-t, --type <type>', 'Type: layout | navigation | data-display | form | feedback | section | widget', 'layout')
    .option('-d, --description <desc>', 'Description')
    .action(async (name: string, opts: { type?: string; description?: string }) => {
      const project = findConfig()
      if (!project) exitNotCoherent()
      const validTypes = ['layout', 'navigation', 'data-display', 'form', 'feedback', 'section', 'widget']
      const type = (validTypes.includes(opts.type ?? '') ? opts.type : 'layout') as SharedComponentType
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
