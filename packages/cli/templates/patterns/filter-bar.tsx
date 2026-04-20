/**
 * GOLDEN PATTERN — Filter Bar / Toolbar
 *
 * The canonical filter-bar layout. Copy this when generating any page that
 * filters a list/table by search + dropdowns + date range.
 *
 * Rules encoded here (DO NOT deviate):
 *   - ONE row on desktop via flex-wrap. Mobile wraps naturally.
 *   - Search input takes remaining space (flex-1), everything else is fixed.
 *   - Search icon lives INSIDE the input via absolute positioning + pl-9 on Input.
 *   - ALL controls share the same height (h-10).
 *   - ONE control per filter dimension — no duplicates.
 *   - Toolbar sits ABOVE the data Card, not nested inside another Card.
 */

import { Search, Calendar as CalendarIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface FilterBarProps {
  searchValue: string
  onSearchChange: (v: string) => void
  categories: string[]
  statusOptions: string[]
  onDateRangeClick: () => void
}

export function FilterBar({ searchValue, onSearchChange, categories, statusOptions, onDateRangeClick }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative flex-1 min-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search transactions..."
          className="h-10 pl-9"
        />
      </div>

      <Select>
        <SelectTrigger className="h-10 w-[160px]">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          {categories.map(c => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select>
        <SelectTrigger className="h-10 w-[120px]">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map(s => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" onClick={onDateRangeClick} className="h-10">
        <CalendarIcon className="size-4 mr-2" />
        Date range
      </Button>
    </div>
  )
}
