import { useState, useEffect } from 'react'
import type { WizardState, PropertyShape } from '@/types'
import { suggestProperties } from '@/api/backend'

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

interface Props {
  state:  WizardState
  update: (patch: Partial<WizardState>) => void
}

export function Step3Properties({ state, update }: Props) {
  const [input, setInput] = useState('')
  const [pillSuggestions, setPillSuggestions] = useState<string[]>([])
  const [loadingPills, setLoadingPills] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    if (state.nlParsed) return
    setLoadingPills(true)
    suggestProperties(state.shapeName, state.targetValue, state.targetType || 'class')
      .then(result => setPillSuggestions(result.properties.map(p => p.path)))
      .catch(() => {})
      .finally(() => setLoadingPills(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pills that haven't been added yet — reappear automatically when a property is removed
  const availablePills = pillSuggestions.filter(
    s => !state.properties.find(p => p.path === s)
  )

  const showOverlay = input === '' && !state.nlParsed && (loadingPills || availablePills.length > 0)

  const uploadSuggestions = state.suggestedProperties.filter(
    p => !state.properties.find(prop => prop.path === p)
  )

  const addProperty = (path?: string) => {
    const p = (path ?? input).trim()
    if (!p || p.toLowerCase() === state.targetValue.toLowerCase()) return
    const prop: PropertyShape = { id: uid(), path: p, constraints: {} }
    update({ properties: [...state.properties, prop] })
    setInput('')
  }

  const removeProperty = (id: string) => {
    update({ properties: state.properties.filter(p => p.id !== id) })
  }

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
        <h2 className="text-lg font-semibold text-zinc-900">
          Which properties do you want to constrain?
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Add the predicates you want to validate on{' '}
          <span className="mono text-zinc-700">ex:{state.targetValue}</span> nodes.
        </p>
      </div>

      {/* Input with floating pill overlay */}
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

          {/* Pill overlay — only shown when input is empty */}
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

      {/* Upload-mode suggestions */}
      {state.mode === 'upload' && uploadSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">
            Detected in your file:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {uploadSuggestions.map(s => (
              <button
                key={s}
                onClick={() => addProperty(s)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-dashed border-zinc-300
                  text-zinc-600 hover:border-zinc-500 hover:bg-zinc-50 transition-colors mono"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Property list */}
      {state.properties.length > 0 ? (
        <div className="space-y-2">
          {state.properties.map(prop => (
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
                    <span className="mono text-sm font-medium text-zinc-800">
                      ex:{prop.path}
                    </span>
                  )}
                  {Object.keys(prop.constraints).length > 0 && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">
                      {Object.keys(prop.constraints).length} rules
                    </span>
                  )}
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
        </div>
      ) : (
        <div className="text-center py-10 text-zinc-400 text-sm border border-dashed border-zinc-200 rounded-xl">
          No properties yet. Add at least one above.
        </div>
      )}
    </div>
  )
}
