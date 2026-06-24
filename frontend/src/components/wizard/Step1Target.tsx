// Step 1 — Target declaration.
// The user picks what kind of resources they want to validate and names them.

import { useState } from 'react'
import { TargetCard } from './TargetCard'
import { TARGET_OPTIONS } from '@/types'
import type { WizardState, TargetType } from '@/types'
import { InfoTip } from './InfoTip'

// Prefixes always shown as quick-pick fallbacks regardless of what the file contained.
const COMMON_PREFIXES: Array<{ prefix: string; namespace: string }> = [
  { prefix: 'ex',     namespace: 'http://example.org/' },
  { prefix: 'foaf',   namespace: 'http://xmlns.com/foaf/0.1/' },
  { prefix: 'schema', namespace: 'https://schema.org/' },
  { prefix: 'dc',     namespace: 'http://purl.org/dc/elements/1.1/' },
  { prefix: 'owl',    namespace: 'http://www.w3.org/2002/07/owl#' },
]

interface Props {
  state:  WizardState
  update: (patch: Partial<WizardState>) => void
}

const TARGET_HELP: Record<TargetType, string> = {
  class: 'Use this for all resources declared as a class, such as every ex:Person in your data.',
  node: 'Use this for one named resource only, such as ex:Alice or ex:Product_123.',
  subjectsOf: 'Use this for every resource that has a property, no matter what class it belongs to.',
  objectsOf: 'Use this for every resource that appears as the value of a property.',
}

// A referenced shape "DepartmentShape" maps to class "Department" but keeps the
// full "DepartmentShape" as the shape name.
const classNameOf = (ref: string) => {
  const local = ref.split(':').pop()!
  return local.endsWith('Shape') ? local.slice(0, -'Shape'.length) : local
}
const shapeNameOf = (ref: string) => ref.split(':').pop()!

