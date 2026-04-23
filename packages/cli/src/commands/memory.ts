/**
 * `coherent memory show` / `coherent memory diff` — make per-project memory
 * auditable instead of black-box.
 *
 * Rationale (codex review, 2026-04-23): if memory influences generation
 * output, users must be able to see why. "Why does the model keep picking
 * amber / max-w-6xl / ThatSharedComponent?" should have a one-command
 * answer. Black-box memory is a bad product decision.
 *
 * Surfaces three things:
 *   - `.coherent/wiki/decisions.md` — the per-project design memory
 *   - `coherent.components.json` — shared component registry (name + count)
 *   - `.coherent/runs/*.yaml` — recent generation run records (v0.8.2+)
 *
 * `diff` wraps `git diff -- .coherent/wiki/decisions.md`. Requires git repo;
 * prints a helpful hint if not.
 */

import chalk from 'chalk'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'
import { spawnSync } from 'child_process'
import { requireProject, loadConfig } from './chat/utils.js'
import { readDesignMemory } from '../utils/design-memory.js'

export interface MemoryCommandOptions {
  _throwOnError?: boolean
}

export async function memoryShowCommand(_opts: MemoryCommandOptions = {}) {
  const project = requireProject()
  const projectRoot = project.root

  console.log(chalk.bold('\nCoherent memory for this project\n'))

  // 1. Design memory (decisions.md)
  const decisionsPath = resolve(projectRoot, '.coherent', 'wiki', 'decisions.md')
  const decisions = readDesignMemory(projectRoot)
  console.log(chalk.cyan(`📓 Design memory`) + chalk.dim(` — ${relative(projectRoot, decisionsPath)}`))
  if (decisions.trim().length === 0) {
    console.log(chalk.dim('   (no decisions yet — run `coherent chat "..."` to start building memory)'))
  } else {
    const lines = decisions.trimEnd().split('\n')
    for (const line of lines) console.log('   ' + line)
  }
  console.log('')

  // 2. Components registry
  try {
    const config = await loadConfig(project.configPath)
    const components = config.components ?? []
    console.log(chalk.cyan(`🧩 Shared components`) + chalk.dim(` — ${components.length} registered`))
    if (components.length === 0) {
      console.log(chalk.dim('   (none yet)'))
    } else {
      for (const c of components) {
        const used = (c as unknown as { usedBy?: string[] }).usedBy
        const usedCount = Array.isArray(used) ? used.length : 0
        console.log(
          `   ${chalk.bold(c.id)}  ${chalk.white(c.name)}  ${chalk.dim(`(${c.category}, used on ${usedCount} page${usedCount === 1 ? '' : 's'})`)}`,
        )
      }
    }
  } catch (err) {
    console.log(chalk.dim(`   (could not read config: ${err instanceof Error ? err.message : String(err)})`))
  }
  console.log('')

  // 3. Recent run records
  const runsDir = resolve(projectRoot, '.coherent', 'runs')
  console.log(chalk.cyan(`🗒  Recent runs`) + chalk.dim(` — ${relative(projectRoot, runsDir)}`))
  if (!existsSync(runsDir)) {
    console.log(chalk.dim('   (none — start generating with `coherent chat "..."` to capture)'))
  } else {
    const files = readdirSync(runsDir)
      .filter(f => f.endsWith('.yaml'))
      .map(f => ({ name: f, mtime: statSync(join(runsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 5)
    if (files.length === 0) {
      console.log(chalk.dim('   (none yet)'))
    } else {
      for (const { name } of files) {
        const content = readFileSync(join(runsDir, name), 'utf-8')
        const intent = content.match(/^intent:\s*"?(.*?)"?$/m)?.[1]?.trim() || '(unknown)'
        const outcome = content.match(/^outcome:\s*(\w+)/m)?.[1] || 'unknown'
        const duration = content.match(/^durationMs:\s*(\d+)/m)?.[1] || '?'
        const atmosphere = content.match(/^\s+background:\s*"?([^"\n]+)"?/m)?.[1]
        const atmos = atmosphere ? ` · ${chalk.dim(atmosphere)}` : ''
        const badge =
          outcome === 'success' ? chalk.green('✓') : outcome === 'error' ? chalk.red('✖') : chalk.yellow('?')
        const shortName = name.replace('.yaml', '')
        console.log(
          `   ${badge} ${chalk.dim(shortName)}  ${chalk.white(intent.slice(0, 60))}${atmos}  ${chalk.dim(`(${duration}ms)`)}`,
        )
      }
    }
  }
  console.log('')

  console.log(chalk.dim(`Tip: \`coherent memory diff\` to see what changed in decisions.md since last commit.\n`))
}

export async function memoryDiffCommand(ref: string | undefined, opts: MemoryCommandOptions = {}) {
  const project = requireProject()
  const projectRoot = project.root
  const decisionsRel = '.coherent/wiki/decisions.md'
  const decisionsAbs = resolve(projectRoot, decisionsRel)

  if (!existsSync(decisionsAbs)) {
    console.error(chalk.red(`\n❌ No design memory at ${decisionsRel}\n`))
    console.log(chalk.dim(`   Run \`coherent chat "..."\` once to generate initial decisions.\n`))
    if (opts._throwOnError) throw new Error('No design memory')
    process.exit(1)
  }

  // Check for git repo
  const gitCheck = spawnSync('git', ['-C', projectRoot, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf-8' })
  if (gitCheck.status !== 0) {
    console.error(chalk.red(`\n❌ Not a git repository — \`coherent memory diff\` needs git to show changes.\n`))
    console.log(chalk.dim(`   Run \`git init && git add . && git commit -m "init"\` first, then iterate.\n`))
    if (opts._throwOnError) throw new Error('Not a git repo')
    process.exit(1)
  }

  const target = ref ?? 'HEAD'
  const diff = spawnSync('git', ['-C', projectRoot, 'diff', '--color=always', target, '--', decisionsRel], {
    encoding: 'utf-8',
  })

  if (diff.status !== 0 && diff.stderr) {
    console.error(chalk.red(`\n❌ git diff failed: ${diff.stderr.trim()}\n`))
    if (opts._throwOnError) throw new Error(`git diff failed: ${diff.stderr.trim()}`)
    process.exit(1)
  }

  const out = diff.stdout?.trim() ?? ''
  if (out.length === 0) {
    console.log(chalk.dim(`\nNo changes in ${decisionsRel} vs ${target}.\n`))
    return
  }

  console.log(chalk.bold(`\nDecisions diff (working tree vs ${target}):\n`))
  console.log(out)
  console.log('')
}
