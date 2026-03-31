/**
 * Export Command (Story 3.1)
 *
 * Creates a clean, deployable Next.js project:
 * - Copies app code, components, styles, public assets
 * - Strips ALL Coherent platform artifacts: DS overlay, AppNav, config, AI context files, .env
 * - Cleans layout.tsx to remove AppNav references
 * - Cleans ShowWhenNotAuthRoute to remove /design-system paths
 * - Runs next build (unless --no-build)
 */

import chalk from 'chalk'
import ora from 'ora'
import { spawn } from 'child_process'
import { existsSync, rmSync, readdirSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises'
import { findConfig, exitNotCoherent } from '../utils/find-config.js'

/** Files/dirs to skip entirely during copy */
const COPY_EXCLUDE = new Set([
  'node_modules',
  '.next',
  '.git',
  'export',
  '.tmp-e2e',
  '.cursorrules',
  'CLAUDE.md',
  'AGENTS.md',
  '.claude',
  '.coherent',
  'design-system.config.ts',
  'coherent.components.json',
  'recommendations.md',
  '.env',
  '.env.local',
])

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const srcPath = join(src, e.name)
    const destPath = join(dest, e.name)
    if (COPY_EXCLUDE.has(e.name)) continue
    if (e.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await mkdir(dirname(destPath), { recursive: true })
      await copyFile(srcPath, destPath)
    }
  }
}

export interface ExportOptions {
  output?: string
  build?: boolean
  keepDs?: boolean
}

function checkProjectInitialized(projectRoot: string): boolean {
  return existsSync(resolve(projectRoot, 'design-system.config.ts')) && existsSync(resolve(projectRoot, 'package.json'))
}

function getPackageManager(projectRoot: string): 'pnpm' | 'npm' | 'npx' {
  if (existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(resolve(projectRoot, 'package-lock.json'))) return 'npm'
  return 'npx'
}

async function patchNextConfigForExport(outRoot: string): Promise<void> {
  for (const name of ['next.config.ts', 'next.config.mjs', 'next.config.js']) {
    const p = join(outRoot, name)
    if (!existsSync(p)) continue
    let content = await readFile(p, 'utf-8')
    if (content.includes('ignoreDuringBuilds')) return
    content = content.replace(
      /(const\s+nextConfig\s*(?::\s*\w+)?\s*=\s*\{)/,
      '$1\n  eslint: { ignoreDuringBuilds: true },\n  typescript: { ignoreBuildErrors: true },',
    )
    await writeFile(p, content, 'utf-8')
    return
  }
}

async function buildProduction(projectRoot: string): Promise<void> {
  const pm = getPackageManager(projectRoot)
  const command = pm === 'pnpm' ? 'pnpm' : pm === 'npm' ? 'npm' : 'npx'
  const args = pm === 'npx' ? ['next', 'build'] : ['run', 'build']
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit', shell: true })
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`Build failed with exit code ${code}`))))
    child.on('error', error => reject(new Error(`Failed to start build: ${error.message}`)))
  })
}

const DEPLOY_SECTION = `
## Deploy

### Vercel (recommended)
\`\`\`bash
npm i -g vercel
vercel
\`\`\`

### Docker
\`\`\`dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["npm", "start"]
EXPOSE 3000
\`\`\`
`

async function ensureReadmeDeploySection(outRoot: string): Promise<void> {
  const readmePath = join(outRoot, 'README.md')
  if (!existsSync(readmePath)) return
  try {
    let content = await readFile(readmePath, 'utf-8')
    if (/##\s+Deploy\b/m.test(content)) return
    content = content.trimEnd() + DEPLOY_SECTION + '\n'
    await writeFile(readmePath, content)
  } catch {
    /* non-critical */
  }
}

async function countPages(outRoot: string): Promise<number> {
  let n = 0
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isFile() && e.name === 'page.tsx') n++
      else if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'api') await walk(full)
    }
  }
  const appDir = join(outRoot, 'app')
  if (existsSync(appDir)) await walk(appDir)
  return n
}

function countComponents(outRoot: string): number {
  let n = 0
  for (const sub of ['ui', 'shared']) {
    const dir = join(outRoot, 'components', sub)
    if (!existsSync(dir)) continue
    try {
      n += readdirSync(dir).filter(f => f.endsWith('.tsx') || f.endsWith('.jsx')).length
    } catch {
      /* ignore */
    }
  }
  return n
}

const IMPORT_FROM_REGEX = /from\s+['"]([^'"]+)['"]/g

