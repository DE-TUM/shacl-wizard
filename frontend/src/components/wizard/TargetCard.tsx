// A selectable card used in Step 1 for choosing the SHACL target type.

import { InfoTip } from './InfoTip'

interface TargetCardProps {
  label:       string
  description: string
  badge?:      string       // e.g. "sh:targetClass"
  info?:       string
  selected:    boolean
  onClick:     () => void
}

export function TargetCard({ label, description, badge, info, selected, onClick }: TargetCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-150
        ${selected
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200 bg-white hover:border-zinc-400 text-zinc-800'
        }
      `}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{label}</span>
          {badge && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider
                ${selected ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'}
              `}
            >
              {badge}
            </span>
          )}
          {info && (
            <InfoTip
              align="left"
              focusable={false}
              className={selected ? 'info-tip-on-dark' : ''}
            >
              {info}
            </InfoTip>
          )}
        </div>
        <div className={`text-xs mt-0.5 ${selected ? 'text-zinc-300' : 'text-zinc-500'}`}>
          {description}
        </div>
      </div>
    </button>
  )
}
