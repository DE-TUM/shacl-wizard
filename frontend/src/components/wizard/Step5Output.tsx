import { useEffect, useRef, useState } from 'react'
import { CodeBlock } from './CodeBlock'
import { generateShapes, validateGraph } from '@/api/backend'
import { buildTurtle, buildJsonLd, buildRdfXml, buildTrig } from '@/utils/outputBuilder'
import type { WizardState } from '@/types'
import type { ValidationResult } from '@/api/backend'

interface Props {
  state:   WizardState
  update:  (patch: Partial<WizardState>) => void
  onReset: () => void  // kept for API compatibility
}

const TABS = [
  { id: 'turtle', label: 'Turtle',  ext: 'ttl'   },
  { id: 'jsonld', label: 'JSON-LD', ext: 'jsonld' },
  { id: 'rdfxml', label: 'RDF/XML', ext: 'rdf'   },
  { id: 'trig',   label: 'TriG',    ext: 'trig'  },
] as const

// ─── Validation result types ──────────────────────────────────────────────────

type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid' | 'error'
type GenerationStatus = 'generating' | 'ready' | 'fallback'

// ─── Component ────────────────────────────────────────────────────────────────

export function Step5Output({ state, update }: Props) {
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('generating')
  const [generatedFormats, setGeneratedFormats] = useState<Record<WizardState['outputTab'], string> | null>(null)
  const [generationError, setGenerationError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fallbackBuilds: Record<WizardState['outputTab'], string> = {
    turtle: buildTurtle(state),
    jsonld: buildJsonLd(state),
    rdfxml: buildRdfXml(state),
    trig:   buildTrig(state),
  }

  const activeTab = TABS.find(t => t.id === state.outputTab) ?? TABS[0]
  const builds = generatedFormats ?? fallbackBuilds
  const code = builds[activeTab.id]

  useEffect(() => {
    let alive = true

    setGenerationStatus('generating')
    setGenerationError('')

    generateShapes(state)
      .then(result => {
        if (!alive) return
        setGeneratedFormats(result.formats)
        setGenerationStatus('ready')
      })
      .catch(error => {
        if (!alive) return
        setGeneratedFormats(null)
        setGenerationStatus('fallback')
        setGenerationError(error instanceof Error ? error.message : 'Backend generation failed.')
      })

    return () => {
      alive = false
    }
  }, [state])

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
        <h2 className="text-lg font-semibold text-zinc-900">Your shapes graph is ready.</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Copy or download the output, then validate your data graph below.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Shape',      value: state.shapeName || '—' },
          { label: 'Target',     value: state.targetValue ? `ex:${state.targetValue}` : '—' },
          { label: 'Properties', value: String(state.properties.length) },
        ].map(item => (
          <div key={item.label} className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">{item.label}</div>
            <div className="mono text-sm font-medium text-zinc-900 truncate">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Format tabs */}
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

      <CodeBlock code={code} lang={activeTab.label} />

      {generationStatus === 'generating' && (
        <p className="text-xs text-zinc-400">Generating output with the backend...</p>
      )}
      {generationStatus === 'ready' && (
        <p className="text-xs text-emerald-600">Backend output is active.</p>
      )}
      {generationStatus === 'fallback' && (
        <p className="text-xs text-amber-600">
          Backend output unavailable. Showing local preview{generationError ? `: ${generationError}` : '.'}
        </p>
      )}

      {/* Download button */}
      <button
        onClick={handleDownload}
        className="w-full h-9 rounded-md border border-zinc-200 text-zinc-700 text-sm hover:bg-zinc-50 transition-colors"
      >
        Download .{activeTab.ext}
      </button>

      {/* ── Validation section ─────────────────────────────────────────────── */}
      <div className="border-t border-zinc-100 pt-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-zinc-800">Validate your data graph</p>
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
          /* Loading state */
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
          /* All valid */
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
          /* Violations */
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
              {validationResult!.violations.map((v, i) => (
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