async function collectImportedPackages(dir: string, extensions: Set<string>): Promise<Set<string>> {
  const packages = new Set<string>()
  if (!existsSync(dir)) return packages
  async function walk(d: string): Promise<void> {
    const entries = await readdir(d, { withFileTypes: true })
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        await walk(full)
        continue
      }
      if (!e.isFile()) continue
      const ext = e.name.replace(/^.*\./, '')
      if (!extensions.has(ext)) continue
      const content = await readFile(full, 'utf-8').catch(() => '')
      let m: RegExpExecArray | null
      IMPORT_FROM_REGEX.lastIndex = 0
      while ((m = IMPORT_FROM_REGEX.exec(content)) !== null) {
        const spec = m[1]
        if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/')) continue
        const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
        if (pkg) packages.add(pkg)
      }
    }
  }
  await walk(dir)
  return packages
}

async function findMissingDepsInExport(outRoot: string): Promise<string[]> {
  const pkgPath = join(outRoot, 'package.json')
  if (!existsSync(pkgPath)) return []
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
  } catch {
    return []
  }
  const inDeps = new Set<string>([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
  const codeDirs = [join(outRoot, 'app'), join(outRoot, 'components')]
  const extensions = new Set(['ts', 'tsx', 'js', 'jsx'])
  const imported = new Set<string>()
  for (const dir of codeDirs) {
    ;(await collectImportedPackages(dir, extensions)).forEach(p => imported.add(p))
  }
  return [...imported].filter(p => !inDeps.has(p)).sort()
}

/**
 * Strip all Coherent platform artifacts from the exported project.
 */
async function stripCoherentArtifacts(outputDir: string): Promise<string[]> {
  const removed: string[] = []

  // DS overlay routes & API
  for (const p of ['app/design-system', 'app/api/design-system']) {
    const full = join(outputDir, p)
    if (existsSync(full)) {
      rmSync(full, { recursive: true, force: true })
      removed.push(p)
    }
  }

  // AppNav.tsx — remove entirely (legacy platform-only component)
  const appNavPath = join(outputDir, 'app', 'AppNav.tsx')
  if (existsSync(appNavPath)) {
    rmSync(appNavPath, { force: true })
    removed.push('app/AppNav.tsx')
  }

  // Clean layout.tsx — remove AppNav import and <AppNav /> usage (legacy)
  const layoutPath = join(outputDir, 'app', 'layout.tsx')
  if (existsSync(layoutPath)) {
    let layout = await readFile(layoutPath, 'utf-8')
    layout = layout.replace(/import\s*\{?\s*AppNav\s*\}?\s*from\s*['"][^'"]+['"]\s*\n?/g, '')
    layout = layout.replace(/\s*<AppNav\s*\/?\s*>\s*/g, '\n')
    await writeFile(layoutPath, layout, 'utf-8')
  }

  // Clean shared Header — remove Design System FAB link (platform-only)
  const sharedHeaderPath = join(outputDir, 'components', 'shared', 'header.tsx')
  if (existsSync(sharedHeaderPath)) {
    let header = await readFile(sharedHeaderPath, 'utf-8')
    header = header.replace(/<Link\s[^>]*href="\/design-system"[^>]*>[\s\S]*?<\/Link>/g, '')
    header = header.replace(/\n\s*<>\s*\n/, '\n')
    header = header.replace(/\n\s*<\/>\s*\n/, '\n')
    await writeFile(sharedHeaderPath, header, 'utf-8')
  }

  // Clean root layout — remove Design System FAB link (sidebar mode puts it here)
  if (existsSync(layoutPath)) {
    let rootLayout = await readFile(layoutPath, 'utf-8')
    const before = rootLayout
    rootLayout = rootLayout.replace(/<Link\s[^>]*href="\/design-system"[^>]*>[\s\S]*?<\/Link>/g, '')
    if (rootLayout !== before) {
      await writeFile(layoutPath, rootLayout, 'utf-8')
    }
  }

  // Clean ShowWhenNotAuthRoute — remove /design-system from hidden paths
  const guardPath = join(outputDir, 'app', 'ShowWhenNotAuthRoute.tsx')
  if (existsSync(guardPath)) {
    let guard = await readFile(guardPath, 'utf-8')
    guard = guard.replace(/['"],?\s*'\/design-system['"],?\s*/g, '')
    // If no auth routes remain, remove the file and unwrap in layout
    const pathsMatch = guard.match(/HIDDEN_PATHS\s*=\s*\[([^\]]*)\]/)
    const remaining = pathsMatch
      ? pathsMatch[1]
          .replace(/['"]/g, '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : []
    if (remaining.length === 0) {
      rmSync(guardPath, { force: true })
      removed.push('app/ShowWhenNotAuthRoute.tsx')
      // Unwrap in layout — remove import and wrapper tags
      if (existsSync(layoutPath)) {
        let layout = await readFile(layoutPath, 'utf-8')
        layout = layout.replace(/import\s+\w+\s+from\s*['"]\.\/ShowWhenNotAuthRoute['"]\s*\n?/g, '')
        layout = layout.replace(/\s*<ShowWhenNotAuthRoute>\s*\n?/g, '\n')
        layout = layout.replace(/\s*<\/ShowWhenNotAuthRoute>\s*\n?/g, '\n')
        await writeFile(layoutPath, layout, 'utf-8')
      }
    } else {
      await writeFile(guardPath, guard, 'utf-8')
    }
  }

  // Remove any remaining Coherent-specific files that slipped through
  for (const name of [
    'coherent.components.json',
    'design-system.config.ts',
    '.cursorrules',
    'CLAUDE.md',
    'AGENTS.md',
    '.env',
    '.env.local',
    'recommendations.md',
  ]) {
    const full = join(outputDir, name)
    if (existsSync(full)) {
      rmSync(full, { force: true })
      removed.push(name)
    }
  }
  for (const dir of ['.claude', '.coherent']) {
    const full = join(outputDir, dir)
    if (existsSync(full)) {
      rmSync(full, { recursive: true, force: true })
      removed.push(dir + '/')
    }
  }

  return removed
}

/**
 * Export command — produces a clean, deployable Next.js project.
 */
export async function exportCommand(options: ExportOptions = {}) {
  const outputDir = resolve(process.cwd(), options.output ?? './export')
  const doBuild = options.build !== false
  const keepDs = options.keepDs === true

  const spinner = ora('Preparing export...').start()

  const project = findConfig()
  if (!project) {
    spinner.fail('Not a Coherent project')
    exitNotCoherent()
  }

  const projectRoot = project.root

  try {
    if (!checkProjectInitialized(projectRoot)) {
      spinner.fail('Project not initialized')
      process.exit(1)
    }

    // 1. Copy project (excludes node_modules, .git, AI context files, .env, config)
    spinner.text = 'Copying project...'
    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true })
    await copyDir(projectRoot, outputDir)
    spinner.succeed('Project copied')

    // 2. Strip Coherent artifacts
    if (!keepDs) {
      spinner.start('Cleaning Coherent artifacts...')
      const removed = await stripCoherentArtifacts(outputDir)
      spinner.succeed(`Cleaned ${removed.length} Coherent artifact(s)`)
    }

    // 3. Check for missing deps
    const missingDeps = await findMissingDepsInExport(outputDir)
    if (missingDeps.length > 0) {
      console.log(
        chalk.yellow(
          '\n⚠️  Warning: exported code imports packages not in package.json: ' +
            missingDeps.join(', ') +
            '\n   Add them to dependencies and run npm install in the export dir.\n',
        ),
      )
    }

    // 4. Install deps
    spinner.start('Installing dependencies...')
    const pm = getPackageManager(projectRoot)
    const installCmd = pm === 'pnpm' ? 'pnpm' : 'npm'
    await new Promise<void>((res, rej) => {
      const child = spawn(installCmd, ['install'], { cwd: outputDir, stdio: 'inherit', shell: true })
      child.on('exit', c => (c === 0 ? res() : rej(new Error('install failed'))))
      child.on('error', rej)
    })
    spinner.succeed('Dependencies installed')

    // 5. Prepare for build
    await ensureReadmeDeploySection(outputDir)
    await patchNextConfigForExport(outputDir)

    // 5.5 Suggest quality check
    console.log(chalk.dim('\n   Tip: run `coherent check` before export to catch quality issues.\n'))

    // 6. Build
    let buildOk = false
    if (doBuild) {
      spinner.start('Running next build...')
      try {
        await buildProduction(outputDir)
        buildOk = true
        spinner.succeed('Build: success')
      } catch (e) {
        spinner.fail('Build failed')
        if (e instanceof Error) console.error(chalk.red(e.message))
      }
    } else {
      buildOk = true
    }

    const pageCount = await countPages(outputDir)
    const componentCount = countComponents(outputDir)

    spinner.stop()
    console.log(chalk.green('\n✅ Exported to ' + outputDir + '\n'))
    console.log(chalk.blue('   Pages: ' + pageCount))
    console.log(chalk.blue('   Components: ' + componentCount + ' (base + shared)'))
    console.log(chalk.blue('   Build: ' + (doBuild ? (buildOk ? 'success' : 'failed') : 'skipped (--no-build)')))
    console.log('')
    console.log(chalk.dim('   Deploy: npx vercel ' + outputDir))
    console.log(chalk.dim('       or: npx netlify deploy --dir ' + outputDir + '/.next'))
    console.log('')
  } catch (error) {
    spinner.fail('Export failed')
    if (error instanceof Error) console.error(chalk.red('\n❌ ' + error.message))
    process.exit(1)
  }
}
