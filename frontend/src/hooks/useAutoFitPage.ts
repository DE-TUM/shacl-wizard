import { useEffect, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Pagination that shrinks its own default page so `containerRef`'s content
 * fits without scrolling - only a deliberate "Show more" click is allowed to
 * grow past that and engage the container's own scrollbar. Used by the
 * scrollable list region of the side-panel browsers (Step 1's detected
 * classes, Step 3's detected properties); their fixed header (title, search,
 * counts) sits outside this region and is unaffected.
 *
 * `resetKey` should change whenever the underlying filtered/searched item set
 * changes (e.g. the search box or a source filter) - it starts the count back
 * at `pageSize` and re-triggers the fit pass. Reads `containerRef.current`
 * fresh inside the effect (not as a captured render-time value) since the ref
 * only attaches to the DOM after this render commits.
 */
export function useAutoFitPage(
  pageSize:     number,
  resetKey:     unknown,
  containerRef: RefObject<HTMLElement | null>,
  minVisible = 1,
) {
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [autoFitting, setAutoFitting] = useState(true)

  useEffect(() => {
    setVisibleCount(pageSize)
    setAutoFitting(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, pageSize])

  // Runs only while auto-fitting is active (right after a reset, never after
  // a manual "Show more" click) - drops one item per pass and re-measures
  // until the list region stops overflowing its own (flex-allotted) height,
  // or until minVisible is reached. In inline/mobile layouts the list region
  // has no height constraint at all, so scrollHeight never exceeds
  // clientHeight and this settles immediately without ever shrinking.
  useLayoutEffect(() => {
    if (!autoFitting) return
    const el = containerRef.current
    if (!el) { setAutoFitting(false); return }
    if (el.scrollHeight > el.clientHeight + 1 && visibleCount > minVisible) {
      setVisibleCount(c => Math.max(minVisible, c - 1))
    } else {
      setAutoFitting(false)
    }
  }, [autoFitting, visibleCount, containerRef, minVisible])

  const showMore = () => {
    setAutoFitting(false)
    setVisibleCount(c => c + pageSize)
  }

  return { visibleCount, showMore }
}
