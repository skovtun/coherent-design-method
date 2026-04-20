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
