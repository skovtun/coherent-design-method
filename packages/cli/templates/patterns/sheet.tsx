/**
 * GOLDEN PATTERN — Sheet (side drawer)
 *
 * Use for: filters panel, detail view without losing context, multi-field forms
 * that don't fit in a dialog. Side is ALWAYS right by default; left for
 * navigation drawers on mobile only.
 *
 * Rules encoded here:
 *   - ALWAYS use shadcn Sheet + SheetContent with side="right" (or side="left"
 *     for mobile nav).
 *   - SheetHeader + SheetTitle + SheetDescription at the top.
 *   - Body content in a scrollable region when long.
 *   - SheetFooter with Cancel/Save at the bottom (sticky).
 *   - Width: default is sm:max-w-sm (small). Use className="sm:max-w-md" for
 *     larger content. NEVER full-screen on desktop.
 */

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Filter } from 'lucide-react'

interface FilterSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: () => void
}

export function FilterSheet({ open, onOpenChange, onApply }: FilterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-10">
          <Filter className="size-4 mr-2" />
          Advanced filters
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Advanced Filters</SheetTitle>
          <SheetDescription>Narrow down transactions by multiple criteria.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* filter fields — use form-layout pattern rules */}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onApply}>Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
