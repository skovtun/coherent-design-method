/**
 * Init Command
 *
 * Initializes a new Coherent project with minimal configuration.
 * If the current folder has no Next.js (no package.json with next), runs create-next-app
 * non-interactively (--yes), then adds the Coherent layer (design-system config, pages, docs).
 * Supports both Tailwind v3 and v4 — auto-detects and generates compatible configs.
 */

import chalk from 'chalk'
import ora from 'ora'
import prompts from 'prompts'
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { execSync } from 'child_process'
import { warnIfVolatile } from '../utils/find-config.js'
import { writeFile } from '../utils/files.js'
import { fileExistsAsync } from '../utils/files.js'
import type { DesignSystemConfig } from '@getcoherent/core'
import { ProjectScaffolder, ComponentGenerator } from '@getcoherent/core'
import { getComponentProvider } from '../providers/index.js'
import { createMinimalConfig } from '../utils/minimal-config.js'
import { showSuccessMessage } from '../utils/success-message.js'
import { appendRecentChanges } from '../utils/recent-changes.js'
import { COHERENT_REQUIRED_PACKAGES } from '../utils/self-heal.js'
import { getWelcomeMarkdown, generateWelcomeComponent } from '../utils/welcome-content.js'
import { setupApiKey, hasApiKey } from '../utils/api-key-setup.js'
import { writeAllHarnessFiles } from '../utils/harness-context.js'
import { isTailwindV4, generateV4GlobalsCss } from '../utils/tailwind-version.js'
import { detectEditors, detectClaudeCodeUserLevel } from '../utils/editor-detection.js'
import type { SuccessMode } from '../utils/success-message.js'
import { cwd } from 'process'
import { toKebabCase, toTitleCase } from '../utils/strings.js'

export interface InitOptions {
  /** Skip API key prompt; emit skill-mode CTA. */
  skillMode?: boolean
  /** Force API key setup; emit chat CTA. */
  apiMode?: boolean
  /** API key setup optional; emit both CTAs. */
  both?: boolean
}

/** Whether current directory has a package.json with next (dependencies or devDependencies). */
function hasNextInPackageJson(projectPath: string): boolean {
  const pkgPath = join(projectPath, 'package.json')
  if (!existsSync(pkgPath)) return false
  try {
    const json = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const deps = { ...json.dependencies, ...json.devDependencies }
    return typeof deps?.next === 'string'
  } catch {
    return false
  }
}

/** Remove files that conflict with create-next-app in an existing directory. */
function cleanConflictingFiles(projectPath: string): void {
  const conflicts = ['.next', '.coherent', '.cursorrules', '.eslintrc.json', 'CLAUDE.md', '.claude', '.vscode']
  for (const name of conflicts) {
    const fullPath = join(projectPath, name)
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true })
    }
  }
}

/** Create Next.js app non-interactively. No prompts (React Compiler, import alias, etc.). */
function runCreateNextApp(projectPath: string): void {
  cleanConflictingFiles(projectPath)

  const envPath = join(projectPath, '.env')
  const envBackup = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : null
  if (envBackup !== null) rmSync(envPath, { force: true })

  const cmd =
    'npx --yes create-next-app@15.2.4 . --typescript --tailwind --eslint --app --no-src-dir --no-turbopack --yes'
  execSync(cmd, { cwd: projectPath, stdio: 'inherit' })

  if (envBackup !== null) {
    const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''
    writeFileSync(envPath, existing ? existing + '\n' + envBackup : envBackup, 'utf-8')
  }
}

/** Ensure lib/utils.ts (cn) and components/ui/ exist for Coherent layer. */
async function ensureCoherentPrerequisites(projectPath: string): Promise<void> {
  const libPath = join(projectPath, 'lib')
  const utilsPath = join(projectPath, 'lib', 'utils.ts')
  const componentsUiPath = join(projectPath, 'components', 'ui')
  if (!existsSync(utilsPath)) {
    if (!existsSync(libPath)) mkdirSync(libPath, { recursive: true })
    const cnContent = `import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`
    await writeFile(utilsPath, cnContent)
  }
  if (!existsSync(componentsUiPath)) mkdirSync(componentsUiPath, { recursive: true })
}

/**
 * Ensure registry component files exist (e.g. components/ui/button.tsx)
 * so pages that import from @/components/ui/button etc. resolve.
 */
