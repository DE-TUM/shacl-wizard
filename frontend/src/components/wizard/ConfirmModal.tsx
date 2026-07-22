import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ConfirmModalProps {
  title:        string
  body:         string
  confirmLabel: string
  cancelLabel:  string
  onConfirm:    () => void
  onCancel:     () => void
  // Default (false): neutral confirmation (e.g. skip-upload) - no red, no
  // icons, matches the app's existing informational styling. Set true for a
  // genuinely destructive action (e.g. remove all) - styles the confirm
  // button with the app's existing red palette instead of the neutral dark one.
  destructive?: boolean
}

export function ConfirmModal({ title, body, confirmLabel, cancelLabel, onConfirm, onCancel, destructive = false }: ConfirmModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="bg-white rounded-2xl border border-zinc-200 shadow-lg p-6 max-w-sm w-full"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" className="text-base font-semibold text-zinc-900">
          {title}
        </h2>
        <p className="text-sm text-zinc-500 mt-2">
          {body}
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="text-zinc-500 text-sm px-3 py-2 rounded hover:bg-zinc-100 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`text-sm h-9 px-4 rounded-md transition-colors ${
              destructive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-zinc-900 hover:bg-zinc-700 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
