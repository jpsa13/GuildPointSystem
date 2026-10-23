import { useCallback, useRef } from 'react'

const MIN_HEIGHT = 480

/**
 * Sets `--auction-panel-height` on the element to the viewport space left below its top edge, so the
 * chat fills the screen without scrolling the page whatever sits above it (e.g. the equipment notice).
 */
export function useFillViewport<T extends HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null)

  return useCallback((el: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!el) return

    const main = el.closest('main')
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      el.style.setProperty('--auction-panel-height', `${Math.max(MIN_HEIGHT, window.innerHeight - top - bottom)}px`)
    }

    measure()
    window.addEventListener('resize', measure)
    // A notice appearing or going away above the page moves its top edge.
    const observer = new ResizeObserver(measure)
    if (main) observer.observe(main)
    cleanupRef.current = () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [])
}
