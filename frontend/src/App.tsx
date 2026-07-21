/**
 * App.tsx - root of the SHACL Wizard.
 *
 * Owns the top-level wizard state and decides which screen/step to render.
 * All state mutations flow downward via a single `update()` helper.
 *
 * Screen routing (simple - no React Router needed):
 *   state.mode === ''       → ModeSelect (landing)
 *   state.mode === 'upload' && !uploadStepDone → UploadScreen
 *   otherwise               → Wizard card (steps 0–4)
 */

import { useState } from 'react'
import { INITIAL_STATE } from '@/types'
import type { WizardState, CompletedShape, PropertyShape } from '@/types'

import { ModeSelect }       from '@/components/wizard/ModeSelect'
import { UploadScreen }     from '@/components/wizard/UploadScreen'
import { StepIndicator }    from '@/components/wizard/StepIndicator'
import { Step1Target }      from '@/components/wizard/Step1Target'
import { Step2Shape }       from '@/components/wizard/Step2Shape'
import { Step3Properties }  from '@/components/wizard/Step3Properties'
import { Step4Constraints } from '@/components/wizard/Step4Constraints'
import { Step5Output }      from '@/components/wizard/Step5Output'

const TOTAL_STEPS = 5

// ─── Can the user advance to the next step? ───────────────────────────────────

function canAdvance(state: WizardState): boolean {
  switch (state.step) {
    case 0: return !!state.targetType && !!state.targetValue.trim()
    case 1: return !!state.shapeName.trim()
    case 2: return state.properties.length > 0
    case 3: return true   // constraints are optional; user can always proceed
    case 4: return false  // last step - no "Next"
    default: return false
  }
}

