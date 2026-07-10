// Step 4 — Constraint configuration.
// For each property added in Step 3, the user defines what constraints apply.
// The panel on the left shows property pills; clicking one opens the constraint
// editor for that property on the right.
//
// The editor groups constraints into a single-expand accordion, one collapsible
// section per SHACL constraint category. Only one section is open at a time.

import { useState, useEffect } from 'react'
import type { WizardState, PropertyConstraints, SubShape } from '@/types'
import { DATATYPE_OPTIONS, NODEKIND_OPTIONS } from '@/types'
import { detectConstraintIssues } from '@/utils/constraintWarnings'
import type { IssueLevel } from '@/utils/constraintWarnings'
import { InfoTip } from './InfoTip'

interface Props {
  state:  WizardState
  update: (patch: Partial<WizardState>) => void
}

// Which draft keys belong to each accordion category. Drives the per-section
// "active count" badge. Includes keys not yet exposed by a manual control
// (e.g. class, minExclusive) so the badge still reflects values set via AI
// parsing until their control lands in a later phase.
const CATEGORY_KEYS: Record<string, (keyof PropertyConstraints)[]> = {
  valueType:   ['datatype', 'nodeKind', 'class'],
  cardinality: ['minCount', 'maxCount'],
  valueRange:  ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'],
  stringBased: ['pattern', 'minLength', 'maxLength', 'languageIn', 'uniqueLang'],
  propertyPair: ['equals', 'disjoint', 'lessThan', 'lessThanOrEquals'],
  logical:     ['and', 'or', 'xone', 'not', 'qualifiedValueShape'],
  shapeBased:  ['node'],
  other:       ['in', 'hasValue'],
}

// A constraint value counts as "set" for the badge. Arrays/objects (logical
// sub-shapes) only count when non-empty.
function isSet(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v).length > 0
  return true
}

