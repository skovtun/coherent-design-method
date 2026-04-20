/**
 * GOLDEN PATTERN — Dropdown Menu (row actions, user menu, contextual actions)
 *
 * Rules encoded here:
 *   - ALWAYS use shadcn DropdownMenu + DropdownMenuContent. NEVER a custom
 *     absolute div with manual open state.
 *   - Trigger is a Button variant="ghost" size="icon" with MoreHorizontal or
 *     the relevant icon.
 *   - Items are DropdownMenuItem. Destructive items get text-destructive and
 *     go at the bottom, separated by a DropdownMenuSeparator.
 *   - align="end" on DropdownMenuContent for row-end action menus.
 */

import { MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface RowActionsProps {
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function RowActions({ onEdit, onDuplicate, onDelete }: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Row actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-4 mr-2" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="size-4 mr-2" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="size-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
