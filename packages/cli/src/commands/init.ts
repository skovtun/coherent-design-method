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
import { execSync, spawn } from 'child_process'
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

/**
 * Bordered hero header rendered at the very top of `coherent init`.
 *
 * Vite/Claude-Code aesthetic: a thin unicode box, the version inlined in the
 * top border, and a 2×2 block-grid logo built from Unicode full/shade blocks
 * (█ / ▒) that approximates the SVG favicon. Users with terminals narrower
 * than 60 columns get a plain 2-line fallback so the box never wraps.
 */
function printInitHeader(version: string): void {
  const cols = process.stdout.columns ?? 80
  const logoTopPlain = '██ ▒▒'
  const logoBotPlain = '▒▒ ██'

  // Non-TTY (Claude Code's Bash tool, CI, piped output) gets a single-line
  // header. The boxed banner relies on stable Unicode box-drawing alignment
  // and a fixed column count — both of which break in buffered/captured
  // output displays. Top-tier CLIs (Vite/Bun/shadcn) start with a one-liner
  // anyway; we only earn the box when there's a real terminal raster.
  if (!process.stdout.isTTY || cols < 60) {
    console.log('')
    console.log(
      `  ${chalk.bold('Coherent')} ${chalk.dim('v' + version)}  ${chalk.dim('— Describe an app. Get a product.')}`,
    )
    console.log('')
    return
  }

  const innerWidth = 58
  const title = ` Coherent ${chalk.dim('v' + version)} `
  const titleVisibleLen = ` Coherent v${version} `.length
  const dashesAfterTitle = Math.max(0, innerWidth - 2 - titleVisibleLen)
  const top = chalk.dim('╭─') + chalk.bold(title) + chalk.dim('─'.repeat(dashesAfterTitle)) + chalk.dim('╮')

  const pad = (s: string, visibleLen: number): string => s + ' '.repeat(Math.max(0, innerWidth - visibleLen))

  const empty = chalk.dim('│') + ' '.repeat(innerWidth) + chalk.dim('│')
  const logo1 = chalk.blue('██') + ' ' + chalk.blue.dim('▒▒')
  const logo2 = chalk.blue.dim('▒▒') + ' ' + chalk.blue('██')
  // Two-level tagline: tagline + subtitle. Tagline is the hook,
  // subtitle unpacks the promise (what you get). Subtitle is kept
  // short (<58 chars) to fit the CLI banner; the scaffolded welcome
  // page carries the longer form with "design system built in"
  // since it has more room to breathe.
  const tag1Plain = 'Describe an app. Get a product.'
  const tag2Plain = 'Consistent, interactive, multi-page UI.'
  const tag1 = chalk.blue(tag1Plain)
  const tag2 = chalk.blue(tag2Plain)

  const row1 =
    chalk.dim('│') + pad(`   ${logo1}   ${tag1}`, 3 + logoTopPlain.length + 3 + tag1Plain.length) + chalk.dim('│')
  const row2 =
    chalk.dim('│') + pad(`   ${logo2}   ${tag2}`, 3 + logoBotPlain.length + 3 + tag2Plain.length) + chalk.dim('│')
  const bottom = chalk.dim('╰' + '─'.repeat(innerWidth) + '╯')

  console.log('')
  console.log(top)
  console.log(empty)
  console.log(row1)
  console.log(row2)
  console.log(empty)
  console.log(bottom)
  console.log('')
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

/**
 * Create Next.js app non-interactively. No prompts (React Compiler, import alias, etc.).
 *
 * Pinned to a CVE-patched 15.x release (CVE-2025-66478 fixed in 15.5.x). The
 * npm-side noise — funding ads, audit prompts, update-notifier — is silenced
 * via env vars.
 *
 * Additionally, this function line-filters create-next-app's own stdout so
 * the user doesn't see details they can't act on: which pm is being used,
 * the template slug (we only ship one), the dependency package list, the
 * create-next-app update-notifier banner, and the duplicate "Initialized a
 * git repository" message (Coherent's own scaffolder does its own git work
 * separately). We keep real-time streaming (line by line) so the ~15s install
 * still shows progress.
 */
const NOISE_PATTERNS: RegExp[] = [
  /^Using (npm|pnpm|yarn|bun)\.\s*$/i,
  /^Initializing project with template:/i,
  /^Installing dependencies:\s*$/i,
  /^Installing devDependencies:\s*$/i,
  /^- [a-z@][a-z0-9@/_.-]*\s*$/i,
  /A new version of `?create-next-app`? is available/i,
  /^You can update by running:/i,
  /^\s*npm i -g create-next-app\s*$/i,
  /^Initialized a git repository\.\s*$/i,
  /^Success! Created .* at /i,
  // The heartbeat spinner (see below) covers the "creating a new Next.js app"
  // moment with a progress UI — letting the raw text through would collide
  // visually with the animated spinner frame.
  /^Creating a new Next\.js app in/i,
  // npm's own warnings about transitive-dep engine mismatches and funding —
  // our env vars silence most, but macOS npm still surfaces a few through
  // stdout. Filtering them here keeps the install-phase stdout truly quiet
  // so the stderr-hosted spinner can animate without cursor interference.
  /^npm warn /i,
  /^npm notice /i,
]

function runCreateNextApp(projectPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    cleanConflictingFiles(projectPath)

    const envPath = join(projectPath, '.env')
    const envBackup = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : null
    if (envBackup !== null) rmSync(envPath, { force: true })

    const args = [
      '--yes',
      'create-next-app@15.5.15',
      '.',
      '--typescript',
      '--tailwind',
      '--eslint',
      '--app',
      '--no-src-dir',
      '--no-turbopack',
      '--yes',
    ]

    const proc = spawn('npx', args, {
      cwd: projectPath,
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: '1',
        npm_config_fund: 'false',
        npm_config_audit: 'false',
        npm_config_update_notifier: 'false',
        npm_config_loglevel: 'error',
      },
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: process.platform === 'win32',
    })

    let buffer = ''
    // Initialized to `true` so the very first blank line in create-next-app's
    // output is suppressed — that first blank, if let through, would collide
    // with the spinner's opening frame on stderr and cause the cursor-tracking
    // to drift. After the first non-empty line arrives, this flips back to
    // `false` and normal collapse resumes.
    let prevBlank = true
    let seenAnyOutput = false
    // Animated progress spinner, on STDERR. Running ora on stderr while the
    // child's filtered output goes to stdout means they use separate streams,
    // so ora's cursor-manipulation frames don't compete with the filtered
    // stdout writes. The filter is also tightened (first blank suppressed,
    // npm-warn lines suppressed) so stdout is genuinely silent during the
    // install phase — which is the condition under which ora's cursor math
    // stays consistent.
    const installSpinner = ora({
      text: 'Installing dependencies (takes ~15s)...',
      prefixText: ' ',
      stream: process.stderr,
    }).start()
    const stopInstallSpinner = (): void => {
      if (installSpinner.isSpinning) installSpinner.stop()
    }

    const handleChunk = (chunk: Buffer): void => {
      buffer += chunk.toString('utf-8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const isEmpty = /^\s*$/.test(line)
        const isNoise = !isEmpty && NOISE_PATTERNS.some(p => p.test(line))
        if (isNoise) continue
        if (isEmpty) {
          if (prevBlank) continue
          prevBlank = true
        } else {
          prevBlank = false
          // First meaningful output means install has progressed past the
          // quiet phase — stop the spinner so its frames don't overlap
          // with the real output that's about to stream.
          if (!seenAnyOutput) {
            stopInstallSpinner()
            seenAnyOutput = true
          }
        }
        process.stdout.write(line + '\n')
      }
    }

    proc.stdout?.on('data', handleChunk)

    const finalize = (err?: Error): void => {
      stopInstallSpinner()
      if (buffer && !NOISE_PATTERNS.some(p => p.test(buffer))) {
        process.stdout.write(buffer + '\n')
      }
      if (envBackup !== null) {
        const existing = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : ''
        writeFileSync(envPath, existing ? existing + '\n' + envBackup : envBackup, 'utf-8')
      }
      if (err) reject(err)
    }

    proc.on('error', err => finalize(err))
    proc.on('close', code => {
      if (code === 0) {
        finalize()
        resolve()
      } else {
        finalize(new Error(`create-next-app exited with code ${code}`))
      }
    })
  })
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
 *
 * For the no-flag, no-key case we now prompt interactively in `initCommand`
 * (see `promptForMode`) — this resolver is the synchronous fallback / auto-
 * decide path used when prompting is impossible (CI, non-TTY) or the user
 * passed an explicit flag.
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

