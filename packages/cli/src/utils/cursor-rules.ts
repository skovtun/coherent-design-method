/**
 * Generate .cursorrules for Cursor (and other AI editors) from manifest + config.
 * Updated when shared components or config change.
 */

import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { DesignSystemConfig } from '@getcoherent/core'
import type { SharedComponentsManifest } from '@getcoherent/core'
import { loadManifest } from '@getcoherent/core'
import { DesignSystemManager } from '@getcoherent/core'
import { findConfig } from './find-config.js'
import { writeClaudeMd } from './claude-code.js'

function buildSharedComponentsList(manifest: SharedComponentsManifest): string {
  if (!manifest.shared || manifest.shared.length === 0) {
    return `No shared components registered yet.
When you create reusable blocks (headers, footers, repeated sections),
register them: coherent components shared add <Name> --type layout|section|widget`
  }
  const order = { layout: 0, section: 1, widget: 2 }
  const sorted = [...manifest.shared].sort(
    (a, b) => order[a.type as keyof typeof order] - order[b.type as keyof typeof order] || a.name.localeCompare(b.name)
  )
  const lines = sorted.map((entry) => {
    const usedIn =
      entry.usedIn.length === 0
        ? '(not used yet)'
        : entry.usedIn.length === 1 && entry.usedIn[0] === 'app/layout.tsx'
          ? 'app/layout.tsx (all pages)'
          : entry.usedIn.join(', ')
    return `- ${entry.id} ${entry.name} (${entry.type}) — ${entry.file}\n  Used in: ${usedIn}`
  })
  return `Currently registered shared components:\n\n${lines.join('\n\n')}`
}

function buildDesignTokensSummary(config: DesignSystemConfig | null): string {
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
      ? (radiusObj as { md?: string }).md ?? '0.5rem'
      : typeof radiusObj === 'string'
        ? radiusObj
        : '0.5rem'
  add('Radius', radiusStr)
  if (lines.length === 0) {
    return `Tokens in design-system.config.ts. Use semantic classes (bg-primary, text-foreground, etc.).`
  }
  return `Current design tokens:\n${lines.join('\n')}`
}

export function buildCursorRules(manifest: SharedComponentsManifest, config: DesignSystemConfig | null): string {
  const sharedList = buildSharedComponentsList(manifest)
  const tokensSummary = buildDesignTokensSummary(config)

  return `# Coherent Design Method — Project Rules
# Auto-generated. Updated when shared components or config change.
# Do NOT edit manually — run \`coherent rules\` to regenerate.

## Project Architecture

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
- globals.css — CSS variables (colors, typography, spacing)

## Shared Components (MUST REUSE)

Before creating ANY UI block, check if a matching shared component exists below.
If it does — IMPORT and USE it. NEVER recreate inline.

${sharedList}

When using a shared component:
- Import from @/components/shared/{filename}
- If you need it with different props, use its props interface
- If the component doesn't accept the prop you need, add the prop to the shared component and update all existing usages

## Component Rules (MANDATORY)

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
- transition-colors for hovers. 150ms default. NEVER animate on page load or decorative.

## Design Quality Standards

- Headlines: text-4xl+ font-bold tracking-tight for page titles, text-5xl+ for heroes, text-2xl+ for sections
- Cards: rounded-xl with border-border/15, ALWAYS hover state: hover:border-border/30 transition-colors
- Icons in feature cards: wrapped in bg-primary/10 rounded-lg p-2.5 container, h-5 w-5
- Terminal/code blocks: bg-zinc-950 rounded-xl, text-emerald-400, green "$ " prompt
- Spacing rhythm: py-20+ between sections, mb-12+ title-to-content, p-6 inside cards, gap-5 between cards
- One accent color per page — never mix blue + purple + emerald
- Hero: min-h-[80vh] centered, gradient text on key phrase (from-white to-zinc-500 bg-clip-text text-transparent)
- Comparison sections: red-400 X for negative, emerald-400 Check for positive
- Footer: minimal, border-t border-border/10, py-10, text-sm text-muted-foreground

## Design Tokens

${tokensSummary}

Use semantic token classes (bg-background, text-foreground, bg-primary, etc.).
NEVER hardcode colors. NEVER use arbitrary Tailwind values like bg-[#123456].

## Form Layout Rules

- Label above Input (never beside on mobile)
- space-y-2 within field group (label + input + description)
- space-y-6 between field groups
- Switch for boolean toggles, not Checkbox
- Select for 3+ options, Radio for 2-3 options
- CardFooter for form actions (Save, Cancel)

## Accessibility (WCAG 2.2 AA)

- Text contrast ≥ 4.5:1, UI component contrast ≥ 3:1
- Touch targets ≥ 44×44px (min-h-11 min-w-11)
- Focus visible on ALL interactive elements (focus-visible:ring-2)
- Color never the only indicator
- Every form input must have a Label with htmlFor
- Heading hierarchy: one h1 per page, no skipped levels

## Auth Pages

Login, signup, register, forgot-password → placed in app/(auth)/ route group.
These pages do NOT show Header/Footer.

## After Making Changes

Run in terminal:
- coherent check — show all quality and consistency issues (read-only)
- coherent fix — auto-fix cache, deps, syntax, and style issues

## Platform Overlay (DO NOT TOUCH)

The following are dev-only platform features, excluded from production export:
- Floating Design System button (in AppNav.tsx)
- /design-system/* pages
- /api/design-system/* routes
- coherent.components.json

DO NOT modify or delete these. They are managed by the platform.
`
}

/**
 * Load manifest and config, build .cursorrules, write to project root.
 * Call from init, components shared add, chat (shared changes), import figma.
 * Returns { written: true, sharedCount, tokenKeys } or { written: false } if not a Coherent project.
 */
export async function writeCursorRules(projectRoot: string): Promise<{
  written: boolean
  sharedCount?: number
  tokenKeys?: number
}> {
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
  const content = buildCursorRules(manifest, config)
  const outPath = join(projectRoot, '.cursorrules')
  writeFileSync(outPath, content, 'utf-8')
  writeClaudeMd(projectRoot, manifest, config)
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

/**
 * Regenerate .cursorrules using findConfig() for project root.
 * Used by `coherent rules` command.
 */
export async function regenerateCursorRules(): Promise<{ written: boolean; sharedCount?: number; tokenKeys?: number }> {
  const project = findConfig()
  if (!project) {
    return { written: false }
  }
  return writeCursorRules(project.root)
}
