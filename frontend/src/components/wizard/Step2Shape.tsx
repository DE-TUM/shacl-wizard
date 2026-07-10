import { useState } from 'react'
import { parseNaturalLanguage } from '@/api/backend'
import type { WizardState, PropertyShape, PropertyConstraints, CompletedShape } from '@/types'
import { InfoTip } from './InfoTip'

interface Props {
  state:           WizardState
  update:          (patch: Partial<WizardState>) => void
  completedShapes: CompletedShape[]
}

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

function mergeConstraints(
  ai: PropertyConstraints,
  up: Partial<PropertyConstraints>,
): PropertyConstraints {
  const result: PropertyConstraints = { ...ai }

  // nodeKind: upload wins (upload observed real IRI values in the file)
  if (up.nodeKind) {
    result.nodeKind = up.nodeKind
    if (up.nodeKind === 'sh:IRI') delete result.datatype
  }

  // datatype: upload wins only when it found a concrete XSD type and AI didn't set one
  if (up.datatype && !ai.datatype) {
    result.datatype = up.datatype
  }

  // Everything else follows AI-wins rules (in, range bounds, minCount, maxCount, pattern):
  // They are already in `result` from the `{ ...ai }` spread.
  // No upload fields override them.

  return result
}

// Match on the local name (part after the last colon) so the AI's bare
// "jobTitle" lines up with the upload's CURIE "schema:jobTitle".
function localName(path: string): string {
  const i = path.lastIndexOf(':')
  return (i >= 0 ? path.slice(i + 1) : path).toLowerCase()
}

function mergeWithUpload(
  aiProps: PropertyShape[],
  upload: Record<string, Partial<PropertyConstraints>>,
): PropertyShape[] {
  // Index upload entries by local name → [full CURIE path, constraints]
  const uploadIndex = new Map<string, [string, Partial<PropertyConstraints>]>()
  for (const [path, constraints] of Object.entries(upload)) {
    uploadIndex.set(localName(path), [path, constraints])
  }

  // Start with AI properties, merging upload data where local names overlap.
  const merged: PropertyShape[] = []
  const usedUploadKeys = new Set<string>()
  for (const aiProp of aiProps) {
    const key = localName(aiProp.path)
    const upEntry = uploadIndex.get(key)
    if (upEntry) {
      usedUploadKeys.add(key)
      merged.push({
        ...aiProp,
        path: upEntry[0], // prefer the file's full CURIE path over the AI's bare name
        constraints: mergeConstraints(aiProp.constraints, upEntry[1]),
      })
    } else {
      merged.push(aiProp)
    }
  }

  // Append upload-only properties that AI didn't mention
  for (const [path, constraints] of Object.entries(upload)) {
    if (!usedUploadKeys.has(localName(path))) {
      merged.push({ id: uid(), path, constraints: constraints as PropertyConstraints })
    }
  }

  return merged
}

