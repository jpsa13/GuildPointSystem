import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './NavBadge.styles.scss'

interface NavBadgeProps {
  count: number
  /** Screen-reader text for the bubble. */
  ariaLabel: string
  /** Popover heading shown on hover. */
  title: string
  /** Popover rows (`<li className="nav-popover__row">`). */
  children: ReactNode
}

/** Sidebar bubble with a count; hovering it lists the entries. Renders nothing at zero. */
export function NavBadge({ count, ariaLabel, title, children }: NavBadgeProps) {
  // Rendered in a portal: the sidebar scrolls and the nav links are clipped (chamfer).
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  if (count === 0) return null

  return (
    <>
      <span
        className="nav-badge"
        aria-label={ariaLabel}
        onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setAnchor(null)}
      >
        {count}
      </span>
      {anchor &&
        createPortal(
          <div
            className="nav-popover"
            role="tooltip"
            style={{ top: anchor.top + anchor.height / 2, left: anchor.right + 14 }}
          >
            <span className="nav-popover__title">{title}</span>
            <ul>{children}</ul>
          </div>,
          document.body,
        )}
    </>
  )
}
