import { useLayoutEffect, useState, type RefObject } from 'react'

interface FitRowsOptions {
  /** The list whose rows we are paging (its top edge is where rows start). */
  listRef: RefObject<HTMLElement | null>
  /** Element right after the rows that only shows with more than one page (e.g. pagination). */
  paginationRef: RefObject<HTMLElement | null>
  totalRows: number
  /** Natural (minimum) row height, border included; rows are counted with it. */
  fallbackRowHeight: number
  /** Height the pagination will take once it appears. */
  fallbackPaginationHeight: number
  minRows?: number
  /** Below this viewport width the layout stacks and the page scrolls anyway. */
  stackedBelowPx?: number
  stackedRows?: number
}

export interface FitRows {
  perPage: number
  /**
   * When paginated, the row height that spreads the leftover (less than one row) over the rows so
   * the list ends exactly at the viewport bottom. Undefined when rows keep their natural height.
   */
  rowHeight?: number
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
}: FitRowsOptions): FitRows {
  const [fit, setFit] = useState<FitRows>({ perPage: stackedRows })

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const measure = () => {
      if (window.innerWidth < stackedBelowPx) {
        setFit({ perPage: stackedRows })
        return
      }
      const listRect = list.getBoundingClientRect()
      const listTop = listRect.top + window.scrollY
      // Counted with the natural height, not the measured one: rows may already be stretched.
      const rowHeight = fallbackRowHeight

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
        setFit({ perPage: Math.max(minRows, totalRows) })
        return
      }
      const rowsSpace = space - (paginationHeight || fallbackPaginationHeight)
      const perPage = Math.max(minRows, Math.floor(rowsSpace / rowHeight))
      const stretched = Math.floor(rowsSpace / perPage)
      setFit((prev) => {
        const next = { perPage, rowHeight: stretched > rowHeight ? stretched : undefined }
        return prev.perPage === next.perPage && prev.rowHeight === next.rowHeight ? prev : next
      })
    }

    measure()
    window.addEventListener('resize', measure)
    // Content above the list (podium, fonts loading) can shift its top edge.
    const observer = new ResizeObserver(measure)
    const panel = list.closest('.panel')
    if (panel) observer.observe(panel)
    // Content removed above the panel (e.g. the Cerberus banner going away) shrinks the page root.
    const pageRoot = list.closest('main')?.firstElementChild
    if (pageRoot) observer.observe(pageRoot)
    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [listRef, paginationRef, totalRows, fallbackRowHeight, fallbackPaginationHeight, minRows, stackedBelowPx, stackedRows])

  return fit
}
