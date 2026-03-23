/**
 * Preview Command
 *
 * Self-healing preview: pre-flight deps, clear cache, validate syntax,
 * launch with error monitoring, health check.
 */

import chalk from 'chalk'
import ora from 'ora'
import { spawn, ChildProcess } from 'child_process'
import { existsSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'
import { readdir } from 'fs/promises'
import { findConfig, exitNotCoherent, warnIfVolatile } from '../utils/find-config.js'
import { needsGlobalsFix, fixGlobalsCss } from '../utils/fix-globals-css.js'
import { validateV4GlobalsCss } from '../utils/css-validator.js'
import { isTailwindV4 } from '../utils/tailwind-version.js'
import { DesignSystemManager, ComponentGenerator } from '@getcoherent/core'
import {
  findMissingPackages,
  installPackages,
  sanitizeMetadataStrings,
  ensureUseClientIfNeeded,
  fixUnescapedLtInJsx,
} from '../utils/self-heal.js'
import { startFileWatcher } from '../utils/file-watcher.js'
import { getShadcnComponent } from '../utils/shadcn-installer.js'
import { getComponentProvider } from '../providers/index.js'
import { analyzePageCode } from '../utils/page-analyzer.js'

/**
 * Get package manager for project
 */
function getPackageManager(projectRoot: string): 'pnpm' | 'npm' {
  const hasPnpm = existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))
  return hasPnpm ? 'pnpm' : 'npm'
}

/**
 * Run npm/pnpm install and wait for completion
 */
function runInstall(projectRoot: string): Promise<boolean> {
  const pm = getPackageManager(projectRoot)
  const command = pm === 'pnpm' ? 'pnpm' : 'npm'
  // Use --legacy-peer-deps for npm to handle peer dependency conflicts
  const args = pm === 'pnpm' ? ['install'] : ['install', '--legacy-peer-deps']

  return new Promise(resolvePromise => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true,
    })
    child.on('close', code => {
      resolvePromise(code === 0)
    })
    child.on('error', () => {
      resolvePromise(false)
    })
  })
}

/**
 * Check if project is initialized
 */
function checkProjectInitialized(projectRoot: string): boolean {
  const configPath = resolve(projectRoot, 'design-system.config.ts')
  const packageJsonPath = resolve(projectRoot, 'package.json')

  if (!existsSync(configPath)) {
    return false
  }

  if (!existsSync(packageJsonPath)) {
    return false
  }

  return true
}

/**
 * Check if dependencies are installed
 */
function checkDependenciesInstalled(projectRoot: string): boolean {
  const nodeModulesPath = resolve(projectRoot, 'node_modules')
  return existsSync(nodeModulesPath)
}

/** Always clear .next to avoid Turbopack cache corruption. */
function clearStaleCache(projectRoot: string): void {
  const nextDir = join(projectRoot, '.next')
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true })
    console.log(chalk.dim('   ✔ Cleared stale build cache'))
  }
}

/** Auto-install missing dependencies (required + imported in app/components). */
async function preflightDependencyCheck(projectRoot: string): Promise<void> {
  const missing = await findMissingPackages(projectRoot)
  if (missing.length === 0) return
  console.log(chalk.cyan(`\n   Auto-installing missing dependencies: ${missing.join(', ')}`))
  const ok = await installPackages(projectRoot, missing)
  if (ok) console.log(chalk.dim('   ✔ Installed'))
  else console.log(chalk.yellow(`   Run manually: npm install ${missing.join(' ')}`))
}

/** Collect app/.../page.tsx paths. */
async function listPageFiles(appDir: string): Promise<string[]> {
  const out: string[] = []
  if (!existsSync(appDir)) return out
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'api' && e.name !== 'design-system') await walk(full)
      else if (e.isFile() && e.name === 'page.tsx') out.push(full)
    }
  }
  await walk(appDir)
  return out
}

