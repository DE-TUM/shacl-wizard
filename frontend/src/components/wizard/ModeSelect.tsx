import type { WizardState } from '@/types'
import { InfoTip } from './InfoTip'

interface Props {
  update: (patch: Partial<WizardState>) => void
}

export function ModeSelect({ update }: Props) {
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center shrink-0">
          <span className="text-white text-lg font-black tracking-tight">SH</span>
        </div>
        <div>
          <div className="text-xs text-zinc-400 font-medium tracking-[0.12em] uppercase leading-none mb-1">
            SHACL Wizard
          </div>
          <div className="text-2xl font-bold text-zinc-900 tracking-tight leading-none">
            Shape Builder
          </div>
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        Generate valid SHACL shapes graphs without writing a single line of Turtle.
        <InfoTip align="left" className="ml-1.5">
          SHACL is a standard way to describe rules for RDF data, such as required
          properties, allowed value types, and valid ranges.
        </InfoTip>
      </p>

      {/* Mode cards */}
      <div className="space-y-3">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          How do you want to start?
        </p>

        <button
          onClick={() => update({ mode: 'manual' })}
          className="w-full text-left p-4 rounded-xl border-2 border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div>
              <div className="font-semibold text-zinc-900 text-sm flex items-center gap-1.5">
                Manual mode
                <InfoTip align="right" focusable={false}>
                  Use this when you already know the class, properties, and rules you
                  want to describe.
                </InfoTip>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Start from scratch — the wizard asks everything step by step.
              </div>
            </div>
            <span className="ml-auto text-zinc-300 group-hover:text-zinc-600 transition-colors text-lg">→</span>
          </div>
        </button>

        <button
          onClick={() => update({ mode: 'upload' })}
          className="w-full text-left p-4 rounded-xl border-2 border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div>
              <div className="font-semibold text-zinc-900 text-sm flex items-center gap-1.5">
                Upload-assisted mode
                <InfoTip align="right" focusable={false}>
                  The app scans an RDF data file to suggest classes, properties, and a
                  few likely constraints. You still review everything before output.
                </InfoTip>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Upload an RDF file — classes and properties are pre-filled for you.
              </div>
            </div>
            <span className="ml-auto text-zinc-300 group-hover:text-zinc-600 transition-colors text-lg">→</span>
          </div>
        </button>
      </div>
    </div>
  )
}
