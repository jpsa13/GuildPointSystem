import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Height that makes `ref` end at the same bottom edge as `targetRef` (e.g. a side column lining
 * up with the main panel next to it). Follows the target's size changes.
 * Returns undefined below `stackedBelowPx`, where the columns stack and natural height is used.
 */
export function useMatchBottom(
  ref: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
  /** Pass false while the elements aren't rendered yet (e.g. behind a loading state). */
  ready = true,
  stackedBelowPx = 1100,
) {
  const [height, setHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const el = ref.current
    const target = targetRef.current
    if (!ready || !el || !target) return

    const measure = () => {
      if (window.innerWidth < stackedBelowPx) {
        setHeight(undefined)
        return
      }
      const h = Math.round(target.getBoundingClientRect().bottom - el.getBoundingClientRect().top)
      setHeight(h > 0 ? h : undefined)
    }

    measure()
    window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [ref, targetRef, ready, stackedBelowPx])

  return height
}
