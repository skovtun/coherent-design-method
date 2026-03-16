import chalk from 'chalk'
import { resolve } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { DesignSystemManager, ComponentManager, loadManifest } from '@getcoherent/core'
import { requireProject, loadConfig } from './utils.js'

const DEBUG = process.env.COHERENT_DEBUG === '1'

export async function interactiveChat(
  options: { provider?: string },
  chatCommandFn: (message: string, options: Record<string, any>) => Promise<void>,
) {
  const { createInterface } = await import('readline')
  const { homedir } = await import('os')

  const project = requireProject()
  const projectRoot = project.root
  const configPath = project.configPath

  const config = await loadConfig(configPath)
  const dsm = new DesignSystemManager(configPath)
  await dsm.load()
  const cm = new ComponentManager(config)

  const validProviders = ['claude', 'openai', 'auto']
  const provider = (options.provider || 'auto').toLowerCase() as 'claude' | 'openai' | 'auto'
  if (!validProviders.includes(provider)) {
    console.error(chalk.red(`\n❌ Invalid provider: ${options.provider}`))
    process.exit(1)
  }

  const historyDir = resolve(homedir(), '.coherent')
  const historyFile = resolve(historyDir, 'history')
  let history: string[] = []
  try {
    mkdirSync(historyDir, { recursive: true })
    if (existsSync(historyFile)) {
      history = readFileSync(historyFile, 'utf-8').split('\n').filter(Boolean).slice(-200)
    }
  } catch (e) {
    if (DEBUG) console.error('Failed to load REPL history:', e)
  }

  console.log(chalk.cyan('\n🎨 Coherent Interactive Mode'))
  console.log(chalk.dim('   Type your requests, or use built-in commands.'))
  console.log(chalk.dim('   Type "help" for available commands, "exit" to quit.\n'))

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('Coherent> '),
    history,
    historySize: 200,
  } as any)

  rl.prompt()

  rl.on('line', async (line: string) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    const lower = input.toLowerCase()

    if (lower === 'exit' || lower === 'quit' || lower === 'q') {
      saveHistory()
      console.log(chalk.dim('\nBye!\n'))
      rl.close()
      process.exit(0)
    }

    if (lower === 'help') {
      console.log(chalk.bold('\n  Built-in commands:'))
      console.log(chalk.white('    components') + chalk.dim('  — list shared and UI components'))
      console.log(chalk.white('    pages') + chalk.dim('      — list all pages'))
      console.log(chalk.white('    tokens') + chalk.dim('     — show design tokens'))
      console.log(chalk.white('    status') + chalk.dim('     — project summary'))
      console.log(chalk.white('    help') + chalk.dim('       — this help'))
      console.log(chalk.white('    exit') + chalk.dim('       — quit interactive mode'))
      console.log(chalk.bold('\n  Target shortcuts:'))
      console.log(chalk.white('    @ComponentName <msg>') + chalk.dim(' — target a shared component'))
      console.log(chalk.white('    @/route <msg>') + chalk.dim('         — target a page by route'))
      console.log(chalk.dim('\n  Anything else is sent to AI as a modification request.\n'))
      rl.prompt()
      return
    }

    if (lower === 'components' || lower === 'list components' || lower.includes('what components')) {
      const manifest = await loadManifest(projectRoot)
      if (manifest.shared.length === 0) {
        console.log(chalk.gray('\n  No shared components yet.\n'))
      } else {
        console.log('')
        const order: Record<string, number> = { layout: 0, section: 1, widget: 2 }
        const sorted = [...manifest.shared].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9))
        sorted.forEach(entry => {
          const usage = entry.usedIn.includes('app/layout.tsx')
            ? chalk.green('all pages')
            : entry.usedIn.length > 0
              ? chalk.gray(entry.usedIn.join(', '))
              : chalk.gray('unused')
          console.log(
            `  ${chalk.cyan(entry.id.padEnd(8))} ${chalk.white(entry.name.padEnd(18))} ${chalk.gray(entry.type.padEnd(9))} ${usage}`,
          )
        })
        console.log('')
      }
      rl.prompt()
      return
    }

    if (lower === 'pages' || lower === 'list pages' || lower.includes('what pages')) {
      const currentConfig = dsm.getConfig()
      if (currentConfig.pages.length === 0) {
        console.log(chalk.gray('\n  No pages yet.\n'))
      } else {
        console.log('')
        currentConfig.pages.forEach(p => {
          console.log(`  ${chalk.white(p.name.padEnd(22))} ${chalk.gray(p.route)}`)
        })
        console.log('')
      }
      rl.prompt()
      return
    }

    if (lower === 'status') {
      const currentConfig = dsm.getConfig()
      const manifest = await loadManifest(projectRoot)
      console.log(chalk.bold(`\n  ${currentConfig.name || 'Coherent Project'}`))
      console.log(
        chalk.dim(
          `  Pages: ${currentConfig.pages.length}  |  Shared components: ${manifest.shared.length}  |  UI components: ${cm.getAllComponents().length}\n`,
        ),
      )
      rl.prompt()
      return
    }

    if (lower === 'tokens' || lower === 'show tokens' || lower === 'design tokens') {
      const currentConfig = dsm.getConfig()
      const t = currentConfig.tokens
      console.log(chalk.bold('\n  Design Tokens\n'))
      console.log(chalk.cyan('  Colors (light)'))
      for (const [k, v] of Object.entries(t.colors.light)) {
        console.log(`    ${chalk.white(k.padEnd(14))} ${chalk.gray(v)}`)
      }
      console.log(chalk.cyan('\n  Typography'))
      console.log(`    ${chalk.white('sans'.padEnd(14))} ${chalk.gray(t.typography.fontFamily.sans)}`)
      console.log(`    ${chalk.white('mono'.padEnd(14))} ${chalk.gray(t.typography.fontFamily.mono)}`)
      console.log(chalk.cyan('\n  Spacing'))
      for (const [k, v] of Object.entries(t.spacing)) {
        console.log(`    ${chalk.white(k.padEnd(14))} ${chalk.gray(v)}`)
      }
      console.log(chalk.cyan('\n  Radius'))
      for (const [k, v] of Object.entries(t.radius)) {
        console.log(`    ${chalk.white(k.padEnd(14))} ${chalk.gray(v)}`)
      }
      console.log('')
      rl.prompt()
      return
    }

    let resolvedInput = input
    const extraOpts: { component?: string; page?: string } = {}
    const componentMatch = input.match(/^@(\w[\w-]*)(?:\s+(.+))?$/)
    const pageMatch = input.match(/^@(\/\S*)(?:\s+(.+))?$/)
    if (pageMatch && pageMatch[2]) {
      extraOpts.page = pageMatch[1]
      resolvedInput = pageMatch[2]
    } else if (componentMatch && componentMatch[2]) {
      extraOpts.component = componentMatch[1]
      resolvedInput = componentMatch[2]
    }

    try {
      await chatCommandFn(resolvedInput, { provider, interactive: false, _throwOnError: true, ...extraOpts })
      await dsm.load()
    } catch (err: any) {
      if (!err._printed) {
        console.error(chalk.red(`\n  Error: ${err.message}\n`))
      }
    }

    rl.prompt()
  })

  function saveHistory() {
    try {
      const lines = ((rl as any).history as string[] | undefined) || []
      writeFileSync(historyFile, lines.join('\n') + '\n')
    } catch (e) {
      if (DEBUG) console.error('Failed to save REPL history:', e)
    }
  }

  rl.on('close', () => {
    saveHistory()
    process.exit(0)
  })
}
