/**
 * Deterministic shared-component templates.
 *
 * For known component shapes (StatsChart today; more over time), we emit a
 * vetted TSX body directly and skip the LLM round-trip. Zero AI variance at the
 * source — fixes the "CHART_PLACEHOLDER still fires" class of regression where
 * the model cops out with a stub div instead of a real chart.
 *
 * Matching is intentionally narrow. A template is chosen only when the planned
 * component name clearly signals the shape we encode. False negatives fall
 * through to the normal LLM path (safe). False positives would silently
 * override a plan author's intent — avoided via strict name matching.
 *
 * Contract: returned code must compile standalone, use semantic tokens (not
 * raw Tailwind colors), survive quality-validator checks, and match the
 * PlannedComponent.props contract declared in plan-generator.ts.
 */

import type { z } from 'zod'
import type { PlannedComponentSchema } from '../commands/chat/plan-generator.js'

type PlannedComponent = z.infer<typeof PlannedComponentSchema>

const STATS_CHART_TEMPLATE = `'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type StatsChartDatum = { label: string; value: number } | Record<string, number | string>

interface StatsChartProps {
  data: StatsChartDatum[]
  chartType?: 'area' | 'bar' | 'line' | 'pie'
  title?: string
  description?: string
  className?: string
}

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export function StatsChart({
  data,
  chartType = 'area',
  title,
  description,
  className,
}: StatsChartProps) {
  const config: ChartConfig = {
    value: { label: title ?? 'Value', color: CHART_COLORS[0] },
  }

  const hasData = Array.isArray(data) && data.length > 0

  const body = !hasData ? (
    <p className="text-muted-foreground flex h-[300px] items-center justify-center text-sm">
      No data yet.
    </p>
  ) : (
    <ChartContainer config={config} className="h-[300px] w-full">
      {chartType === 'pie' ? (
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Pie
            data={data as Array<{ label: string; value: number }>}
            dataKey="value"
            nameKey="label"
            innerRadius={60}
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      ) : chartType === 'bar' ? (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="value" fill={CHART_COLORS[0]} radius={4} />
        </BarChart>
      ) : chartType === 'line' ? (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            dataKey="value"
            type="monotone"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      ) : (
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            dataKey="value"
            type="monotone"
            stroke={CHART_COLORS[0]}
            fill={CHART_COLORS[0]}
            fillOpacity={0.2}
          />
        </AreaChart>
      )}
    </ChartContainer>
  )

  if (!title && !description) {
    return <div className={className}>{body}</div>
  }

  return (
    <Card className={className}>
      <CardHeader>
        {title ? <CardTitle>{title}</CardTitle> : null}
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
`

/**
 * True when the component's declared name matches the StatsChart shape.
 * Exact "StatsChart" or a two-word chart/graph name (e.g., "RevenueChart").
 * Narrow on purpose: plan authors who want a non-standard chart keep control.
 */
function matchesStatsChart(comp: PlannedComponent): boolean {
  const name = comp.name.trim()
  if (name === 'StatsChart') return true
  // Accept TitledChart / RevenueGraph / AnalyticsChart style names when the
  // component is declared as data-display — author is asking for a chart
  // wrapper, not a bespoke visualization.
  if (comp.type !== 'data-display') return false
  return /^(?:[A-Z][a-z0-9]+)+(?:Chart|Graph)$/.test(name)
}

/**
 * Rewrite `export function StatsChart(` to use the planned component name when
 * it differs. Preserves every other line of the template verbatim.
 */
function renameComponent(code: string, targetName: string): string {
  if (targetName === 'StatsChart') return code
  return code
    .replace(/export function StatsChart\b/, `export function ${targetName}`)
    .replace(/interface StatsChartProps\b/, `interface ${targetName}Props`)
    .replace(/: StatsChartProps\b/, `: ${targetName}Props`)
}

/**
 * Return vetted TSX for the component, or null to fall through to the LLM.
 */
export function getDeterministicComponentCode(comp: PlannedComponent): string | null {
  if (matchesStatsChart(comp)) return renameComponent(STATS_CHART_TEMPLATE, comp.name)
  return null
}