async function ensureRegistryComponents(config: DesignSystemConfig, projectPath: string): Promise<void> {
  const provider = getComponentProvider()

  const baseComponents = ['button', 'card', 'input', 'label', 'switch']
  await provider.installBatch(baseComponents, projectPath)

  const generator = new ComponentGenerator(config)
  const uiDir = join(projectPath, 'components', 'ui')
  if (!existsSync(uiDir)) mkdirSync(uiDir, { recursive: true })
  for (const comp of config.components) {
    if (comp.source === 'shadcn') continue
    const fileName = toKebabCase(comp.name) + '.tsx'
    const filePath = join(uiDir, fileName)
    if (existsSync(filePath)) continue
    const code = await generator.generate(comp)
    await writeFile(filePath, code)
  }
}

/**
 * Generate TypeScript config file content from DesignSystemConfig
 */
function generateConfigFile(config: DesignSystemConfig): string {
  // Format JSON with proper indentation
  const jsonString = JSON.stringify(config, null, 2)

  return `/**
 * Design System Configuration
 * 
 * This file is auto-generated by Coherent Design Method.
 * Do not edit manually - use 'coherent chat' command to modify.
 */

export const config = ${jsonString} as const
`
}

/**
 * Resolve the init mode from user-supplied flags. Precedence: explicit flags
 * beat auto-detect. `--both` beats `--skill-mode` beats `--api-mode` when the
 * user passes more than one (same shape as most CLIs on conflicting flags).
 *
 * When no flag is set we auto-pick based on two signals:
 *   - Claude Code detected (`.claude/` in repo) → skill CTA is reachable.
 *   - API key already in env → chat CTA is reachable.
 * If both reachable, show both. If only one, show only that one.
 */
export function resolveInitMode(
  options: InitOptions,
  signals: { hasClaudeCode: boolean; hasApiKey: boolean },
): SuccessMode {
  if (options.both) return 'both'
  if (options.skillMode) return 'skill'
  if (options.apiMode) return 'api'
  if (signals.hasClaudeCode && signals.hasApiKey) return 'both'
  if (signals.hasClaudeCode) return 'skill'
  return 'api'
}

