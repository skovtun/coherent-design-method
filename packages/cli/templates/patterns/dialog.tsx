/**
 * GOLDEN PATTERN — Dialog / Modal
 *
 * Canonical modal dialog using shadcn Dialog. Centered, max-w-lg by default,
 * with DialogHeader + Content + DialogFooter.
 *
 * Rules encoded here:
 *   - ALWAYS use shadcn <Dialog>/<DialogContent>. NEVER a custom overlay div.
 *   - DialogContent has max-w-sm | md | lg | xl (default: max-w-lg).
 *   - Title + description in DialogHeader.
 *   - Primary action on the right, Cancel on the left, both inside DialogFooter.
 *   - The Dialog component handles overlay, focus-trap, Escape key automatically.
 */

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ExampleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ExampleDialog({ open, onOpenChange, onConfirm }: ExampleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Budget</DialogTitle>
          <DialogDescription>Set spending limits for a new category.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* form fields — use form-layout pattern rules */}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Create Budget</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