/** Auto-fix known syntax issues in page files (metadata quotes, use client). */
async function validateSyntax(projectRoot: string): Promise<void> {
  const appDir = join(projectRoot, 'app')
  const pages = await listPageFiles(appDir)
  for (const file of pages) {
    const content = readFileSync(file, 'utf-8')
    const fixed = fixUnescapedLtInJsx(sanitizeMetadataStrings(ensureUseClientIfNeeded(content)))
    if (fixed !== content) {
      writeFileSync(file, fixed, 'utf-8')
      console.log(chalk.dim(`   ✔ Auto-fixed syntax: ${file.replace(projectRoot, '.').replace(/^\.[/\\]/, '')}`))
    }
  }
}

/** Auto-fix component files that are missing exports expected by page files. */
async function fixMissingComponentExports(projectRoot: string): Promise<void> {
  const appDir = join(projectRoot, 'app')
  const uiDir = join(projectRoot, 'components', 'ui')
  if (!existsSync(appDir) || !existsSync(uiDir)) return

  const pages = await listPageFiles(appDir)

  const sharedDir = join(projectRoot, 'components', 'shared')
  if (existsSync(sharedDir)) {
    const sharedFiles = readdirSync(sharedDir)
      .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
      .map(f => join(sharedDir, f))
    pages.push(...sharedFiles)
  }

  const neededExports = new Map<string, Set<string>>()

  for (const file of pages) {
    const content = readFileSync(file, 'utf-8')
    const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/ui\/([^'"]+)['"]/g
    let m
    while ((m = importRe.exec(content)) !== null) {
      const names = m[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      const componentId = m[2]
      if (!neededExports.has(componentId)) neededExports.set(componentId, new Set())
      for (const name of names) neededExports.get(componentId)!.add(name)
    }
  }

  const configPath = join(projectRoot, 'design-system.config.ts')
  let config: any = null
  try {
    const mgr = new DesignSystemManager(configPath)
    config = mgr.getConfig()
  } catch {
    /* ignore */
  }
  const generator = new ComponentGenerator(config || { components: [], pages: [], tokens: {} })

  const provider = getComponentProvider()

  for (const [componentId, needed] of neededExports) {
    const componentFile = join(uiDir, `${componentId}.tsx`)

    if (!existsSync(componentFile)) {
      if (provider.has(componentId)) {
        try {
          const result = await provider.installComponent(componentId, projectRoot)
          if (result.success) {
            console.log(chalk.dim(`   ✔ Installed missing ${componentId}.tsx`))
          }
        } catch {
          /* best-effort */
        }
      } else {
        const def = getShadcnComponent(componentId)
        if (!def) continue
        try {
          const { mkdirSync } = await import('fs')
          mkdirSync(uiDir, { recursive: true })
          const newContent = await generator.generate(def)
          writeFileSync(componentFile, newContent, 'utf-8')
          console.log(chalk.dim(`   ✔ Created missing ${componentId}.tsx`))
        } catch {
          /* best-effort */
        }
      }
      continue
    }

    const content = readFileSync(componentFile, 'utf-8')
    const exportRe = /export\s+(?:const|function|class)\s+(\w+)|export\s*\{([^}]+)\}/g
    const existingExports = new Set<string>()
    let em
    while ((em = exportRe.exec(content)) !== null) {
      if (em[1]) existingExports.add(em[1])
      if (em[2])
        em[2]
          .split(',')
          .map(
            s =>
              s
                .trim()
                .split(/\s+as\s+/)
                .pop()!,
          )
          .filter(Boolean)
          .forEach(n => existingExports.add(n))
    }

    const missing = [...needed].filter(n => !existingExports.has(n))
    if (missing.length === 0) continue

    if (provider.has(componentId)) {
      try {
        const result = await provider.installComponent(componentId, projectRoot, { force: true })
        if (result.success) {
          console.log(chalk.dim(`   ✔ Reinstalled ${componentId}.tsx (added missing exports: ${missing.join(', ')})`))
        }
      } catch {
        /* best-effort */
      }
    } else {
      const def = getShadcnComponent(componentId)
      if (!def) continue
      try {
        const newContent = await generator.generate(def)
        writeFileSync(componentFile, newContent, 'utf-8')
        console.log(chalk.dim(`   ✔ Regenerated ${componentId}.tsx (added missing exports: ${missing.join(', ')})`))
      } catch {
        /* best-effort */
      }
    }
  }
}

/** Backfill pageAnalysis for pages that were generated but never analyzed. */
async function backfillPageAnalysis(projectRoot: string): Promise<void> {
  const configPath = join(projectRoot, 'design-system.config.ts')
  if (!existsSync(configPath)) return
  try {
    const mgr = new DesignSystemManager(configPath)
    const config = mgr.getConfig()
    let changed = false
    for (const page of config.pages) {
      if ((page as any).pageAnalysis) continue
      const route = page.route || '/'
      const isAuth =
        route.includes('login') || route.includes('register') || route.includes('signup') || route.includes('sign-up')
      let filePath: string
      if (route === '/') {
        filePath = join(projectRoot, 'app', 'page.tsx')
      } else if (isAuth) {
        filePath = join(projectRoot, 'app', '(auth)', route.slice(1), 'page.tsx')
      } else {
        filePath = join(projectRoot, 'app', route.slice(1), 'page.tsx')
      }
      if (!existsSync(filePath)) continue
      const code = readFileSync(filePath, 'utf-8')
      if (code.length < 50) continue
      ;(page as any).pageAnalysis = analyzePageCode(code)
      changed = true
    }
    if (changed) {
      mgr.updateConfig(config)
      await mgr.save()
    }
  } catch {
    /* best-effort */
  }
}

/** Extract package name from "Module not found: Can't resolve 'pkg'" message. */
function extractPackageFromModuleNotFound(msg: string): string | null {
  const m = msg.match(/Can't resolve\s+['"]([^'"]+)['"]/)
  if (!m) return null
  const spec = m[1]
  if (spec.startsWith('.') || spec.startsWith('@/') || spec === 'next') return null
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
}

/** Extract shadcn component id from "@/components/ui/XXX" Module not found errors. */
function extractShadcnComponentFromModuleNotFound(msg: string): string | null {
  const m = msg.match(/Can't resolve\s+['"]@\/components\/ui\/([a-z0-9-]+)['"]/)
  return m?.[1] ?? null
}

/** Auto-install a missing shadcn component file via provider. Ensures components.json exists first. */
async function autoInstallShadcnComponent(componentId: string, projectRoot: string): Promise<boolean> {
  const provider = getComponentProvider()
  const result = await provider.installComponent(componentId, projectRoot)
  return result.success
}

const DEFAULT_PORT = 3000

/** Health check after server reports ready. */
async function healthCheck(port: number): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${port}`)
    if (res.status === 200) {
      console.log(chalk.green(`\n✅ Preview healthy at http://localhost:${port}`))
    } else {
      console.log(chalk.yellow(`\n⚠ Preview returned ${res.status}. Run: coherent fix`))
    }
  } catch {
    console.log(chalk.yellow(`\n⚠ Preview not responding. Run: coherent fix`))
  }
}

