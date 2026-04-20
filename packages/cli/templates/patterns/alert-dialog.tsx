/**
 * GOLDEN PATTERN — Alert Dialog (destructive confirmations)
 *
 * Use for irreversible actions: delete, cancel subscription, log out, etc.
 * NOT for non-destructive prompts — use regular Dialog for those.
 *
 * Rules encoded here:
 *   - ALWAYS use shadcn AlertDialog (handles focus trap + Escape key).
 *   - Title describes the action ("Delete budget?"), not generic "Are you sure?".
 *   - Description states the CONSEQUENCE ("This will remove 12 transactions.")
 *     and whether it's reversible.
 *   - Cancel on left (default variant outline). Action on right.
 *   - Destructive action button: variant="destructive". Non-destructive: default.
 *   - Never auto-dismiss. User must explicitly confirm or cancel.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface DeleteBudgetProps {
  budgetName: string
  transactionCount: number
  onConfirm: () => void
}

export function DeleteBudgetDialog({ budgetName, transactionCount, onConfirm }: DeleteBudgetProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete budget</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{budgetName}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove {transactionCount} linked transactions and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
