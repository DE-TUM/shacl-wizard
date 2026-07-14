import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query and re-render when it starts/stops matching.
 * Centralises the responsive breakpoint check (e.g. Step 4's sliding-panel vs
 * stacked layout) so we don't scatter fixed pixel comparisons across components.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
