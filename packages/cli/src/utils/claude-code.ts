/**
 * Generate CLAUDE.md and .claude/* for Claude Code users.
 * Kept under 150 lines for CLAUDE.md; commands/skills/settings are static.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { DesignSystemConfig } from '@getcoherent/core'
import type { SharedComponentsManifest } from '@getcoherent/core'
import { loadManifest } from '@getcoherent/core'
import { DesignSystemManager } from '@getcoherent/core'

function buildSharedComponentsListForClaude(manifest: SharedComponentsManifest): string {
  if (!manifest.shared || manifest.shared.length === 0) {
    return 'No shared components yet. Register with: coherent components shared add <name> --type layout|section|widget'
  }
  const order: Record<string, number> = {
    layout: 0,
    navigation: 1,
    'data-display': 2,
    form: 3,
    feedback: 4,
    section: 5,
    widget: 6,
  }
  const sorted = [...manifest.shared].sort(
    (a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.name.localeCompare(b.name),
  )
  return sorted
    .map(e => {
      const used =
        e.usedIn.length === 0
          ? '—'
          : e.usedIn.length === 1 && e.usedIn[0] === 'app/layout.tsx'
            ? 'layout'
            : e.usedIn.length + ' files'
      return `- ${e.id} ${e.name} (${e.type}) — ${e.file} — ${used}`
    })
    .join('\n')
}

function buildClaudeMdContent(manifest: SharedComponentsManifest, _config: DesignSystemConfig | null): string {
  const sharedList = buildSharedComponentsListForClaude(manifest)
  return `# Coherent Design Method Project

This is a Coherent Design Method project — AI-powered multi-page UI prototype with shared component system.

## Architecture

- app/ — Next.js App Router pages
- components/ui/ — base shadcn/ui components (Button, Card, Input, etc.)
- components/shared/ — shared reusable blocks with unique IDs (CID-XXX)
- app/design-system/ — platform overlay (DO NOT MODIFY)
- coherent.components.json — shared component manifest
- design-system.config.ts — design tokens and page definitions

## Shared Components (MUST REUSE)

${sharedList}

Before creating ANY UI block, check if a shared component exists above. If yes — IMPORT it. NEVER recreate inline.

## Rules

- ONLY use @/components/ui/* — never native <button>, <select>, <input type="checkbox">, <table>
- Icons: lucide-react only
- Forms: Label above Input, Switch for toggles, Select for 3+ options
- Colors: semantic tokens only (bg-background, text-foreground, bg-primary) — never hardcoded
- Links: text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors (ALL links same style per page)
- ALL interactive elements MUST have hover: and focus-visible: states — no exceptions
- Identical components must look identical everywhere
- Badge: default=success, secondary=neutral, outline=warning, destructive=error (same status = same variant everywhere)
- Avatar: size-8 in lists, size-10 in profiles, always rounded-full
- Dialog: max-w-sm for confirms, max-w-md for forms. Footer: cancel left, action right
- Tabs: shadcn Tabs. TabsContent space-y-4. TabsList w-full md:w-auto
- Alert: <Alert> for info, variant="destructive" for errors. Never for success (use toast)
- Sections: h2 text-lg font-semibold. Separator between sections, border-b between list items
- Nav active: sidebar=bg-accent font-medium, top nav=text-foreground font-medium
- Toast: use shadcn toast, not browser alert(). Success=description only 3-5s, error=variant="destructive" persistent
- Table rows: hover:bg-muted/50, actions via DropdownMenu (MoreHorizontal), wrap in overflow-x-auto
- Button order: secondary first, primary LAST. Icon+text: icon mr-2 size-4 before text
- Skeleton: h-4 animate-pulse rounded-md bg-muted (match content shape). Button loading: Loader2 animate-spin
- Sheet for filters/mobile nav/previews. Dialog for confirmations/blocking. Sheet default side: right
- Breadcrumb on pages 2+ levels deep. Current page=text-foreground, parents=muted-foreground
- Code blocks: inline=rounded bg-muted px-1.5 py-0.5 font-mono text-sm. Block=rounded-md bg-muted px-4 py-3
- Pagination: shadcn Pagination, centered below list. Feeds: "Load more" button instead
- Card actions: DropdownMenu in CardHeader top-right OR actions in CardFooter, never both
- Search: relative + Search icon absolute left-3, Input pl-9, debounce 300ms
- Accordion: shadcn, type="single" for FAQ, "multiple" for settings
- Popover=small forms, DropdownMenu=action lists, Dialog=complex/blocking
- ScrollArea=fixed containers, native overflow-y-auto=dynamic content
- Empty states: centered icon (size-12) + title + description + CTA. Search/filter variants
- Stat cards: CardTitle text-sm font-medium, metric text-2xl font-bold, trend text-emerald-600/text-destructive
- Error pages: centered 404/500 + "Go home" CTA. Never dead-end the user
- Confirmation: title=action-specific, description=consequences, Cancel(outline)+Destructive
- Multi-step: numbered circles (bg-primary active, bg-muted upcoming), Back/Next buttons
- Form validation: text-sm text-destructive below input, border-destructive on input. NEVER toast
- File upload: border-2 border-dashed + Upload icon + "Drag and drop or browse"
- RadioGroup: 2-3 options=Radio, 4+=Select. Vertical default
- Notification dot: absolute -top-1 -right-1 size-2 bg-destructive. Count: max "9+"
- Progress: shadcn Progress h-2. For uploads/quotas. NEVER for page loads
- Data format: dates=relative recent, absolute older. Numbers=toLocaleString. Currency=$1,234.56
- Status dots: size-2 rounded-full (emerald=active, destructive=error, yellow=warning)
- Timeline: vertical dot+line+event. Avatar group: flex -space-x-2 ring-2 ring-background
- Sidebar: w-64 desktop, Sheet from left mobile. Settings: two-col nav+cards
- Pricing: grid md:grid-cols-3, highlighted=ring-2 ring-primary, Popular badge
- Hero: centered py-16 md:py-24, h1 text-3xl md:text-5xl, CTA size="lg"
- Command palette: shadcn Command, ⌘K trigger. Toggle/ToggleGroup for view switchers
- Copy: ghost sm button, swap Copy→Check icon 2s. Z-index: content=0, dropdown=50, toast=100
- Animation: transition-colors for hovers, 150ms. NEVER page load animations
- Accessibility: WCAG 2.2 AA, contrast ≥ 4.5:1, touch targets ≥ 44px, focus-visible on all interactive
- Auth pages (login, signup, etc.) go in app/(auth)/ route group — no Header/Footer

## After Making Changes

Run after changes:
- coherent check — show all quality and consistency issues (read-only)
- coherent fix — auto-fix cache, deps, syntax, and style issues

## Do NOT modify

- app/design-system/* — platform overlay
- app/api/design-system/* — platform API routes
- coherent.components.json — managed by platform
`
}

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
description: Add a new page to the prototype via Coherent CLI
argument-hint: [page-description]
allowed-tools: Bash(coherent chat *)
---
Run \`coherent chat "add $ARGUMENTS"\` in the project root.
This ensures the page goes through the full Coherent pipeline:
shared component reuse, validation, manifest update.
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

export function writeClaudeMd(
  projectRoot: string,
  manifest: SharedComponentsManifest,
  config: DesignSystemConfig | null,
): void {
  const content = buildClaudeMdContent(manifest, config)
  const outPath = join(projectRoot, 'CLAUDE.md')
  writeFileSync(outPath, content, 'utf-8')
}

export function writeClaudeCommands(projectRoot: string): void {
  const dir = join(projectRoot, '.claude', 'commands')
  ensureDir(dir)
  for (const [name, body] of Object.entries(COMMANDS)) {
    writeFileSync(join(dir, name), body, 'utf-8')
  }
}

export function writeClaudeSkills(projectRoot: string): void {
  const dirCoherent = join(projectRoot, '.claude', 'skills', 'coherent-project')
  const dirFrontend = join(projectRoot, '.claude', 'skills', 'frontend-ux')
  ensureDir(dirCoherent)
  ensureDir(dirFrontend)
  writeFileSync(join(dirCoherent, 'SKILL.md'), SKILL_COHERENT, 'utf-8')
  writeFileSync(join(dirFrontend, 'SKILL.md'), SKILL_FRONTEND_UX, 'utf-8')
}

export function writeClaudeSettings(projectRoot: string): void {
  const dir = join(projectRoot, '.claude')
  ensureDir(dir)
  writeFileSync(join(dir, 'settings.json'), SETTINGS_JSON.trim(), 'utf-8')
}

async function loadManifestAndConfig(
  projectRoot: string,
): Promise<{ manifest: SharedComponentsManifest; config: DesignSystemConfig | null }> {
  let manifest: SharedComponentsManifest
  try {
    manifest = await loadManifest(projectRoot)
  } catch {
    manifest = { shared: [], nextId: 1 }
  }
  let config: DesignSystemConfig | null = null
  const configPath = join(projectRoot, 'design-system.config.ts')
  if (existsSync(configPath)) {
    try {
      const dsm = new DesignSystemManager(configPath)
      await dsm.load()
      config = dsm.getConfig()
    } catch {
      // config may be invalid during init
    }
  }
  return { manifest, config }
}

/**
 * Generate CLAUDE.md only (used when shared components or config change).
 * Call from same places as writeCursorRules for shared-component updates.
 */
export async function updateClaudeMd(projectRoot: string): Promise<boolean> {
  try {
    const { manifest, config } = await loadManifestAndConfig(projectRoot)
    writeClaudeMd(projectRoot, manifest, config)
    return true
  } catch {
    return false
  }
}

/**
 * Generate all Claude Code files at coherent init.
 * Call after writeCursorRules in init.
 */
export async function generateClaudeCodeFiles(projectRoot: string): Promise<void> {
  const { manifest, config } = await loadManifestAndConfig(projectRoot)
  writeClaudeMd(projectRoot, manifest, config)
  writeClaudeCommands(projectRoot)
  writeClaudeSkills(projectRoot)
  writeClaudeSettings(projectRoot)
}