/**
 * Interactive picker shown when neither flag nor env key gives us a clear
 * answer. We always offer all three options regardless of detection — even a
 * Claude Code user might want API mode for CI / scripts / batch generation,
 * and an API user might still want the skill installed for ad-hoc Claude Code
 * sessions later. Default cursor lands on the cheapest path: skill if Claude
 * Code is detected (free with subscription), api otherwise.
 *
 * Returns the auto-decide value when prompts is suppressed (non-TTY / CI) so
 * `coherent init` never hangs in scripted contexts.
 */
async function promptForMode(hasClaudeCode: boolean): Promise<SuccessMode> {
  const fallback: SuccessMode = hasClaudeCode ? 'skill' : 'api'
  if (!process.stdout.isTTY) return fallback

  const response = await prompts(
    {
      type: 'select',
      name: 'mode',
      message: 'How do you want to drive Coherent?',
      choices: [
        {
          title: 'Claude Code skill — no API key (free with Claude subscription)',
          value: 'skill',
          description: 'Generation runs inside Claude Code via /coherent-chat',
        },
        {
          title: 'CLI with API key — Anthropic or OpenAI (pay per call)',
          value: 'api',
          description: 'Generation runs from your terminal via `coherent chat "..."`',
        },
        {
          title: 'Both — set up API key, also install the Claude Code skill',
          value: 'both',
          description: 'Useful if you might use either path or run CI/scripts',
        },
      ],
      initial: hasClaudeCode ? 0 : 1,
    },
    { onCancel: () => process.exit(0) },
  )
  return (response.mode as SuccessMode | undefined) ?? fallback
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
        console.log(chalk.bold('\n  Fix:'))
        console.log(chalk.dim('    1. Open a new terminal'))
        console.log(chalk.dim('    2. Go to a valid directory:'))
        console.log('       ' + chalk.green('cd ~'))
        console.log('       ' + chalk.green('mkdir my-project && cd my-project'))
        console.log(chalk.dim('    3. Run:'))
        console.log('       ' + chalk.green('coherent init') + '\n')
        process.exit(1)
      }
      throw err
    }

    const initStartMs = Date.now()
    const { CLI_VERSION } = await import('@getcoherent/core')
    printInitHeader(CLI_VERSION)

    // Step 1: Check if already initialized
    if (await fileExistsAsync('./design-system.config.ts')) {
      console.log(`\n  ${chalk.magenta('✨ Project already initialized')}\n`)
      console.log(chalk.dim('  Config: ') + './design-system.config.ts\n')
      console.log(chalk.bold('  Continue building:'))
      console.log('    ' + chalk.green('coherent chat "add a dashboard page"'))
      console.log('    ' + chalk.green('coherent chat "make buttons rounded"') + '\n')
      console.log(chalk.bold('  Preview:'))
      console.log('    ' + chalk.green('coherent preview') + chalk.dim('   → http://localhost:3000') + '\n')
      console.log(chalk.bold('  Ship it:'))
      console.log('    ' + chalk.green('coherent export') + '\n')
      console.log(chalk.dim('  Start fresh: ') + chalk.green('rm design-system.config.ts && coherent init'))
      console.log(
        chalk.dim('  Docs: ') + chalk.dim.underline('https://github.com/skovtun/coherent-design-method') + '\n',
      )
      process.exit(0)
    }

    // Step 2: If no Next.js, create it non-interactively (no prompts).
    // `runCreateNextApp` streams filtered stdout line-by-line — the user still
    // sees progress during the ~15s install, they just don't see the noise.
    const hasNext = hasNextInPackageJson(projectPath)
    let usedCreateNextApp = false
    if (!hasNext) {
      console.log(chalk.dim('Scaffolding Next.js foundation...'))
      await runCreateNextApp(projectPath)
      usedCreateNextApp = true
    }

    // Step 3: Create minimal config
    // NOTE: `settings.autoScaffold` default is false (see minimal-config.ts). The
    // chat-rail linked-pages feature (`coherent chat` auto-expanding Login → Sign
    // Up + Forgot Password) is opt-in — users who want it flip the setting in
    // `design-system.config.ts`. Prompting at init for a chat-only setting that
    // skill-mode users never see was confusing UX and is removed in v0.9.0.
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

    const config = createMinimalConfig(appName)
    const configContent = generateConfigFile(config)
    await writeFile('./design-system.config.ts', configContent)

    // Compute the welcome-page mode EARLY (user-level detection only, since
    // project-level detectEditors runs on the scaffolded tree which doesn't
    // exist yet). Passed into generateWelcomeComponent so the scaffolded home
    // page shows `/coherent-chat` or `coherent chat` in its step examples
    // to match the user's actual path — otherwise API-mode users would see
    // slash commands they can't run.
    const welcomeMode = resolveInitMode(options, {
      hasClaudeCode: detectClaudeCodeUserLevel(),
      hasApiKey: hasApiKey(),
    })

    const scaffolder = new ProjectScaffolder(config, projectPath)

    // Single compound spinner for the entire Coherent layer setup. The
    // previous flow surfaced four separate spinners (design-system config,
    // dependency install, DS pages, docs pages) which duplicated content the
    // final summary already lists. The slowest step is the `npm install`
    // (~10-20s) so the spinner label calls it out explicitly.
    const layerSpinner = ora('Setting up Coherent layer (installing deps + pages + docs)...').start()
    try {
      if (usedCreateNextApp) {
        await ensureCoherentPrerequisites(projectPath)

        try {
          execSync(`npm install --legacy-peer-deps ${COHERENT_REQUIRED_PACKAGES.join(' ')}`, {
            cwd: projectPath,
            stdio: 'pipe',
            env: {
              ...process.env,
              NO_UPDATE_NOTIFIER: '1',
              npm_config_fund: 'false',
              npm_config_audit: 'false',
              npm_config_loglevel: 'error',
            },
          })
        } catch {
          layerSpinner.fail('Component dependency install failed')
          console.log(chalk.yellow(`  Run manually: npm install ${COHERENT_REQUIRED_PACKAGES.join(' ')}`))
          throw new Error('npm install failed')
        }

        await ensureRegistryComponents(config, projectPath)

        const usesV4 = isTailwindV4(projectPath)
        if (usesV4) {
          const v4Css = generateV4GlobalsCss(config)
          await writeFile(join(projectPath, 'app', 'globals.css'), v4Css)
        } else {
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

        await scaffolder.generateRootLayout()
        await configureNextImages(projectPath)
        await createAppRouteGroupLayout(projectPath)

        const welcomeMarkdown = getWelcomeMarkdown()
        const homePageContent = generateWelcomeComponent(welcomeMarkdown, welcomeMode)
        await writeFile(join(projectPath, 'app', 'page.tsx'), homePageContent)
        await scaffolder.generateDesignSystemPages()
        await scaffolder.generateDocsPages()
      } else {
        const welcomeMarkdown = getWelcomeMarkdown()
        const homePageContent = generateWelcomeComponent(welcomeMarkdown, welcomeMode)
        await scaffolder.scaffold({ homePageContent })

        try {
          execSync(`npm install --legacy-peer-deps ${COHERENT_REQUIRED_PACKAGES.join(' ')}`, {
            cwd: projectPath,
            stdio: 'pipe',
            env: {
              ...process.env,
              NO_UPDATE_NOTIFIER: '1',
              npm_config_fund: 'false',
              npm_config_audit: 'false',
              npm_config_loglevel: 'error',
            },
          })
        } catch {
          layerSpinner.fail('Component dependency install failed')
          console.log(chalk.yellow(`  Run manually: npm install ${COHERENT_REQUIRED_PACKAGES.join(' ')}`))
          throw new Error('npm install failed')
        }

        await ensureRegistryComponents(config, projectPath)
        await createAppRouteGroupLayout(projectPath)
        await scaffolder.generateDesignSystemPages()
        await scaffolder.generateDocsPages()
      }
      // Spinner stops silently — the final success signal is the ✨ line in
      // showSuccessMessage, and duplicating "ready" markers reads as two
      // separate completion events to a first-time user.
      layerSpinner.stop()
    } catch (e) {
      if (layerSpinner.isSpinning) layerSpinner.fail('Coherent layer setup failed')
      throw e
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
    //
    // Decision tree:
    //   1. Explicit flag (`--skill-mode` / `--api-mode` / `--both`) wins — no prompt.
    //   2. API key already in env / .env — auto-pick based on Claude Code signal.
    //   3. Otherwise — ask the user. Skill is only "free" when Claude Code is
    //      installed AND the user wants to drive it from there; many users
    //      have Claude Code but want API for CI / scripts / batch. Asking is
    //      more honest than silently defaulting to skill.
    const flagPassed = options.skillMode || options.apiMode || options.both
    const keyPresent = hasApiKey()
    const resolvedMode: SuccessMode = flagPassed
      ? resolveInitMode(options, { hasClaudeCode, hasApiKey: keyPresent })
      : keyPresent
        ? hasClaudeCode
          ? 'both'
          : 'api'
        : await promptForMode(hasClaudeCode)

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
    const elapsedMs = Date.now() - initStartMs
    showSuccessMessage('.', {
      mode: resolvedMode,
      detectedEditors: preWriteDetection.detected,
      v2TargetEditors: preWriteDetection.v2Target,
      elapsedMs,
      projectName: name,
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
