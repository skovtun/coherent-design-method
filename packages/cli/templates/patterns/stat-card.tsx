/**
 * GOLDEN PATTERN — Stat Card
 *
 * Compact metric card with title, value, optional trend indicator, optional
 * sparkline. Used in "Stats Grid" at the top of dashboards.
 *
 * Rules encoded here:
 *   - CardHeader uses flex-row justify-between space-y-0 pb-2 for title + icon.
 *   - Value is text-2xl font-bold; trend is text-xs with colored arrow.
 *   - Icon is size-4 text-muted-foreground in a clean square.
 *   - Uses Intl.NumberFormat for numbers (not toFixed + template string).
 *   - Max shadow is shadow-sm; no nested borders.
 */

import type { ElementType } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StatCardProps {
  title: string
  value: number
  formatValue?: (n: number) => string
  trend?: {
    direction: 'up' | 'down' | 'neutral'
    value: number // e.g. 12.5 for "+12.5%"
  }
  icon?: ElementType
}

const defaultFormat = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

export function StatCard({ title, value, formatValue = defaultFormat, trend, icon }: StatCardProps) {
  const Icon = icon
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatValue(value)}</div>
        {trend ? (
          <p className={`mt-1 text-xs flex items-center ${trendColor(trend.direction)}`}>
            {trend.direction === 'up' ? (
              <ArrowUp className="size-3 mr-1" />
            ) : trend.direction === 'down' ? (
              <ArrowDown className="size-3 mr-1" />
            ) : null}
            {trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}
            {trend.value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function trendColor(direction: 'up' | 'down' | 'neutral'): string {
  if (direction === 'up') return 'text-success'
  if (direction === 'down') return 'text-destructive'
  return 'text-muted-foreground'
}