export function Step2Shape({ state, update, completedShapes }: Props) {
  const isDuplicateName = state.shapeName.trim().length > 0 &&
    completedShapes.some(s => s.shapeName === state.shapeName.trim())
  const [parsing, setParsing] = useState(false)

  const handleParse = async () => {
    if (!state.nlDescription.trim()) return
    setParsing(true)
    try {
      const result = await parseNaturalLanguage(state)
      const properties =
        Object.keys(state.suggestedConstraints).length > 0
          ? mergeWithUpload(result.properties, state.suggestedConstraints)
          : result.properties
      update({ properties, nlParsed: true })
    } catch (err) {
      console.error('NL parse failed:', err)
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          Give your shape a name.
          <InfoTip align="left">
            A NodeShape is a named bundle of validation rules. The name lets you
            reference and reuse that bundle in your shapes graph.
          </InfoTip>
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          This becomes the identifier for the NodeShape in the output file.
        </p>
      </div>

      {/* Shape name input */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
          Shape name
          <InfoTip align="left" className="lowercase">
            This is not the class itself. It is the rule set that checks nodes from
            the class or target you chose.
          </InfoTip>
        </label>
        
        <div className="relative">
          <input
            autoFocus
            type="text"
            value={state.shapeName}
            onChange={e => update({ shapeName: e.target.value.replace(/\s/g, '') })}
            className="w-full h-11 px-3 rounded-md border border-zinc-200 text-sm mono
              focus:outline-none focus:border-zinc-400"
          />
          {!state.shapeName && (
            <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
              <span className="text-sm mono text-zinc-400">
                e.g.{' '}
                <button
                  className="pointer-events-auto px-2.5 py-0.5 rounded-full border border-zinc-300 bg-white text-zinc-500 hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
                  onClick={() => update({ shapeName: state.targetValue ? `${state.targetValue}Shape` : 'PersonShape' })}
                >
                  {state.targetValue ? `${state.targetValue}Shape` : 'PersonShape'}
                </button>
              </span>
            </div>
          )}
        </div>
        {state.shapeName && !isDuplicateName && (
          <p className="text-[11px] text-zinc-400 mono">
            → ex:{state.shapeName} a sh:NodeShape .
          </p>
        )}
        {isDuplicateName && (
          <p className="text-[11px] text-red-500 mono">
            ex:{state.shapeName} is already defined in this graph
          </p>
        )}
        <p className="text-[11px] text-zinc-400">
          Convention: if your target is{' '}
          <span className="mono">ex:{state.targetValue || 'Car'}</span>, name the shape{' '}
          <span className="mono">ex:{state.targetValue || 'Car'}Shape</span>.{' '}
          Keeping them distinct avoids naming conflicts.
        </p>
      </div>

      {/* Node-shape-level sh:message — an annotation shown in the validation
          report, NOT one of the 28 SHACL Core constraints. */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
          Custom validation message (optional)
          <InfoTip align="left" className="lowercase">
            A plain-language message shown in the validation report when a node
            fails this shape (sh:message). It is a helpful annotation, not a
            validating constraint.
          </InfoTip>
        </label>
        <input
          type="text"
          value={state.shapeMessage}
          onChange={e => update({ shapeMessage: e.target.value })}
          placeholder="e.g. This must be a valid Person record."
          className="w-full h-10 px-3 rounded-md border border-zinc-200 text-sm
            focus:outline-none focus:border-zinc-400"
        />
      </div>

      {/* AI-assisted toggle panel */}
      <div className="border border-dashed border-zinc-200 rounded-xl p-4 bg-zinc-50/60 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
              AI-assisted input
              <InfoTip align="left">
                Describe the intended rules in ordinary language. The result is a
                draft list of SHACL properties and constraints for you to review.
              </InfoTip>
            </span>
            <p className="text-xs text-zinc-500 mt-0.5">
              Describe your data in plain English — AI will suggest properties and constraints.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={state.useNL}
            onClick={() => update({ useNL: !state.useNL })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors focus:outline-none
              ${state.useNL ? 'bg-zinc-900' : 'bg-zinc-200'}
            `}
          >
            <span
              className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform
                ${state.useNL ? 'translate-x-4' : 'translate-x-0'}
              `}
            />
          </button>
        </div>

        {state.useNL && (
          <div className="space-y-2 fade-up">
            <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
              Plain-English constraints
              <InfoTip align="left" className="lowercase">
                Mention required fields, optional fields, value types, ranges,
                formats, and fixed lists. You can edit every suggestion later.
              </InfoTip>
            </p>
            <textarea
              value={state.nlDescription}
              onChange={e => update({ nlDescription: e.target.value, nlParsed: false })}
              placeholder="Describe what your data must look like. e.g. A Person must have exactly one name, at least one email address, and an optional age between 0 and 150."
              className="w-full min-h-[100px] max-h-[400px] px-3 py-2 text-sm rounded-md border border-zinc-200 resize-y
                focus:outline-none focus:border-zinc-400 bg-white"
            />
            <button
              onClick={handleParse}
              disabled={!state.nlDescription.trim() || parsing}
              className="w-full h-9 text-sm border border-zinc-300 text-zinc-700 rounded-md
                hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              {parsing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-zinc-500 pulse-dot inline-block"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </span>
                  Analysing...
                </span>
              ) : 'Parse with AI'}
            </button>
            {state.nlParsed && (
              <p className="text-xs text-emerald-600">
                Found {state.properties.length} propert{state.properties.length === 1 ? 'y' : 'ies'}.
                Review them in the next step.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
