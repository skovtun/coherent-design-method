/**
 * `coherent session start/end` — skill-mode lifecycle subcommand.
 *
 * Paired with `coherent _phase` (Lane C) to drive the phase-engine across a
 * multi-process rail:
 *
 *   coherent session start  → UUID
 *   coherent _phase plan     --session UUID
 *   coherent _phase anchor   --session UUID
 *   ... etc
 *   coherent session end     UUID
 *
 * `start` acquires the persistent project lock + writes initial snapshots;
 * `end` applies artifacts (via Lane D appliers) + releases the lock.
 */

import chalk from 'chalk'
import { requireProject } from './chat/utils.js'
import { sessionEnd, sessionStart } from '../phase-engine/session-lifecycle.js'
import { defaultAppliers } from '../phase-engine/appliers.js'

export interface SessionStartCliOptions {
  intent?: string
  optionsJson?: string
  quiet?: boolean
  /** Override project root — testing hook. Defaults to `requireProject()`. */
  _projectRoot?: string
  _throwOnError?: boolean
}

export async function sessionStartCommand(options: SessionStartCliOptions): Promise<void> {
  const bail = (msg: string): never => {
    if (options._throwOnError) throw new Error(msg)
    process.exit(1)
  }

  let parsedOptions: Record<string, unknown> = {}
  if (options.optionsJson) {
    try {
      const parsed = JSON.parse(options.optionsJson)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        bail('--options must be a JSON object')
      }
      parsedOptions = parsed as Record<string, unknown>
    } catch (e) {
      console.error(chalk.red(`\n❌ Invalid --options JSON: ${e instanceof Error ? e.message : String(e)}\n`))
      bail('Invalid --options JSON')
    }
  }

  const projectRoot = options._projectRoot ?? requireProject().root
  try {
    const result = await sessionStart({
      projectRoot,
      intent: options.intent,
      options: parsedOptions,
    })
    // Machine-readable: UUID on stdout (single line). Humans see the boxed summary
    // on stderr so shell pipelines like `UUID=$(coherent session start ...)` work.
    console.log(result.uuid)
    // --quiet suppresses the informational stderr block — used by the skill rail
    // (`/coherent-chat`) to keep Bash boxes tight. Errors and warnings still emit.
    if (!options.quiet) {
      process.stderr.write(
        chalk.dim(`\nSession ${result.uuid} started.\n  dir: ${result.sessionDir}\n  at:  ${result.startedAt}\n\n`),
      )
    }
  } catch (e) {
    console.error(chalk.red(`\n❌ session start failed: ${e instanceof Error ? e.message : String(e)}\n`))
    if (options._throwOnError) throw e
    process.exit(1)
  }
}

export interface SessionEndCliOptions {
  keep?: boolean
  quiet?: boolean
  /** Override project root — testing hook. Defaults to `requireProject()`. */
  _projectRoot?: string
  _throwOnError?: boolean
}

export async function sessionEndCommand(uuid: string, options: SessionEndCliOptions): Promise<void> {
  const projectRoot = options._projectRoot ?? requireProject().root
  try {
    // Wire the default applier set so generated artifacts (config-delta,
    // components-generated, page-*.json) actually land on the project
    // (codex P1 #2). Without these, a "successful" skill-mode run left the
    // project unchanged — the session dir had all the work, none of it
    // applied.
    const result = await sessionEnd({
      projectRoot,
      uuid,
      keepSession: options.keep,
      appliers: defaultAppliers(),
    })
    if (options.quiet) {
      // Skill rail consumes a tight one-line summary; the skill body emits the
      // full polished card via Claude text after this Bash call returns.
      const count = result.applied.length
      console.log(chalk.green(`✔ Session ${uuid.slice(0, 8)} ended (${count} applied)`))
    } else {
      console.log(chalk.green(`\n✔ Session ${uuid} ended at ${result.endedAt}`))
      if (result.applied.length > 0) {
        console.log(chalk.cyan('\nApplied:'))
        for (const line of result.applied) {
          console.log(chalk.dim(`  • ${line}`))
        }
      }
      if (result.runRecordPath) {
        console.log(chalk.dim(`\n  📝 Run record → ${result.runRecordPath}`))
      }
      console.log('')
    }
  } catch (e) {
    console.error(chalk.red(`\n❌ session end failed: ${e instanceof Error ? e.message : String(e)}\n`))
    if (options._throwOnError) throw e
    process.exit(1)
  }
}