const MAX_RESTARTS = 2

/**
 * Start dev server with error monitoring: auto-install on Module not found and restart; health check after Ready.
 */
function launchWithMonitoring(projectRoot: string, restarts: number): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const closeWatcher = startFileWatcher(projectRoot)
    const server = startDevServer(projectRoot)
    let serverReady = false
    let browserOpened = false
    let healthCheckDone = false
    let intentionalRestart = false

    server.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      process.stdout.write(output)
      if (
        !serverReady &&
        (output.includes('Local:') || output.includes('Ready in') || output.includes('localhost:3000'))
      ) {
        serverReady = true
        const urlMatch = output.match(/https?:\/\/[^\s]+/)
        const url = urlMatch ? urlMatch[0] : 'http://localhost:3000'
        if (!browserOpened) {
          browserOpened = true
          setTimeout(() => openBrowser(url).catch(() => {}), 1500)
        }
        if (output.includes('Ready in') && !healthCheckDone) {
          healthCheckDone = true
          setTimeout(() => healthCheck(DEFAULT_PORT), 2000)
        }
      }
    })

    const installingSet = new Set<string>()

    server.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString()
      process.stderr.write(data)
      if (msg.includes("Module not found: Can't resolve") && restarts < MAX_RESTARTS && !intentionalRestart) {
        const shadcnId = extractShadcnComponentFromModuleNotFound(msg)
        if (shadcnId && !installingSet.has(shadcnId)) {
          installingSet.add(shadcnId)
          console.log(chalk.yellow(`\n⚠ Missing component detected: ${shadcnId}`))
          console.log(chalk.cyan('  Auto-installing...'))
          autoInstallShadcnComponent(shadcnId, projectRoot).then(ok => {
            if (ok) {
              console.log(chalk.green(`  ✔ Installed ${shadcnId}.tsx. Restarting...`))
              intentionalRestart = true
              server.kill('SIGTERM')
              launchWithMonitoring(projectRoot, restarts + 1)
                .then(resolvePromise)
                .catch(rejectPromise)
            } else {
              console.log(chalk.red(`  ✖ Could not install ${shadcnId}. Run: npx shadcn@latest add ${shadcnId}`))
            }
          })
        } else if (!shadcnId) {
          const pkg = extractPackageFromModuleNotFound(msg)
          if (pkg && !installingSet.has(pkg)) {
            installingSet.add(pkg)
            console.log(chalk.yellow(`\n⚠ Missing package detected: ${pkg}`))
            console.log(chalk.cyan('  Auto-installing...'))
            installPackages(projectRoot, [pkg]).then(ok => {
              if (ok) {
                console.log(chalk.green(`  ✔ Installed ${pkg}. Restarting...`))
                intentionalRestart = true
                server.kill('SIGTERM')
                launchWithMonitoring(projectRoot, restarts + 1)
                  .then(resolvePromise)
                  .catch(rejectPromise)
              }
            })
          }
        }
      }
      if (msg.includes('Failed to compile')) {
        console.log(chalk.yellow('\n⚠ Compilation error detected.'))
        console.log(chalk.dim('  Hint: run "coherent fix" in another terminal to auto-fix'))
        console.log(chalk.dim('  Or:  coherent chat "fix the broken page"'))
      }
    })

    server.on('exit', code => {
      if (intentionalRestart) return
      if (code !== 0 && code !== null) {
        console.log(chalk.red(`\n❌ Dev server exited with code ${code}`))
        console.log(chalk.dim('   Check the output above. Fix and run "coherent preview" again.\n'))
      } else {
        console.log(chalk.dim('\n👋 Dev server stopped'))
      }
      process.exit(code ?? 0)
    })

    server.on('error', err => {
      if (!intentionalRestart) rejectPromise(err)
    })

    const shutdown = () => {
      closeWatcher()
      console.log(chalk.dim('\n\n🛑 Stopping dev server...'))
      server.kill('SIGTERM')
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
}

