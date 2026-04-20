/**
 * Per-validator fix guidance for auto-heal.
 *
 * When `ai.editPageCode()` is asked to fix quality issues, a generic "fix
 * these" prompt gets generic results. Giving the AI the SPECIFIC remediation
 * pattern for each issue type produces targeted, high-quality fixes.
 *
 * This map is consulted by the quality-fix loop in modification-handler.ts.
 * Unknown types fall back to the issue message itself.
 */

export const AUTO_HEAL_GUIDANCE: Record<string, string> = {
  // Layout / visual
  NESTED_CONTAINERS:
    'Remove the inner border/shadow div. Render children flat inside the parent Card, or use <Separator /> rows.',
  HEAVY_SHADOW: 'Replace shadow-md/lg/xl with shadow-sm or no shadow.',
  TEXT_BASE: 'Change text-base → text-sm on body text.',
  EXCESSIVE_PADDING: 'Reduce padding to p-6 maximum.',

  // Charts
  CHART_PLACEHOLDER:
    'Replace placeholder text with a real <AreaChart> or <BarChart> via shadcn ChartContainer + recharts. Use var(--chart-1..5) for colors and a fixed h-[200/300/400] height. Include 8+ realistic data points.',
  CHART_EMPTY_BOX:
    'Replace the empty bg-muted div with a real shadcn Chart. Import ChartContainer + recharts primitives.',

  // Numbers / data
  RAW_NUMBER_FORMAT:
    'Replace `${value.toFixed(2)}` with `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)`. Define a `money` helper at the top of the file.',
  DOUBLE_SIGN:
    'Remove the manual +/- ternary prefix. Use `Intl.NumberFormat` with `signDisplay: "always"` (or "exceptZero") instead.',
  INLINE_MOCK_DATA:
    'Extract the inline array to `src/data/<kebab-name>.ts` as a named export and import it. Keeps the page component readable.',

  // Tables
  TABLE_COLUMN_MISMATCH:
    'Define a single `const columns: ColumnDef[] = [...]` array and map over it for BOTH <TableHead> in the header AND <TableCell> in each body row. Prevents drift between header/body counts.',

  // Filter bar
  FILTER_DUPLICATE:
    'Remove the duplicate filter control for this dimension. Keep either the <Select> OR the <Button>, not both.',
  FILTER_HEIGHT_MISMATCH:
    'Set every filter control (Input, SelectTrigger, Button) to className="h-10" — all filter controls must be the same height.',
  SEARCH_ICON_MISPLACED:
    'Wrap the Search icon + Input in `<div className="relative">`. Give the icon `className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"`. Add `pl-9` to the Input. Do NOT render them as siblings.',

  // Overlays
  DIALOG_FULL_WIDTH:
    'Add max-w-lg (or max-w-sm/md/xl) to the <DialogContent> className. Never render a full-width modal on desktop.',
  DIALOG_CUSTOM_OVERLAY:
    'Delete the custom `<div className="fixed inset-0 bg-black/..."` overlay. Use shadcn <Dialog> + <DialogContent> — they handle overlay, focus trap, and Escape automatically.',
  ALERT_DIALOG_NON_DESTRUCTIVE:
    'Change <AlertDialog> to <Dialog>. AlertDialog is reserved for irreversible destructive actions (delete, cancel subscription, log out).',

  // A11y
  MISSING_ARIA_LABEL:
    'Add `aria-label="description of action"` to the icon-only button. Example: `<Button size="icon" aria-label="Close dialog">`.',
  SMALL_TOUCH_TARGET: 'Add min-h-[44px] to the button, or increase its padding to meet 44px minimum touch target.',
  EMOJI_IN_UI: 'Replace the emoji character with a Lucide icon (e.g. <Check className="size-4" />).',

  // Links / interactive
  NESTED_INTERACTIVE:
    'Use <Button asChild><Link>...</Link></Button> to combine button styling with Link navigation. Prevents DOM nesting errors.',
  LINK_MISSING_HREF: 'Add an href prop to the <Link> or <a> element. Required by Next.js router.',
  CLICKABLE_DIV:
    'Replace the clickable <div onClick> with <button> (semantic) or add `role="button"` + `tabIndex={0}` + keyboard handlers.',

  // Content
  BANNED_COPY: 'Replace the AI cliché word with specific, concrete copy that describes the actual feature.',
  BANNED_NAME: 'Use a distinctive realistic name (e.g., "Priya Sharma", "Marcus Rivera") instead of "John Doe".',
  PLACEHOLDER: 'Replace placeholder text with realistic contextual content that reflects the domain.',

  // Structure
  COMPONENT_TOO_LONG:
    'Extract logical sections (data table, form, chart, hero) into named subcomponents. Keep the page file under 200 lines.',
  NO_EMPTY_STATE:
    'Wrap the list/table/grid with an empty-state check. When data is empty, render a friendly message + primary action (see golden pattern empty-state.tsx).',
  NO_H1: 'Add exactly one <h1> element to the page — typically the page title.',
  MULTIPLE_H1: 'Keep exactly one <h1> per page. Change other <h1> elements to <h2> / <h3>.',
  SKIPPED_HEADING: 'Fix heading hierarchy — do not skip levels (e.g., h1 → h3 without h2).',
  MISSING_FOCUS_VISIBLE: 'Add focus-visible:ring-2 focus-visible:ring-ring to the interactive element.',
}

/**
 * Build a targeted fix instruction for a set of quality issues. Pulls
 * per-type guidance where available, falls back to the validator's original
 * message when we don't have specific guidance.
 */
export function buildFixInstruction(issues: Array<{ type: string; line: number; message: string }>): string {
  const byType = new Map<string, string[]>()
  for (const issue of issues) {
    if (!byType.has(issue.type)) byType.set(issue.type, [])
    byType.get(issue.type)!.push(`Line ${issue.line}: ${issue.message}`)
  }
  const lines = ['Fix these specific quality issues:', '']
  for (const [type, msgs] of byType) {
    const guidance = AUTO_HEAL_GUIDANCE[type]
    lines.push(`## ${type}`)
    for (const m of msgs) lines.push(`  - ${m}`)
    if (guidance) lines.push(`  FIX: ${guidance}`)
    lines.push('')
  }
  lines.push(
    'Keep all existing functionality and layout intact. Fix ONLY the listed issues; do not refactor unrelated code.',
  )
  return lines.join('\n')
}
