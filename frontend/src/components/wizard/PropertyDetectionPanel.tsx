import { useMemo, useRef, useState } from 'react'
import { InfoTip } from './InfoTip'
import { useAutoFitPage } from '@/hooks/useAutoFitPage'

const PAGE_SIZE = 20

type SourceFilter = 'all' | 'data' | 'ontology'

interface PropertyDetectionPanelProps {
  // Not-yet-added detected property paths, already excluding whatever's in
  // state.properties - the parent (Step3Properties) owns that exclusion since
  // it's the one that knows what's already added.
  dataDetected:     string[]
  ontologyDetected: string[]
  // Only true when BOTH a data graph and an ontology were uploaded - with a
  // single source there's nothing to filter between.
  showSourceFilter: boolean
  onAddOne:  (path: string) => void
  onAddMany: (paths: string[]) => void
}

// The property browser itself - rendered either portaled into the App-level
// side panel (desktop) or inline/stacked (mobile) by the caller via
// MaybePortal. This component only renders its *content*; the side panel's
// own border/background/shadow/padding already come from the shared <aside>
// in App.tsx (or, inline, from the surrounding step content) - it must not
// re-apply a second, competing container style here.
//
// Title/search/count/add-all stay fixed at the top (shrink-0); only the pill
// list + "Show more" scroll, in the flex-1 min-h-0 region below. When
// portaled into the App-level panel (which is flex flex-col, max-h-full),
// this root's own min-h-0 lets it clamp to the available height and hand the
// leftover space to the scrollable region; inline (mobile), there's no such
// constraint, so nothing here ever needs to scroll.
export function PropertyDetectionPanel({
  dataDetected,
  ontologyDetected,
  showSourceFilter,
  onAddOne,
  onAddMany,
}: PropertyDetectionPanelProps) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [search, setSearch] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const allDetected = useMemo(
    () => [...new Set([...dataDetected, ...ontologyDetected])].sort(),
    [dataDetected, ontologyDetected],
  )

  const filteredBySource = useMemo(() => {
    if (sourceFilter === 'data') return [...dataDetected].sort()
    if (sourceFilter === 'ontology') return [...ontologyDetected].sort()
    return allDetected
  }, [sourceFilter, dataDetected, ontologyDetected, allDetected])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return filteredBySource
    return filteredBySource.filter(p => p.toLowerCase().includes(q))
  }, [filteredBySource, search])

  // Changing the filter or search re-runs against the full matching set, not
  // just whatever page was already revealed - reset back to the first page,
  // then auto-shrink further if even that overflows the list region's height.
  const { visibleCount, showMore } = useAutoFitPage(PAGE_SIZE, `${sourceFilter} ${search}`, listRef)

  const visible = searched.slice(0, visibleCount)
  const hasMore = searched.length > visible.length

  return (
    <div className="flex flex-col min-h-0 gap-3">
      <div className="shrink-0 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
            Detected properties
            <InfoTip align="left">
              These predicates were found in your uploaded file(s). Add the ones
              whose values should be checked by the shape.
            </InfoTip>
          </h3>
        </div>

        {showSourceFilter && (
          <div className="flex flex-wrap gap-1.5">
            {([
              ['all', 'All detected properties'],
              ['data', 'Properties detected in Data'],
              ['ontology', 'Properties detected in Ontology'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSourceFilter(value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors
                  ${sourceFilter === value
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                `}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search detected properties..."
          className="w-full h-9 px-3 rounded-md border border-zinc-200 text-sm mono
            focus:outline-none focus:border-zinc-400"
        />

        {searched.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-zinc-400">
              {searched.length} propert{searched.length === 1 ? 'y' : 'ies'}
            </p>
            <button
              onClick={() => onAddMany(searched)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-300
                text-zinc-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700
                transition-colors mono shrink-0"
            >
              + Add all ({searched.length})
            </button>
          </div>
        )}
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {searched.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {visible.map(p => (
                <button
                  key={p}
                  onClick={() => onAddOne(p)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-dashed border-zinc-300
                    text-zinc-600 hover:border-zinc-500 hover:bg-zinc-50 transition-colors mono"
                >
                  + {p}
                </button>
              ))}
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
            No detected properties match "{search}".
          </p>
        )}
      </div>
    </div>
  )
}
