import { useMemo, useRef, useState } from 'react'
import { InfoTip } from './InfoTip'
import { useAutoFitPage } from '@/hooks/useAutoFitPage'

const PAGE_SIZE = 20

interface ClassDetectionPanelProps {
  classes:        string[]
  classHierarchy: Record<string, string>
  selectedClass:  string
  pfx:            string
  onSelect:       (cls: string) => void
}

// The detected-classes browser - rendered either portaled into the App-level
// side panel (desktop) or inline/stacked (mobile) by the caller via
// MaybePortal, mirroring PropertyDetectionPanel. This component only renders
// its *content*; the side panel's own border/background/shadow/padding
// already come from the shared <aside> in App.tsx (or, inline, from the
// surrounding step content).
//
// Title/search/count stay fixed at the top (shrink-0); only the pill list +
// "Show more" scroll, in the flex-1 min-h-0 region below - see
// PropertyDetectionPanel for why min-h-0 here is what makes the clamp-and-
// inner-scroll behavior work once portaled into the App-level panel.
export function ClassDetectionPanel({
  classes,
  classHierarchy,
  selectedClass,
  pfx,
  onSelect,
}: ClassDetectionPanelProps) {
  const [search, setSearch] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => [...classes].sort(), [classes])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(c => c.toLowerCase().includes(q))
  }, [sorted, search])

  // Search re-runs against the full class list, not just whatever page was
  // already revealed - reset back to the first page, then auto-shrink
  // further if even that overflows the list region's height.
  const { visibleCount, showMore } = useAutoFitPage(PAGE_SIZE, search, listRef)

  const visible = searched.slice(0, visibleCount)
  const hasMore = searched.length > visible.length

  return (
    <div className="flex flex-col min-h-0 gap-3">
      <div className="shrink-0 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
            Detected classes
            <InfoTip align="left">
              These are classes found in your uploaded RDF file. Picking one
              means the shape will validate nodes with that class.
            </InfoTip>
          </h3>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search detected classes..."
          className="w-full h-9 px-3 rounded-md border border-zinc-200 text-sm mono
            focus:outline-none focus:border-zinc-400"
        />

        {searched.length > 0 && (
          <p className="text-[11px] text-zinc-400">
            {searched.length} class{searched.length === 1 ? '' : 'es'}
          </p>
        )}
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {searched.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {visible.map(cls => {
                const parent = classHierarchy[cls]
                const isSelected = selectedClass === cls
                return (
                  <button
                    key={cls}
                    onClick={() => onSelect(cls)}
                    title={parent ? `Subclass of ${parent}` : undefined}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors mono flex items-center gap-1
                      ${isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                    `}
                  >
                    {pfx}:{cls}
                    {parent && (
                      <span className={`text-[9px] ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                        ⊂ {parent}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {hasMore && (
              <button
                onClick={showMore}
                className="w-full h-8 text-xs text-zinc-500 border border-dashed border-zinc-200
                  rounded-md hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
              >
                Show more ({searched.length - visible.length} remaining)
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-zinc-400 text-center py-6">
            No detected classes match "{search}".
          </p>
        )}
      </div>
    </div>
  )
}
