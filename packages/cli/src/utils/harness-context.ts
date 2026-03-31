import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { DesignSystemConfig, SharedComponentsManifest } from '@getcoherent/core'
import { loadManifest, DesignSystemManager } from '@getcoherent/core'
import { findConfig } from './find-config.js'
import { writeClaudeCommands, writeClaudeSkills, writeClaudeSettings } from './claude-code.js'

export interface HarnessResult {
  written: boolean
  sharedCount?: number
  tokenKeys?: number
}

export interface ProjectContext {
  sharedComponents: string
  sharedComponentsCompact: string
  designTokens: string
  architectureDetailed: string
  architectureCompact: string
  rulesDetailed: string
  rulesCompact: string
  designQuality: string
  forms: string
  accessibility: string
  auth: string
  commands: string
  platform: string
}

export function buildSharedComponentsList(manifest: SharedComponentsManifest): string {
  if (!manifest.shared || manifest.shared.length === 0) {
    return `No shared components registered yet.
When you create reusable blocks (headers, footers, repeated sections),
register them: coherent components shared add <Name> --type layout|navigation|data-display|form|feedback|section|widget`
  }
  const typeOrder: Record<string, number> = {
    layout: 0,
    navigation: 1,
    'data-display': 2,
    form: 3,
    feedback: 4,
    section: 5,
    widget: 6,
  }
  const sorted = [...manifest.shared].sort(
    (a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9) || a.name.localeCompare(b.name),
  )
  const lines = sorted.map(entry => {
    const usedIn =
      entry.usedIn.length === 0
        ? '(not used yet)'
        : entry.usedIn.length === 1 && entry.usedIn[0] === 'app/layout.tsx'
          ? 'app/layout.tsx (all pages)'
          : entry.usedIn.join(', ')
    const importPath = entry.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
    const parts = [
      `- ${entry.id} ${entry.name} (${entry.type})${entry.description ? ` — ${entry.description}` : ''}`,
      `  Import: import { ${entry.name} } from '@/components/shared/${importPath}'`,
    ]
    if (entry.propsInterface) parts.push(`  Props: ${entry.propsInterface}`)
    if (entry.usageExample) parts.push(`  Usage: ${entry.usageExample}`)
    parts.push(`  Used in: ${usedIn}`)
    return parts.join('\n')
  })
  return `Currently registered shared components:\n\n${lines.join('\n\n')}`
}

