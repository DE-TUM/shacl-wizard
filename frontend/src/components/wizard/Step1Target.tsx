// Step 1 — Target declaration.
// The user picks what kind of resources they want to validate and names them.

import { TargetCard } from './TargetCard'
import { TARGET_OPTIONS } from '@/types'
import type { WizardState, TargetType } from '@/types'
import { InfoTip } from './InfoTip'

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

export function Step1Target({ state, update }: Props) {
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
            onClick={() => update({ targetType: opt.value, targetValue: '' })}
          />
        ))}
      </div>

      {/* Value input — shown once a type is selected */}
      {state.targetType && (
        <div className="space-y-1.5 fade-up">
          <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
            {targetValueLabel}
            <InfoTip align="left">
              {targetValueHelp}
            </InfoTip>
          </label>

          {/* Suggested class pills (upload mode) */}
          {state.mode === 'upload' && state.targetType === 'class' && state.suggestedClasses.length > 0 && (
            <div className="space-y-1.5 mb-2">
              <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
                Detected classes
                <InfoTip align="left">
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
                    ex:{cls}
                  </button>
                ))}
              </div>
            </div>
          )}

          <input
            autoFocus
            type="text"
            value={state.targetValue}
            onChange={e => update({ targetValue: e.target.value })}
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
              → {TARGET_OPTIONS.find(o => o.value === state.targetType)?.shacl} ex:{state.targetValue}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
