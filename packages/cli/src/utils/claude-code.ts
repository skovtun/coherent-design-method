/**
 * Static `.claude/*` writers for Claude Code (commands, skills, settings.json).
 * Dynamic project context (CLAUDE.md, etc.) lives in `harness-context.ts`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import chalk from 'chalk'
import { PHASE_ENGINE_PROTOCOL } from '../phase-engine/phase-registry.js'

function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
}

const COMMANDS = {
  'check.md': `---
description: Show all quality and consistency issues (read-only)
allowed-tools: Bash(coherent check *)
---
Run \`coherent check\` in the project root and report results.
If there are errors, suggest fixes for each one.
Use \`coherent check --pages\` for pages only, \`--shared\` for shared components only.
`,
  'fix.md': `---
description: Auto-fix cache, deps, components, syntax, and quality issues
allowed-tools: Bash(coherent fix *)
---
Run \`coherent fix\` in the project root.
Report what was fixed and what remains.
Use \`--dry-run\` to preview without writing.
`,
  'add-page.md': `---
description: Add a new page to the prototype via Coherent CLI (requires ANTHROPIC_API_KEY)
argument-hint: [page-description]
allowed-tools: Bash(coherent chat *)
---
Run \`coherent chat "add $ARGUMENTS"\` in the project root.
This ensures the page goes through the full Coherent pipeline:
shared component reuse, validation, manifest update.

Note: this command calls the Anthropic API directly via \`coherent chat\` and
requires an API key. If you want to use your Claude Code subscription instead,
use \`/coherent-chat\` — same pipeline, but the generation happens in your
current Claude session.
`,
  'coherent-chat.md': `---
description: Coherent Design Method skill — generate multi-page UI from a prompt inside Claude Code.
argument-hint: [intent, e.g. "a CRM dashboard with charts"]
allowed-tools: Bash(coherent *), Read, Write
---

You are driving Coherent's v0.9.0 phase-engine rail from inside a Claude Code session. The CLI never calls an AI API under this command; every AI phase's response comes from THIS model session. Coherent contributes the constraint bundle, the per-phase prompts, and the session-end validator.

**Protocol version: ${PHASE_ENGINE_PROTOCOL}.** Every \`coherent _phase ...\` call below carries \`--protocol ${PHASE_ENGINE_PROTOCOL}\` so CLI/markdown drift is caught at the first ingest, not silently halfway through the run.

## How to invoke each Bash call (read this once, applies to every step)

Each Bash tool call is its own subshell, and Claude Code's permission rule for this skill is exactly \`Bash(coherent *)\` — i.e., the call passes silently only when the FIRST and ONLY command is a literal \`coherent ...\` invocation. **Anything that introduces a second command triggers a yes/no permission gate**, which is why "still many confirmations" used to happen.

Concrete rules:

- **No pipes.** Never write \`coherent ... | wc -l\`, \`coherent ... | head\`, \`coherent ... | grep ...\`. The pipe target is a separate command and gets gated.
- **No chains.** Never use \`&&\`, \`||\`, or \`;\` to chain anything after a coherent call.
- **No env prefix.** Never write \`UUID=$(coherent session start ...)\` or \`UUID=x coherent ...\`. The leading \`UUID=...\` makes the command not start with \`coherent\`.
- **No debug echo.** No \`coherent ...; echo "exit: $?"\` — exit code is in the tool result already.
- **Inspect files with the Read tool, not Bash.** Want to see file size, plan.json, or whether an artifact got written — use Read or list_files. Never \`cat\`, \`wc\`, or \`ls\` via Bash for these.
- **Substitute the UUID literally** into every command. The UUID was printed by step 1; paste it directly. Each Bash call must START with the literal token \`coherent\`.

In the snippets below, \`<UUID>\` is a placeholder — replace it with the actual UUID printed by step 1.

If a Bash call legitimately fails, the tool result already includes the stderr — read it, fix the response file, retry. Don't add redirects or echos.

## Flow overview

\`\`\`
session start
  → plan          (AI: prep → respond → ingest)
  → anchor        (AI)
  → extract-style (deterministic: run)
  → components    (AI)
  → page × N      (AI, one prep/ingest per page)
session end  (applies all artifacts + writes run record)
coherent fix    (auto-install shadcn primitives, fix imports, cleanup)
\`\`\`

## Response format per phase (read once, follow exactly)

Each phase's prompt file describes the schema in detail; the rules below are the cross-phase summary.

- **Plan, components** — plain JSON. Match the schema printed in the prompt verbatim.
- **Anchor, page** — JSON header followed by a \`\`\`tsx fenced block. NO \`pageCode\` string in the JSON. The TSX is read VERBATIM by the CLI parser — no escaping needed.

Anchor and page response shape:

\`\`\`
{
  "type": "add-page",
  "target": "new",
  "changes": {
    "id": "balance",
    "name": "Balance",
    "route": "/balance",
    "layout": "centered",
    ...
  }
}

\`\`\`tsx
import { Card } from "@/components/ui/card"
export default function BalancePage() {
  return <div className="space-y-6">...</div>
}
\`\`\`
\`\`\`

DO NOT put \`pageCode\` inside the JSON. Embedded backticks inside template literals or JSX are fine — only a fence-only line at the very end closes the block. This format kills the JSON-escape failure class on long pageCode (M14, PHASE_ENGINE_PROTOCOL=2).

## Skip sentinel

When a \`prep\` Bash output is exactly \`__COHERENT_PHASE_SKIPPED__\` (one line, optional trailing newline), the phase has no AI work to do — it already wrote its output artifact deterministically. **Do NOT Write a response file. Do NOT call \`_phase ingest\` for that phase.** Move on to the next step.

This currently fires on the components phase when the plan has zero shared components.

## Progress reporting

Before each phase's Bash call, print one line so the user sees what's happening:

- \`▸ [1/6] Planning pages…\`
- \`▸ [2/6] Generating anchor page (Dashboard)…\`
- \`▸ [3/6] Extracting design tokens…\`
- \`▸ [4/6] No shared components — skipping\` (when sentinel fires)
- \`▸ [5/6] Generating /balance, /transactions, /settings in parallel…\`
- \`▸ [6/6] Applying to disk…\`

One line per phase, plain text. The user reads these between Bash spinners.

## Steps

### 1. Start the session

\`\`\`bash
coherent session start --intent "$ARGUMENTS"
\`\`\`

The command prints the session UUID (one line) to stdout. Capture it. Use that literal UUID in every subsequent command — do NOT prefix calls with \`UUID=...\`.

### 2. Plan phase (AI)

\`\`\`bash
coherent _phase prep plan --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/plan-prompt.md
\`\`\`

Read \`.coherent/session/<UUID>/plan-prompt.md\`. Produce the plan JSON response (match the schema in the prompt exactly). Write to \`.coherent/session/<UUID>/plan-response.md\`. Then:

\`\`\`bash
coherent _phase ingest plan --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/plan-response.md
\`\`\`

### 3. Anchor phase (AI)

Run prep first:

\`\`\`bash
coherent _phase prep anchor --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/anchor-prompt.md
\`\`\`

Read \`.coherent/session/<UUID>/anchor-prompt.md\`, produce the JSON response (schema is in the prompt), Write it to \`.coherent/session/<UUID>/anchor-response.md\`. Then ingest in a separate Bash call:

\`\`\`bash
coherent _phase ingest anchor --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/anchor-response.md
\`\`\`

### 4. Extract-style phase (deterministic)

\`\`\`bash
coherent _phase run extract-style --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL}
\`\`\`

### 5. Components phase (AI)

\`\`\`bash
coherent _phase prep components --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/components-prompt.md
\`\`\`

Read the prompt, produce the response file, then ingest in a separate Bash call:

\`\`\`bash
coherent _phase ingest components --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/components-response.md
\`\`\`

### 6. Page phase (AI, parallel per page)

Read \`.coherent/session/<UUID>/pages-input.json\` and run page phase for every \`pageId\` in \`pages[].id\`. The first page in \`plan.pageNames\` is the anchor — generated in step 3 — so \`pages-input.json\` deliberately does NOT include it.

**Run pages in parallel.** All page generations are independent after extract-style. Issue calls in 3 batches of N parallel tool calls per message (cap at 6 per batch for very wide plans):

- **Batch 1 — parallel prep:** one Claude message, N parallel Bash calls, one per page id, each writing to \`page-<id>-prompt.md\`.
- **Batch 2 — parallel response writes:** read each prompt file, generate the response (JSON header + \`\`\`tsx fence per the format spec above), Write each \`page-<id>-response.md\`. One message, N parallel Write calls.
- **Batch 3 — parallel ingest:** one message, N parallel Bash calls, each piping its \`page-<id>-response.md\` into \`coherent _phase ingest page:<id>\`.

Example single Bash call within a batch:

\`\`\`bash
coherent _phase prep page:<pageId> --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/page-<pageId>-prompt.md
\`\`\`

This collapses what would be 12 sequential turns (4 pages × 3 steps) into 3 parallel batches.

### 7. End the session

\`\`\`bash
coherent session end <UUID>
\`\`\`

Applies all artifacts (config-delta, generated pages, components) — including the auto-fix pass on every file — writes the run record under \`.coherent/runs/\`, releases the project lock.

### 8. Run \`coherent fix\` (auto-install shadcn primitives + cleanup)

\`\`\`bash
coherent fix
\`\`\`

Generated pages often import shadcn primitives (\`@/components/ui/badge\`, \`tabs\`, \`select\`, etc.) that the user's project doesn't yet have. Session-end doesn't auto-install them — \`coherent fix\` does. Without this step, \`coherent preview\` will throw \`Module not found\` on the first page open. Run it once after \`session end\`.

## Report back

Tell the user:
- Which pages and components were written (read from the \`session end\` output).
- Which shadcn primitives \`coherent fix\` auto-installed (if any).
- Run-record path under \`.coherent/runs/\`.
- Any pages that were skipped (empty pageCode) and need regeneration.

If \`session end\` reported auto-fix counts, mention them — it means the AI-generated code had known issues and the CLI corrected them before write.

## Error recovery

- \`Protocol mismatch\`: the CLI's \`PHASE_ENGINE_PROTOCOL\` differs from this command's declared version. Upgrade one side (\`coherent update\` in the project to refresh this markdown) before retrying.
- \`ingest: empty stdin\`: your response file is empty or whitespace-only. Regenerate and re-pipe.
- Any step fails: the session dir under \`.coherent/session/<UUID>/\` is preserved. Re-run the failing step after correcting the response, or \`coherent session end <UUID> --keep\` to bail while preserving state. The project lock is released even on failure — subsequent sessions can start immediately.
`,
}

const SKILL_FRONTEND_UX = `---
name: frontend-ux
description: UX and accessibility rules for Coherent UI
---

# Frontend & UX

## Accessibility (WCAG 2.2 AA)

- Contrast: text ≥ 4.5:1 on background; large text ≥ 3:1
- Touch targets: ≥ 44×44px for tap/click
- Focus: every interactive element has visible focus-visible ring
- Forms: every input has a visible <Label>; errors announced (aria-describedby or live region)
- Skip link: first focusable element skips to main content when applicable

## Layout

- Use semantic tokens: bg-background, text-foreground, border-border, text-muted-foreground
- Spacing: prefer space-y-* / gap-* from design tokens (p-4, gap-4, etc.)
- Max width for long text: max-w-prose or max-w-2xl for readability

## Icons

- lucide-react only; pair with text when meaning is not obvious (aria-label or sr-only text)
`

const SKILL_COHERENT_CHAT = `---
name: coherent-chat
description: Coherent Design Method skill — generate multi-page UI from a prompt inside Claude Code.
phase_engine_protocol: ${PHASE_ENGINE_PROTOCOL}
---

# coherent-chat — skill-mode orchestrator

Drives Coherent's v0.9.0 phase rail via the \`coherent\` CLI, one phase at a
time. Responses come from THIS model session; the CLI never calls an AI API
under this skill.

**Protocol version: ${PHASE_ENGINE_PROTOCOL}.** Every \`coherent _phase ...\`
invocation below passes \`--protocol ${PHASE_ENGINE_PROTOCOL}\` so CLI/markdown
drift is caught at the first ingest, not silently halfway through a run.

## When to invoke

- User asks to build, generate, scaffold, or add pages/components/a project
- Working directory has \`design-system.config.ts\` (Coherent project root)
- API-key-less flow: no \`ANTHROPIC_API_KEY\` / \`OPENAI_API_KEY\` configured

If the user ran \`coherent init --api-mode\` or has an API key, prefer
\`coherent chat "<request>"\` (the single-shot in-process rail).

## Flow

\`\`\`
session start
  → plan          (AI: prep → respond → ingest)
  → anchor        (AI)
  → extract-style (deterministic: run)
  → components    (AI)
  → page × N      (AI, one prep/ingest per page)
session end  (applies all artifacts + writes run record)
coherent fix    (auto-install shadcn primitives, fix imports, cleanup)
\`\`\`

## Response format per phase (read once, follow exactly)

Each phase's prompt file describes the schema in detail; the rules below are the cross-phase summary.

- **Plan, components** — plain JSON. Match the schema printed in the prompt verbatim.
- **Anchor, page** — JSON header followed by a \`\`\`tsx fenced block. NO \`pageCode\` string in the JSON. The TSX is read VERBATIM by the CLI parser — no escaping needed.

Anchor and page response shape:

\`\`\`
{
  "type": "add-page",
  "target": "new",
  "changes": {
    "id": "balance",
    "name": "Balance",
    "route": "/balance",
    "layout": "centered",
    ...
  }
}

\`\`\`tsx
import { Card } from "@/components/ui/card"
export default function BalancePage() {
  return <div className="space-y-6">...</div>
}
\`\`\`
\`\`\`

DO NOT put \`pageCode\` inside the JSON. Embedded backticks inside template literals or JSX are fine — only a fence-only line at the very end closes the block. This format kills the JSON-escape failure class on long pageCode (M14, PHASE_ENGINE_PROTOCOL=2).

## Skip sentinel

When a \`prep\` Bash output is exactly \`__COHERENT_PHASE_SKIPPED__\` (one line, optional trailing newline), the phase has no AI work to do — it already wrote its output artifact deterministically. **Do NOT Write a response file. Do NOT call \`_phase ingest\` for that phase.** Move on to the next step.

This currently fires on the components phase when the plan has zero shared components.

## Progress reporting

Before each phase's Bash call, print one line so the user sees what's happening:

- \`▸ [1/6] Planning pages…\`
- \`▸ [2/6] Generating anchor page (Dashboard)…\`
- \`▸ [3/6] Extracting design tokens…\`
- \`▸ [4/6] No shared components — skipping\` (when sentinel fires)
- \`▸ [5/6] Generating /balance, /transactions, /settings in parallel…\`
- \`▸ [6/6] Applying to disk…\`

One line per phase, plain text. The user reads these between Bash spinners.

## How to invoke each Bash call (read this once, applies to every step)

Each Bash tool call is its own subshell, and Claude Code's permission rule for this skill is exactly \`Bash(coherent *)\` — i.e., the call passes silently only when the FIRST and ONLY command is a literal \`coherent ...\` invocation. **Anything that introduces a second command triggers a yes/no permission gate**, which is why "still many confirmations" used to happen even after the rename.

Concrete rules:

- **No pipes.** Never write \`coherent ... | wc -l\`, \`coherent ... | head\`, \`coherent ... | grep ...\`. The pipe target is a separate command and gets gated.
- **No chains.** Never use \`&&\`, \`||\`, or \`;\` to chain anything after a coherent call. Same reason.
- **No env prefix.** Never write \`UUID=$(coherent session start ...)\` or \`UUID=x coherent ...\`. The leading \`UUID=...\` makes the command not start with \`coherent\`.
- **No debug echo.** No \`coherent ...; echo "exit: $?"\` — exit code is reported through your own tool result, you don't need to echo it.
- **Inspect files with the Read tool, not Bash.** If you want to see how big a prompt file is, what's in plan.json, or whether an artifact got written — use Read or list_files. Never \`cat\`, \`wc\`, or \`ls\` via Bash for these.
- **Substitute the UUID literally** into every command. The UUID was printed by step 1; paste it directly. Each Bash call must START with the literal token \`coherent\`.

In the snippets below, \`<UUID>\` is a placeholder — replace it with the actual UUID printed by step 1.

If a Bash call legitimately fails (CLI returned non-zero), the tool result already includes the stderr — you don't need to redirect or echo. Read the result, fix the response file, retry.

## Steps

### 1. Start the session

\`\`\`bash
coherent session start --intent "<user request verbatim>"
\`\`\`

The command prints the session UUID (one line) to stdout. Capture it. Use that literal UUID in every subsequent command — do NOT prefix calls with \`UUID=...\` and do NOT pipe the output to anything.

### 2. Plan phase (AI)

\`\`\`bash
coherent _phase prep plan --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/plan-prompt.md
\`\`\`

Read \`.coherent/session/<UUID>/plan-prompt.md\`. Produce the plan JSON response (match the
schema in the prompt exactly). Write to \`.coherent/session/<UUID>/plan-response.md\`. Then:

\`\`\`bash
coherent _phase ingest plan --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/plan-response.md
\`\`\`

### 3. Anchor phase (AI)

Run prep first:

\`\`\`bash
coherent _phase prep anchor --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/anchor-prompt.md
\`\`\`

Read \`.coherent/session/<UUID>/anchor-prompt.md\`, produce the JSON response
(the schema is in the prompt), Write it to
\`.coherent/session/<UUID>/anchor-response.md\`. Then ingest in a SEPARATE Bash call:

\`\`\`bash
coherent _phase ingest anchor --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/anchor-response.md
\`\`\`

### 4. Extract-style phase (deterministic)

No AI call — pure transform over the anchor artifact:

\`\`\`bash
coherent _phase run extract-style --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL}
\`\`\`

### 5. Components phase (AI)

\`\`\`bash
coherent _phase prep components --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/components-prompt.md
\`\`\`

Read the prompt, Write the response file, then ingest in a SEPARATE Bash call:

\`\`\`bash
coherent _phase ingest components --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/components-response.md
\`\`\`

### 6. Page phase (AI, parallel per page)

Read \`.coherent/session/<UUID>/pages-input.json\` and run page phase for every
\`pageId\` in \`pages[].id\`. The first page in \`plan.pageNames\` is the
anchor — generated in step 3 — so \`pages-input.json\` deliberately does NOT
include it.

**Run pages in parallel.** Pages are independent after extract-style. Issue
calls in 3 batches of N parallel tool calls per message (cap at 6 per batch
for very wide plans):

- **Batch 1 — parallel prep:** one message, N parallel Bash calls, one per
  page id, each writing to \`page-<id>-prompt.md\`.
- **Batch 2 — parallel response writes:** read each prompt file, generate
  the response (JSON header + \`\`\`tsx fence per the format spec above),
  Write each \`page-<id>-response.md\`. One message, N parallel Write calls.
- **Batch 3 — parallel ingest:** one message, N parallel Bash calls, each
  piping its \`page-<id>-response.md\` into \`coherent _phase ingest
  page:<id>\`.

Example Bash calls within batches (substitute literal page id, e.g. \`page:balance\`):

\`\`\`bash
coherent _phase prep page:<pageId> --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/page-<pageId>-prompt.md
\`\`\`

\`\`\`bash
coherent _phase ingest page:<pageId> --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/page-<pageId>-response.md
\`\`\`

This collapses 12 sequential turns (4 pages × 3 steps) into 3 parallel batches.

### 7. End the session

\`\`\`bash
coherent session end <UUID>
\`\`\`

Applies all artifacts (config-delta, generated pages, components), writes
the run record under \`.coherent/runs/\`, releases the project lock.

### 8. Run \`coherent fix\` (auto-install shadcn primitives + cleanup)

\`\`\`bash
coherent fix
\`\`\`

Generated pages often import shadcn primitives (\`@/components/ui/badge\`,
\`tabs\`, \`select\`, etc.) that the user's project doesn't yet have.
Session-end doesn't auto-install them — \`coherent fix\` does. Without this
step, \`coherent preview\` will throw \`Module not found\` on first open.
Run it once after \`session end\`.

## Error recovery

- Any step fails: the session dir under \`.coherent/session/<UUID>/\` stays
  intact for post-mortem. Re-run the failing step after producing a
  corrected response, or \`coherent session end <UUID> --keep\` to bail
  while preserving state.
- \`Protocol mismatch\`: the CLI's \`PHASE_ENGINE_PROTOCOL\` differs from
  what this skill was written for. Upgrade one side before retrying.
- \`ingest: empty stdin\`: your response file is empty or whitespace-only.
  Regenerate and re-pipe.

## Response quality

Every AI phase's prompt contains the Coherent constraint bundle (design
thinking, core constraints, quality rules, contextual rules, golden
patterns, atmosphere directive). Follow them literally — the CLI's
validator rejects raw Tailwind colors, undersized tap targets, and other
anti-patterns on \`session end\`, and the page will be regenerated.
`

const SETTINGS_JSON = `{
  "permissions": {
    "allow": [
      "Bash(coherent *)",
      "Bash(npm run *)",
      "Bash(npx next *)",
      "Read",
      "Edit",
      "Write"
    ]
  }
}
`

export function writeClaudeCommands(projectRoot: string): void {
  const dir = join(projectRoot, '.claude', 'commands')
  ensureDir(dir)
  for (const [name, body] of Object.entries(COMMANDS)) {
    writeFileSync(join(dir, name), body, 'utf-8')
  }
}

/**
 * Exported for tests — the skill body generated for this CLI build. Every
 * `coherent _phase ...` invocation inside must carry
 * `--protocol ${PHASE_ENGINE_PROTOCOL}`; the test suite enforces that.
 */
