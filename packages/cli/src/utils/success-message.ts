/**
 * Success Message for `coherent init`.
 *
 * Modern CLI aesthetic (Vite/Bun/Astro-style): compact, scannable, one hero
 * emoji, muted gray for context, bright only for signal. No marketing blocks —
 * that content lives in README/docs. The goal is to get the user to their next
 * command in 5 seconds.
 *
 * Branches on mode so users land on the CTA that fits their setup:
 *  - skill: /coherent-chat in Claude Code (no API key needed)
 *  - api:   coherent chat (uses an Anthropic/OpenAI key)
 *  - both:  show both
 */

import chalk from 'chalk'
import type { DetectedEditor } from './editor-detection.js'

export type SuccessMode = 'skill' | 'api' | 'both'

export interface SuccessMessageOptions {
  mode?: SuccessMode
  detectedEditors?: DetectedEditor[]
  v2TargetEditors?: DetectedEditor[]
  /** ms since `coherent init` began — rendered as "Ready in Xs". */
  elapsedMs?: number
  /** User-supplied project name (rendered in Next command when we generated a subdir). */
  projectName?: string
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 10) return `${s.toFixed(1)}s`
  return `${Math.round(s)}s`
}

export function showSuccessMessage(projectPath: string = '.', options: SuccessMessageOptions = {}): void {
  const mode: SuccessMode = options.mode ?? 'api'
  const tick = chalk.green('✓')

  console.log('')
  console.log(`  ${tick} ${chalk.dim('Next.js scaffolded')}`)
  console.log(`  ${tick} ${chalk.dim('Design system configured')}`)
  console.log(`  ${tick} ${chalk.dim('Shared components  ')}${chalk.gray('— Header, Footer')}`)
  console.log(`  ${tick} ${chalk.dim('Design System viewer  ')}${chalk.gray('— /design-system')}`)
  console.log(`  ${tick} ${chalk.dim('AI context configured')}`)

  if (options.v2TargetEditors && options.v2TargetEditors.length > 0) {
    const names = options.v2TargetEditors.map(e => `.${e === 'claude-code' ? 'claude' : e}`).join(', ')
    console.log('')
    console.log(chalk.dim(`  detected ${names} — native skill adapter lands in v0.10+`))
  }

  const elapsed = options.elapsedMs ? ` ${chalk.dim('in')} ${chalk.white(formatElapsed(options.elapsedMs))}` : ''
  console.log('')
  console.log(`  ${chalk.green('Ready')}${elapsed}`)
  console.log('')
  console.log(`  ${chalk.magenta('✨ Coherent Design Method — Project Initialized')}`)

  // Copy matches the getcoherent.design landing page: Describe first, then
  // Preview. Shell commands (coherent chat, coherent preview) need both
  // quotes around multi-word args and a `cd` into the new project if
  // `coherent init <name>` created a subdir. Slash commands inside Claude
  // Code need neither — Claude Code passes the whole rest-of-line as one
  // argument and runs inside the project the user already has open.
  const needsCd = !!options.projectName && options.projectName !== '.' && options.projectName !== ''
  const example = 'a fitness studio app with classes, pricing, and contact'
  const shellExample = `"${example}"`
  console.log('')
  console.log(chalk.bold('  Next:'))
  console.log('')

  // Command color: plain `chalk.green` — readable across light and dark
  // terminals, not bold (bold felt heavy in real-terminal testing).
  const cmd = chalk.green

  // Detect whether this `coherent init` ran from inside an active Claude
  // Code session (its Bash tool executing our binary). In that case the
  // user cannot just "launch claude" — they're already in one, but it's
  // anchored to the parent workdir, not the freshly-scaffolded subdir. The
  // slash command lives in `.claude/commands/coherent-chat.md` of the new
  // project, so the current session can't see it. They need to exit and
  // relaunch Claude inside the new project dir. Communicate that honestly.
  const insideClaudeCode = !process.stdout.isTTY || !!process.env.CLAUDE_CODE_SESSION || !!process.env.CLAUDECODE

  if (mode === 'skill') {
    if (insideClaudeCode && needsCd) {
      console.log(chalk.dim("    You're already in Claude Code — but it's anchored to this folder."))
      console.log(chalk.dim('    To use the skill in the new project:'))
      console.log('')
      console.log(chalk.dim('    1. Exit this Claude Code session:'))
      console.log(cmd(`       /exit`))
      console.log('')
      console.log(chalk.dim('    2. Re-open Claude Code in the project:'))
      console.log(cmd(`       cd ${options.projectName}`))
      console.log(cmd(`       claude`))
      console.log('')
      console.log(chalk.dim('    3. Inside Claude Code, describe your app:'))
      console.log(cmd(`       /coherent-chat ${example}`))
      console.log('')
      console.log(chalk.dim('    4. Preview:'))
      console.log(cmd(`       coherent preview`))
    } else {
      console.log(chalk.dim('    1. Open the project in Claude Code:'))
      if (needsCd) console.log(cmd(`       cd ${options.projectName}`))
      console.log(cmd(`       claude`))
      console.log('')
      console.log(chalk.dim('    2. Inside Claude Code, describe your app:'))
      console.log(cmd(`       /coherent-chat ${example}`))
      console.log('')
      console.log(chalk.dim('    3. Preview:'))
      console.log(cmd(`       coherent preview`))
    }
  } else if (mode === 'api') {
    console.log(chalk.dim('    1. Describe your app:'))
    if (needsCd) console.log(cmd(`       cd ${options.projectName}`))
    console.log(cmd(`       coherent chat ${shellExample}`))
    console.log('')
    console.log(chalk.dim('    2. Preview:'))
    console.log(cmd(`       coherent preview`))
  } else {
    console.log(chalk.dim('    1. Describe your app — pick one path:'))
    if (needsCd) console.log(cmd(`       cd ${options.projectName}`))
    console.log('')
    console.log(chalk.dim('       Claude Code (no API key):'))
    console.log(cmd(`         claude`) + chalk.dim('   # opens Claude Code in this project'))
    console.log(cmd(`         /coherent-chat ${example}`) + chalk.dim('   # inside Claude Code'))
    console.log('')
    console.log(chalk.dim('       CLI (with API key):'))
    console.log(cmd(`         coherent chat ${shellExample}`))
    console.log('')
    console.log(chalk.dim('    2. Preview:'))
    console.log(cmd(`       coherent preview`))
  }

  // Shipping + recovery commands are shared between skill and API modes —
  // they're plain CLI commands that don't depend on the AI-generation path.
  // Listed below the immediate CTA so the first-time user isn't overwhelmed
  // but knows where to look when they get there.
  console.log('')
  console.log(chalk.dim('  When your UI is ready and you like it:'))
  console.log(cmd('    coherent export') + chalk.dim('  — export as a finished frontend, or hand off to a developer'))

  console.log('')
  console.log(chalk.dim('  If something is off:'))
  console.log(cmd('    coherent fix') + chalk.dim('     — auto-fix common issues (broken imports, missing files)'))
  console.log(cmd('    coherent sync') + chalk.dim('    — re-sync the design system after manual edits'))

  console.log('')
  console.log(chalk.dim('  More commands: ') + cmd('coherent --help'))
  console.log(chalk.dim('  Docs: ') + chalk.dim.underline('https://github.com/skovtun/coherent-design-method'))
  console.log('')
}
