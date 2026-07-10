// Step indicator component - the progress bar + numbered circles at the top
// of every wizard step.

interface StepIndicatorProps {
  step:  number  // 0-indexed current step
  total: number  // total number of steps (5)
}

const STEP_LABELS = ['Target', 'Shape', 'Properties', 'Constraints', 'Output']

export function StepIndicator({ step, total }: StepIndicatorProps) {
  const pct = (step / (total - 1)) * 100

  return (
    <div className="mb-8">
      {/* Circles + labels */}
      <div className="flex items-center justify-between mb-3">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${i < step  ? 'bg-emerald-500 text-white' : ''}
                ${i === step ? 'bg-zinc-900 text-white ring-2 ring-offset-2 ring-zinc-900' : ''}
                ${i > step  ? 'bg-zinc-100 text-zinc-400' : ''}
              `}
            >
              {i < step ? '✓' : i + 1}
            </div>
            <span
              className={`text-[10px] font-medium tracking-wide uppercase hidden sm:block
                ${i === step ? 'text-zinc-900' : 'text-zinc-400'}
              `}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="relative h-0.5 bg-zinc-100 rounded-full">
        <div
          className="absolute h-full bg-zinc-900 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