export default function App() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const [previousState, setPreviousState] = useState<WizardState | null>(null)

  // Step 4's constraint editor is portaled into a side panel that sits OUTSIDE the
  // wizard card (a page-level sibling). When open, the whole card column translates
  // left and the panel slides into the freed space. `panelOpen` is reported up from
  // Step 4 (desktop only); `slotNode` is the panel's scroll container (portal target).
  const [panelOpen, setPanelOpen] = useState(false)
  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null)

  const update = (patch: Partial<WizardState>) =>
    setState((prev: WizardState) => ({ ...prev, ...patch }))

  const reset = () => { setState(INITIAL_STATE); setPreviousState(null) }

  const handleAddAnotherShape = () => {
    const completed: CompletedShape = {
      shapeName:         state.shapeName,
      targetType:        state.targetType as CompletedShape['targetType'],
      targetValue:       state.targetValue,
      properties:        state.properties,
      shapeMessage:      state.shapeMessage,
      closed:            state.closed,
      ignoredProperties: state.ignoredProperties,
    }
    const allCompleted = [...state.completedShapes, completed]
    const completedNames = new Set(allCompleted.flatMap(s => [
      s.shapeName,
      s.shapeName.split(':').pop()!,
    ]))
    // Collect sh:node refs from ALL completed shapes that don't have a shape yet
    const pendingNodeRefs = [
      ...new Set(
        allCompleted
          .flatMap(s => s.properties.map((p: PropertyShape) => p.constraints.node))
          .filter((n): n is string => {
            if (!n) return false
            const local = n.split(':').pop()!
            return !completedNames.has(n) && !completedNames.has(local)
          })
      ),
    ]
    setPreviousState(state)
    setState({
      ...INITIAL_STATE,
      mode:                state.mode,
      uploadStepDone:      state.uploadStepDone,
      uploadedFileName:    state.uploadedFileName,
      suggestedClasses:    state.suggestedClasses,
      suggestedProperties: state.suggestedProperties,
      propertiesByClass:   state.propertiesByClass,
      suggestedConstraints: state.suggestedConstraints,
      classHierarchy:      state.classHierarchy,
      ontologyConstraintsByClass: state.ontologyConstraintsByClass,
      inferenceLimited:    state.inferenceLimited,
      completedShapes:     allCompleted,
      selectedPrefix:      state.selectedPrefix,
      selectedNamespace:   state.selectedNamespace,
      detectedPrefixes:    state.detectedPrefixes,
      pendingNodeRefs,
    })
  }

  const handleUndoAddShape = () => {
    if (previousState) {
      setState(previousState)
      setPreviousState(null)
    }
  }

  // ── Mode selection ──────────────────────────────────────────────────────────
  if (!state.mode) {
    return (
      <Shell>
        <WizardCard>
          <ModeSelect update={update} />
        </WizardCard>
      </Shell>
    )
  }

  // ── Upload mode: show file picker before the wizard ─────────────────────────
  // Unlike every other screen, this one renders two independent card-styled
  // windows (not content nested inside a single shared WizardCard), so it
  // needs a wider Shell to fit both at full size side by side.
  if (state.mode === 'upload' && !state.uploadStepDone) {
    return (
      <Shell maxWidthClass="max-w-[888px]">
        <UploadScreen state={state} update={update} onBack={() => update({ mode: '' })} />
      </Shell>
    )
  }

  // ── Main wizard ─────────────────────────────────────────────────────────────
  return (
    <Shell>
      {/* The whole card column (header + card + footer) translates left when the
          Step 4 side panel opens, freeing space on the right for it to slide into. */}
      <div className={`transition-transform duration-200 ease-out ${panelOpen ? '-translate-x-[255px]' : ''}`}>
      {/* Header */}
      <div className="mb-7 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Logo />
            <span className="text-xs text-zinc-500 font-medium tracking-[0.12em] uppercase">
              SHACL Wizard
            </span>
            {state.mode === 'upload' && state.uploadedFileName && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                Upload-Assisted
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight leading-none">
            Shape Builder
          </h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-zinc-400 mono">
            Step {state.step + 1} / {TOTAL_STEPS}
          </div>
          {state.uploadedFileName && (
            <div className="text-[10px] text-zinc-400 mono mt-0.5 truncate max-w-[140px]">
              {state.uploadedFileName}
            </div>
          )}
        </div>
      </div>

      {/* Card + side panel. The panel is an absolutely-positioned sibling of the
          card (anchored to its right edge), so opening/closing it never reflows the
          card. It's the portal target for Step 4's constraint editor on >=1120px. */}
      <div className="relative">
      <WizardCard>
        {/* Step indicator */}
        <StepIndicator step={state.step} total={TOTAL_STEPS} />

        {/* Step content */}
        <div className="fade-up">
          {state.step === 0 && <Step1Target state={state} update={update} />}
          {state.step === 1 && <Step2Shape state={state} update={update} completedShapes={state.completedShapes} />}
          {state.step === 2 && (
            <Step3Properties state={state} update={update} />
          )}
          {state.step === 3 && (
            <Step4Constraints
              state={state}
              update={update}
              onPanelChange={setPanelOpen}
              panelSlot={slotNode}
            />
          )}
          {state.step === 4 && (
            <Step5Output
              state={state}
              update={update}
              onReset={reset}
              completedShapes={state.completedShapes}
              onAddAnotherShape={handleAddAnotherShape}
            />
          )}
        </div>

        {/* Navigation bar */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 -mx-6 -mb-6 mt-6 rounded-b-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => state.step === 0 ? reset() : update({ step: state.step - 1 })}
              className="text-zinc-500 text-sm px-3 py-2 rounded hover:bg-zinc-100 transition-colors"
            >
              {state.step === 0 ? '← Change mode' : '← Back'}
            </button>
            {previousState && (
              <button
                onClick={handleUndoAddShape}
                className="text-xs text-zinc-400 hover:text-zinc-700 px-2 py-1 rounded hover:bg-zinc-100 transition-colors"
                title={`Go back to ${previousState.shapeName}`}
              >
                ↩ Back to {previousState.shapeName}
              </button>
            )}
          </div>
          {state.step < 4 ? (
            <button
              onClick={() => update({ step: state.step + 1 })}
              disabled={!canAdvance(state)}
              className="bg-zinc-900 hover:bg-zinc-700 text-white text-sm h-9 px-5 rounded-md
                disabled:opacity-40 transition-colors"
            >
              {state.step === 3 ? 'Generate output →' : 'Continue →'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddAnotherShape}
                className="text-sm px-4 py-2 rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                + Add another shape
              </button>
              <button
                onClick={reset}
                className="text-sm px-4 py-2 rounded border border-zinc-200 text-zinc-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
              >
                Start over
              </button>
            </div>
          )}
        </div>
      </WizardCard>
        <aside
          aria-label="Constraint editor"
          className={`absolute top-0 left-full ml-6 w-[486px] transition-[transform,opacity] duration-200 ease-out
            ${panelOpen ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0 pointer-events-none'}`}
        >
          <div
            ref={setSlotNode}
            className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 max-h-[calc(100vh-6rem)] overflow-y-auto"
          />
        </aside>
      </div>

      <div className="mt-4 px-1 h-4">
        {(state.shapeName || state.targetValue) && (
          <p className="text-[11px] text-zinc-400 mono truncate text-center">
            {state.shapeName ? `${state.selectedPrefix}:${state.shapeName}` : '…'}
            {state.targetType && state.targetValue
              ? ` → ${
                  state.targetType === 'class'      ? 'sh:targetClass' :
                  state.targetType === 'node'       ? 'sh:targetNode' :
                  state.targetType === 'subjectsOf' ? 'sh:targetSubjectsOf' :
                                                      'sh:targetObjectsOf'
                } ${state.selectedPrefix}:${state.targetValue}`
              : ''}
            {state.properties.length > 0
              ? ` · ${state.properties.length} propert${state.properties.length === 1 ? 'y' : 'ies'}`
              : ''}
          </p>
        )}
      </div>
      </div>
    </Shell>
  )
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Shell({ children, maxWidthClass = 'max-w-[540px]' }: { children: React.ReactNode; maxWidthClass?: string }) {
  return (
    <div className="min-h-screen bg-[#f7f7f5] flex items-start justify-center py-10 px-4 overflow-x-hidden">
      <div className={`w-full ${maxWidthClass}`}>{children}</div>
    </div>
  )
}

function WizardCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <div className="p-6 pb-5">{children}</div>
    </div>
  )
}

function Logo() {
  return (
    <div className="w-6 h-6 bg-zinc-900 rounded flex items-center justify-center">
      <span className="text-white text-[9px] font-black tracking-tight">SH</span>
    </div>
  )
}