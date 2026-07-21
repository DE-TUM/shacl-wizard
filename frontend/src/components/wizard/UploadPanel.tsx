import { useRef } from 'react'
import type { ReactNode } from 'react'
import { InfoTip } from './InfoTip'

interface UploadPanelProps {
  title:            string
  infoTip?:         ReactNode
  helperText:       string
  acceptAttr:       string   // e.g. '.ttl,.jsonld,.rdf,.n3,.trig,.xml'
  acceptCopy:       string   // e.g. '.ttl · .jsonld · .rdf · .n3 · .trig'
  pastePlaceholder: string
  fileName:         string
  fileSize?:        number | null
  parsing?:         boolean
  parsingLarge?:    boolean
  error?:           string
  onFileSelected:   (file: File) => void
  onPasteSubmit:    (text: string) => void
  onRemove:         () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// A single independent upload widget: dropzone + paste-fallback + loaded/error
// states. Used twice on the upload screen (data graph, ontology); each
// instance owns its own file input ref and receives all file state via props,
// so two instances never collide.
export function UploadPanel({
  title,
  infoTip,
  helperText,
  acceptAttr,
  acceptCopy,
  pastePlaceholder,
  fileName,
  fileSize = null,
  parsing = false,
  parsingLarge = false,
  error = '',
  onFileSelected,
  onPasteSubmit,
  onRemove,
}: UploadPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden p-6 pb-5 space-y-3 w-full sm:w-[432px] sm:flex-none">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-1.5">
          {title}
          {infoTip && <InfoTip align="left">{infoTip}</InfoTip>}
        </h3>
        <p className="text-xs text-zinc-500 mt-1">{helperText}</p>
      </div>

      {fileName && !parsing ? (
        <div className="border-2 border-zinc-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-700 truncate">{fileName}</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Uploaded{fileSize != null ? ` · ${formatFileSize(fileSize)}` : ''}
            </p>
          </div>
          <button
            onClick={onRemove}
            className="text-xs text-zinc-500 px-2 py-1 rounded hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-zinc-200 rounded-xl p-5 text-center cursor-pointer hover:border-zinc-400 hover:bg-zinc-50 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFileSelected(f) }}
        >
          {parsing ? (
            <div className="space-y-3">
              <div className="flex justify-center gap-1.5">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-2 h-2 rounded-full bg-zinc-400 pulse-dot inline-block" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
              <p className="text-sm text-zinc-500">Parsing RDF file...</p>
              {parsingLarge ? (
                <p className="text-xs text-amber-500">Parsing large file, this may take several minutes...</p>
              ) : (
                <p className="text-xs text-zinc-400 mono">Extracting classes and properties</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700">Drop your file here</p>
              <p className="text-xs text-zinc-400">or click to browse</p>
              <p className="text-[11px] text-zinc-400 mono mt-2">{acceptCopy}</p>
            </div>
          )}
          <input ref={fileRef} type="file" accept={acceptAttr} className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelected(f) }} />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500">
          {error}
        </p>
      )}

      {!fileName && (
        <div className="border-t border-zinc-100 pt-3">
          <p className="text-[11px] text-zinc-400 mb-2">
            Or paste the raw file contents directly:
          </p>
          <textarea
            placeholder={pastePlaceholder}
            className="w-full min-h-[80px] px-3 py-2 text-xs mono rounded-md border border-zinc-200 resize-none focus:outline-none focus:border-zinc-400"
            onBlur={e => {
              if (e.target.value.trim()) {
                onPasteSubmit(e.target.value)
              }
            }}
          />
        </div>
      )}
    </div>
  )
}
