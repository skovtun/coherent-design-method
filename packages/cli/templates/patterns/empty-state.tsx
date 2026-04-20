/**
 * GOLDEN PATTERN — Empty State
 *
 * Friendly message + primary action when a list/table/grid has no data.
 *
 * Rules encoded here:
 *   - Centered vertically and horizontally (py-12 flex-col items-center).
 *   - Icon is size-12 text-muted-foreground in a rounded-full muted circle.
 *   - Title text-lg font-semibold. Description text-sm text-muted-foreground.
 *   - Single primary CTA button (variant="default"). NEVER two equal CTAs.
 */

import type { ElementType } from 'react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon?: ElementType
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const Icon = icon
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>
      ) : null}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