export const COHERENT_CHAT_SKILL_BODY = SKILL_COHERENT_CHAT

/**
 * Extract the declared `phase_engine_protocol` from a coherent-chat
 * SKILL.md body. Returns `null` when the frontmatter key is missing or
 * unparseable — callers treat that as "pre-protocol-guard markdown".
 */
export function readSkillProtocol(markdown: string): number | null {
  const match = markdown.match(/^phase_engine_protocol:\s*(\d+)\s*$/m)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

export function writeClaudeSkills(projectRoot: string): void {
  // v0.10.0 rename: drop legacy /coherent-project (retired) and /coherent-generate (renamed).
  for (const legacy of ['coherent-project', 'coherent-generate']) {
    const dir = join(projectRoot, '.claude', 'skills', legacy)
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // Permission/ENOENT: safe to ignore — next run will retry.
      }
    }
  }
  // Legacy slash command too.
  const legacyCmd = join(projectRoot, '.claude', 'commands', 'coherent-generate.md')
  if (existsSync(legacyCmd)) {
    try {
      rmSync(legacyCmd, { force: true })
    } catch {
      // ignore
    }
  }

  const dirFrontend = join(projectRoot, '.claude', 'skills', 'frontend-ux')
  const dirChat = join(projectRoot, '.claude', 'skills', 'coherent-chat')
  ensureDir(dirFrontend)
  ensureDir(dirChat)
  writeFileSync(join(dirFrontend, 'SKILL.md'), SKILL_FRONTEND_UX, 'utf-8')

  // R5 refresh notice: if an older protocol generation exists in the project,
  // tell the user it's being upgraded so a stale ambient copy never goes
  // unnoticed. Silent when the markdown is absent or already current.
  const chatPath = join(dirChat, 'SKILL.md')
  if (existsSync(chatPath)) {
    try {
      const existing = readFileSync(chatPath, 'utf-8')
      const declared = readSkillProtocol(existing)
      if (declared !== null && declared !== PHASE_ENGINE_PROTOCOL) {
        console.log(
          chalk.yellow(`   ↻ Refreshing coherent-chat skill (protocol ${declared} → ${PHASE_ENGINE_PROTOCOL}).`),
        )
      }
    } catch {
      // Unreadable existing file — overwrite silently, downstream tooling
      // already handles broken `.claude/` state.
    }
  }
  writeFileSync(chatPath, SKILL_COHERENT_CHAT, 'utf-8')
}

export function writeClaudeSettings(projectRoot: string): void {
  const dir = join(projectRoot, '.claude')
  ensureDir(dir)
  writeFileSync(join(dir, 'settings.json'), SETTINGS_JSON.trim(), 'utf-8')
}
