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

The flow is **dynamic** — phases are gated by \`session-shape.json\` written by the plan phase. After plan ingest, read \`session-shape.json\` and follow only the phases listed in \`shape.phases\`.

Two common shapes:

\`\`\`
Plan-only (delete-page, update-token, add-component, etc.):
  session start → plan → session end                          (2 steps)

Full add-page generation:
  session start → plan → anchor → extract-style → components
                       → page × N → session end → coherent fix (8 steps)
\`\`\`

A rename like "rename Transactions to Activity" decomposes into \`[delete-page X, add-page Y]\` and uses the FULL flow because of the add-page. A pure \`[delete-page X]\` uses the plan-only flow and skips anchor / extract-style / components / page entirely.

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

Common cases (v0.11.4):
- **Components** when the plan has zero shared components.
- **Anchor** when the plan has no \`add-page\` request (plan-only flows).
- **Components** when extract-style was skipped (no \`components-input.json\` to read).

If you forget to skip and call \`_phase ingest\` after a sentinel, ingest also no-ops gracefully — but you'll have wasted a Write+Bash turn.

## Progress reporting

Use the \`session-shape.json\` to size your progress counters. Total = \`shape.phases.length\` (2 for plan-only, 8 for full add-page generation). Position = the phase you're about to run.

Examples (positions match a shape with \`phases: ["plan", "anchor", "extract-style", "components", "page", "apply"]\` plus the post-apply fix step):

- \`▸ [1/8] Planning pages…\`
- \`▸ [2/8] Generating anchor page (Dashboard)…\`
- \`▸ [3/8] Extracting design tokens…\`
- \`▸ [4/8] No shared components — skipping\` (sentinel)
- \`▸ [5/8] Generating /balance, /transactions, /settings in parallel…\`
- \`▸ [6/8] Applying to disk…\`
- \`▸ [7/8] Auto-installing shadcn primitives…\`
- \`▸ [8/8] Done — preview ready\`

Plan-only example (\`phases: ["plan", "apply"]\`):

- \`▸ [1/2] Planning…\`
- \`▸ [2/2] Applying delete-page to disk…\`
- \`▸ Done — preview ready\` (post-apply line, no counter)

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

### 2.5. Read the session shape (gates everything below)

Read \`.coherent/session/<UUID>/session-shape.json\` with the Read tool. The plan ingest wrote it. Shape fields:

- \`phases: string[]\` — ordered list of phases this session needs, e.g. \`["plan", "apply"]\` or \`["plan", "anchor", "extract-style", "components", "page", "apply"]\`. Use \`phases.length\` for the \`[N/M]\` counter total.
- \`hasAddPage: boolean\` — when \`false\`, **skip steps 3–6 entirely** (anchor, extract-style, components, page). Jump to step 7.
- \`hasOnlyNoAiRequests: boolean\` — when \`true\`, fast path. The modification applier handles delete-page / delete-component / update-token / add-component / modify-component deterministically at session end. No AI generation needed.
- \`needsFix: boolean\` — when \`false\`, **skip step 8** (\`coherent fix\`). For plan-only ops it's noisy and risks mutating unrelated state.

If the shape file is missing (older CLI), default to \`hasAddPage: true\` + \`needsFix: true\` and run all steps as before.

### 3. Anchor phase (AI) — only if \`shape.hasAddPage\`

Run prep first:

\`\`\`bash
coherent _phase prep anchor --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/anchor-prompt.md
\`\`\`

Read \`.coherent/session/<UUID>/anchor-prompt.md\`, produce the JSON response (schema is in the prompt), Write it to \`.coherent/session/<UUID>/anchor-response.md\`. Then ingest in a separate Bash call:

\`\`\`bash
coherent _phase ingest anchor --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/anchor-response.md
\`\`\`

### 4. Extract-style phase (deterministic) — only if \`shape.hasAddPage\`

\`\`\`bash
coherent _phase run extract-style --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL}
\`\`\`

### 5. Components phase (AI) — only if \`shape.hasAddPage\`

\`\`\`bash
coherent _phase prep components --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/components-prompt.md
\`\`\`

Read the prompt, produce the response file, then ingest in a separate Bash call:

\`\`\`bash
coherent _phase ingest components --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/components-response.md
\`\`\`

### 6. Page phase (AI, parallel per page) — only if \`shape.hasAddPage\`

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

Applies all artifacts in order: config-delta → modification (delete-page, update-token, add-component, modify-component, delete-component) → components → pages → replace-welcome → layout → fix-globals-css. Writes the run record under \`.coherent/runs/\`, releases the project lock.

The output starts with \`Applied:\` followed by one line per applier with what it did. Capture this — you'll surface it in the completion signal below.

### 8. Run \`coherent fix\` — only if \`shape.needsFix\`

\`\`\`bash
coherent fix
\`\`\`

When generated pages or shared components landed in step 6/7, they often import shadcn primitives (\`@/components/ui/badge\`, \`tabs\`, \`select\`, etc.) that the user's project doesn't yet have. \`coherent fix\` auto-installs them and runs cleanup. Without this step, \`coherent preview\` would throw \`Module not found\` on the first page open.

For plan-only sessions (delete-page, update-token, etc.) \`needsFix\` is \`false\` — \`coherent fix\` is noisy and risks mutating unrelated state. Skip it.

## Completion signal

After step 7 (and step 8 when \`needsFix\`), print ONE final line.

**Format — no backticks anywhere on this line.** Claude Code renders inline code as gray-on-light text; on the highlighted ✅ Done plate the contrast collapses to invisible (the v0.11.4 dogfood showed "Run \`coherent preview\` to see it" with the command literally unreadable). Use plain text:

> ✅ Done. Applied: <comma-separated summary from session end>. Preview: coherent preview

The summary comes from the \`session end\` output — read its \`Applied:\` block and condense to a one-liner. Examples (verbatim, plain text):

> ✅ Done. Applied: delete-page Profile. Preview: coherent preview

> ✅ Done. Applied: 4 pages, 2 components, layout regen. Preview: coherent preview

If \`session end\` errored (non-zero exit, error in output) — say what failed instead, plain text:

> ❌ Session end failed: <error message verbatim>. Project unchanged. See .coherent/session/<UUID>/ for state.

Do NOT print the green Done line on failure.

## Report back

Beyond the one-line completion signal, also surface:

- Run-record path under \`.coherent/runs/\` (helps with later retros / debugging).
- Any pages that were skipped (empty pageCode) and need regeneration.
- Shadcn primitives \`coherent fix\` auto-installed (only when step 8 ran).
- Auto-fix counts from \`session end\` (means the AI-generated code had known issues and the CLI corrected them before write).

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

The flow is **dynamic** — phases are gated by \`session-shape.json\` written by the plan phase. After plan ingest, read \`session-shape.json\` and follow only the phases listed in \`shape.phases\`.

Two common shapes:

\`\`\`
Plan-only (delete-page, update-token, add-component, etc.):
  session start → plan → session end                          (2 steps)

Full add-page generation:
  session start → plan → anchor → extract-style → components
                       → page × N → session end → coherent fix (8 steps)
\`\`\`

A rename like "rename Transactions to Activity" decomposes into \`[delete-page X, add-page Y]\` and uses the FULL flow because of the add-page. A pure \`[delete-page X]\` uses the plan-only flow and skips anchor / extract-style / components / page entirely.

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

Common cases (v0.11.4):
- **Components** when the plan has zero shared components.
- **Anchor** when the plan has no \`add-page\` request (plan-only flows).
- **Components** when extract-style was skipped (no \`components-input.json\` to read).

If you forget to skip and call \`_phase ingest\` after a sentinel, ingest also no-ops gracefully — but you'll have wasted a Write+Bash turn.

## Progress reporting

Use the \`session-shape.json\` to size your progress counters. Total = \`shape.phases.length\` (2 for plan-only, 8 for full add-page generation when including \`coherent fix\`). Position = the phase you're about to run.

Examples (\`phases: ["plan", "anchor", "extract-style", "components", "page", "apply"]\` plus the post-apply fix step):

- \`▸ [1/8] Planning pages…\`
- \`▸ [2/8] Generating anchor page (Dashboard)…\`
- \`▸ [3/8] Extracting design tokens…\`
- \`▸ [4/8] No shared components — skipping\` (sentinel)
- \`▸ [5/8] Generating /balance, /transactions, /settings in parallel…\`
- \`▸ [6/8] Applying to disk…\`
- \`▸ [7/8] Auto-installing shadcn primitives…\`
- \`▸ [8/8] Done — preview ready\`

Plan-only example (\`phases: ["plan", "apply"]\`):

- \`▸ [1/2] Planning…\`
- \`▸ [2/2] Applying delete-page to disk…\`
- \`▸ Done — preview ready\` (post-apply line, no counter)

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

### 2.5. Read the session shape (gates everything below)

Read \`.coherent/session/<UUID>/session-shape.json\` with the Read tool. The plan ingest wrote it. Shape fields:

- \`phases: string[]\` — ordered list of phases this session needs, e.g. \`["plan", "apply"]\` or \`["plan", "anchor", "extract-style", "components", "page", "apply"]\`. Use \`phases.length\` for the \`[N/M]\` counter total.
- \`hasAddPage: boolean\` — when \`false\`, **skip steps 3–6 entirely** (anchor, extract-style, components, page). Jump to step 7.
- \`hasOnlyNoAiRequests: boolean\` — when \`true\`, fast path. The modification applier handles delete-page / delete-component / update-token / add-component / modify-component deterministically at session end. No AI generation needed.
- \`needsFix: boolean\` — when \`false\`, **skip step 8** (\`coherent fix\`). For plan-only ops it's noisy and risks mutating unrelated state.

If the shape file is missing (older CLI), default to \`hasAddPage: true\` + \`needsFix: true\` and run all steps as before.

### 3. Anchor phase (AI) — only if \`shape.hasAddPage\`

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

### 4. Extract-style phase (deterministic) — only if \`shape.hasAddPage\`

No AI call — pure transform over the anchor artifact:

\`\`\`bash
coherent _phase run extract-style --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL}
\`\`\`

### 5. Components phase (AI) — only if \`shape.hasAddPage\`

\`\`\`bash
coherent _phase prep components --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} > .coherent/session/<UUID>/components-prompt.md
\`\`\`

Read the prompt, Write the response file, then ingest in a SEPARATE Bash call:

\`\`\`bash
coherent _phase ingest components --session <UUID> --protocol ${PHASE_ENGINE_PROTOCOL} < .coherent/session/<UUID>/components-response.md
\`\`\`

### 6. Page phase (AI, parallel per page) — only if \`shape.hasAddPage\`

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

Applies all artifacts in order: config-delta → modification → components → pages → replace-welcome → layout → fix-globals-css. Writes the run record under \`.coherent/runs/\`, releases the project lock.

The output starts with \`Applied:\` followed by one line per applier. Capture this — surface it in the completion signal.

### 8. Run \`coherent fix\` — only if \`shape.needsFix\`

\`\`\`bash
coherent fix
\`\`\`

When generated pages or shared components landed in step 6/7, they often import shadcn primitives (\`@/components/ui/badge\`, \`tabs\`, \`select\`, etc.) that the user's project doesn't yet have. \`coherent fix\` auto-installs them and runs cleanup. Without this step, \`coherent preview\` would throw \`Module not found\` on first open.

For plan-only sessions (delete-page, update-token, etc.) \`needsFix\` is \`false\` — \`coherent fix\` is noisy and risks mutating unrelated state. Skip it.

## Completion signal

After step 7 (and step 8 when \`needsFix\`), print ONE final line.

**Format — no backticks anywhere on this line.** Claude Code renders inline code as gray-on-light text; on the highlighted ✅ Done plate the contrast collapses to invisible (the v0.11.4 dogfood showed "Run \`coherent preview\` to see it" with the command literally unreadable). Use plain text:

> ✅ Done. Applied: <comma-separated summary from session end>. Preview: coherent preview

The summary comes from the \`session end\` output — read its \`Applied:\` block and condense to a one-liner. Examples (verbatim, plain text):

> ✅ Done. Applied: delete-page Profile. Preview: coherent preview

> ✅ Done. Applied: 4 pages, 2 components, layout regen. Preview: coherent preview

If \`session end\` errored (non-zero exit, error in output) — say what failed instead, plain text:

> ❌ Session end failed: <error message verbatim>. Project unchanged. See .coherent/session/<UUID>/ for state.

Do NOT print the green Done line on failure.

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