export function Step1Target({ state, update }: Props) {
  const [customPrefix, setCustomPrefix] = useState('')
  const [customNamespace, setCustomNamespace] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  // Remembers which "referenced shape to define" pill was picked, so switching
  // target type keeps the prefilled class/shape names instead of clearing them.
  const [selectedRef, setSelectedRef] = useState<string | null>(null)

  const pfx = state.selectedPrefix
  const ns  = state.selectedNamespace

  const targetValueLabel =
    state.targetType === 'class'      ? 'Class name' :
    state.targetType === 'node'       ? 'Individual name (e.g. Alice)' :
                                        'Property name'

  const targetValueHelp =
    state.targetType === 'class'
      ? 'A class groups similar RDF resources. SHACL will validate each node typed as this class.'
      : state.targetType === 'node'
        ? 'An individual is one specific RDF resource. SHACL will validate only this named node.'
        : 'A property is an RDF predicate. SHACL uses it here to find which nodes should be validated.'

  // Build the ordered prefix list:
  //   1. Detected prefixes first (always with their file-declared namespace)
  //   2. COMMON_PREFIXES not already covered by a detected entry
  //   3. Currently-selected custom prefix if not already shown
  const detectedEntries = Object.entries(state.detectedPrefixes)
  const commonExtras = COMMON_PREFIXES.filter(c => !state.detectedPrefixes[c.prefix])
  const shownPrefixes = new Set([
    ...detectedEntries.map(([p]) => p),
    ...commonExtras.map(c => c.prefix),
  ])
  const customEntry =
    pfx && ns && !shownPrefixes.has(pfx)
      ? [{ prefix: pfx, namespace: ns }]
      : []
  const allPrefixOptions = [
    ...detectedEntries.map(([prefix, namespace]) => ({ prefix, namespace })),
    ...commonExtras,
    ...customEntry,
  ]

  const applyCustomPrefix = () => {
    const p = customPrefix.trim().replace(/:$/, '')
    const n = customNamespace.trim()
    if (p && n) {
      update({ selectedPrefix: p, selectedNamespace: n })
      setShowCustom(false)
      setCustomPrefix('')
      setCustomNamespace('')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          What do you want to validate?
          <InfoTip align="left">
            A SHACL target tells the validator which RDF nodes should be checked by
            this shape.
          </InfoTip>
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          This defines which nodes in your data graph will be checked against the shape.
        </p>
      </div>

      {/* ── Prefix selector ── */}
      <div className="space-y-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
        <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
          Namespace prefix for generated shapes
          <InfoTip align="left" className="lowercase">
            Shapes will use this prefix for class names, property paths, and the
            shape URI itself. Choose the prefix that matches your data file so
            PySHACL can match nodes correctly.
          </InfoTip>
        </p>

        <div className="flex flex-wrap gap-1.5">
          {allPrefixOptions.map(({ prefix, namespace }) => {
            const isSelected = pfx === prefix && ns === namespace
            const isDetected = !!state.detectedPrefixes[prefix]
            return (
              <button
                key={prefix + namespace}
                onClick={() => { update({ selectedPrefix: prefix, selectedNamespace: namespace }); setShowCustom(false) }}
                title={namespace}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors mono flex items-center gap-1
                  ${isSelected
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                `}
              >
                {prefix}:
                {isDetected && (
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`}>
                    detected
                  </span>
                )}
              </button>
            )
          })}
          <button
            onClick={() => setShowCustom(v => !v)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors
              ${showCustom
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'}
            `}
          >
            custom…
          </button>
        </div>

        {/* Custom prefix entry */}
        {showCustom && (
          <div className="flex gap-2 items-center fade-up mt-1">
            <input
              type="text"
              value={customPrefix}
              onChange={e => setCustomPrefix(e.target.value)}
              placeholder="prefix"
              className="w-20 h-8 px-2 text-xs mono rounded border border-zinc-300 focus:outline-none focus:border-zinc-500"
            />
            <span className="text-zinc-400 text-xs">:</span>
            <input
              type="text"
              value={customNamespace}
              onChange={e => setCustomNamespace(e.target.value)}
              placeholder="http://example.org/ns#"
              className="flex-1 h-8 px-2 text-xs mono rounded border border-zinc-300 focus:outline-none focus:border-zinc-500"
            />
            <button
              onClick={applyCustomPrefix}
              disabled={!customPrefix.trim() || !customNamespace.trim()}
              className="h-8 px-3 text-xs bg-zinc-800 text-white rounded hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              Use
            </button>
          </div>
        )}

        {/* Selected prefix preview */}
        <p className="text-[11px] text-zinc-400 mono truncate">
          @prefix {pfx}: &lt;{ns}&gt; .
        </p>
      </div>

      {/* Pending node refs — shown above target type cards so they're immediately visible */}
      {state.pendingNodeRefs.length > 0 && (
        <div className="space-y-1.5 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-[11px] text-emerald-700 font-medium uppercase tracking-wider flex items-center gap-1.5">
            Referenced shapes to define
            <InfoTip align="left" className="lowercase">
              These shapes were referenced via sh:node in your previous shape
              but haven't been defined yet. Pick one to build it next.
            </InfoTip>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {state.pendingNodeRefs.map(ref => {
              const isSelected = selectedRef === ref
              return (
                <button
                  key={ref}
                  onClick={() => {
                    setSelectedRef(ref)
                    update({ targetType: 'class', targetValue: classNameOf(ref), shapeName: shapeNameOf(ref) })
                  }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors mono
                    ${isSelected
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-100'}
                  `}
                >
                  {ref.includes(':') ? ref : `${pfx}:${ref}`}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Target type cards */}
      <div className="space-y-2.5">
        {TARGET_OPTIONS.map(opt => (
          <TargetCard
            key={opt.value}
            label={opt.label}
            description={opt.description}
            badge={opt.shacl}
            info={TARGET_HELP[opt.value]}
            selected={state.targetType === opt.value}
            onClick={() => update({
              targetType: opt.value,
              // Keep the prefilled value from a picked reference; otherwise clear.
              targetValue: selectedRef ? classNameOf(selectedRef) : '',
            })}
          />
        ))}
      </div>

      {/* Value input — shown once a type is selected */}
      {state.targetType && (
        <div className="space-y-1.5 fade-up">
          <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
            {targetValueLabel}
            <InfoTip align="left" className="lowercase">
              {targetValueHelp}
            </InfoTip>
          </label>

          {/* Suggested class pills (upload mode) */}
          {state.mode === 'upload' && state.targetType === 'class' && state.suggestedClasses.length > 0 && (
            <div className="space-y-1.5 mb-2">
              <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
                Detected classes
                <InfoTip align="left" className="lowercase">
                  These are classes found in your uploaded RDF file. Picking one
                  means the shape will validate nodes with that class.
                </InfoTip>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {state.suggestedClasses.map(cls => (
                  <button
                    key={cls}
                    onClick={() => update({ targetValue: cls })}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors mono
                      ${state.targetValue === cls
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                    `}
                  >
                    {pfx}:{cls}
                  </button>
                ))}
              </div>
            </div>
          )}

          <input
            autoFocus
            type="text"
            value={state.targetValue}
            onChange={e => { setSelectedRef(null); update({ targetValue: e.target.value }) }}
            placeholder={
              state.targetType === 'class'      ? 'e.g. Person, Car, Product' :
              state.targetType === 'node'       ? 'e.g. Alice, Product_123' :
                                                  'e.g. email, name'
            }
            className="w-full h-10 px-3 rounded-md border border-zinc-200 text-sm mono
              focus:outline-none focus:border-zinc-400"
          />

          {state.targetValue && (
            <p className="text-[11px] text-zinc-400 mono">
              → {TARGET_OPTIONS.find(o => o.value === state.targetType)?.shacl} {pfx}:{state.targetValue}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
