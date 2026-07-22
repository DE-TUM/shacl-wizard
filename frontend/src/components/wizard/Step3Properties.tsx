import { useState, useEffect, useCallback, useRef } from 'react'
import type { WizardState, PropertyShape } from '@/types'
import { suggestProperties } from '@/api/backend'
import { unwrapSuggested, lookupSuggestedConstraint } from '@/utils/suggestedConstraints'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { InfoTip } from './InfoTip'
import { MaybePortal } from './MaybePortal'
import { PropertyDetectionPanel } from './PropertyDetectionPanel'
import { ConfirmModal } from './ConfirmModal'

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

// Added Properties only needs a "Show more" button once the list is long
// enough to be worth paginating - same incremental-reveal convention as
// PropertyDetectionPanel's detected-properties browser.
const ADDED_PAGE_SIZE = 10

interface Props {
  state:  WizardState
  update: (patch: Partial<WizardState>) => void
  // Reported upward so App can shift the card left + slide the side panel in
  // (desktop) - the same App-level mechanism Step 4's constraint editor uses.
  onPanelChange?: (open: boolean) => void
  // The App-level side-panel scroll container to portal the property browser
  // into (desktop).
  panelSlot?:     HTMLElement | null
}

export function Step3Properties({ state, update, onPanelChange, panelSlot }: Props) {
  const pfx = state.selectedPrefix || 'ex'
  const [input, setInput] = useState('')
  // Same breakpoint as Step 4's side panel - both share the App-level
  // mechanism (540px card + 486px panel fit side by side above this width).
  const isDesktop = useMediaQuery('(min-width: 1120px)')
  const [pillSuggestions, setPillSuggestions] = useState<string[]>([])
  const [loadingPills, setLoadingPills] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addedSearch, setAddedSearch] = useState('')
  const [showRemoveAllModal, setShowRemoveAllModal] = useState(false)
  const [visibleAddedCount, setVisibleAddedCount] = useState(ADDED_PAGE_SIZE)

  // Fetch AI property suggestions for the pill overlay. Extracted so the retry
  // button can re-run it. Failures are surfaced (see suggestError) instead of
  // being swallowed - in manual mode this call is the only suggestion source,
  // so a silent failure looks like "the AI suggestions just don't work".
  const loadSuggestions = useCallback(() => {
    setLoadingPills(true)
    setSuggestError(null)
    suggestProperties(state.shapeName, state.targetValue, state.targetType || 'class', {
      prefixes: state.detectedPrefixes,
      selectedPrefix: state.selectedPrefix,
    })
      .then(result => setPillSuggestions(result.properties.map(p => p.path)))
      .catch((err: unknown) => {
        const timedOut = err instanceof Error && err.name === 'AbortError'
        setSuggestError(
          timedOut
            ? 'Suggestions timed out. Check your connection, then retry.'
            : 'Could not load AI suggestions. Retry, or add properties manually below.'
        )
      })
      .finally(() => setLoadingPills(false))
  }, [state.shapeName, state.targetValue, state.targetType, state.detectedPrefixes, state.selectedPrefix])

  // StrictMode double-invokes mount effects in dev, which would fire two
  // suggestProperties calls; the second (last to resolve) would overwrite the
  // first, making pills visibly change after they first render. A ref persists
  // across StrictMode's simulated remount, so the fetch runs exactly once.
  const didAutoLoad = useRef(false)
  useEffect(() => {
    if (state.nlParsed) return
    if (didAutoLoad.current) return
    didAutoLoad.current = true
    loadSuggestions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pills that haven't been added yet - reappear automatically when a property is removed
  const availablePills = pillSuggestions.filter(
    s => !state.properties.find(p => p.path.toLowerCase() === s.toLowerCase())
  )

  const showOverlay = input === '' && !state.nlParsed && (loadingPills || availablePills.length > 0)

  // Per-source detected-property lists for the side panel, excluding whatever
  // is already added (mirrors the old classFilteredProperties/uploadSuggestions
  // fallback: a class with no data-graph-scoped entry falls back to the flat,
  // ungrouped suggestedProperties list, unchanged from today; the ontology
  // side has no such flat fallback, since suggestedProperties is data-graph-only).
  const isAlreadyAdded = (p: string) => state.properties.some(prop => prop.path.toLowerCase() === p.toLowerCase())

  const rawDataDetected =
    state.targetValue && state.dataGraphPropertiesByClass[state.targetValue]
      ? state.dataGraphPropertiesByClass[state.targetValue]
      : state.suggestedProperties
  const rawOntologyDetected =
    (state.targetValue && state.ontologyPropertiesByClass[state.targetValue]) || []

  const dataDetected = rawDataDetected.filter(p => !isAlreadyAdded(p))
  const ontologyDetected = rawOntologyDetected.filter(p => !isAlreadyAdded(p))
  const hasAnyDetected = state.mode === 'upload' && (dataDetected.length > 0 || ontologyDetected.length > 0)
  const showSourceFilter = Boolean(state.uploadedFileName) && state.ontologyUploaded

  // Tell App when the side panel should be open (desktop + something to
  // browse) - same reporting mechanism Step 4's constraint editor uses.
  useEffect(() => {
    onPanelChange?.(isDesktop && hasAnyDetected)
  }, [isDesktop, hasAnyDetected, onPanelChange])
  useEffect(() => () => onPanelChange?.(false), [onPanelChange])

  const addProperty = (path?: string) => {
    const p = (path ?? input).trim()
    if (!p || p.toLowerCase() === state.targetValue.toLowerCase()) return
    if (state.properties.some(prop => prop.path.toLowerCase() === p.toLowerCase())) return
    const inferred = unwrapSuggested(lookupSuggestedConstraint(state.suggestedConstraints, state.ontologyConstraintsByClass, state.targetValue, p))
    const prop: PropertyShape = { id: uid(), path: p, constraints: inferred }
    update({ properties: [...state.properties, prop] })
    setInput('')
  }

  // Adds every path passed in (the panel's currently-visible/filtered set,
  // whatever combination of source filter + search produced it) - not
  // necessarily the full detected list.
  const addManyProperties = (paths: string[]) => {
    const newProps: PropertyShape[] = paths
      .filter(p => p.toLowerCase() !== state.targetValue.toLowerCase())
      .map(p => ({ id: uid(), path: p, constraints: unwrapSuggested(lookupSuggestedConstraint(state.suggestedConstraints, state.ontologyConstraintsByClass, state.targetValue, p)) }))
    if (newProps.length === 0) return
    update({ properties: [...state.properties, ...newProps] })
  }

  const removeProperty = (id: string) => {
    update({ properties: state.properties.filter(p => p.id !== id) })
  }

  // Removes every added property, regardless of the added-properties search -
  // an unqualified "Remove all" means all, not just what's currently visible.
  const removeAllProperties = () => {
    update({ properties: [] })
    setShowRemoveAllModal(false)
  }

  const visibleAddedProperties = state.properties.filter(p =>
    p.path.toLowerCase().includes(addedSearch.trim().toLowerCase())
  )

  // Search re-runs against the full added-properties list, not just whatever
  // page was already revealed - reset back to the first page.
  useEffect(() => {
    setVisibleAddedCount(ADDED_PAGE_SIZE)
  }, [addedSearch])

  const pagedAddedProperties = visibleAddedProperties.slice(0, visibleAddedCount)
  const hasMoreAdded = visibleAddedProperties.length > pagedAddedProperties.length

  const commitRename = (id: string, newPath: string) => {
    const trimmed = newPath.trim()
    if (trimmed) {
      update({
        properties: state.properties.map(p => p.id === id ? { ...p, path: trimmed } : p),
      })
    }
    setEditingId(null)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          Which properties do you want to constrain?
          <InfoTip align="left">
            In SHACL, each property shape checks one predicate on the target node,
            such as ex:name, ex:email, or ex:birthDate.
          </InfoTip>
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Add the predicates you want to validate on{' '}
          <span className="mono text-zinc-700">{pfx}:{state.targetValue}</span> nodes.
        </p>
      </div>

      {state.mode === 'upload' && state.inferenceLimited && (
        <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs text-zinc-600">
          This file is too large, so some constraint suggestions were skipped.
        </div>
      )}

      {/* Input with floating pill overlay */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
          Property path
          <InfoTip align="left" className="lowercase">
            A property path points from the node being validated to the value being
            checked. For a simple path, enter the predicate name, such as email.
          </InfoTip>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addProperty()}
              className="w-full h-9 px-3 rounded-md border border-zinc-200 text-sm mono
                focus:outline-none focus:border-zinc-400"
            />

            {/* Pill overlay - only shown when input is empty */}
            {showOverlay && (
              <div className="absolute inset-0 flex items-center px-2 pointer-events-none overflow-hidden rounded-md">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {loadingPills ? (
                    [0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-zinc-300 pulse-dot inline-block shrink-0"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))
                  ) : (
                    availablePills.map(s => (
                      <button
                        key={s}
                        onClick={() => addProperty(s)}
                        className="pointer-events-auto px-2.5 py-0.5 rounded-full border border-zinc-300
                          bg-white text-zinc-500 hover:bg-emerald-50 hover:border-emerald-400
                          hover:text-emerald-700 transition-colors text-[11px] mono shrink-0"
                      >
                        {s}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => addProperty()}
            className="px-4 h-9 rounded-md bg-zinc-900 text-white text-sm hover:bg-zinc-700 transition-colors shrink-0"
          >
            Add
          </button>
        </div>

        {/* Surface a failed suggestion fetch with a retry, instead of silently
            showing nothing (the pill overlay is the only AI source in manual mode). */}
        {suggestError && !loadingPills && (
          <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
            {suggestError}
            <button
              onClick={loadSuggestions}
              className="underline underline-offset-2 hover:text-amber-700 font-medium"
            >
              Retry
            </button>
          </p>
        )}
      </div>

      {/* Detected-properties browser: portaled into the App-level side panel on
          desktop (>=1120px, same mechanism as Step 4's constraint editor), or
          rendered right here, inline/stacked, below that. */}
      {hasAnyDetected && (
        <MaybePortal target={panelSlot ?? null} inline={!isDesktop}>
          <PropertyDetectionPanel
            dataDetected={dataDetected}
            ontologyDetected={ontologyDetected}
            showSourceFilter={showSourceFilter}
            onAddOne={addProperty}
            onAddMany={addManyProperties}
          />
        </MaybePortal>
      )}

      {/* Property list */}
      {state.properties.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
              Added properties
              <InfoTip align="left" className="lowercase">
                The number badge shows how many SHACL constraints are already
                attached to that property - such as required count, datatype,
                or value range. You can configure them in the next step.
              </InfoTip>
            </p>
            <button
              onClick={() => setShowRemoveAllModal(true)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-red-200
                text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300
                transition-colors shrink-0"
            >
              Remove all
            </button>
          </div>
          <input
            type="text"
            value={addedSearch}
            onChange={e => setAddedSearch(e.target.value)}
            placeholder="Search added properties..."
            className="w-full h-8 px-3 rounded-md border border-zinc-200 text-xs mono
              focus:outline-none focus:border-zinc-400"
          />
          {visibleAddedProperties.length === 0 && (
            <p className="text-xs text-zinc-400 text-center py-4">
              No added properties match "{addedSearch}".
            </p>
          )}
          {pagedAddedProperties.map(prop => (
            <div
              key={prop.id}
              className="flex items-center justify-between p-3 rounded-lg border border-zinc-200"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {editingId === prop.id ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(prop.id, editValue)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => commitRename(prop.id, editValue)}
                      className="mono text-sm font-medium text-zinc-800 border-b border-zinc-400 outline-none bg-transparent w-32"
                    />
                  ) : (
                    <span
                      className="mono text-sm font-medium text-zinc-800 truncate inline-block max-w-[40ch]"
                      title={prop.path.includes(':') ? prop.path : `${pfx}:${prop.path}`}
                    >
                      {prop.path.includes(':') ? prop.path : `${pfx}:${prop.path}`}
                    </span>
                  )}
                  {(() => {
                    const count = Object.values(prop.constraints).filter(
                      v => v !== null && v !== undefined && v !== ''
                    ).length
                    return count > 0 ? (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">
                        {count} rules
                      </span>
                    ) : null
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <button
                  onClick={() => { setEditingId(prop.id); setEditValue(prop.path) }}
                  className="text-xs text-zinc-400 hover:text-zinc-600 px-2 py-1 rounded border border-zinc-200 hover:border-zinc-300 transition-colors"
                >
                  ✎
                </button>
                <button
                  onClick={() => removeProperty(prop.id)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded border border-zinc-200 hover:border-red-200 transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {hasMoreAdded && (
            <button
              onClick={() => setVisibleAddedCount(c => c + ADDED_PAGE_SIZE)}
              className="w-full h-8 text-xs text-zinc-500 border border-dashed border-zinc-200
                rounded-md hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
            >
              Show more ({visibleAddedProperties.length - pagedAddedProperties.length} remaining)
            </button>
          )}
        </div>
      ) : (
        <div className="text-center py-10 text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-xl">
          No properties yet. Add at least one above.
        </div>
      )}

      {showRemoveAllModal && (
        <ConfirmModal
          title="Remove all properties?"
          body={`This will remove all ${state.properties.length} added propert${state.properties.length === 1 ? 'y' : 'ies'} from this shape. This cannot be undone.`}
          cancelLabel="Cancel"
          confirmLabel="Remove all"
          destructive
          onCancel={() => setShowRemoveAllModal(false)}
          onConfirm={removeAllProperties}
        />
      )}
    </div>
  )
}