export async function initCommand(name?: string, options: InitOptions = {}) {
  try {
    // Step 0: If name provided, create directory and cd into it
    if (name) {
      if (name.includes('..') || name.startsWith('/') || name.startsWith('\\')) {
        console.error(
          chalk.red(`\n❌ Invalid project name: "${name}"\n   Name must not contain ".." or start with "/" or "\\".`),
        )
        process.exit(1)
      }
      const targetDir = join(cwd(), name)
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true })
      }
      process.chdir(targetDir)
    }

    let projectPath: string
    try {
      projectPath = cwd()
      if (!existsSync(projectPath)) {
        throw new Error('ENOENT')
      }
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.message === 'ENOENT') {
        console.error(chalk.red('\n❌ Current directory is not accessible.\n'))
        console.log(chalk.dim('The directory may have been deleted or moved.'))
        console.log(chalk.cyan('\n💡 Fix:'))
        console.log(chalk.white('   1. Open a new terminal'))
        console.log(chalk.white('   2. Go to a valid directory:'))
        console.log(chalk.yellow('      $ cd ~'))
        console.log(chalk.yellow('      $ mkdir my-project && cd my-project'))
        console.log(chalk.white('   3. Run:'))
        console.log(chalk.yellow('      $ coherent init\n'))
        process.exit(1)
      }
      throw err
    }

    console.log(chalk.cyan('\n🎨 Initializing Coherent Design Method...\n'))

    // Step 1: Check if already initialized
    if (await fileExistsAsync('./design-system.config.ts')) {
      console.log(chalk.green('\n✨ Project already initialized!\n'))
      console.log('Your Coherent design system is ready at:')
      console.log(chalk.cyan('📁 ./design-system.config.ts\n'))
      console.log(chalk.cyan('🚀 What you can do now:\n'))
      console.log(chalk.white('   1. Continue building:'))
      console.log(chalk.yellow('      $ coherent chat "add a dashboard page"'))
      console.log(chalk.yellow('      $ coherent chat "make buttons rounded"\n'))
      console.log(chalk.white('   2. Start dev server:'))
      console.log(chalk.yellow('      $ npm run dev'))
      console.log(chalk.gray('      → Preview at http://localhost:3000\n'))
      console.log(chalk.white('   3. Deploy to production:'))
      console.log(chalk.yellow('      $ coherent export\n'))
      console.log(chalk.cyan('💡 Want to start fresh?'))
      console.log(chalk.yellow('   $ rm design-system.config.ts'))
      console.log(chalk.yellow('   $ coherent init\n'))
      console.log(chalk.blue('📖 Learn more: https://github.com/skovtun/coherent-design-method\n'))
      process.exit(0)
    }

    // Step 2: If no Next.js, create it non-interactively (no prompts)
    const hasNext = hasNextInPackageJson(projectPath)
    let usedCreateNextApp = false
    if (!hasNext) {
      const cnaSpinner = ora('Creating Next.js app (non-interactive)...').start()
      cnaSpinner.stop()
      runCreateNextApp(projectPath)
      usedCreateNextApp = true
    }

    // Step 2.5: Ask about auto-scaffolding (skip in non-interactive / CI mode)
    let autoScaffoldValue = true
    if (process.stdin.isTTY) {
      const { autoScaffold: answer } = await prompts({
        type: 'select',
        name: 'autoScaffold',
        message: 'Auto-create linked pages? (e.g. Login → Sign Up, Forgot Password)',
        choices: [
          { title: 'Yes', value: true },
          { title: 'No', value: false },
        ],
        initial: 0,
      })
      autoScaffoldValue = answer ?? true
    }

    // Step 3: Create minimal config
    let appName: string | undefined
    if (name) {
      appName = toTitleCase(name)
    } else {
      try {
        const pkgPath = join(projectPath, 'package.json')
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
          if (typeof pkg.name === 'string' && pkg.name) {
            appName = toTitleCase(pkg.name)
          }
        }
      } catch {
        /* ignore */
      }
      if (!appName) appName = toTitleCase(basename(projectPath))
    }

    const spinner = ora('Creating design system...').start()
    const config = createMinimalConfig(appName)
    config.settings.autoScaffold = autoScaffoldValue
    const configContent = generateConfigFile(config)
    await writeFile('./design-system.config.ts', configContent)
    spinner.succeed('Design system created')

    const scaffolder = new ProjectScaffolder(config, projectPath)

    if (usedCreateNextApp) {
      // Add Coherent layer on top of create-next-app output
      await ensureCoherentPrerequisites(projectPath)

      // Install required packages for Coherent (icons, CVA, clsx, tailwind-merge)
      const depsSpinner = ora('Installing component dependencies...').start()
      try {
        execSync(`npm install --legacy-peer-deps ${COHERENT_REQUIRED_PACKAGES.join(' ')}`, {
          cwd: projectPath,
          stdio: 'pipe',
        })
        depsSpinner.succeed('Component dependencies installed')
      } catch {
        depsSpinner.fail('Failed to install component dependencies')
        console.log(chalk.yellow(`  Run manually: npm install ${COHERENT_REQUIRED_PACKAGES.join(' ')}`))
      }

      // Ensure registry components exist (button, card) so @/components/card etc. resolve
      await ensureRegistryComponents(config, projectPath)

      const usesV4 = isTailwindV4(projectPath)

      if (usesV4) {
        // Tailwind v4: keep v4 runtime & PostCSS plugin, write v4-compatible globals.css
        const v4Css = generateV4GlobalsCss(config)
        await writeFile(join(projectPath, 'app', 'globals.css'), v4Css)
      } else {
        // Tailwind v3: overwrite globals.css, tailwind.config, and postcss.config
        await scaffolder.generateGlobalsCss()
        await scaffolder.generateTailwindConfigTs()

        const postcssContent = `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config
`
        await writeFile(join(projectPath, 'postcss.config.mjs'), postcssContent)
      }

      // Replace root layout with Coherent layout + AppNav (floating Design System button)
      await scaffolder.generateRootLayout()

      // Configure Next.js to allow external placeholder images (avatars, etc.)
      await configureNextImages(projectPath)

      // Create (app) route group layout for consistent page width
      await createAppRouteGroupLayout(projectPath)

      // Overwrite app/page.tsx with Coherent welcome page (replace default Next.js page)
      const welcomeMarkdown = getWelcomeMarkdown()
      const homePageContent = generateWelcomeComponent(welcomeMarkdown)
      await writeFile(join(projectPath, 'app', 'page.tsx'), homePageContent)
      const designSystemSpinner = ora('Creating design system pages...').start()
      await scaffolder.generateDesignSystemPages()
      designSystemSpinner.succeed('Design system pages created')
      const docsSpinner = ora('Creating documentation pages...').start()
      await scaffolder.generateDocsPages()
      docsSpinner.succeed('Documentation pages created')
    } else {
      // Full scaffold (existing Next.js or legacy path)
      const scaffoldSpinner = ora('Generating project structure...').start()
      const welcomeMarkdown = getWelcomeMarkdown()
      const homePageContent = generateWelcomeComponent(welcomeMarkdown)
      await scaffolder.scaffold({ homePageContent })
      scaffoldSpinner.succeed('Project structure created')

      // Welcome page and Coherent components need required packages
      const depsSpinner = ora('Installing component dependencies...').start()
      try {
        execSync(`npm install --legacy-peer-deps ${COHERENT_REQUIRED_PACKAGES.join(' ')}`, {
          cwd: projectPath,
          stdio: 'pipe',
        })
        depsSpinner.succeed('Component dependencies installed')
      } catch {
        depsSpinner.fail('Failed to install component dependencies')
        console.log(chalk.yellow(`  Run manually: npm install ${COHERENT_REQUIRED_PACKAGES.join(' ')}`))
      }

      await ensureRegistryComponents(config, projectPath)
      await createAppRouteGroupLayout(projectPath)

      const designSystemSpinner = ora('Creating design system pages...').start()
      await scaffolder.generateDesignSystemPages()
      designSystemSpinner.succeed('Design system pages created')
      const docsSpinner = ora('Creating documentation pages...').start()
      await scaffolder.generateDocsPages()
      docsSpinner.succeed('Documentation pages created')
    }

    // Record initial change for status
    appendRecentChanges(projectPath, [
      { type: 'init', description: 'Project initialized', timestamp: new Date().toISOString() },
    ])

    // Detect editors FIRST — BEFORE the API key prompt, so `resolveInitMode()`
    // can pick `skill` when the user already has Claude Code and never has
    // to be prompted for a key they don't need.
    //
    // Two layers (codex review R1 P2 + R2 P1 #5):
    //
    //   1. Project-local detection (`detectEditors`) — picks up any editor
    //      marker dirs (`.cursor/`, `.continue/`, `.windsurf/`, `.claude/`)
    //      that already exist in the project. Useful for `coherent init`
    //      run against an existing codebase, not a fresh directory.
    //
    //   2. User-level detection (`detectClaudeCodeUserLevel`) — checks
    //      `~/.claude/`, `$PATH` for `claude` binary, `$CLAUDE_CODE_SESSION`
    //      env. This is the path that matters for `coherent init my-app`
    //      against a brand-new directory, where the project marker will
    //      never exist on first run.
    //
    // Historical bug (R1 P2): detection used to run AFTER writeAllHarnessFiles,
    // which unconditionally creates `.claude/` — making detection always see
    // claude-code even for users who didn't have it. Snapshot BEFORE harness
    // write.
    const preWriteDetection = detectEditors(projectPath)
    const hasClaudeCode = preWriteDetection.withAdapter.includes('claude-code') || detectClaudeCodeUserLevel()

    // Resolve mode once, up front, so the API-key prompt branch below sees
    // the final answer. Previously we auto-detected AFTER the API key
    // prompt fired, so the skill flow was unreachable in practice (codex
    // R2 P1 #4).
    const resolvedMode = resolveInitMode(options, { hasClaudeCode, hasApiKey: hasApiKey() })

    // API key setup. Skip the prompt entirely for skill mode — the whole
    // point of the no-key flow is that the user doesn't need one. Both /
    // api mode still prompt when no key is present.
    const skipApiKey = resolvedMode === 'skill'
    if (!skipApiKey && !hasApiKey()) {
      await setupApiKey(projectPath)
    }

    // Generate .cursorrules (Cursor) and CLAUDE.md + .claude/* (Claude Code)
    try {
      await writeAllHarnessFiles(projectPath)
    } catch (e) {
      if (process.env.COHERENT_DEBUG === '1') console.error(chalk.dim('Could not write .cursorrules / CLAUDE.md:'), e)
    }

    warnIfVolatile(projectPath)
    showSuccessMessage('.', {
      mode: resolvedMode,
      detectedEditors: preWriteDetection.detected,
      v2TargetEditors: preWriteDetection.v2Target,
    })
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : 'Unknown error')
    process.exit(1)
  }
}

async function configureNextImages(projectPath: string): Promise<void> {
  const tsPath = join(projectPath, 'next.config.ts')
  const jsPath = join(projectPath, 'next.config.js')
  const mjsPath = join(projectPath, 'next.config.mjs')

  let configPath = ''
  if (existsSync(tsPath)) configPath = tsPath
  else if (existsSync(mjsPath)) configPath = mjsPath
  else if (existsSync(jsPath)) configPath = jsPath
  else return

  const content = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
`
  await writeFile(configPath, content)
}

async function createAppRouteGroupLayout(projectPath: string): Promise<void> {
  const dir = join(projectPath, 'app', '(app)')
  mkdirSync(dir, { recursive: true })
  const layoutCode = `export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {children}
    </main>
  )
}
`
  await writeFile(join(dir, 'layout.tsx'), layoutCode)
}
