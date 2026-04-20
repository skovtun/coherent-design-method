/**
 * Golden Patterns — embedded for prompt injection.
 *
 * These strings are the exact content the AI sees when a user request matches
 * a pattern keyword. Mirrors `packages/cli/templates/patterns/*.tsx` (the
 * human-readable source) but inlined here so tsup can bundle them into dist.
 *
 * The `pickGoldenPatterns()` function returns only the patterns relevant to
 * the current request — injecting all four on every call would cost ~1200
 * tokens and force the AI to average over irrelevant examples.
 *
 * Single source of truth: when you edit a pattern in templates/patterns/,
 * mirror the change here. A future release will add codegen to sync both.
 */

const FILTER_BAR_PATTERN = `// GOLDEN: filter bar — one row, search+selects+date range above a table.
// Copy the STRUCTURE exactly; adapt only props and placeholder text.
import { Search, Calendar as CalendarIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

<div className="flex flex-wrap items-center gap-3 mb-4">
  <div className="relative flex-1 min-w-[240px]">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
    <Input placeholder="Search transactions..." className="h-10 pl-9" />
  </div>
  <Select>
    <SelectTrigger className="h-10 w-[160px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
    <SelectContent>{/* <SelectItem value="cat">Cat</SelectItem> */}</SelectContent>
  </Select>
  <Select>
    <SelectTrigger className="h-10 w-[120px]"><SelectValue placeholder="All Status" /></SelectTrigger>
    <SelectContent>{/* ... */}</SelectContent>
  </Select>
  <Button variant="outline" className="h-10"><CalendarIcon className="size-4 mr-2" />Date range</Button>
</div>`

const STAT_CARD_PATTERN = `// GOLDEN: stat card — title + icon + value + optional trend. Use in Stats Grid at top of dashboard.
import { ArrowUp, ArrowDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
    <ArrowUp className="size-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">{money(42180)}</div>
    <p className="mt-1 text-xs flex items-center text-success"><ArrowUp className="size-3 mr-1" />+12.5%</p>
  </CardContent>
</Card>`

const EMPTY_STATE_PATTERN = `// GOLDEN: empty state — friendly message + one primary CTA. Centered, muted icon in rounded square.
import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'

<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
    <Inbox className="size-6 text-muted-foreground" />
  </div>
  <h3 className="text-lg font-semibold">No transactions yet</h3>
  <p className="mt-1 max-w-sm text-sm text-muted-foreground">Start by adding your first transaction to see it here.</p>
  <Button className="mt-4">Add transaction</Button>
</div>`

const CHART_CARD_PATTERN = `// GOLDEN: chart card — AreaChart with shadcn wrappers, fixed height, var(--chart-N) colors.
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent,
  ChartLegend, ChartLegendContent,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const chartConfig: ChartConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
  expenses: { label: 'Expenses', color: 'var(--chart-2)' },
}
const data = [
  { month: 'Jan', revenue: 42180, expenses: 28340 }, { month: 'Feb', revenue: 44120, expenses: 27980 },
  { month: 'Mar', revenue: 46300, expenses: 29510 }, { month: 'Apr', revenue: 48600, expenses: 30120 },
  /* ... at least 8 points ... */
]

<Card>
  <CardHeader>
    <CardTitle>Revenue vs Expenses</CardTitle>
    <CardDescription>Last 12 months</CardDescription>
  </CardHeader>
  <CardContent>
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.2} />
        <Area dataKey="expenses" type="monotone" stroke="var(--color-expenses)" fill="var(--color-expenses)" fillOpacity={0.2} />
      </AreaChart>
    </ChartContainer>
  </CardContent>
</Card>`

const DIALOG_PATTERN = `// GOLDEN: Dialog / Modal — shadcn Dialog with max-w-lg by default.
// NEVER build a custom overlay div. Dialog handles overlay + focus trap + Escape.
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>Create New Budget</DialogTitle>
      <DialogDescription>Set spending limits for a new category.</DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-4">
      {/* form fields */}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button onClick={onConfirm}>Create Budget</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`

const DROPDOWN_MENU_PATTERN = `// GOLDEN: Dropdown Menu — shadcn DropdownMenu.
// NEVER build a custom absolute floating panel. Destructive items at the bottom
// after a DropdownMenuSeparator, with text-destructive class.
import { MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" aria-label="Row actions">
      <MoreHorizontal className="size-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={onEdit}><Pencil className="size-4 mr-2" />Edit</DropdownMenuItem>
    <DropdownMenuItem onClick={onDuplicate}><Copy className="size-4 mr-2" />Duplicate</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
      <Trash2 className="size-4 mr-2" />Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`

const ALERT_DIALOG_PATTERN = `// GOLDEN: Alert Dialog — ONLY for destructive/irreversible actions (delete, cancel subscription, log out).
// For non-destructive prompts use regular Dialog. Action button gets destructive variant.
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete budget</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete "{budgetName}"?</AlertDialogTitle>
      <AlertDialogDescription>This will remove {transactionCount} linked transactions and cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>`