/**
 * Open browser at URL
 */
async function openBrowser(url: string): Promise<void> {
  try {
    const open = await import('open')
    await open.default(url)
  } catch (error) {
    // Browser opening is optional, don't fail if it doesn't work
    console.log(chalk.yellow(`\n⚠️  Could not open browser automatically`))
    console.log(chalk.dim(`   Please open ${url} manually`))
  }
}

/**
 * Start Next.js dev server
 */
function startDevServer(projectRoot: string): ChildProcess {
  // Check if we're in a Next.js project
  const packageJsonPath = resolve(projectRoot, 'package.json')
  if (!existsSync(packageJsonPath)) {
    throw new Error('package.json not found. Run "coherent init" first.')
  }

  // Use npm or pnpm based on what's available
  const hasPnpm = existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))
  const hasNpm = existsSync(resolve(projectRoot, 'package-lock.json'))

  // Use Turbopack to avoid webpack CSS parsing bug (SyntaxError 51:12 in globals.css)
  // pnpm uses 'pnpm dev --turbo', npm uses 'npm run dev -- --turbo'
  const command = hasPnpm ? 'pnpm' : hasNpm ? 'npm' : 'npx'
  const args = hasPnpm ? ['dev', '--turbo'] : hasNpm ? ['run', 'dev', '--', '--turbo'] : ['next', 'dev', '--turbo']

  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'pipe',
    shell: true,
  })

  return child
}