export function buildSharedComponentsListCompact(manifest: SharedComponentsManifest): string {
  if (!manifest.shared || manifest.shared.length === 0) {
    return 'No shared components yet. Register with: coherent components shared add <name> --type layout|navigation|data-display|form|feedback|section|widget'
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

export function buildDesignTokensSummary(config: DesignSystemConfig | null): string {
  if (!config?.tokens) {
    return `Design tokens are defined in design-system.config.ts and globals.css.
Use semantic classes: bg-background, text-foreground, bg-primary, text-muted-foreground, etc.`
  }
  const t = config.tokens
  const light = t.colors?.light ?? {}
  const dark = t.colors?.dark ?? {}
  const lines: string[] = []
  const add = (label: string, value: string) => {
    if (value) lines.push(`- ${label}: ${value}`)
  }
  add('Primary', light.primary ?? dark.primary ?? '')
  add('Background', light.background ?? dark.background ?? '')
  add('Foreground', light.foreground ?? dark.foreground ?? '')
  add('Muted', light.muted ?? dark.muted ?? '')
  add('Border', light.border ?? dark.border ?? '')
  const radiusObj = t.radius
  const radiusStr =
    typeof radiusObj === 'object' && radiusObj && 'md' in radiusObj
      ? ((radiusObj as { md?: string }).md ?? '0.5rem')
      : typeof radiusObj === 'string'
        ? radiusObj
        : '0.5rem'
  add('Radius', radiusStr)
  if (lines.length === 0) {
    return `Tokens in design-system.config.ts. Use semantic classes (bg-primary, text-foreground, etc.).`
  }
  return `Current design tokens:\n${lines.join('\n')}`
}

export const ARCHITECTURE_DETAILED = `## Project Architecture

This is a Coherent Design Method project. It uses Next.js + Tailwind + a built-in component library.

### Key directories
- app/           — pages (Next.js App Router)
- components/ui/ — base UI components (Button, Card, Input, etc.)
- components/shared/ — shared reusable blocks with unique IDs (CID-XXX)
- app/design-system/ — platform overlay (DO NOT MODIFY)
- app/api/design-system/ — platform API (DO NOT MODIFY)

### Config files
- design-system.config.ts — design tokens, pages, navigation
- coherent.components.json — shared component manifest
- globals.css — CSS variables (colors, typography, spacing)`

export const ARCHITECTURE_COMPACT = `## Architecture

- app/ — Next.js App Router pages
- components/ui/ — base shadcn/ui components (Button, Card, Input, etc.)
- components/shared/ — shared reusable blocks with unique IDs (CID-XXX)
- app/design-system/ — platform overlay (DO NOT MODIFY)
- coherent.components.json — shared component manifest
- design-system.config.ts — design tokens and page definitions`

export const RULES_DETAILED = `## Component Rules (MANDATORY)

- ONLY use components from @/components/ui/* — never native HTML elements
- NEVER use native <button> — use: import { Button } from "@/components/ui/button"
- NEVER use native <select> — use: import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
- NEVER use native <input type="checkbox"> — use: import { Checkbox } from "@/components/ui/checkbox" or { Switch } from "@/components/ui/switch"
- NEVER use native <table> — use: import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
- Icons: import from lucide-react

## Link & Interactive State Consistency (MANDATORY)

- Text links: text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors
- Navigation links: text-sm font-medium text-muted-foreground hover:text-foreground transition-colors (no underline)
- ALL links on the same page MUST use the SAME style — never mix underlined and non-underlined
- ALL interactive elements MUST have hover: and focus-visible: states
- Identical components must look identical everywhere — no per-page variations

## Component Styling Standards (MANDATORY)

### Badge variants — consistent status mapping
- Success/active (Active, Paid, Verified): variant="default"
- Neutral/info (Pending, Draft, In Progress): variant="secondary"
- Attention/warning (Review, Expiring, Low Stock): variant="outline"
- Error/destructive (Failed, Overdue, Declined): variant="destructive"
- Same status = same variant across ALL pages

### Avatar
- Tables/lists: size-8 rounded-full. Profile headers: size-10. Never larger.
- Fallback: <AvatarFallback className="text-xs font-medium">JD</AvatarFallback>

### Dialog/Modal
- Confirm/delete: max-w-sm. Standard forms: max-w-md. Complex: max-w-lg.
- Footer: cancel (variant="outline") left, primary action right.
- NEVER use Dialog for success — use toast.

### Dropdown Menu
- Items: text-sm. Icons: size-4 mr-2. Destructive item at bottom with separator.
- Trigger: Button variant="ghost" size="icon" (for ⋯ menus).

### Tabs
- Use shadcn Tabs. TabsContent: space-y-4. TabsList: w-full md:w-auto on mobile.

### Alert
- Info: <Alert> with Info icon. Error: <Alert variant="destructive"> with AlertCircle.
- Never use for success — use toast. Never replace inline form errors.

### Section Headers
- Pattern: h2 text-lg font-semibold tracking-tight + optional action Button size="sm"
- With description: wrap h2 + p in space-y-1

### Navigation Active State
- Sidebar: bg-accent text-accent-foreground font-medium
- Top nav: text-foreground font-medium (no bg, no underline)

### Separator
- Between page sections: <Separator className="my-6" />
- Between list items: border-b on items (NOT Separator)
- NEVER native <hr>

### Tooltip
- For icon-only buttons. Max one line. Wrap page in single TooltipProvider.

### Images
- Hero: aspect-video rounded-xl object-cover. Thumbnail: aspect-square rounded-md.
- Fallback: bg-muted + centered icon.

### Toast / Notifications
- Use shadcn toast or Sonner. NEVER browser alert()/confirm().
- Success: toast({ description }) — brief, no title. Error: toast({ variant: "destructive", title, description }).
- Position: bottom-right. Duration: 3-5s success, persistent for errors.
- Use toast for background actions. Inline text for form validation.

### Table Rows
- Data rows: hover:bg-muted/50. Actions: last column, DropdownMenu with MoreHorizontal trigger.
- Always wrap Table in overflow-x-auto. Show empty state in TableBody when no data.

### Button Grouping
- Order: secondary (outline/ghost) FIRST, primary LAST. Destructive always isolated/last.
- Gap: flex items-center gap-2. Page header: justify-between. CardFooter: justify-end gap-2.
- Icon + text: <Plus className="mr-2 size-4" />. Icon-only: size="icon" + Tooltip.

### Skeleton Loading
- Text: h-4 animate-pulse rounded-md bg-muted, vary widths (w-full, w-3/4, w-1/2).
- Button loading: <Loader2 className="mr-2 size-4 animate-spin" /> + disabled.
- ALWAYS skeleton matching content shape. NEVER centered spinner for page loads.

### Sheet (Side Panel)
- Use Sheet for: filters, mobile nav, detail preview, secondary forms.
- Use Dialog for: confirmations, blocking actions.
- Default side: right. Width: max-w-sm default.

### Breadcrumb
- On pages 2+ levels deep. Use shadcn Breadcrumb. Current page: text-foreground (no link).

### Code Block
- Inline: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
- Block: rounded-md bg-muted px-4 py-3 font-mono text-sm. Copy button: variant="ghost" size="sm".

### Pagination
- Use shadcn Pagination. Below list/table, centered. Max 5 page numbers visible with ellipsis.
- For feeds: "Load more" button (variant="outline" w-full) instead.

### Card Actions
- Content cards: DropdownMenu in top-right of CardHeader. Form cards: actions in CardFooter.
- NEVER actions in BOTH header AND footer.

### Search Input
- Search icon: absolute left-3, Input with pl-9. Debounce 300ms. No search button.
- Clear: X icon in right when value present.

### Accordion
- Use shadcn Accordion. Type "single" for FAQ, "multiple" for settings.

### Popover vs Dropdown vs Dialog
- Action list → DropdownMenu. Small form (1-3 fields) → Popover. Complex/blocking → Dialog.

### ScrollArea
- Fixed containers: shadcn ScrollArea. Dynamic page content: native overflow-y-auto.

### Empty States
- Pattern: centered icon (size-12) + h3 title + p description + CTA Button.
- Search: "No results for 'query'." + clear. Filtered: "No items match." + reset.

### Stat / Metric Cards
- Grid: md:grid-cols-2 lg:grid-cols-4. Trend up: text-emerald-600 + ArrowUp. Down: text-destructive + ArrowDown.

### Error Pages (404, 500)
- Centered: min-h-[50vh] flex col items-center justify-center. Always a "Go home" CTA.

### Confirmation Dialog
- Title: action-specific ("Delete project?"). Description: consequences. Buttons: Cancel (outline) + Destructive.

### Multi-Step Forms
- Numbered circles (active: bg-primary, completed: CheckCircle, upcoming: bg-muted). Connectors: h-px bg-border.
- "Back" (outline) + "Next" (default) navigation. Validate before Next.

### Form Validation
- Error text: text-sm text-destructive below input. Input: border-destructive. Show on blur/submit.
- Form summary: Alert variant="destructive" at top. NEVER toast for validation.

### File Upload / Dropzone
- Dashed border: border-2 border-dashed border-muted-foreground/25. Upload icon + text + format hint.

### RadioGroup
- 2-3 options: RadioGroup. 4+: Select. Vertical by default.

### Tag Input / Multi-Select
- Badges inside border container. Input at end. Max 5 visible + "+N more".

### Notification Indicators
- Unread dot: absolute -top-1 -right-1 size-2 rounded-full bg-destructive.
- Count: size-4 rounded-full bg-destructive text-[10px]. Max "9+".

### Progress Bar
- shadcn Progress h-2. Label above. Use for uploads/quotas. NEVER for page loads.

### Data Formatting
- Dates: relative for recent, "Jan 26, 2026" for older. Numbers: 1,234. Currency: $1,234.56.

### Status Indicators
- Dot + text: size-2 rounded-full + text-sm. Emerald=active, destructive=error, yellow=warning.

### Timeline / Activity Log
- Vertical: dot + line connector + event text + time. Last item: no connector.

### Avatar Group
- Stacked: flex -space-x-2. ring-2 ring-background. Max 4 + "+N" counter.

### Sidebar Layout
- Desktop: w-64 fixed sidebar + main. Mobile: Sheet from left via hamburger.

### Settings Page
- Two-column (md): nav w-48 left + Card sections right. Danger zone: separate Card at bottom.

### Pricing Cards
- Grid md:grid-cols-3. Highlighted: ring-2 ring-primary + "Popular" Badge absolute top.

### Hero Section
- Centered: py-16 md:py-24. H1: text-3xl md:text-5xl. CTAs: Button size="lg".

### Command Palette
- shadcn Command (cmdk). Trigger: ⌘K. Groups + items + shortcuts.

### Toggle / ToggleGroup
- View switcher (grid/list). NOT for boolean (use Switch). ToggleGroup type="single".

### Dark Mode Toggle
- ghost icon button. Sun/Moon with rotation transitions. In navbar or settings.

### Copy to Clipboard
- Ghost sm button. Swap Copy→Check icon for 2s. Optional toast for non-obvious copies.

### Z-Index
- Content: z-0. Sticky: z-10. Dropdowns: z-50. Toast: z-[100]. Never arbitrary above z-50.

### Animation
- transition-colors for hovers. 150ms default. NEVER animate on page load or decorative.`

export const RULES_COMPACT = `## Rules

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
- Auth pages (login, signup, etc.) go in app/(auth)/ route group — no Header/Footer`

export const DESIGN_QUALITY = `## Design Quality Standards

- Headlines: text-4xl+ font-bold tracking-tight for page titles, text-5xl+ for heroes, text-2xl+ for sections
- Cards: rounded-xl with border-border/15, ALWAYS hover state: hover:border-border/30 transition-colors
- Icons in feature cards: wrapped in bg-primary/10 rounded-lg p-2.5 container, h-5 w-5
- Terminal/code blocks: bg-zinc-950 rounded-xl, text-emerald-400, green "$ " prompt
- Spacing rhythm: py-20+ between sections, mb-12+ title-to-content, p-6 inside cards, gap-5 between cards
- One accent color per page — never mix blue + purple + emerald
- Hero: min-h-[80vh] centered, gradient text on key phrase (from-white to-zinc-500 bg-clip-text text-transparent)
- Comparison sections: red-400 X for negative, emerald-400 Check for positive
- Footer: minimal, border-t border-border/10, py-10, text-sm text-muted-foreground`

export const FORMS = `## Form Layout Rules

- Label above Input (never beside on mobile)
- space-y-2 within field group (label + input + description)
- space-y-6 between field groups
- Switch for boolean toggles, not Checkbox
- Select for 3+ options, Radio for 2-3 options
- CardFooter for form actions (Save, Cancel)`

export const ACCESSIBILITY = `## Accessibility (WCAG 2.2 AA)

- Text contrast ≥ 4.5:1, UI component contrast ≥ 3:1
- Touch targets ≥ 44×44px (min-h-11 min-w-11)
- Focus visible on ALL interactive elements (focus-visible:ring-2)
- Color never the only indicator
- Every form input must have a Label with htmlFor
- Heading hierarchy: one h1 per page, no skipped levels`

export const AUTH = `## Auth Pages

Login, signup, register, forgot-password → placed in app/(auth)/ route group.
These pages do NOT show Header/Footer.`

export const COMMANDS_SECTION = `## After Making Changes

Run in terminal:
- coherent check — show all quality and consistency issues (read-only)
- coherent fix — auto-fix cache, deps, syntax, and style issues`

export const PLATFORM = `## Platform Overlay (DO NOT TOUCH)

The following are dev-only platform features, excluded from production export:
- Floating Design System button (in shared Header component)
- /design-system/* pages
- /api/design-system/* routes
- coherent.components.json

DO NOT modify or delete these. They are managed by the platform.`

export const COMMANDS_COMPACT = `## After Making Changes

Run after changes:
- coherent check — show all quality and consistency issues (read-only)
- coherent fix — auto-fix cache, deps, syntax, and style issues`

export const PLATFORM_COMPACT = `## Do NOT modify

- app/design-system/* — platform overlay
- app/api/design-system/* — platform API routes
- coherent.components.json — managed by platform`

export function buildProjectContext(
  manifest: SharedComponentsManifest,
  config: DesignSystemConfig | null,
): ProjectContext {
  return {
    sharedComponents: buildSharedComponentsList(manifest),
    sharedComponentsCompact: buildSharedComponentsListCompact(manifest),
    designTokens: buildDesignTokensSummary(config),
    architectureDetailed: ARCHITECTURE_DETAILED,
    architectureCompact: ARCHITECTURE_COMPACT,
    rulesDetailed: RULES_DETAILED,
    rulesCompact: RULES_COMPACT,
    designQuality: DESIGN_QUALITY,
    forms: FORMS,
    accessibility: ACCESSIBILITY,
    auth: AUTH,
    commands: COMMANDS_SECTION,
    platform: PLATFORM,
  }
}

export function formatForCursor(ctx: ProjectContext): string {
  return `# Coherent Design Method — Project Rules
# Auto-generated. Updated when shared components or config change.
# Do NOT edit manually — run \`coherent rules\` to regenerate.

${ctx.architectureDetailed}

## Shared Components (MUST REUSE)

Before creating ANY UI block, check if a matching shared component exists below.
If it does — IMPORT and USE it. NEVER recreate inline.

${ctx.sharedComponents}

When using a shared component:
- Import from @/components/shared/{filename}
- If you need it with different props, use its props interface
- If the component doesn't accept the prop you need, add the prop to the shared component and update all existing usages

${ctx.rulesDetailed}

${ctx.designQuality}

## Design Tokens

${ctx.designTokens}

Use semantic token classes (bg-background, text-foreground, bg-primary, etc.).
NEVER hardcode colors. NEVER use arbitrary Tailwind values like bg-[#123456].

${ctx.forms}

${ctx.accessibility}

${ctx.auth}

${ctx.commands}

${ctx.platform}
`
}

export function formatForClaude(ctx: ProjectContext): string {
  return `# Coherent Design Method Project

This is a Coherent Design Method project — AI-powered multi-page UI prototype with shared component system.

${ctx.architectureCompact}

## Shared Components (MUST REUSE)

${ctx.sharedComponentsCompact}

Before creating ANY UI block, check if a shared component exists above. If yes — IMPORT it. NEVER recreate inline.

${ctx.rulesCompact}

## Design Tokens

${ctx.designTokens}

Use semantic token classes (bg-background, text-foreground, bg-primary, etc.).
NEVER hardcode colors. NEVER use arbitrary Tailwind values like bg-[#123456].

${COMMANDS_COMPACT}

${PLATFORM_COMPACT}
`
}

export function formatForAgents(ctx: ProjectContext): string {
  return `# Project Conventions
# Auto-generated by Coherent. Run \`coherent rules\` to regenerate.

${ctx.architectureDetailed}

## Shared Components (MUST REUSE)

Before creating ANY UI block, check if a matching shared component exists below.
If it does — IMPORT and USE it. NEVER recreate inline.

${ctx.sharedComponents}

When using a shared component:
- Import from @/components/shared/{filename}
- If you need it with different props, use its props interface
- If the component doesn't accept the prop you need, add the prop to the shared component and update all existing usages

${ctx.rulesDetailed}

${ctx.designQuality}

## Design Tokens

${ctx.designTokens}

Use semantic token classes (bg-background, text-foreground, bg-primary, etc.).
NEVER hardcode colors. NEVER use arbitrary Tailwind values like bg-[#123456].

${ctx.forms}

${ctx.accessibility}

${ctx.auth}

${ctx.commands}

${ctx.platform}
`
}

export async function writeAllHarnessFiles(projectRoot: string): Promise<HarnessResult> {
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
      // config may be invalid during init — proceed with null
    }
  }

  const ctx = buildProjectContext(manifest, config)

  writeFileSync(join(projectRoot, '.cursorrules'), formatForCursor(ctx), 'utf-8')
  writeFileSync(join(projectRoot, 'CLAUDE.md'), formatForClaude(ctx), 'utf-8')
  writeFileSync(join(projectRoot, 'AGENTS.md'), formatForAgents(ctx), 'utf-8')

  writeClaudeCommands(projectRoot)
  writeClaudeSkills(projectRoot)
  writeClaudeSettings(projectRoot)

  const tokenKeys = config?.tokens
    ? [
        ...Object.keys(config.tokens.colors?.light ?? {}),
        ...Object.keys(config.tokens.colors?.dark ?? {}),
        ...Object.keys(config.tokens.spacing ?? {}),
        ...Object.keys(config.tokens.radius ?? {}),
      ].filter((k, i, a) => a.indexOf(k) === i).length
    : 0

  return {
    written: true,
    sharedCount: manifest.shared.length,
    tokenKeys: tokenKeys || undefined,
  }
}

export async function regenerateAllHarnessFiles(): Promise<HarnessResult> {
  const project = findConfig()
  if (!project) {
    return { written: false }
  }
  return writeAllHarnessFiles(project.root)
}