export function Step4Constraints({ state, update }: Props) {
  const pfx = state.selectedPrefix || 'ex'
  const [activeId, setActiveId]         = useState<string | null>(null)
  const [draft,    setDraft]            = useState<PropertyConstraints>({})
  const [editingName, setEditingName]   = useState(false)
  const [nameValue,   setNameValue]     = useState('')
  const [openSection, setOpenSection]   = useState<string | null>('valueType')

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

  // Single-expand: storing one open id means opening a section closes the rest.
  const toggleSection = (id: string) =>
    setOpenSection(prev => (prev === id ? null : id))

  const countFor = (id: string) =>
    CATEGORY_KEYS[id].filter(k => isSet(draft[k])).length

  // Cross-field validation (Phase 0.5). Warns but never blocks — SHACL permits
  // writing an unsatisfiable shape. ownPath enables the property-pair self-
  // reference checks (C13/R5).
  const issues = detectConstraintIssues(draft, activeProperty?.path)

  // Other properties in this shape, offered as property-pair comparison targets.
  const otherProps = state.properties
    .filter(p => p.id !== activeId)
    .map(p => p.path)

  // ── Logical constraint helpers (Phase 5) ──
  // Only one logical mode is active per property (keeps the UI demo-ready).
  type LogicalMode = 'none' | 'and' | 'or' | 'xone' | 'not' | 'qualified'
  const logicalMode: LogicalMode =
    draft.and ? 'and' : draft.or ? 'or' : draft.xone ? 'xone'
      : draft.not ? 'not' : draft.qualifiedValueShape ? 'qualified' : 'none'

  const setLogicalMode = (mode: LogicalMode) => {
    // Clear every logical field, then seed the chosen one.
    const cleared: Partial<PropertyConstraints> = {
      and: undefined, or: undefined, xone: undefined, not: undefined,
      qualifiedValueShape: undefined, qualifiedMinCount: undefined, qualifiedMaxCount: undefined,
    }
    if (mode === 'and' || mode === 'or' || mode === 'xone') cleared[mode] = [{}]
    else if (mode === 'not') cleared.not = {}
    else if (mode === 'qualified') cleared.qualifiedValueShape = {}
    patchDraft(cleared)
  }

  const listKey = (logicalMode === 'and' || logicalMode === 'or' || logicalMode === 'xone')
    ? logicalMode : null

  const updateGroup = (index: number, patch: Partial<SubShape>) => {
    if (!listKey) return
    const groups = [...(draft[listKey] ?? [])]
    groups[index] = { ...groups[index], ...patch }
    patchDraft({ [listKey]: groups })
  }
  const addGroup = () => {
    if (!listKey) return
    patchDraft({ [listKey]: [...(draft[listKey] ?? []), {}] })
  }
  const removeGroup = (index: number) => {
    if (!listKey) return
    const groups = (draft[listKey] ?? []).filter((_, i) => i !== index)
    patchDraft({ [listKey]: groups.length ? groups : undefined })
    if (!groups.length) setLogicalMode('none')
  }
  const updateSingle = (key: 'not' | 'qualifiedValueShape', patch: Partial<SubShape>) =>
    patchDraft({ [key]: { ...(draft[key] ?? {}), ...patch } })

  // Worst issue level touching a given category, for the section header marker.
  const sectionIssueLevel = (id: string): IssueLevel | null => {
    const keys = CATEGORY_KEYS[id]
    const matched = issues.filter(i => i.fields.some(f => keys.includes(f)))
    if (matched.some(i => i.level === 'contradiction')) return 'contradiction'
    return matched.length > 0 ? 'redundant' : null
  }

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
        <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          What rules apply to each property?
          <InfoTip align="left">
            Constraints are the checks SHACL runs for a property, such as whether a
            value is required, what type it must be, or which values are allowed.
          </InfoTip>
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Select a property below and configure its constraints.
        </p>
      </div>

      {/* Property selector pills */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
          Property to edit
          <InfoTip align="left" className="lowercase">
            Pick a predicate first. The rules you set below will apply only to
            values reached through that property.
          </InfoTip>
        </p>
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
              {(() => {
                // Count only validating constraints — sh:message is an annotation.
                const count = Object.entries(prop.constraints).filter(
                  ([k, v]) => k !== 'message' && v !== null && v !== undefined && v !== ''
                ).length
                return count > 0 ? (
                  <span className="ml-1.5 opacity-60">{count}x</span>
                ) : null
              })()}
            </button>
          ))}
        </div>
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
                {activeProperty.path.includes(':') ? activeProperty.path : `${pfx}:${activeProperty.path}`}
              </button>
            )}
            <InfoTip align="left">
              This property name becomes the sh:path in the output. SHACL checks the
              values connected to the target node through this path.
            </InfoTip>
          </div>

          {/* ── Constraint accordion — one open section at a time ── */}
          <div className="space-y-2">

            {/* ── Value Type ── */}
            <AccordionSection
              title="Value Type"
              count={countFor('valueType')}
              issueLevel={sectionIssueLevel('valueType')}
              isOpen={openSection === 'valueType'}
              onToggle={() => toggleSection('valueType')}
            >
              {/* Datatype */}
              <ConstraintSection
                label="What type of value is expected?"
                info="Datatype constraints are for literal values such as text, numbers, dates, and booleans."
              >
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

              {/* Node kind */}
              <ConstraintSection
                label="Should the value be a resource or a plain value?"
                info="Node kind distinguishes named resources (IRIs), blank nodes, and plain literal values."
              >
                <div className="flex flex-wrap gap-1.5">
                  {NODEKIND_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => patchDraft({ nodeKind: draft.nodeKind === opt.value ? undefined : opt.value })}
                      className={`inline-flex items-center gap-1 text-[11px] px-3 py-1 rounded-full border transition-colors
                        ${draft.nodeKind === opt.value ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                      `}
                    >
                      {opt.label}
                      {opt.value === 'sh:IRI' && (
                        <InfoTip align="left" placement="top" className="!w-[0.85rem] !h-[0.85rem] !text-[9px] lowercase">
                          The value is a named resource identified by a URI, like
                          <span className="font-mono"> ex:Paris</span> or a full URL. Use this
                          when the property links to another entity in the graph.
                        </InfoTip>
                      )}
                      {opt.value === 'sh:BlankNode' && (
                        <InfoTip align="left" placement="top" className="!w-[0.85rem] !h-[0.85rem] !text-[9px] lowercase">
                          The value is an anonymous node with no global identifier. Blank nodes
                          are embedded sub-structures (e.g. an address block) that exist only
                          inside this graph and cannot be referenced from outside.
                        </InfoTip>
                      )}
                      {opt.value === 'sh:Literal' && (
                        <InfoTip align="left" placement="top" className="!w-[0.85rem] !h-[0.85rem] !text-[9px] lowercase">
                          The value is a plain data value such as a string, number, date, or
                          boolean, not a link to another resource. Examples:
                          <span className="font-mono"> "Alice"</span>,
                          <span className="font-mono"> 42</span>,
                          <span className="font-mono"> true</span>.
                        </InfoTip>
                      )}
                    </button>
                  ))}
                </div>
                {draft.nodeKind === 'sh:Literal' && (
                  <p className="text-[10px] text-amber-600 mt-1.5">
                    Tip: pair with sh:pattern to ensure the value is a string before the regex runs.
                  </p>
                )}
              </ConstraintSection>

              {/* sh:class */}
              <ConstraintSection
                label="Must the value be an instance of a class? (sh:class)"
                info="sh:class requires each value to be a resource that has rdf:type the given class (directly or via a subclass). Use it for links to typed resources, e.g. every author must be a foaf:Person."
              >
                <input
                  type="text"
                  value={draft.class ?? ''}
                  onChange={e => patchDraft({ class: e.target.value || undefined })}
                  placeholder={`e.g. ${pfx}:Person or foaf:Person`}
                  className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
                />
              </ConstraintSection>
            </AccordionSection>

            {/* ── Cardinality ── */}
            <AccordionSection
              title="Cardinality"
              count={countFor('cardinality')}
              issueLevel={sectionIssueLevel('cardinality')}
              isOpen={openSection === 'cardinality'}
              onToggle={() => toggleSection('cardinality')}
            >
              <ConstraintSection
                label="How many values must this property have?"
                info="Cardinality controls whether the property is required and how many values are allowed for each target node."
              >
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { label: 'Exactly one',  min: '1', max: '1' },
                    { label: 'At least one', min: '1', max: '' },
                    { label: 'At most one',  min: '', max: '1' },
                    { label: 'Optional',     min: '', max: '' },
                  ].map(opt => {
                    const active = (draft.minCount || undefined) === (opt.min || undefined) && (draft.maxCount || undefined) === (opt.max || undefined)
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
                  <NumberInput
                    label="Custom min"
                    value={draft.minCount}
                    onChange={v => patchDraft({ minCount: v })}
                    info="sh:minCount is the smallest number of values this property must have."
                  />
                  <NumberInput
                    label="Custom max"
                    value={draft.maxCount}
                    onChange={v => patchDraft({ maxCount: v })}
                    info="sh:maxCount is the largest number of values this property may have."
                  />
                </div>
              </ConstraintSection>
            </AccordionSection>

            {/* ── Value Range ── */}
            <AccordionSection
              title="Value Range"
              count={countFor('valueRange')}
              issueLevel={sectionIssueLevel('valueRange')}
              isOpen={openSection === 'valueRange'}
              onToggle={() => toggleSection('valueRange')}
            >
              <ConstraintSection
                label="Is there a numeric range? (for integers / decimals)"
                info="Range constraints compare numeric or date-like values against lower and upper bounds."
              >
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput
                    label="Min value >="
                    value={draft.minInclusive}
                    onChange={v => patchDraft({ minInclusive: v })}
                    info="sh:minInclusive means the value must be this number or higher."
                  />
                  <NumberInput
                    label="Max value <="
                    value={draft.maxInclusive}
                    onChange={v => patchDraft({ maxInclusive: v })}
                    info="sh:maxInclusive means the value must be this number or lower."
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <NumberInput
                    label="Min value > (exclusive)"
                    value={draft.minExclusive}
                    onChange={v => patchDraft({ minExclusive: v })}
                    info="sh:minExclusive means the value must be strictly greater than this number."
                  />
                  <NumberInput
                    label="Max value < (exclusive)"
                    value={draft.maxExclusive}
                    onChange={v => patchDraft({ maxExclusive: v })}
                    info="sh:maxExclusive means the value must be strictly less than this number."
                  />
                </div>
              </ConstraintSection>
            </AccordionSection>

            {/* ── String-based ── */}
            <AccordionSection
              title="String-based"
              count={countFor('stringBased')}
              issueLevel={sectionIssueLevel('stringBased')}
              isOpen={openSection === 'stringBased'}
              onToggle={() => toggleSection('stringBased')}
            >
              {/* Pattern */}
              <ConstraintSection
                label="Does the value need to match a specific format? (regex)"
                info="sh:pattern checks text with a regular expression, which is useful for emails, IDs, codes, and similar formats."
              >
                <input
                  type="text"
                  value={draft.pattern ?? ''}
                  onChange={e => patchDraft({ pattern: e.target.value || undefined })}
                  placeholder="e.g. ^[\w.]+@[\w.]+\.[a-z]{2,}$ for email"
                  className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
                />
              </ConstraintSection>

              {/* String length */}
              <ConstraintSection
                label="Is there a character length limit?"
                info="Length constraints count the characters in a literal text value."
              >
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput
                    label="Min length"
                    value={draft.minLength}
                    onChange={v => patchDraft({ minLength: v })}
                    info="sh:minLength is the fewest characters the value may contain."
                  />
                  <NumberInput
                    label="Max length"
                    value={draft.maxLength}
                    onChange={v => patchDraft({ maxLength: v })}
                    info="sh:maxLength is the most characters the value may contain."
                  />
                </div>
              </ConstraintSection>

              {/* sh:languageIn */}
              <ConstraintSection
                label="Which languages are allowed? (sh:languageIn)"
                info="sh:languageIn restricts language-tagged text to the listed language tags, e.g. only English and German labels. It applies to literals with a language tag."
              >
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['en', 'de', 'fr', 'es', 'it'].map(tag => {
                    const tags = (draft.languageIn ?? '').split(',').map(t => t.trim()).filter(Boolean)
                    const active = tags.includes(tag)
                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          const next = active ? tags.filter(t => t !== tag) : [...tags, tag]
                          patchDraft({ languageIn: next.length ? next.join(', ') : undefined })
                        }}
                        className={`text-[11px] px-3 py-1 rounded-full border transition-colors
                          ${active ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                        `}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
                <input
                  type="text"
                  value={draft.languageIn ?? ''}
                  onChange={e => patchDraft({ languageIn: e.target.value || undefined })}
                  placeholder="Comma-separated tags: en, de, fr"
                  className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
                />
              </ConstraintSection>

              {/* sh:uniqueLang */}
              <ConstraintSection
                label="At most one value per language? (sh:uniqueLang)"
                info="sh:uniqueLang true forbids two values sharing the same language tag, e.g. only one English label. It only has an effect when the property can have several values."
              >
                <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-600">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.uniqueLang === 'true'}
                    onClick={() => patchDraft({ uniqueLang: draft.uniqueLang === 'true' ? undefined : 'true' })}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors
                      ${draft.uniqueLang === 'true' ? 'bg-zinc-900' : 'bg-zinc-200'}
                    `}
                  >
                    <span
                      className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform
                        ${draft.uniqueLang === 'true' ? 'translate-x-4' : 'translate-x-0'}
                      `}
                    />
                  </button>
                  Require a unique language tag per value
                </label>
              </ConstraintSection>
            </AccordionSection>

            {/* ── Property Pair ── */}
            <AccordionSection
              title="Property Pair"
              count={countFor('propertyPair')}
              issueLevel={sectionIssueLevel('propertyPair')}
              isOpen={openSection === 'propertyPair'}
              onToggle={() => toggleSection('propertyPair')}
            >
              {otherProps.length === 0 ? (
                <p className="text-xs text-zinc-400">
                  Add another property in Step 3 to compare this one against.
                </p>
              ) : (
                <div className="space-y-4">
                  <PropertyPairSelect
                    label="Same values as another property? (sh:equals)"
                    info="sh:equals requires this property to have exactly the same set of values as the chosen property."
                    value={draft.equals}
                    options={otherProps}
                    onChange={v => patchDraft({ equals: v })}
                  />
                  <PropertyPairSelect
                    label="No shared values with another property? (sh:disjoint)"
                    info="sh:disjoint requires this property and the chosen property to share no value in common."
                    value={draft.disjoint}
                    options={otherProps}
                    onChange={v => patchDraft({ disjoint: v })}
                  />
                  <PropertyPairSelect
                    label="Strictly less than another property? (sh:lessThan)"
                    info="sh:lessThan requires each value of this property to be strictly less than each value of the chosen property (e.g. startDate < endDate)."
                    value={draft.lessThan}
                    options={otherProps}
                    onChange={v => patchDraft({ lessThan: v })}
                  />
                  <PropertyPairSelect
                    label="Less than or equal to another property? (sh:lessThanOrEquals)"
                    info="sh:lessThanOrEquals requires each value of this property to be less than or equal to each value of the chosen property."
                    value={draft.lessThanOrEquals}
                    options={otherProps}
                    onChange={v => patchDraft({ lessThanOrEquals: v })}
                  />
                </div>
              )}
            </AccordionSection>

            {/* ── Logical ── */}
            <AccordionSection
              title="Logical"
              count={countFor('logical')}
              issueLevel={sectionIssueLevel('logical')}
              isOpen={openSection === 'logical'}
              onToggle={() => toggleSection('logical')}
            >
              <div className="space-y-3">
                <ConstraintSection
                  label="Combine conditions on the value"
                  info="Logical constraints let a value be checked against one or more nested conditions: all of them (sh:and), any of them (sh:or), exactly one (sh:xone), none (sh:not), or a minimum number of values matching a condition (sh:qualifiedValueShape)."
                >
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ['none', 'None'],
                      ['and', 'All of (AND)'],
                      ['or', 'Any of (OR)'],
                      ['xone', 'Exactly one (XONE)'],
                      ['not', 'Not'],
                      ['qualified', 'Qualified count'],
                    ] as [LogicalMode, string][]).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => setLogicalMode(mode)}
                        className={`text-[11px] px-3 py-1 rounded-full border transition-colors
                          ${logicalMode === mode ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                        `}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </ConstraintSection>

                {/* AND / OR / XONE — a list of condition groups */}
                {listKey && (
                  <div className="space-y-2">
                    {(draft[listKey] ?? []).map((group, i) => (
                      <SubShapeEditor
                        key={i}
                        title={`Condition ${i + 1}`}
                        value={group}
                        onChange={patch => updateGroup(i, patch)}
                        onRemove={() => removeGroup(i)}
                        pfx={pfx}
                      />
                    ))}
                    <button
                      onClick={addGroup}
                      className="w-full h-8 text-xs rounded-md border border-dashed border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
                    >
                      + Add condition
                    </button>
                  </div>
                )}

                {/* NOT — a single negated condition */}
                {logicalMode === 'not' && (
                  <SubShapeEditor
                    title="Value must NOT match"
                    value={draft.not ?? {}}
                    onChange={patch => updateSingle('not', patch)}
                    pfx={pfx}
                  />
                )}

                {/* Qualified value shape + counts */}
                {logicalMode === 'qualified' && (
                  <div className="space-y-2">
                    <SubShapeEditor
                      title="Values matching this condition"
                      value={draft.qualifiedValueShape ?? {}}
                      onChange={patch => updateSingle('qualifiedValueShape', patch)}
                      pfx={pfx}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <NumberInput
                        label="Qualified min count"
                        value={draft.qualifiedMinCount}
                        onChange={v => patchDraft({ qualifiedMinCount: v })}
                        info="sh:qualifiedMinCount — the fewest values that must match the condition above."
                      />
                      <NumberInput
                        label="Qualified max count"
                        value={draft.qualifiedMaxCount}
                        onChange={v => patchDraft({ qualifiedMaxCount: v })}
                        info="sh:qualifiedMaxCount — the most values that may match the condition above."
                      />
                    </div>
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* ── Shape-based ── */}
            <AccordionSection
              title="Shape-based"
              count={countFor('shapeBased')}
              issueLevel={sectionIssueLevel('shapeBased')}
              isOpen={openSection === 'shapeBased'}
              onToggle={() => toggleSection('shapeBased')}
            >
              <ConstraintSection
                label="Must the value conform to another shape? (sh:node)"
                info="sh:node requires that the value node also satisfies the referenced NodeShape. Use this to nest shapes — e.g. every worksFor value must match UniversityShape."
              >
                {state.completedShapes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {state.completedShapes.map(cs => (
                      <button
                        key={cs.shapeName}
                        onClick={() => patchDraft({ node: draft.node === cs.shapeName ? undefined : cs.shapeName })}
                        className={`text-[11px] px-3 py-1 rounded-full border transition-colors mono
                          ${draft.node === cs.shapeName
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
                        `}
                      >
                        {pfx}:{cs.shapeName}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={draft.node ?? ''}
                  onChange={e => patchDraft({ node: e.target.value || undefined })}
                  placeholder={
                    state.completedShapes.length > 0
                      ? 'or type a shape CURIE, e.g. ex:AddressShape'
                      : `e.g. ${pfx}:AddressShape`
                  }
                  className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
                />
              </ConstraintSection>
            </AccordionSection>

            {/* ── Other ── */}
            <AccordionSection
              title="Other"
              count={countFor('other')}
              issueLevel={sectionIssueLevel('other')}
              isOpen={openSection === 'other'}
              onToggle={() => toggleSection('other')}
            >
              <ConstraintSection
                label="Must the value be one of a fixed list? (sh:in)"
                info="sh:in means the value must match one item from the allowed list, such as active, inactive, or pending."
              >
                <input
                  type="text"
                  value={draft.in ?? ''}
                  onChange={e => patchDraft({ in: e.target.value || undefined })}
                  placeholder="Comma-separated: active, inactive, pending"
                  className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
                />
              </ConstraintSection>

              {/* sh:hasValue */}
              <ConstraintSection
                label="Must the value include a specific value? (sh:hasValue)"
                info="sh:hasValue requires the property to have this exact value among its values (in addition to anything else). Useful for a mandatory flag, e.g. status must include 'active'."
              >
                <input
                  type="text"
                  value={draft.hasValue ?? ''}
                  onChange={e => patchDraft({ hasValue: e.target.value || undefined })}
                  placeholder="e.g. active"
                  className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
                />
              </ConstraintSection>
            </AccordionSection>

          </div>

          {/* sh:message — a validation-report annotation, NOT one of the 28
              SHACL Core constraints. Kept outside the constraint accordion. */}
          <div className="rounded-xl border border-zinc-200 p-3 space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              Custom validation message (optional)
              <InfoTip align="left" placement="top" className="lowercase">
                A plain-language message shown in the validation report when this
                property's rules are violated (sh:message). It is a helpful
                annotation, not a validating constraint.
              </InfoTip>
            </label>
            <input
              type="text"
              value={draft.message ?? ''}
              onChange={e => patchDraft({ message: e.target.value || undefined })}
              placeholder="e.g. Every person must have a valid email address."
              className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Cross-field warnings (Phase 0.5) — informational, never blocking */}
          {issues.length > 0 && (
            <div className="space-y-1.5">
              {issues.map((issue, idx) => (
                <div
                  key={`${issue.id}-${idx}`}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border
                    ${issue.level === 'contradiction'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-amber-50 border-amber-200 text-amber-700'}
                  `}
                >
                  <span className="mt-px shrink-0" aria-hidden="true">
                    {issue.level === 'contradiction' ? '⚠' : 'ⓘ'}
                  </span>
                  <span className="flex-1 leading-snug">
                    <span className="font-semibold">
                      {issue.level === 'contradiction' ? 'Contradiction: ' : 'Redundant: '}
                    </span>
                    {issue.message}
                  </span>
                  <InfoTip align="right" placement="top" className="lowercase shrink-0">
                    {issue.why}
                  </InfoTip>
                </div>
              ))}
            </div>
          )}

          {/* Active constraint badges — scalar constraints only. The sh:message
              annotation and the nested logical sub-shapes render in their own
              sections, not as badges. */}
          {Object.entries(draft).some(([k, v]) => k !== 'message' && typeof v === 'string' && v) && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(draft).filter(([k, v]) => k !== 'message' && typeof v === 'string').map(([k, v]) =>
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
            <span className="mono ml-1 opacity-70">{activeProperty.path.includes(':') ? activeProperty.path : `${pfx}:${activeProperty.path}`}</span>
          </button>
        </div>
      ) : (
        <div className="text-center py-8 text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-xl">
          Select a property above to define its constraints.
        </div>
      )}

      {/* ── Shape-level rule: sh:closed applies to the whole NodeShape, so it
             lives outside the per-property accordion above. ── */}
      <div className="rounded-xl border border-zinc-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
              Close this shape
              <InfoTip align="left" placement="top">
                sh:closed true means a node may only use the property paths declared
                in this shape — any other property makes it invalid. This applies to
                the whole shape, not one property.
              </InfoTip>
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Only allow the {state.properties.length} propert{state.properties.length === 1 ? 'y' : 'ies'} declared in this shape.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.closed}
            onClick={() => update({ closed: !state.closed })}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors
              ${state.closed ? 'bg-zinc-900' : 'bg-zinc-200'}
            `}
          >
            <span
              className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform
                ${state.closed ? 'translate-x-4' : 'translate-x-0'}
              `}
            />
          </button>
        </div>
        {state.closed && (
          <div className="space-y-1.5 fade-up">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              Also allow these extra properties (optional)
              <InfoTip align="left" placement="top" className="lowercase">
                sh:ignoredProperties lists predicates still permitted even when the
                shape is closed — commonly rdf:type.
              </InfoTip>
            </label>
            <input
              type="text"
              value={state.ignoredProperties}
              onChange={e => update({ ignoredProperties: e.target.value })}
              placeholder="Comma-separated: rdf:type, ex:note"
              className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Small reusable sub-components ───────────────────────────────────────────

function AccordionSection({
  title,
  count,
  issueLevel,
  isOpen,
  onToggle,
  children,
}: {
  title:      string
  count:      number
  issueLevel: IssueLevel | null
  isOpen:     boolean
  onToggle:   () => void
  children:   React.ReactNode
}) {
  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors
          ${isOpen ? 'bg-zinc-50' : 'bg-white hover:bg-zinc-50'}
        `}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800">
          {title}
          {issueLevel && (
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full
                ${issueLevel === 'contradiction' ? 'bg-red-500' : 'bg-amber-500'}
              `}
              title={issueLevel === 'contradiction'
                ? 'This section has a contradictory combination'
                : 'This section has a redundant combination'}
              aria-label={issueLevel === 'contradiction'
                ? 'contradiction in this section'
                : 'redundant combination in this section'}
            />
          )}
        </span>
        <span className="flex items-center gap-2">
          {count > 0 && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5 leading-none">
              {count}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-3 space-y-5 border-t border-zinc-100 fade-up">
          {children}
        </div>
      )}
    </div>
  )
}

function ConstraintSection({
  label,
  info,
  children,
}: {
  label: string
  info?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        {label}
        {info && (
          <InfoTip align="left" placement="top" className="lowercase">
            {info}
          </InfoTip>
        )}
      </p>
      {children}
    </div>
  )
}

// Compact editor for a one-level nested sub-shape used inside a logical /
// qualified constraint. Offers the most common value-level controls.
function SubShapeEditor({ title, value, onChange, onRemove, pfx }: {
  title:    string
  value:    SubShape
  onChange: (patch: Partial<SubShape>) => void
  onRemove?: () => void
  pfx:      string
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{title}</span>
        {onRemove && (
          <button onClick={onRemove} className="text-zinc-400 hover:text-red-600 text-xs" title="Remove condition">
            ✕
          </button>
        )}
      </div>

      {/* datatype */}
      <div className="flex flex-wrap gap-1">
        {DATATYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange({ datatype: value.datatype === opt.value ? undefined : opt.value })}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors
              ${value.datatype === opt.value ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* nodeKind */}
      <div className="flex flex-wrap gap-1">
        {NODEKIND_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange({ nodeKind: value.nodeKind === opt.value ? undefined : opt.value })}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors
              ${value.nodeKind === opt.value ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={value.class ?? ''}
          onChange={e => onChange({ class: e.target.value || undefined })}
          placeholder={`class, e.g. ${pfx}:Person`}
          className="h-7 px-2 rounded-md border border-zinc-200 text-xs mono focus:outline-none focus:border-zinc-400"
        />
        <input
          type="text"
          value={value.pattern ?? ''}
          onChange={e => onChange({ pattern: e.target.value || undefined })}
          placeholder="pattern (regex)"
          className="h-7 px-2 rounded-md border border-zinc-200 text-xs mono focus:outline-none focus:border-zinc-400"
        />
        <input
          type="number"
          value={value.minInclusive ?? ''}
          onChange={e => onChange({ minInclusive: e.target.value || undefined })}
          placeholder="min value >="
          className="h-7 px-2 rounded-md border border-zinc-200 text-xs mono focus:outline-none focus:border-zinc-400"
        />
        <input
          type="number"
          value={value.maxInclusive ?? ''}
          onChange={e => onChange({ maxInclusive: e.target.value || undefined })}
          placeholder="max value <="
          className="h-7 px-2 rounded-md border border-zinc-200 text-xs mono focus:outline-none focus:border-zinc-400"
        />
        <input
          type="text"
          value={value.in ?? ''}
          onChange={e => onChange({ in: e.target.value || undefined })}
          placeholder="in: a, b, c"
          className="h-7 px-2 rounded-md border border-zinc-200 text-xs mono focus:outline-none focus:border-zinc-400"
        />
        <input
          type="text"
          value={value.hasValue ?? ''}
          onChange={e => onChange({ hasValue: e.target.value || undefined })}
          placeholder="hasValue"
          className="h-7 px-2 rounded-md border border-zinc-200 text-xs mono focus:outline-none focus:border-zinc-400"
        />
      </div>
    </div>
  )
}

function PropertyPairSelect({ label, info, value, options, onChange }: {
  label:    string
  info?:    string
  value:    string | undefined
  options:  string[]
  onChange: (v: string | undefined) => void
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
        {label}
        {info && (
          <InfoTip align="left" placement="top" className="lowercase">
            {info}
          </InfoTip>
        )}
      </label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || undefined)}
        className="w-full h-8 px-2 rounded-md border border-zinc-200 text-sm mono bg-white focus:outline-none focus:border-zinc-400"
      >
        <option value="">— none —</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

function NumberInput({ label, value, onChange, info }: {
  label:    string
  value:    string | undefined
  onChange: (v: string | undefined) => void
  info?:    string
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-zinc-400 flex items-center gap-1.5">
        {label}
        {info && (
          <InfoTip align="left" placement="top" className="lowercase">
            {info}
          </InfoTip>
        )}
      </label>
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || undefined)}
        className="w-full h-8 px-3 rounded-md border border-zinc-200 text-sm mono focus:outline-none focus:border-zinc-400"
      />
    </div>
  )
}
