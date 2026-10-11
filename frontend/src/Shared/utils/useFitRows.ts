import { useLayoutEffect, useState, type RefObject } from 'react'

interface FitRowsOptions {
  /** The list whose rows we are paging (its top edge is where rows start). */
  listRef: RefObject<HTMLElement | null>
  /** Element right after the rows that only shows with more than one page (e.g. pagination). */
  paginationRef: RefObject<HTMLElement | null>
  totalRows: number
  /** Used until a real row exists to measure. */
  fallbackRowHeight: number
  /** Height the pagination will take once it appears. */
  fallbackPaginationHeight: number
  minRows?: number
  /** Below this viewport width the layout stacks and the page scrolls anyway. */
  stackedBelowPx?: number
  stackedRows?: number
}

/**
 * Rows per page so the list ends exactly at the bottom of the viewport (no page scroll).
 * Everything fits → one page, no pagination; otherwise the pagination's height is reserved too.
 */
export function useFitRows({
  listRef,
  paginationRef,
  totalRows,
  fallbackRowHeight,
  fallbackPaginationHeight,
  minRows = 3,
  stackedBelowPx = 1100,
  stackedRows = 10,
}: FitRowsOptions): number {
  const [perPage, setPerPage] = useState(stackedRows)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = () => {
      if (window.innerWidth < stackedBelowPx) {
        setPerPage(stackedRows)
        return
      }
      const listRect = list.getBoundingClientRect()
      const listTop = listRect.top + window.scrollY
      const firstRow = list.firstElementChild as HTMLElement | null
      const rowHeight = firstRow?.getBoundingClientRect().height || fallbackRowHeight

      // Chrome below the rows inside the panel (padding, border), excluding the pagination itself.
      const panel = list.closest('.panel') ?? list.parentElement
      const pagination = paginationRef.current
      const paginationHeight = pagination?.getBoundingClientRect().height ?? 0
      const panelBottom = panel ? panel.getBoundingClientRect().bottom : listRect.bottom
      const chromeBelow = Math.max(0, panelBottom - listRect.bottom - paginationHeight)

      // Bottom padding of the scrolling page container.
      const main = list.closest('main')
      const mainPadding = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0

      const space = window.innerHeight - listTop - chromeBelow - mainPadding
      const fitAll = Math.floor(space / rowHeight)
      if (totalRows <= fitAll) {
        setPerPage(Math.max(minRows, totalRows))
        return
      }
      const withPagination = Math.floor((space - (paginationHeight || fallbackPaginationHeight)) / rowHeight)
      setPerPage(Math.max(minRows, withPagination))
    }

    measure()
    window.addEventListener('resize', measure)
    // Content above the list (podium, fonts loading) can shift its top edge.
    const observer = new ResizeObserver(measure)
    const panel = list.closest('.panel')
    if (panel) observer.observe(panel)
    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [listRef, paginationRef, totalRows, fallbackRowHeight, fallbackPaginationHeight, minRows, stackedBelowPx, stackedRows])

  return perPage
}
