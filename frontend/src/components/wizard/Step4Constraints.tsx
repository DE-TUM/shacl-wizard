// Step 4 — Constraint configuration.
// For each property added in Step 3, the user defines what constraints apply.
// The panel on the left shows property pills; clicking one opens the constraint
// editor for that property on the right.

import { useState, useEffect } from 'react'
import type { WizardState, PropertyConstraints } from '@/types'
import { DATATYPE_OPTIONS, NODEKIND_OPTIONS } from '@/types'

interface Props {
  state:  WizardState
  update: (patch: Partial<WizardState>) => void
}

export function Step4Constraints({ state, update }: Props) {
  const [activeId, setActiveId]         = useState<string | null>(null)
  const [draft,    setDraft]            = useState<PropertyConstraints>({})
  const [editingName, setEditingName]   = useState(false)
  const [nameValue,   setNameValue]     = useState('')

  const activeProperty = state.properties.find(p => p.id === activeId) ?? null

  // When the user picks a different property, load its existing constraints
  useEffect(() => {
    if (activeProperty) setDraft({ ...activeProperty.constraints })
    else setDraft({})
  }, [activeId])

  const patchDraft = (patch: Partial<PropertyConstraints>) =>
    setDraft(prev => ({ ...prev, ...patch }))

  const removeDraftKey = (key: keyof PropertyConstraints) =>
    setDraft(prev => { const n = { ...prev }; delete n[key]; return n })

  const saveAndClose = () => {
    if (!activeId) return
    update({
      properties: state.properties.map(p =>
        p.id === activeId ? { ...p, constraints: draft } : p
      ),
    })
    setActiveId(null)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          What rules apply to each property?
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Select a property below and configure its constraints.
        </p>
      </div>

      {/* Property selector pills */}
      <div className="flex flex-wrap gap-2">
        {state.properties.map(prop => (
          <button
            key={prop.id}
            onClick={() => setActiveId(prop.id)}
            className={`mono text-xs px-3 py-1.5 rounded-full border transition-colors
              ${activeId === prop.id
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'}
            `}
          >
            {prop.path}
            {Object.keys(prop.constraints).length > 0 && (
              <span className="ml-1.5 opacity-60">
                {Object.keys(prop.constraints).length}×
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Constraint editor */}
      {activeProperty ? (
        <div className="space-y-4 fade-up">

          {/* Editable property name */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Editing:</span>
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (nameValue.trim()) update({ properties: state.properties.map(p => p.id === activeId ? { ...p, path: nameValue.trim() } : p) })
                    setEditingName(false)
                  }
                  if (e.key === 'Escape') setEditingName(false)
                }}
                onBlur={() => {
                  if (nameValue.trim()) update({ properties: state.properties.map(p => p.id === activeId ? { ...p, path: nameValue.trim() } : p) })
                  setEditingName(false)
                }}
                className="mono text-sm font-medium border-b border-zinc-400 outline-none bg-transparent"
              />
            ) : (
              <button
                onClick={() => { setEditingName(true); setNameValue(activeProperty.path) }}
                className="mono text-sm font-medium text-zinc-800 hover:text-emerald-700 transition-colors"
                title="Click to rename"
              >
                ex:{activeProperty.path}
              </button>
            )}
          </div>

          <div className="p-4 border border-zinc-200 rounded-xl space-y-5">

            {/* ── Cardinality ── */}
            <ConstraintSection label="How many values must this property have?">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  { label: 'Exactly one',  min: '1', max: '1' },
                  { label: 'At least one', min: '1', max: '' },
                  { label: 'At most one',  min: '', max: '1' },
                  { label: 'Optional',     min: '', max: '' },
                ].map(opt => {
                  const active = draft.minCount === (opt.min || undefined) && draft.maxCount === (opt.max || undefined)
                  return (
                    <button
                      key={opt.label}
                      onClick={() => patchDraft({ minCount: opt.min || undefined, maxCount: opt.max || undefined })}
                      className={`text-[11px] px-3 py-1 rounded-full border transition-colors
                        ${active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                      `}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput label="Custom min" value={draft.minCount} onChange={v => patchDraft({ minCount: v })} />
                <NumberInput label="Custom max" value={draft.maxCount} onChange={v => patchDraft({ maxCount: v })} />
              </div>
            </ConstraintSection>

            {/* ── Datatype ── */}
            <ConstraintSection label="What type of value is expected?">
              <div className="flex flex-wrap gap-1.5">
                {DATATYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => patchDraft({ datatype: draft.datatype === opt.value ? undefined : opt.value })}
                    className={`text-[11px] px-3 py-1 rounded-full border transition-colors
                      ${draft.datatype === opt.value ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </ConstraintSection>

            {/* ── Node kind ── */}
            <ConstraintSection label="Should the value be a resource or a plain value?">
              <div className="flex flex-wrap gap-1.5">
                {NODEKIND_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => patchDraft({ nodeKind: draft.nodeKind === opt.value ? undefined : opt.value })}
                    className={`text-[11px] px-3 py-1 rounded-full border transition-colors
                      ${draft.nodeKind === opt.value ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {draft.nodeKind === 'sh:Literal' && (
                <p className="text-[10px] text-amber-600 mt-1.5">
                  Tip: pair with sh:pattern to ensure the value is a string before the regex runs.
                </p>
              )}
            </ConstraintSection>

            {/* ── Pattern ── */}
            <ConstraintSection label="Does the value need to match a specific format? (regex)">
              <input
                type="text"
                value={draft.pattern ?? ''}
                onChange={e => patchDraft({ pattern: e.target.value || undefined })}
                placeholder="e.g. ^[\w.]+@[\w.]+\.[a-z]{2,}$ for email"
                className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
              />
            </ConstraintSection>

            {/* ── Numeric range ── */}
            <ConstraintSection label="Is there a numeric range? (for integers / decimals)">
              <div className="grid grid-cols-2 gap-2">
                <NumberInput label="Min value ≥" value={draft.minInclusive} onChange={v => patchDraft({ minInclusive: v })} />
                <NumberInput label="Max value ≤" value={draft.maxInclusive} onChange={v => patchDraft({ maxInclusive: v })} />
              </div>
            </ConstraintSection>

            {/* ── String length ── */}
            <ConstraintSection label="Is there a character length limit?">
              <div className="grid grid-cols-2 gap-2">
                <NumberInput label="Min length" value={draft.minLength} onChange={v => patchDraft({ minLength: v })} />
                <NumberInput label="Max length" value={draft.maxLength} onChange={v => patchDraft({ maxLength: v })} />
              </div>
            </ConstraintSection>

            {/* ── sh:in ── */}
            <ConstraintSection label="Must the value be one of a fixed list? (sh:in)">
              <input
                type="text"
                value={draft.in ?? ''}
                onChange={e => patchDraft({ in: e.target.value || undefined })}
                placeholder="Comma-separated: active, inactive, pending"
                className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
              />
            </ConstraintSection>

          </div>

          {/* Active constraint badges */}
          {Object.keys(draft).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(draft).map(([k, v]) =>
                v ? (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 rounded-full text-xs text-zinc-700"
                  >
                    <span className="text-zinc-400 text-[10px]">{k}</span>
                    {v}
                    <button
                      onClick={() => removeDraftKey(k as keyof PropertyConstraints)}
                      className="text-zinc-400 hover:text-zinc-700"
                    >
                      ×
                    </button>
                  </span>
                ) : null
              )}
            </div>
          )}

          <button
            onClick={saveAndClose}
            className="w-full h-10 rounded-md bg-zinc-900 hover:bg-zinc-700 text-white text-sm transition-colors"
          >
            Save rules for{' '}
            <span className="mono ml-1 opacity-70">ex:{activeProperty.path}</span>
          </button>
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-xl">
          Select a property above to define its constraints.
        </div>
      )}
    </div>
  )
}

// ─── Small reusable sub-components ───────────────────────────────────────────

function ConstraintSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">{label}</p>
      {children}
    </div>
  )
}

function NumberInput({ label, value, onChange }: {
  label:    string
  value:    string | undefined
  onChange: (v: string | undefined) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-zinc-400">{label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || undefined)}
        className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
      />
    </div>
  )
}
