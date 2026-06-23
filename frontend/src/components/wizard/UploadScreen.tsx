import { useRef, useState } from 'react'
import { parseRdfFile, parseRdfText } from '@/api/backend'
import type { WizardState } from '@/types'
import { InfoTip } from './InfoTip'

interface Props {
  update: (patch: Partial<WizardState>) => void
  onBack: () => void
}

// Vocabulary prefixes that belong to fixed external namespaces — never use these
// as the "data namespace" for generating shapes.
const WELL_KNOWN_PREFIXES = new Set([
  'rdf', 'rdfs', 'owl', 'xsd', 'sh', 'shacl',
  'skos', 'dc', 'dcterms', 'dct', 'foaf', 'schema',
  'prov', 'void', 'sd', 'geo', 'wgs',
])

function pickBestPrefix(prefixes: Record<string, string>): { prefix: string; namespace: string } {
  const candidates = Object.entries(prefixes).filter(
    ([p]) => !WELL_KNOWN_PREFIXES.has(p.toLowerCase()) && p !== '',
  )
  if (candidates.length > 0) {
    // Prefer shorter prefixes (more likely to be the "main" ontology)
    candidates.sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]))
    const [prefix, namespace] = candidates[0]
    return { prefix, namespace }
  }
  return { prefix: 'ex', namespace: 'http://example.org/' }
}

export function UploadScreen({ update, onBack }: Props) {
  const [parsing, setParsing] = useState(false)
  const [parsingLarge, setParseLarge] = useState(false)
  const [parseError, setParseError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const applyParsedGraph = (
    filename: string,
    classes: string[],
    properties: string[],
    propertiesByClass: WizardState['propertiesByClass'],
    suggestedConstraints: WizardState['suggestedConstraints'],
    prefixes: Record<string, string>,
  ) => {
    const { prefix, namespace } = pickBestPrefix(prefixes)
    update({
      uploadedFileName:     filename,
      suggestedClasses:     classes,
      suggestedProperties:  properties,
      propertiesByClass:    propertiesByClass,
      suggestedConstraints: suggestedConstraints,
      detectedPrefixes:     prefixes,
      selectedPrefix:       prefix,
      selectedNamespace:    namespace,
      step:                 0,
    })
  }

  const handleFile = async (file: File) => {
    setParsing(true)
    setParseLarge(file.size > 50 * 1024 * 1024) // flag files over 50 MB
    setParseError('')

    try {
      const { classes, properties, propertiesByClass = {}, suggestedConstraints = {}, prefixes = {} } = await parseRdfFile(file)
      applyParsedGraph(file.name, classes, properties, propertiesByClass, suggestedConstraints, prefixes)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setParseError('File parsing timed out. Try a smaller file or ensure Jena is configured.')
      } else {
        setParseError(error instanceof Error ? error.message : 'Could not parse the RDF file.')
      }
    } finally {
      setParsing(false)
      setParseLarge(false)
    }
  }

  const handleText = async (graphText: string) => {
    if (!graphText.trim()) return
    setParsing(true)
    setParseError('')

    try {
      const { classes, properties, propertiesByClass = {}, suggestedConstraints = {}, prefixes = {} } = await parseRdfText(graphText)
      applyParsedGraph('pasted-graph.ttl', classes, properties, propertiesByClass, suggestedConstraints, prefixes)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse the pasted Turtle.')
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
          Upload your RDF data graph
          <InfoTip align="left">
            A data graph is the RDF file with your actual records. A shapes graph is
            the separate rules file that checks those records.
          </InfoTip>
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          This is your data file, not a shapes graph. The app will extract classes and properties
          to pre-fill the wizard.
        </p>
      </div>

      <div
        className="border-2 border-dashed border-zinc-200 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-400 hover:bg-zinc-50 transition-all"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
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
            <p className="text-sm font-medium text-zinc-700">Drop your RDF file here</p>
            <p className="text-xs text-zinc-400">or click to browse</p>
            <p className="text-[11px] text-zinc-400 mono mt-2">.ttl · .jsonld · .rdf · .n3 · .trig</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".ttl,.jsonld,.rdf,.n3,.trig,.xml" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      </div>

      {parseError && (
        <p className="text-xs text-red-500">
          {parseError}
        </p>
      )}

      <div className="border-t border-zinc-100 pt-4">
        <p className="text-xs text-zinc-400 mb-2 flex items-center gap-1.5">
          Or paste raw Turtle text directly:
          <InfoTip align="left">
            Turtle is a compact text syntax for RDF triples. Paste example data here
            and the wizard will look for reusable classes and properties.
          </InfoTip>
        </p>
        <textarea
          placeholder={'@prefix ex: <http://example.org/> .\nex:Alice a ex:Person ;\n    ex:name "Alice" .'}
          className="w-full min-h-[100px] px-3 py-2 text-xs mono rounded-md border border-zinc-200 resize-none focus:outline-none focus:border-zinc-400"
          onBlur={e => {
            if (e.target.value.trim()) {
              handleText(e.target.value)
            }
          }}
        />
        <p className="text-[10px] text-zinc-400 mt-1">Click outside the text area after pasting.</p>
      </div>

      {/* Bottom nav — matches manual mode layout */}
      <div className="flex justify-between items-center px-6 py-4 border-t border-zinc-100 bg-zinc-50/50 -mx-6 -mb-6 mt-2 rounded-b-2xl">
        <button onClick={onBack} className="text-zinc-500 text-sm px-3 py-2 rounded hover:bg-zinc-100 transition-colors">
          ← Change mode
        </button>
        <div />
      </div>
    </div>
  )
}
