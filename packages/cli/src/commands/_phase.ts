/**
 * `coherent _phase <action> <name>` — hidden skill-mode entry point.
 *
 * One invocation = one atomic phase operation. The skill harness orchestrates:
 *
 *   coherent session start                                                → uuid
 *   coherent _phase prep    plan           --session uuid                 → prompt on stdout
 *   # (skill feeds prompt to the active model, captures response)
 *   coherent _phase ingest  plan           --session uuid < response.md
 *   coherent _phase prep    anchor         --session uuid                 → prompt
 *   coherent _phase ingest  anchor         --session uuid < response.md
 *   coherent _phase run     extract-style  --session uuid                 # deterministic
 *   ...
 *   coherent session end uuid
 *
 * Actions:
 *   prep    — AI phases only. Writes the phase's prompt to stdout.
 *   ingest  — AI phases only. Reads the raw model response from stdin,
 *             calls `phase.ingest(raw, ctx)` to parse + persist artifacts.
 *   run     — Deterministic phases only. Executes `phase.run(ctx)`.
 *
 * Protocol: `--protocol N` must match PHASE_ENGINE_PROTOCOL. Mismatch bails
 * with a clear error rather than silently running under the wrong contract.
 */

import chalk from 'chalk'
import { requireProject } from './chat/utils.js'
import { FileBackedSessionStore } from '../phase-engine/file-backed-session-store.js'
import {
  isAiPhase,
  type AiPhase,
  type DeterministicPhase,
  type Phase,
  type PhaseContext,
} from '../phase-engine/phase.js'
import { PHASE_ENGINE_PROTOCOL, resolvePhase } from '../phase-engine/phase-registry.js'

export type PhaseAction = 'prep' | 'ingest' | 'run'

export interface PhaseCliOptions {
  session?: string
  protocol?: string
  /** Override stdin — testing hook. Defaults to reading from process.stdin. */
  _stdin?: string
  /** Override project root — testing hook. Defaults to `requireProject()`. */
  _projectRoot?: string
  /** Override stdout writer — testing hook. Captures prep output. */
  _writeStdout?: (chunk: string) => void
  _throwOnError?: boolean
}

export async function phaseCommand(action: PhaseAction, name: string, options: PhaseCliOptions): Promise<void> {
  const bail = (msg: string): never => {
    if (options._throwOnError) throw new Error(msg)
    console.error(chalk.red(`\n❌ ${msg}\n`))
    process.exit(1)
  }

  if (!options.session) bail('--session <uuid> is required')

  if (options.protocol !== undefined) {
    const requested = Number(options.protocol)
    if (!Number.isFinite(requested) || requested !== PHASE_ENGINE_PROTOCOL) {
      bail(
        `Protocol mismatch: --protocol ${options.protocol}, expected ${PHASE_ENGINE_PROTOCOL}. ` +
          `Upgrade the caller (skill markdown) or the CLI so they agree.`,
      )
    }
  }

  let phase: Phase
  try {
    phase = resolvePhase(name)
  } catch (e) {
    bail(e instanceof Error ? e.message : String(e))
    return // unreachable; bail throws or exits
  }

  const projectRoot = options._projectRoot ?? requireProject().root
  const store = new FileBackedSessionStore(projectRoot)
  const meta = await store.read(options.session!)
  if (!meta) bail(`Session ${options.session} not found. Run \`coherent session start\` first.`)

  const ctx: PhaseContext = { session: store, sessionId: options.session! }

  try {
    switch (action) {
      case 'prep': {
        if (!isAiPhase(phase)) {
          bail(`Phase "${name}" is deterministic — use \`coherent _phase run ${name}\` instead.`)
        }
        const aiPhase = phase as AiPhase
        const prompt = await aiPhase.prep(ctx)
        const write = options._writeStdout ?? ((chunk: string) => process.stdout.write(chunk))
        write(prompt)
        // No trailing newline — the prompt is the full stdout payload so shells
        // like `coherent _phase prep plan > prompt.md` preserve bytes exactly.
        return
      }
      case 'ingest': {
        if (!isAiPhase(phase)) {
          bail(`Phase "${name}" is deterministic — use \`coherent _phase run ${name}\` instead.`)
        }
        const raw = options._stdin ?? (await readAllStdin())
        if (!raw.trim()) bail(`ingest: empty stdin — pipe the model response in`)
        const aiPhase = phase as AiPhase
        await aiPhase.ingest(raw, ctx)
        return
      }
      case 'run': {
        if (isAiPhase(phase)) {
          bail(`Phase "${name}" is AI — use \`coherent _phase prep ${name}\` then \`coherent _phase ingest ${name}\`.`)
        }
        const detPhase = phase as DeterministicPhase
        await detPhase.run(ctx)
        return
      }
      default:
        bail(`Unknown action: ${JSON.stringify(action)}. Expected prep | ingest | run.`)
    }
  } catch (e) {
    if (options._throwOnError) throw e
    console.error(chalk.red(`\n❌ ${name} ${action} failed: ${e instanceof Error ? e.message : String(e)}\n`))
    process.exit(1)
  }
}

async function readAllStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf-8')
}