const SHEET_PATTERN = `// GOLDEN: Sheet (side drawer) — for filter panels, detail views, multi-field forms.
// Side is right by default; left only for mobile nav drawers. Width sm:max-w-sm|md — NEVER full-screen on desktop.
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Filter } from 'lucide-react'

<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetTrigger asChild>
    <Button variant="outline" className="h-10"><Filter className="size-4 mr-2" />Advanced filters</Button>
  </SheetTrigger>
  <SheetContent side="right" className="sm:max-w-md">
    <SheetHeader>
      <SheetTitle>Advanced Filters</SheetTitle>
      <SheetDescription>Narrow down transactions by multiple criteria.</SheetDescription>
    </SheetHeader>
    <div className="flex-1 overflow-y-auto py-4 space-y-6">
      {/* filter fields */}
    </div>
    <SheetFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button onClick={onApply}>Apply filters</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>`

const PAGINATION_PATTERN = `// GOLDEN: Pagination — shadcn Pagination. NEVER build custom Prev/Next with raw buttons.
// Show max 5 page numbers; ellipsis when range is larger. Centered below table.
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'

<div className="flex justify-center mt-4">
  <Pagination>
    <PaginationContent>
      <PaginationItem><PaginationPrevious href="#" onClick={e => { e.preventDefault(); goPrev() }} aria-disabled={currentPage === 1} /></PaginationItem>
      {showLeftEllipsis ? <PaginationItem><PaginationEllipsis /></PaginationItem> : null}
      {pages.map(page => (
        <PaginationItem key={page}>
          <PaginationLink href="#" isActive={page === currentPage} onClick={e => { e.preventDefault(); onPageChange(page) }}>{page}</PaginationLink>
        </PaginationItem>
      ))}
      {showRightEllipsis ? <PaginationItem><PaginationEllipsis /></PaginationItem> : null}
      <PaginationItem><PaginationNext href="#" onClick={e => { e.preventDefault(); goNext() }} aria-disabled={currentPage === totalPages} /></PaginationItem>
    </PaginationContent>
  </Pagination>
</div>`

interface PatternEntry {
  key: string
  keywords: RegExp
  content: string
}

const PATTERNS: PatternEntry[] = [
  {
    key: 'filter-bar',
    keywords: /\b(?:filters?|toolbar|search\s+(?:bar|input|transactions|users))\b/i,
    content: FILTER_BAR_PATTERN,
  },
  {
    key: 'stat-card',
    keywords: /\b(?:stats?\s+(?:cards?|grid)|metrics?\s+cards?|kpi)\b/i,
    content: STAT_CARD_PATTERN,
  },
  {
    key: 'empty-state',
    keywords: /\bempty\s+state\b/i,
    content: EMPTY_STATE_PATTERN,
  },
  {
    key: 'chart-card',
    keywords: /\b(?:chart|graph|analytics|dashboard|revenue|trend)\b/i,
    content: CHART_CARD_PATTERN,
  },
  {
    key: 'dialog',
    keywords: /\b(?:dialog|modal|create\s+new|edit\s+\w+\s+dialog|confirmation\s+modal)\b/i,
    content: DIALOG_PATTERN,
  },
  {
    key: 'dropdown-menu',
    keywords: /\b(?:dropdown|row\s+actions?|action\s+menu|more\s+actions|context\s+menu)\b/i,
    content: DROPDOWN_MENU_PATTERN,
  },
  {
    key: 'alert-dialog',
    keywords: /\b(?:confirm|delete\s+confirmation|are\s+you\s+sure|destructive\s+action|alert\s+dialog)\b/i,
    content: ALERT_DIALOG_PATTERN,
  },
  {
    key: 'sheet',
    keywords: /\b(?:sheet|side\s+(?:drawer|panel)|slide-?over|advanced\s+filters|drawer)\b/i,
    content: SHEET_PATTERN,
  },
  {
    key: 'pagination',
    keywords: /\b(?:pagination|page\s+\d+|prev(?:ious)?\s*\/?\s*next|paginat(?:e|ion))\b/i,
    content: PAGINATION_PATTERN,
  },
]

/**
 * Pick golden-pattern content blocks relevant to the request.
 *
 * Returns an empty string when nothing matches — `coherent chat "change button
 * color to blue"` doesn't need a filter-bar pattern dragging 200 tokens into
 * the prompt for no reason.
 */
export function pickGoldenPatterns(message: string, sections?: string[]): string {
  const haystack = [message, ...(sections ?? [])].join(' ')
  const picked = PATTERNS.filter(p => p.keywords.test(haystack))
  if (picked.length === 0) return ''
  const header = 'GOLDEN PATTERN REFERENCES (copy STRUCTURE exactly — only customize props/text/data):'
  return ['', header, ...picked.map(p => `\n--- ${p.key} ---\n${p.content}`)].join('\n')
}

export const GOLDEN_PATTERN_KEYS = PATTERNS.map(p => p.key)