/**
 * Preview command implementation
 */
export async function previewCommand() {
  const spinner = ora('Checking project setup...').start()

  // Find project (searches up directory tree)
  const project = findConfig()
  if (!project) {
    spinner.fail('Not a Coherent project')
    exitNotCoherent()
  }

  warnIfVolatile(project.root)
  const projectRoot = project.root

  try {
    // Step 1: Check if project is initialized
    if (!checkProjectInitialized(projectRoot)) {
      spinner.fail('Project not initialized')
      console.log(chalk.red('\n❌ Project not found'))
      console.log(chalk.dim('Run "coherent init" first to create a project.'))
      process.exit(1)
    }

    spinner.text = 'Checking dependencies...'

    // Step 2: Install dependencies if needed
    if (!checkDependenciesInstalled(projectRoot)) {
      spinner.warn('Dependencies not installed')
      const pm = getPackageManager(projectRoot)
      const installCommand = pm === 'pnpm' ? 'pnpm install' : 'npm install'
      console.log(chalk.yellow('\n⚠️  Dependencies not installed'))
      console.log(chalk.cyan(`\n   Running ${installCommand}...\n`))
      const ok = await runInstall(projectRoot)
      if (!ok) {
        console.error(chalk.red('\n❌ Install failed. Fix errors above and run "coherent preview" again.\n'))
        process.exit(1)
      }
      console.log(chalk.green('\n✅ Dependencies installed\n'))
    } else {
      spinner.succeed('Dependencies installed')
    }

    // Step 2.5: Fix globals.css if needed (auto-fix old format)
    if (needsGlobalsFix(projectRoot)) {
      spinner.text = 'Fixing globals.css...'
      try {
        const dsm = new DesignSystemManager(resolve(projectRoot, 'design-system.config.ts'))
        await dsm.load()
        const config = dsm.getConfig()
        fixGlobalsCss(projectRoot, config)
        spinner.succeed('Fixed globals.css')
      } catch (error) {
        spinner.warn('Could not auto-fix globals.css')
      }
    }

    if (isTailwindV4(projectRoot)) {
      const globalsPath = resolve(projectRoot, 'app', 'globals.css')
      if (existsSync(globalsPath)) {
        const globalsContent = readFileSync(globalsPath, 'utf-8')
        const cssIssues = validateV4GlobalsCss(globalsContent)
        if (cssIssues.length > 0) {
          console.log(chalk.yellow('\n⚠️  globals.css validation warnings:'))
          for (const issue of cssIssues) {
            console.log(chalk.yellow(`   • ${issue}`))
          }
          console.log(chalk.dim('   Run "coherent chat" to regenerate globals.css\n'))
        }
      }
    }

    // Step 2.6: Pre-flight deps, clear cache, validate syntax
    spinner.text = 'Pre-flight: dependencies and syntax...'
    await preflightDependencyCheck(projectRoot)
    clearStaleCache(projectRoot)
    await validateSyntax(projectRoot)
    await fixMissingComponentExports(projectRoot)
    await backfillPageAnalysis(projectRoot)
    spinner.succeed('Project ready')
    console.log(chalk.dim('  💡 Edited files manually? Run `coherent sync` to update the Design System.\n'))

    // Step 3: Start dev server with error monitoring and health check
    console.log(chalk.blue('\n🚀 Starting Next.js dev server...\n'))
    await launchWithMonitoring(projectRoot, 0)
  } catch (error) {
    spinner.fail('Failed to start dev server')
    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ ${error.message}`))

      if (error.message.includes('package.json')) {
        console.log(chalk.yellow("\n💡 Tip: Make sure you're in a Coherent project directory."))
        console.log(chalk.dim('   Run "coherent init" to create a new project.'))
      }
    } else {
      console.error(chalk.red('Unknown error occurred'))
    }
    process.exit(1)
  }
}
