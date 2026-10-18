/**
 * `coherent hook pre-write` — Claude Code PreToolUse hook for the Coherent agent.
 *
 * Denies Edit/Write/MultiEdit/NotebookEdit on project files that are not in the
 * open edit's declared write set (or when no edit is open), with a reason that
 * tells the agent what to do. A fast-feedback layer only: Bash, subagents and
 * IDE writes bypass it, and coherent_verify_edit remains the boundary.
 */
import { isAbsolute, relative, resolve } from 'path'
import { normalizeRelPath, openTransaction } from './transaction.js'

export interface HookInput {
  tool_name?: string
  tool_input?: { file_path?: string; notebook_path?: string }
  cwd?: string
}

/** Paths the agent may always write: its own config and Coherent's state. */
const FREE = /^(\.claude|\.coherent)\//

export function preWriteDecision(input: HookInput, env: NodeJS.ProcessEnv = process.env): string | null {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  if (!file) return null
  const root = resolve(env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd())
  const abs = isAbsolute(file) ? file : resolve(root, file)
  const rel = relative(root, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null // outside the project: not ours
  let path: string
  try {
    path = normalizeRelPath(rel)
  } catch {
    return null // vendor/tool dirs (node_modules, .git, ...): not governed
  }
  if (FREE.test(path + '/') || FREE.test(path)) return null
  const open = openTransaction(root)
  if (!open)
    return `No Coherent edit is open. Call coherent_begin_edit declaring ${path} (and every other file you will change) before writing.`
  if (!(open.allowed ?? []).includes(path))
    return `${path} is not in the open edit's write set (${(open.allowed ?? []).join(', ')}). Call coherent_begin_edit with amend="${open.id}" and this file, then retry.`
  return null
}

export async function preWriteHookCommand(): Promise<void> {
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  let input: HookInput = {}
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
  } catch {
    return // unparseable input: do not block the agent on our own bug
  }
  let reason: string | null = null
  try {
    reason = preWriteDecision(input)
  } catch (e) {
    process.stderr.write(`coherent hook: ${(e as Error).message}\n`)
    return
  }
  if (reason)
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }),
    )
}
