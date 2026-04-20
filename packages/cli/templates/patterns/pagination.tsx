/**
 * GOLDEN PATTERN — Pagination
 *
 * Rules encoded here:
 *   - ALWAYS use shadcn Pagination. NEVER build custom Prev/Next with raw buttons.
 *   - Pattern: Previous + page numbers + ellipsis + Next.
 *   - Show max 5 page numbers; use <PaginationEllipsis /> when range is larger.
 *   - Disable Previous on page 1, Next on last page (isActive style).
 *   - Centered below the list/table: <div className="flex justify-center mt-4">.
 *   - For feeds / infinite scroll: use "Load more" button instead of pagination.
 */

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

interface DataPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function DataPagination({ currentPage, totalPages, onPageChange }: DataPaginationProps) {
  // Compute a stable window of up to 5 page numbers around the current page.
  const windowSize = 5
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - windowSize + 1))
  const pages = Array.from({ length: Math.min(windowSize, totalPages) }, (_, i) => start + i).filter(n => n <= totalPages)
  const showLeftEllipsis = start > 1
  const showRightEllipsis = start + windowSize - 1 < totalPages

  return (
    <div className="flex justify-center mt-4">
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={e => {
                e.preventDefault()
                if (currentPage > 1) onPageChange(currentPage - 1)
              }}
              aria-disabled={currentPage === 1}
            />
          </PaginationItem>
          {showLeftEllipsis ? (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          ) : null}
          {pages.map(page => (
            <PaginationItem key={page}>
              <PaginationLink
                href="#"
                isActive={page === currentPage}
                onClick={e => {
                  e.preventDefault()
                  onPageChange(page)
                }}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ))}
          {showRightEllipsis ? (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          ) : null}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={e => {
                e.preventDefault()
                if (currentPage < totalPages) onPageChange(currentPage + 1)
              }}
              aria-disabled={currentPage === totalPages}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
