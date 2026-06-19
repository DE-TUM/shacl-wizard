import { useEffect, useRef, useState } from 'react'
import { CodeBlock } from './CodeBlock'
import { generateShapes, validateGraph } from '@/api/backend'
import { buildTurtle, buildJsonLd, buildRdfXml, buildTrig } from '@/utils/outputBuilder'
import type { WizardState, CompletedShape } from '@/types'
import type { ValidationResult } from '@/api/backend'
import { InfoTip } from './InfoTip'

interface Props {
  state:               WizardState
  update:              (patch: Partial<WizardState>) => void
  onReset:             () => void
  completedShapes:     CompletedShape[]
  onAddAnotherShape:   () => void
}

const TABS = [
  { id: 'turtle', label: 'Turtle',  ext: 'ttl'   },
  { id: 'jsonld', label: 'JSON-LD', ext: 'jsonld' },
  { id: 'rdfxml', label: 'RDF/XML', ext: 'rdf'   },
  { id: 'trig',   label: 'TriG',    ext: 'trig'  },
] as const

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid' | 'error'

export function Step5Output({ state, update, completedShapes }: Props) {
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)

  // Generation state
  const [generating, setGenerating]           = useState(true)
  const [generateError, setGenerateError]     = useState(false)
  const [generatedFormats, setGeneratedFormats] = useState<Record<string, string> | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  const fallbackBuilds: Record<WizardState['outputTab'], string> = {
    turtle: buildTurtle(state, completedShapes),
    jsonld: buildJsonLd(state, completedShapes),
    rdfxml: buildRdfXml(state, completedShapes),
    trig:   buildTrig(state, completedShapes),
  }

  const activeTab = TABS.find(t => t.id === state.outputTab) ?? TABS[0]
  const builds    = generatedFormats ?? fallbackBuilds
  const code      = builds[activeTab.id]

  // Only re-generate when actual shape data changes, not on UI-only changes like tab switches.
  useEffect(() => {
    let alive = true
    setGenerating(true)
    setGenerateError(false)

    generateShapes(state)
      .then((result: { formats: Record<string, string> }) => {
        if (!alive) return
        setGeneratedFormats(result.formats)
        setGenerating(false)
      })
      .catch(() => {
        if (!alive) return
        setGeneratedFormats(null)
        setGenerateError(true)
        setGenerating(false)
      })

    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.shapeName, state.targetType, state.targetValue, state.properties, state.completedShapes])

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${state.shapeName || 'shapes'}.${activeTab.ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleValidate = async (file: File) => {
    setValidationStatus('validating')
    setValidationResult(null)
    try {
      const result = await validateGraph(file, builds.turtle)
      setValidationResult(result)
      setValidationStatus(result.status)
    } catch {
      setValidationStatus('error')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          Your shapes graph is ready.
          <InfoTip align="left">
            A shapes graph is the RDF file containing your SHACL rules. Validators
            use it to check a separate RDF data graph.
          </InfoTip>
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Copy or download the output, then validate your data graph below.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          {
            label: 'Shape',
            value: state.shapeName || '—',
            info: 'The named NodeShape that groups these validation rules.',
          },
          {
            label: 'Target',
            value: state.targetValue ? `ex:${state.targetValue}` : '—',
            info: 'The nodes in the data graph that this shape will validate.',
          },
          {
            label: 'Properties',
            value: String(state.properties.length),
            info: 'The predicates that have property-level constraints.',
          },
        ].map(item => (
          <div key={item.label} className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1 flex items-center gap-1.5">
              {item.label}
              <InfoTip align="left" placement="bottom">
                {item.info}
              </InfoTip>
            </div>
            <div className="mono text-sm font-medium text-zinc-900 truncate">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Completed shapes summary */}
      {completedShapes.length > 0 && (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 space-y-1">
          {completedShapes.map(s => {
            const targetPred =
              s.targetType === 'class'      ? 'sh:targetClass' :
              s.targetType === 'node'       ? 'sh:targetNode' :
              s.targetType === 'subjectsOf' ? 'sh:targetSubjectsOf' :
                                              'sh:targetObjectsOf'
            return (
              <p key={s.shapeName} className="text-[11px] text-zinc-500 mono">
                ex:{s.shapeName} → {targetPred} ex:{s.targetValue} · {s.properties.length} propert{s.properties.length === 1 ? 'y' : 'ies'}
              </p>
            )
          })}
        </div>
      )}

      {/* Format tabs */}
      <div className="space-y-1.5">
        <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
          Output format
          <InfoTip align="left">
            These tabs show the same SHACL rules serialized in different RDF
            syntaxes. Turtle is the most common format for reading by hand.
          </InfoTip>
        </p>
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-lg">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => update({ outputTab: tab.id })}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors
                ${state.outputTab === tab.id
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'}
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Code area — loading dots while backend is generating */}
      {generating ? (
        <div className="bg-zinc-950 rounded-xl flex justify-center items-center min-h-[140px]">
          <span className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-zinc-600 pulse-dot inline-block"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </span>
        </div>
      ) : (
        <CodeBlock code={code} lang={activeTab.label} />
      )}

      {!generating && generateError && (
        <p className="text-xs text-zinc-400">
          Backend unavailable — showing client-side preview
        </p>
      )}

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={generating}
        className="w-full h-9 rounded-md border border-zinc-200 text-zinc-700 text-sm hover:bg-zinc-50 disabled:opacity-40 transition-colors"
      >
        Download .{activeTab.ext}
      </button>

      {/* ── Validation section ─────────────────────────────────────────────── */}
      <div className="border-t border-zinc-100 pt-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5">
            Validate your data graph
            <InfoTip align="left" placement="top">
              Validation runs your RDF data through PySHACL using the shapes graph
              above and reports any nodes that break the rules.
            </InfoTip>
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Drop your RDF data file here to check it against this shapes graph with PySHACL.
          </p>
        </div>

        {/* Drop zone */}
        {validationStatus === 'idle' || validationStatus === 'error' ? (
          <div
            className="border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center cursor-pointer
              hover:border-zinc-400 hover:bg-zinc-50 transition-all"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) handleValidate(f)
            }}
          >
            <p className="text-sm text-zinc-500">Drop your data graph here</p>
            <p className="text-xs text-zinc-400 mt-1 mono">.ttl · .jsonld · .rdf · .n3</p>
            {validationStatus === 'error' && (
              <p className="text-xs text-red-500 mt-2">Something went wrong. Try again.</p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".ttl,.jsonld,.rdf,.n3"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleValidate(f) }}
            />
          </div>
        ) : validationStatus === 'validating' ? (
          <div className="border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center">
            <div className="flex justify-center gap-1.5 mb-3">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-zinc-400 pulse-dot inline-block"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
            <p className="text-sm text-zinc-500">Running PySHACL validation...</p>
            <p className="text-xs text-zinc-400 mono mt-1">{validationResult?.dataFile ?? ''}</p>
          </div>
        ) : validationResult?.status === 'valid' ? (
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 text-lg">✓</span>
              <p className="text-sm font-semibold text-emerald-800">Validation passed</p>
            </div>
            <p className="text-xs text-emerald-600">
              All nodes in <span className="mono">{validationResult.dataFile}</span> conform to{' '}
              <span className="mono">ex:{state.shapeName}</span>.
            </p>
            <button
              onClick={() => { setValidationStatus('idle'); setValidationResult(null) }}
              className="text-xs text-emerald-600 underline underline-offset-2 mt-1"
            >
              Test another file
            </button>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-red-500 text-lg">✕</span>
                <p className="text-sm font-semibold text-red-800">
                  {validationResult!.violations.length} violation{validationResult!.violations.length !== 1 ? 's' : ''} found
                </p>
              </div>
              <button
                onClick={() => { setValidationStatus('idle'); setValidationResult(null) }}
                className="text-xs text-red-400 underline underline-offset-2"
              >
                Try again
              </button>
            </div>

            <div className="space-y-2">
              {validationResult!.violations.map((v: ValidationResult['violations'][number], i: number) => (
                <div key={i} className="bg-white rounded-lg p-3 border border-red-100 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[11px] text-red-600 font-medium">{v.focusNode}</span>
                    <span className="text-zinc-300">·</span>
                    <span className="mono text-[11px] text-zinc-500">{v.property}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{v.message}</p>
                  {(v.severity || v.value) && (
                    <p className="text-[10px] text-zinc-400 mono mt-1">
                      {v.severity ? v.severity.replace('sh:', '') : ''}
                      {v.severity && v.value ? ' · ' : ''}
                      {v.value ?? ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
