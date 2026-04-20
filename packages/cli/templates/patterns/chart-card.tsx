/**
 * GOLDEN PATTERN — Chart Card
 *
 * AreaChart (default), BarChart, or LineChart wrapped in a Card with title +
 * description + ChartContainer + ChartTooltip + optional ChartLegend.
 *
 * Rules encoded here:
 *   - Uses shadcn Chart wrappers (ChartContainer / ChartTooltip / etc.).
 *   - Colors come from var(--chart-N) — NEVER raw hex or theme primary tokens.
 *   - Height is one of h-[200/300/400] — never arbitrary.
 *   - CartesianGrid only on h-[300px]+ charts, horizontal lines only.
 *   - Axes hide axisLine/tickLine; ticks use muted-foreground.
 *   - Empty-state fallback when data array is empty.
 */

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ChartCardProps<T extends Record<string, number | string>> {
  title: string
  description?: string
  data: T[]
  xKey: keyof T & string
  series: Array<{ key: keyof T & string; label: string }>
  chartType?: 'area' | 'bar' | 'line'
  height?: 200 | 300 | 400
}

export function ChartCard<T extends Record<string, number | string>>({
  title,
  description,
  data,
  xKey,
  series,
  chartType = 'area',
  height = 300,
}: ChartCardProps<T>) {
  const config: ChartConfig = series.reduce((acc, s, i) => {
    acc[s.key] = { label: s.label, color: `var(--chart-${i + 1})` }
    return acc
  }, {} as ChartConfig)

  const heightClass = height === 200 ? 'h-[200px]' : height === 400 ? 'h-[400px]' : 'h-[300px]'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className={`text-muted-foreground text-sm flex items-center justify-center ${heightClass}`}>
            No data yet. Start tracking to see trends.
          </p>
        ) : (
          <ChartContainer config={config} className={`${heightClass} w-full`}>
            {chartType === 'bar' ? (
              <BarChart data={data}>
                {height >= 300 ? <CartesianGrid strokeDasharray="3 3" vertical={false} /> : null}
                <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
                {series.map(s => (
                  <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={4} />
                ))}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={data}>
                {height >= 300 ? <CartesianGrid strokeDasharray="3 3" vertical={false} /> : null}
                <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
                {series.map(s => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    type="monotone"
                    stroke={`var(--color-${s.key})`}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={data}>
                {height >= 300 ? <CartesianGrid strokeDasharray="3 3" vertical={false} /> : null}
                <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
                {series.map(s => (
                  <Area
                    key={s.key}
                    dataKey={s.key}
                    type="monotone"
                    stroke={`var(--color-${s.key})`}
                    fill={`var(--color-${s.key})`}
                    fillOpacity={0.2}
                  />
                ))}
              </AreaChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
