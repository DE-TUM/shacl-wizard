import { useState } from 'react'
import { parseNaturalLanguage } from '@/api/backend'
import type { WizardState } from '@/types'

interface Props {
  state:  WizardState
  update: (patch: Partial<WizardState>) => void
}

export function Step2Shape({ state, update }: Props) {
  const [parsing, setParsing] = useState(false)

  const handleParse = async () => {
    if (!state.nlDescription.trim()) return
    setParsing(true)
    try {
      const result = await parseNaturalLanguage(state)
      update({ properties: result.properties, nlParsed: true })
    } catch (err) {
      console.error('NL parse failed:', err)
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Give your shape a name.</h2>
        <p className="text-sm text-zinc-500 mt-1">
          This becomes the identifier for the NodeShape in the output file.
        </p>
      </div>

      {/* Shape name input */}
      <div className="space-y-1.5">
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
        {state.shapeName && (
          <p className="text-[11px] text-zinc-400 mono">
            → ex:{state.shapeName} a sh:NodeShape .
          </p>
        )}
        <p className="text-[11px] text-zinc-400">
          Convention: if your target is{' '}
          <span className="mono">ex:{state.targetValue || 'Car'}</span>, name the shape{' '}
          <span className="mono">ex:{state.targetValue || 'Car'}Shape</span>.{' '}
          Keeping them distinct avoids naming conflicts.
        </p>
      </div>

      {/* AI-assisted toggle panel */}
      <div className="border border-dashed border-zinc-200 rounded-xl p-4 bg-zinc-50/60 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-zinc-800">AI-assisted input</span>
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
            <textarea
              value={state.nlDescription}
              onChange={e => update({ nlDescription: e.target.value, nlParsed: false })}
              placeholder="Describe what your data must look like. e.g. A Person must have exactly one name, at least one email address, and an optional age between 0 and 150."
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-zinc-200 resize-none
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
