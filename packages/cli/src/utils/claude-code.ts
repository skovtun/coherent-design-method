/**
 * Static `.claude/*` writers for Claude Code (commands, skills, settings.json).
 * Dynamic project context (CLAUDE.md, etc.) lives in `harness-context.ts`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
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
use \`/coherent-generate\` — same pipeline, but the generation happens in your
current Claude session.
`,
  'coherent-generate.md': `---
description: Generate Coherent-constrained UI using your Claude Code session (no API key needed)
argument-hint: [intent, e.g. "a CRM dashboard with charts"]
allowed-tools: Bash(coherent session *), Bash(coherent _phase *), Bash(coherent check *), Bash(coherent fix *), Read, Write
---

You are driving Coherent's v0.9.0 phase-engine rail from inside a Claude Code session. The CLI never calls an AI API under this command; every AI phase's response comes from THIS model session. Coherent contributes the constraint bundle, the per-phase prompts, and the session-end validator.

**Protocol version: ${PHASE_ENGINE_PROTOCOL}.** Every \`coherent _phase ...\` call below carries \`--protocol ${PHASE_ENGINE_PROTOCOL}\` so CLI/markdown drift is caught at the first ingest, not silently halfway through the run.

## Flow overview

\`\`\`
session start
  → plan          (AI: prep → respond → ingest)
  → anchor        (AI)
  → extract-style (deterministic: run)
  → components    (AI)
  → page × N      (AI, one prep/ingest per page)
session end  (applies all artifacts + writes run record)
\`\`\`

## Steps

### 1. Start the session

\`\`\`bash
UUID=$(coherent session start --intent "$ARGUMENTS")
\`\`\`

Keep \`UUID\` for every subsequent phase call.

### 2. Plan phase (AI)

\`\`\`bash
coherent _phase prep plan --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} > /tmp/coherent-$UUID-plan-prompt.md
\`\`\`

Read \`/tmp/coherent-$UUID-plan-prompt.md\`. Produce the plan JSON response (match the schema in the prompt exactly). Write to \`/tmp/coherent-$UUID-plan-response.md\`. Then:

\`\`\`bash
coherent _phase ingest plan --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} < /tmp/coherent-$UUID-plan-response.md
\`\`\`

### 3. Anchor phase (AI)

Same prep → respond → ingest cycle:

\`\`\`bash
coherent _phase prep anchor --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} > /tmp/coherent-$UUID-anchor-prompt.md
# produce response file
coherent _phase ingest anchor --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} < /tmp/coherent-$UUID-anchor-response.md
\`\`\`

### 4. Extract-style phase (deterministic)

\`\`\`bash
coherent _phase run extract-style --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL}
\`\`\`

### 5. Components phase (AI)

\`\`\`bash
coherent _phase prep components --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} > /tmp/coherent-$UUID-components-prompt.md
# produce response file
coherent _phase ingest components --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} < /tmp/coherent-$UUID-components-response.md
\`\`\`

### 6. Page phase (AI, repeat per page)

For each \`pageId\` in \`.coherent/session/$UUID/plan.json\` under \`pageNames[].id\`:

\`\`\`bash
coherent _phase prep page:<pageId> --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} > /tmp/coherent-$UUID-page-<id>-prompt.md
# produce response file
coherent _phase ingest page:<pageId> --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} < /tmp/coherent-$UUID-page-<id>-response.md
\`\`\`

### 7. End the session

\`\`\`bash
coherent session end "$UUID"
\`\`\`

Applies all artifacts (config-delta, generated pages, components) — including the auto-fix pass on every file — writes the run record under \`.coherent/runs/\`, releases the project lock.

## Report back

Tell the user:
- Which pages and components were written (read from the \`session end\` output).
- Run-record path under \`.coherent/runs/\`.
- Any pages that were skipped (empty pageCode) and need regeneration.

If \`session end\` reported auto-fix counts, mention them — it means the AI-generated code had known issues and the CLI corrected them before write.

## Error recovery

- \`Protocol mismatch\`: the CLI's \`PHASE_ENGINE_PROTOCOL\` differs from this command's declared version. Upgrade one side (\`coherent update\` in the project to refresh this markdown) before retrying.
- \`ingest: empty stdin\`: your response file is empty or whitespace-only. Regenerate and re-pipe.
- Any step fails: the session dir under \`.coherent/session/$UUID/\` is preserved. Re-run the failing step after correcting the response, or \`coherent session end "$UUID" --keep\` to bail while preserving state. The project lock is released even on failure — subsequent sessions can start immediately.
`,
}

const SKILL_COHERENT = `---
name: coherent-project
description: Coherent Design Method project conventions and component rules
---

# Coherent Project Conventions

## Component Library

This project uses shadcn/ui as base component library. All UI elements
must be imported from \`@/components/ui/*\`. Native HTML form elements
are forbidden.

### Import Map

| Need | Import |
|------|--------|
| Button | \`import { Button } from "@/components/ui/button"\` |
| Input | \`import { Input } from "@/components/ui/input"\` |
| Select | \`import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"\` |
| Checkbox | \`import { Checkbox } from "@/components/ui/checkbox"\` |
| Switch | \`import { Switch } from "@/components/ui/switch"\` |
| Table | \`import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"\` |
| Card | \`import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"\` |
| Badge | \`import { Badge } from "@/components/ui/badge"\` |
| Label | \`import { Label } from "@/components/ui/label"\` |

## Shared Components

Shared components live in \`components/shared/\` and are registered in
\`coherent.components.json\` with unique IDs (CID-001, CID-002, etc.).

Types:
- **layout** — Header, Footer, Sidebar (used in layout.tsx, affect all pages)
- **section** — Hero, PricingCard, Testimonials (reusable page sections)
- **widget** — ThemeToggle, SearchBar (small reusable UI blocks)

CRITICAL: Before creating any component that might already exist as shared,
check \`coherent.components.json\`. Import existing shared components instead
of recreating them inline.

## Form Patterns

- Label above Input
- space-y-2 within field group
- space-y-6 between groups
- Switch for boolean toggles
- Select for 3+ options
- CardFooter for form actions

## Links & Interactive States

- Text links: text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors
- Nav links: text-sm font-medium text-muted-foreground hover:text-foreground transition-colors (no underline)
- ALL links on the same page MUST use the SAME style
- ALL interactive elements MUST have hover: and focus-visible: states
- Identical components must look identical on every page — no per-page variations

## Component Styling Standards

### Badge — status mapping (same status = same variant everywhere)
| Semantic | Variant | Examples |
|----------|---------|----------|
| Success | default | Active, Paid, Verified, Online, Published |
| Neutral | secondary | Pending, Draft, In Progress, Scheduled |
| Warning | outline | Review, Expiring, Low Stock, Due Soon |
| Error | destructive | Failed, Overdue, Declined, Cancelled |

### Avatar
- size-8 in tables/lists. size-10 in profile headers. Always rounded-full.
- Fallback: \`<AvatarFallback className="text-xs font-medium">JD</AvatarFallback>\`

### Dialog
- Confirm/delete: max-w-sm. Standard form: max-w-md. Complex: max-w-lg.
- Footer: cancel (outline) left, primary action right.
- Destructive: primary button variant="destructive".
- Never Dialog for success — use toast.

### Dropdown Menu
- Items: text-sm. Icon: size-4 mr-2 before text.
- Destructive item at bottom, preceded by separator, className="text-destructive".
- Trigger: Button variant="ghost" size="icon".

### Tabs
- TabsContent: space-y-4. TabsList: w-full md:w-auto.

### Alert
- Info: \`<Alert>\` + Info icon. Error: \`<Alert variant="destructive">\` + AlertCircle.
- Placement: top of section, full width.

### Section Headers
- \`<h2 className="text-lg font-semibold tracking-tight">\`
- With action: wrap in flex items-center justify-between.

### Navigation Active State
- Sidebar active: bg-accent text-accent-foreground font-medium
- Top nav active: text-foreground font-medium (no bg)

### Separator
- Between page sections: \`<Separator className="my-6" />\`
- Between list items: border-b on items (NOT Separator)
- Never native \`<hr>\`

### Tooltip
- Icon-only buttons only. One line max. Single TooltipProvider at page level.

### Images
- Hero: aspect-video rounded-xl object-cover.
- Thumbnail: aspect-square rounded-md object-cover.
- Fallback: bg-muted + centered ImageIcon.

### Toast
- Use shadcn toast, never browser alert()/confirm().
- Success: description only, 3-5s. Error: variant="destructive", title + description, persistent.
- For background actions (save/delete/copy). Inline text for form validation.

### Table Rows
- Data rows: hover:bg-muted/50. Actions: last column, DropdownMenu with MoreHorizontal.
- Wrap in overflow-x-auto. Empty: colSpan + "No results." centered.

### Button Grouping
- Order: secondary first, primary LAST. Destructive isolated/last.
- Gap: flex items-center gap-2. Icon+text: icon mr-2 size-4 before text.
- Icon-only: size="icon" + Tooltip.

### Skeleton
- Text: h-4 animate-pulse rounded-md bg-muted (vary widths).
- Button loading: \`<Loader2 className="mr-2 size-4 animate-spin" />\` + disabled.
- Match content shape. Never centered spinner for page loads.

### Sheet
- Filters, mobile nav, detail preview → Sheet (default side: right).
- Confirmations, blocking → Dialog.

### Breadcrumb
- Pages 2+ levels deep. Current: text-foreground. Parents: text-muted-foreground with links.

### Code Block
- Inline: rounded bg-muted px-1.5 py-0.5 font-mono text-sm.
- Block: rounded-md bg-muted px-4 py-3 font-mono text-sm. Copy: ghost sm button.

### Pagination
- shadcn Pagination, centered below list. Max 5 visible pages + ellipsis.
- Feeds: "Load more" button (outline, w-full).

### Card Actions
- Content cards: DropdownMenu in CardHeader top-right.
- Form cards: CardFooter with cancel + save.
- Never both header AND footer actions.

### Search Input
- Search icon absolute left-3, Input pl-9. Debounce 300ms. Clear X on right when has value.

### Accordion
- shadcn Accordion. "single" for FAQ. "multiple" for settings.

### Popover vs Dropdown vs Dialog
- Action list → DropdownMenu. Small form → Popover. Complex/blocking → Dialog.

### ScrollArea
- Fixed containers (sidebar, modal) → ScrollArea. Dynamic page content → overflow-y-auto.

### Empty States
- Centered: icon size-12 + h3 title + p description + CTA Button. Always provide action.

### Stat Cards
- CardTitle text-sm font-medium, metric text-2xl font-bold. Grid md:grid-cols-2 lg:grid-cols-4.
- Trend up: text-emerald-600 + ArrowUp. Down: text-destructive + ArrowDown.

### Error Pages
- Centered min-h-[50vh]. 404/500 text + description + "Go home" CTA. Never dead-end user.

### Confirmation Dialog
- Title: action-specific. Description: consequences. Cancel(outline) + Destructive button.

### Multi-Step Forms
- Numbered circles. Active: bg-primary. Completed: CheckCircle. Upcoming: bg-muted.
- Back (outline) + Next (default). Validate before allowing Next.

### Form Validation
- text-sm text-destructive below input. border-destructive on Input. Show on blur/submit.

### File Upload
- border-2 border-dashed border-muted-foreground/25. Upload icon + drag/browse text.

### RadioGroup
- 2-3 options: RadioGroup. 4+: Select. Vertical default.

### Notification Indicators
- Dot: absolute -top-1 -right-1 size-2 bg-destructive. Count: max "9+".

### Progress Bar
- shadcn Progress h-2. Label text-sm above. For uploads/quotas. NEVER page loads.

### Data Formatting
- Dates: relative recent, "Jan 26, 2026" older. Numbers: toLocaleString. Currency: $1,234.56.

### Status Dots + Trends
- Dot: size-2 rounded-full. Trends: emerald+ArrowUp positive, destructive+ArrowDown negative.

### Timeline
- Vertical dot + line connector + event. Last item no connector.

### Avatar Group
- flex -space-x-2. ring-2 ring-background. Max 4 + "+N" counter.

### Sidebar Layout
- Desktop: w-64 sidebar + main. Mobile: Sheet from left via hamburger.

### Settings Page
- Two-col: nav w-48 left + Cards right. Danger zone: separate Card at bottom.

### Pricing Cards
- grid md:grid-cols-3. Highlighted: ring-2 ring-primary + Popular Badge.

### Hero Section
- Centered py-16 md:py-24. H1 text-3xl md:text-5xl. CTAs: Button size="lg".

### Toggle / ToggleGroup
- View switchers (grid/list). NOT for booleans (use Switch).

### Command Palette
- shadcn Command. Trigger: ⌘K. Groups + items with shortcuts.

### Copy to Clipboard
- Ghost sm button. Swap Copy→Check icon for 2s.

### Z-Index & Animation
- Content=z-0, sticky=z-10, dropdowns=z-50, toast=z-[100].
- transition-colors for hovers, 150ms. NEVER page load animations.

## Design Quality Standards

- Headlines: text-4xl+ font-bold tracking-tight for page titles, text-5xl+ for heroes, text-2xl+ for sections
- Cards: rounded-xl with border-border/15, ALWAYS hover: hover:border-border/30 transition-colors
- Icons in cards: wrapped in bg-primary/10 rounded-lg p-2.5, h-5 w-5
- Terminal blocks: bg-zinc-950 rounded-xl, text-emerald-400, green "$ " prompt
- Spacing: py-20+ between sections, p-6 inside cards, gap-5 between cards
- One accent color per page. Gradient text on hero key phrase
- Comparison: red-400 X negative, emerald-400 Check positive
- Footer: border-t border-border/10, py-10, text-sm text-muted-foreground

## Design Tokens

All colors use CSS variables defined in \`globals.css\`.
Use semantic Tailwind classes: bg-background, text-foreground, bg-primary, etc.
Never hardcode colors or use arbitrary values like bg-[#123456].

## Auth Pages

Pages matching: login, signup, register, forgot-password, reset-password
→ placed in \`app/(auth)/\` route group
→ no Header/Footer shown

## Platform Overlay (DO NOT TOUCH)

- \`app/design-system/*\` — auto-generated DS viewer
- \`app/api/design-system/*\` — platform API
- \`coherent.components.json\` — component manifest
- Floating DS button in layout

These are dev-only, stripped during \`coherent export\`.
`

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

const SKILL_COHERENT_GENERATE = `---
name: coherent-generate
description: Skill-mode orchestrator for Coherent page/component/project generation via the phase-engine CLI
phase_engine_protocol: ${PHASE_ENGINE_PROTOCOL}
---

# coherent-generate — skill-mode orchestrator

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
\`\`\`

## Steps

### 1. Start the session

\`\`\`bash
UUID=$(coherent session start --intent "<user request verbatim>")
\`\`\`

Keep \`UUID\` for every subsequent phase call.

### 2. Plan phase (AI)

\`\`\`bash
coherent _phase prep plan --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} > /tmp/coherent-$UUID-plan-prompt.md
\`\`\`

Read \`/tmp/coherent-$UUID-plan-prompt.md\`. Produce the plan JSON response (match the
schema in the prompt exactly). Write to \`/tmp/coherent-$UUID-plan-response.md\`. Then:

\`\`\`bash
coherent _phase ingest plan --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} < /tmp/coherent-$UUID-plan-response.md
\`\`\`

### 3. Anchor phase (AI)

Same prep → respond → ingest cycle:

\`\`\`bash
coherent _phase prep anchor --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} > /tmp/coherent-$UUID-anchor-prompt.md
# produce response file
coherent _phase ingest anchor --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} < /tmp/coherent-$UUID-anchor-response.md
\`\`\`

### 4. Extract-style phase (deterministic)

No AI call — pure transform over the anchor artifact:

\`\`\`bash
coherent _phase run extract-style --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL}
\`\`\`

### 5. Components phase (AI)

\`\`\`bash
coherent _phase prep components --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} > /tmp/coherent-$UUID-components-prompt.md
# produce response file
coherent _phase ingest components --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} < /tmp/coherent-$UUID-components-response.md
\`\`\`

### 6. Page phase (AI, repeat per page)

For each \`pageId\` in \`.coherent/session/$UUID/plan.json\` under
\`pageNames[].id\`:

\`\`\`bash
coherent _phase prep page:<pageId> --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} > /tmp/coherent-$UUID-page-<id>-prompt.md
# produce response file
coherent _phase ingest page:<pageId> --session "$UUID" --protocol ${PHASE_ENGINE_PROTOCOL} < /tmp/coherent-$UUID-page-<id>-response.md
\`\`\`

### 7. End the session

\`\`\`bash
coherent session end "$UUID"
\`\`\`

Applies all artifacts (config-delta, generated pages, components), writes
the run record under \`.coherent/runs/\`, releases the project lock.

## Error recovery

- Any step fails: the session dir under \`.coherent/session/$UUID/\` stays
  intact for post-mortem. Re-run the failing step after producing a
  corrected response, or \`coherent session end "$UUID" --keep\` to bail
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
export const COHERENT_GENERATE_SKILL_BODY = SKILL_COHERENT_GENERATE

/**
 * Extract the declared `phase_engine_protocol` from a coherent-generate
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
  const dirCoherent = join(projectRoot, '.claude', 'skills', 'coherent-project')
  const dirFrontend = join(projectRoot, '.claude', 'skills', 'frontend-ux')
  const dirGenerate = join(projectRoot, '.claude', 'skills', 'coherent-generate')
  ensureDir(dirCoherent)
  ensureDir(dirFrontend)
  ensureDir(dirGenerate)
  writeFileSync(join(dirCoherent, 'SKILL.md'), SKILL_COHERENT, 'utf-8')
  writeFileSync(join(dirFrontend, 'SKILL.md'), SKILL_FRONTEND_UX, 'utf-8')

  // R5 refresh notice: if an older protocol generation exists in the project,
  // tell the user it's being upgraded so a stale ambient copy never goes
  // unnoticed. Silent when the markdown is absent or already current.
  const generatePath = join(dirGenerate, 'SKILL.md')
  if (existsSync(generatePath)) {
    try {
      const existing = readFileSync(generatePath, 'utf-8')
      const declared = readSkillProtocol(existing)
      if (declared !== null && declared !== PHASE_ENGINE_PROTOCOL) {
        console.log(
          chalk.yellow(`   ↻ Refreshing coherent-generate skill (protocol ${declared} → ${PHASE_ENGINE_PROTOCOL}).`),
        )
      }
    } catch {
      // Unreadable existing file — overwrite silently, downstream tooling
      // already handles broken `.claude/` state.
    }
  }
  writeFileSync(generatePath, SKILL_COHERENT_GENERATE, 'utf-8')
}

export function writeClaudeSettings(projectRoot: string): void {
  const dir = join(projectRoot, '.claude')
  ensureDir(dir)
  writeFileSync(join(dir, 'settings.json'), SETTINGS_JSON.trim(), 'utf-8')
}
