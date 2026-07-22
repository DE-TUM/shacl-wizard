import { useEffect, useState } from 'react'
import { parseRdfFile, parseRdfText, parseOntologyFile, parseOntologyText } from '@/api/backend'
import type { WizardState, PropertyConstraints, SuggestedConstraints, OntologyParseResponse } from '@/types'
import { UploadPanel } from './UploadPanel'
import { ConfirmModal } from './ConfirmModal'

interface Props {
  state:  WizardState
  update: (patch: Partial<WizardState>) => void
  onBack: () => void
}

// Vocabulary prefixes that belong to fixed external namespaces - never use these
// as the "data namespace" for generating shapes.
const WELL_KNOWN_PREFIXES = new Set([
  'rdf', 'rdfs', 'owl', 'xsd', 'sh', 'shacl',
  'skos', 'dc', 'dcterms', 'dct', 'foaf', 'schema',
  'prov', 'void', 'sd', 'geo', 'wgs',
])

// Returns the best real candidate from a single prefix pool, or null if none
// exists (no well-known-only / empty pool) - the caller decides the fallback.
function pickBestPrefix(prefixes: Record<string, string>): { prefix: string; namespace: string } | null {
  const candidates = Object.entries(prefixes).filter(
    ([p]) => !WELL_KNOWN_PREFIXES.has(p.toLowerCase()) && p !== '',
  )
  if (candidates.length > 0) {
    // Prefer shorter prefixes (more likely to be the "main" ontology)
    candidates.sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]))
    const [prefix, namespace] = candidates[0]
    return { prefix, namespace }
  }
  return null
}

// Source-level precedence: the data graph is the file actually being
// validated, so its prefix must match for sh:targetClass etc. to resolve
// against real data - it wins whenever it has any real candidate, falling
// back to the ontology's prefix only when the data graph has none.
function pickBestPrefixAcrossSources(
  dataGraphPrefixes: Record<string, string>,
  ontologyPrefixes: Record<string, string>,
): { prefix: string; namespace: string } {
  return (
    pickBestPrefix(dataGraphPrefixes) ??
    pickBestPrefix(ontologyPrefixes) ??
    { prefix: 'ex', namespace: 'http://example.org/' }
  )
}

// ── Ontology response normalization ─────────────────────────────────────────
// Converts the ontology endpoint's declared-fact shape into the same bare-value
// per-property constraint shape the data graph's suggestedConstraints already
// uses, so both sides can feed the same merge function below.
function normalizeOntologyConstraints(resp: OntologyParseResponse): Record<string, Partial<PropertyConstraints>> {
  const result: Record<string, Partial<PropertyConstraints>> = {}
  for (const prop of resp.functionalProperties) {
    result[prop] = { ...result[prop], maxCount: '1' }
  }
  for (const [prop, range] of Object.entries(resp.propertyRanges)) {
    const existing = result[prop] ?? {}
    if (range.datatype) existing.datatype = range.datatype
    if (range.class) existing.class = range.class
    if (range.nodeKind) existing.nodeKind = range.nodeKind
    result[prop] = existing
  }
  return result
}

// Builds the ontology side of propertiesByClass: for each class, its own
// directly-declared properties (rdfs:domain, or a class-scoped owl:Restriction
// with no domain declared elsewhere) PLUS every ancestor's directly-declared
// properties, walked the full length of the classHierarchy chain (not just one
// level) - a GraduateStudent should suggest Student's properties and Person's,
// if Student is itself a subclass of Person.
//
// This only affects classes that have a parent in classHierarchy or a
// classRestrictedConstraints entry; a class with neither behaves identically
// to the old flat "invert propertyDomains" logic (the chain-walk terminates
// after one iteration and returns exactly that class's direct properties).
function expandOntologyPropertiesByClass(
  propertyDomains: Record<string, string[]>,
  classHierarchy: Record<string, string>,
  classRestrictedConstraints: Record<string, Record<string, Partial<PropertyConstraints>>>,
): Record<string, string[]> {
  const direct: Record<string, Set<string>> = {}
  for (const [prop, classes] of Object.entries(propertyDomains)) {
    for (const cls of classes) {
      (direct[cls] ??= new Set()).add(prop)
    }
  }
  for (const [cls, props] of Object.entries(classRestrictedConstraints)) {
    for (const prop of Object.keys(props)) {
      (direct[cls] ??= new Set()).add(prop)
    }
  }

  const allClasses = new Set([
    ...Object.keys(direct),
    ...Object.keys(classHierarchy),
    ...Object.values(classHierarchy),
  ])

  const result: Record<string, string[]> = {}
  for (const cls of allClasses) {
    const props = new Set<string>()
    const seen = new Set<string>() // guards against a malformed cyclic ontology
    let current: string | undefined = cls
    while (current && !seen.has(current)) {
      seen.add(current)
      for (const p of direct[current] ?? []) props.add(p)
      current = classHierarchy[current]
    }
    if (props.size > 0) {
      result[cls] = [...props].sort()
    }
  }
  return result
}

// ── Dual-source merge (Option A precedence: ontology wins when it declares a
// field for a property; otherwise fall back to the data graph). A presence
// check, not a comparison - no conflict detection or suppression. ───────────
function mergeSuggestedConstraints(
  dataGraph: Record<string, Partial<PropertyConstraints>>,
  ontology: Record<string, Partial<PropertyConstraints>>,
): SuggestedConstraints {
  const paths = new Set([...Object.keys(dataGraph), ...Object.keys(ontology)])
  const result: SuggestedConstraints = {}
  for (const path of paths) {
    const dg = dataGraph[path] ?? {}
    const ont = ontology[path] ?? {}
    const fields = new Set([...Object.keys(dg), ...Object.keys(ont)]) as Set<keyof PropertyConstraints>
    const merged: SuggestedConstraints[string] = {}
    for (const field of fields) {
      const ontValue = ont[field]
      const dgValue = dg[field]
      if (typeof ontValue === 'string' && ontValue !== '') {
        merged[field] = { value: ontValue, source: 'ontology' }
      } else if (typeof dgValue === 'string' && dgValue !== '') {
        merged[field] = { value: dgValue, source: 'dataGraph' }
      }
    }
    if (Object.keys(merged).length > 0) {
      result[path] = merged
    }
  }
  return result
}

function mergePropertiesByClass(
  dataGraph: Record<string, string[]>,
  ontology: Record<string, string[]>,
): Record<string, string[]> {
  const classes = new Set([...Object.keys(dataGraph), ...Object.keys(ontology)])
  const result: Record<string, string[]> = {}
  for (const cls of classes) {
    result[cls] = [...new Set([...(dataGraph[cls] ?? []), ...(ontology[cls] ?? [])])].sort()
  }
  return result
}

export function UploadScreen({ state, update, onBack }: Props) {
  // ── Data graph panel state (backed by the real parse pipeline) ─────────────
  const [parsing, setParsing] = useState(false)
  const [parsingLarge, setParseLarge] = useState(false)
  const [parseError, setParseError] = useState('')
  const [dataGraphFileSize, setDataGraphFileSize] = useState<number | null>(null)
  // Raw, bare-value data-graph inference results, kept separately from
  // WizardState so they can be re-merged with the ontology side on any change.
  const [dataGraphConstraints, setDataGraphConstraints] = useState<Record<string, Partial<PropertyConstraints>>>({})
  const [dataGraphPropertiesByClass, setDataGraphPropertiesByClass] = useState<Record<string, string[]>>({})
  const [dataGraphClasses, setDataGraphClasses] = useState<string[]>([])
  const [dataGraphPrefixes, setDataGraphPrefixes] = useState<Record<string, string>>({})

  // ── Ontology panel state (now backed by a real parse call) ─────────────────
  const [ontologyFileName, setOntologyFileName] = useState('')
  const [ontologyFileSize, setOntologyFileSize] = useState<number | null>(null)
  const [ontologyParsing, setOntologyParsing] = useState(false)
  const [ontologyError, setOntologyError] = useState('')
  const [ontologyConstraints, setOntologyConstraints] = useState<Record<string, Partial<PropertyConstraints>>>({})
  const [ontologyPropertiesByClass, setOntologyPropertiesByClass] = useState<Record<string, string[]>>({})
  const [ontologyClassHierarchy, setOntologyClassHierarchy] = useState<Record<string, string>>({})
  const [ontologyClasses, setOntologyClasses] = useState<string[]>([])
  const [ontologyPrefixes, setOntologyPrefixes] = useState<Record<string, string>>({})
  // owl:Restriction facts, already class-scoped by the backend - passed through
  // to WizardState as-is (no merge needed, it has no data-graph counterpart).
  const [ontologyConstraintsByClass, setOntologyConstraintsByClass] = useState<Record<string, Record<string, Partial<PropertyConstraints>>>>({})
  // Whether an ontology has been successfully parsed at all, independent of
  // whether it contributed any data - see the field's doc comment in types/index.ts.
  const [ontologyUploaded, setOntologyUploaded] = useState(false)

  const [showSkipModal, setShowSkipModal] = useState(false)

  // Re-merge whenever either raw source changes. A useEffect (rather than an
  // inline recompute inside each handler) is deliberate: the two upload panels
  // are independently async, so an inline recompute reading the "other side"
  // from a handler's closure could write a stale value if the other panel's
  // parse resolves while this one is still in flight. An effect always reads
  // the latest committed state, so upload order/timing can't drop a source.
  useEffect(() => {
    const { prefix, namespace } = pickBestPrefixAcrossSources(dataGraphPrefixes, ontologyPrefixes)
    update({
      suggestedConstraints: mergeSuggestedConstraints(dataGraphConstraints, ontologyConstraints),
      propertiesByClass:    mergePropertiesByClass(dataGraphPropertiesByClass, ontologyPropertiesByClass),
      dataGraphPropertiesByClass,
      ontologyPropertiesByClass,
      ontologyUploaded,
      classHierarchy:       ontologyClassHierarchy,
      ontologyConstraintsByClass,
      suggestedClasses:     [...new Set([...dataGraphClasses, ...ontologyClasses])].sort(),
      detectedPrefixes:     { ...ontologyPrefixes, ...dataGraphPrefixes },
      selectedPrefix:       prefix,
      selectedNamespace:    namespace,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataGraphConstraints, dataGraphPropertiesByClass, dataGraphClasses, dataGraphPrefixes,
    ontologyConstraints, ontologyPropertiesByClass, ontologyClassHierarchy, ontologyConstraintsByClass, ontologyClasses, ontologyPrefixes,
    ontologyUploaded,
  ])

  const applyParsedGraph = (
    filename: string,
    fileSize: number,
    classes: string[],
    properties: string[],
    propertiesByClass: Record<string, string[]>,
    suggestedConstraints: Record<string, Partial<PropertyConstraints>>,
    prefixes: Record<string, string>,
    inferenceLimited: boolean,
  ) => {
    setDataGraphConstraints(suggestedConstraints)
    setDataGraphPropertiesByClass(propertiesByClass)
    setDataGraphFileSize(fileSize)
    setDataGraphClasses(classes)
    setDataGraphPrefixes(prefixes)
    update({
      uploadedFileName:    filename,
      suggestedProperties: properties,
      inferenceLimited,
    })
  }

  const handleFile = async (file: File) => {
    setParsing(true)
    setParseLarge(file.size > 50 * 1024 * 1024) // flag files over 50 MB
    setParseError('')

    try {
      const { classes, properties, propertiesByClass = {}, suggestedConstraints = {}, prefixes = {}, inferenceLimited = false } = await parseRdfFile(file)
      applyParsedGraph(file.name, file.size, classes, properties, propertiesByClass, suggestedConstraints, prefixes, inferenceLimited)
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
      const { classes, properties, propertiesByClass = {}, suggestedConstraints = {}, prefixes = {}, inferenceLimited = false } = await parseRdfText(graphText)
      applyParsedGraph('pasted-graph.ttl', new Blob([graphText]).size, classes, properties, propertiesByClass, suggestedConstraints, prefixes, inferenceLimited)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse the pasted Turtle.')
    } finally {
      setParsing(false)
    }
  }

  const handleRemoveDataGraph = () => {
    setParseError('')
    setDataGraphConstraints({})
    setDataGraphPropertiesByClass({})
    setDataGraphFileSize(null)
    setDataGraphClasses([])
    setDataGraphPrefixes({})
    update({
      uploadedFileName:     '',
      suggestedProperties:  [],
      inferenceLimited:     false,
    })
  }

  const applyParsedOntology = (filename: string, fileSize: number, resp: OntologyParseResponse) => {
    setOntologyFileName(filename)
    setOntologyFileSize(fileSize)
    setOntologyConstraints(normalizeOntologyConstraints(resp))
    setOntologyPropertiesByClass(expandOntologyPropertiesByClass(resp.propertyDomains, resp.classHierarchy, resp.classRestrictedConstraints))
    setOntologyClassHierarchy(resp.classHierarchy)
    setOntologyConstraintsByClass(resp.classRestrictedConstraints)
    setOntologyClasses(resp.classes)
    setOntologyPrefixes(resp.prefixes)
    setOntologyUploaded(true)
  }

  const handleOntologyFile = async (file: File) => {
    setOntologyParsing(true)
    setOntologyError('')
    try {
      const resp = await parseOntologyFile(file)
      applyParsedOntology(file.name, file.size, resp)
    } catch (error) {
      setOntologyError(error instanceof Error ? error.message : 'Could not parse the ontology file.')
    } finally {
      setOntologyParsing(false)
    }
  }

  const handleOntologyText = async (graphText: string) => {
    if (!graphText.trim()) return
    setOntologyParsing(true)
    setOntologyError('')
    try {
      const resp = await parseOntologyText(graphText)
      applyParsedOntology('pasted-ontology.ttl', new Blob([graphText]).size, resp)
    } catch (error) {
      setOntologyError(error instanceof Error ? error.message : 'Could not parse the pasted ontology.')
    } finally {
      setOntologyParsing(false)
    }
  }

  const handleRemoveOntology = () => {
    setOntologyFileName('')
    setOntologyFileSize(null)
    setOntologyError('')
    setOntologyConstraints({})
    setOntologyPropertiesByClass({})
    setOntologyClassHierarchy({})
    setOntologyConstraintsByClass({})
    setOntologyClasses([])
    setOntologyPrefixes({})
    setOntologyUploaded(false)
  }

  const hasFile = Boolean(state.uploadedFileName) || Boolean(ontologyFileName)
  const isBusy = parsing || ontologyParsing
  const goToWizard = () => update({ uploadStepDone: true })

  const handlePrimaryClick = () => {
    if (hasFile) {
      goToWizard()
    } else {
      setShowSkipModal(true)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-zinc-900">
          Upload your files
        </h2>
        <p className="text-sm text-zinc-600 font-medium mt-1">
          Add a data graph, an ontology, or both. Anything you upload will be used to prefill suggestions in the next steps.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <UploadPanel
          title="Data Graph"
          infoTip={
            <>
              A data graph is the RDF file with your actual records. A shapes graph is
              the separate rules file that checks those records.
            </>
          }
          helperText="Your data file. Classes, properties, and constraints are extracted to pre-fill the wizard."
          acceptAttr=".ttl,.jsonld,.rdf,.n3,.trig,.xml"
          acceptCopy=".ttl · .jsonld · .rdf · .n3 · .trig"
          pastePlaceholder={'@prefix ex: <http://example.org/> .\nex:Alice a ex:Person ;\n    ex:name "Alice" .'}
          fileName={state.uploadedFileName}
          fileSize={dataGraphFileSize}
          parsing={parsing}
          parsingLarge={parsingLarge}
          error={parseError}
          onFileSelected={handleFile}
          onPasteSubmit={handleText}
          onRemove={handleRemoveDataGraph}
        />
        <UploadPanel
          title="Ontology"
          infoTip={
            <>
              An ontology defines the vocabulary, meaning the classes and properties, that
              your data uses, separate from the individual records themselves.
            </>
          }
          helperText="Upload an ontology file describing your data's classes, properties, and constraints. Can be used with or without a data graph."
          acceptAttr=".ttl,.jsonld,.rdf,.owl,.n3,.trig,.xml"
          acceptCopy=".ttl · .jsonld · .rdf · .owl · .n3 · .trig"
          pastePlaceholder={'@prefix ex: <http://example.org/> .\nex:Person a owl:Class .'}
          fileName={ontologyFileName}
          fileSize={ontologyFileSize}
          parsing={ontologyParsing}
          error={ontologyError}
          onFileSelected={handleOntologyFile}
          onPasteSubmit={handleOntologyText}
          onRemove={handleRemoveOntology}
        />
      </div>

      {/* Bottom nav, sits below the two independent windows, not inside either */}
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="text-zinc-500 text-sm px-3 py-2 rounded hover:bg-zinc-100 transition-colors">
          ← Change mode
        </button>
        <button
          onClick={handlePrimaryClick}
          disabled={isBusy}
          className="bg-zinc-900 hover:bg-zinc-700 text-white text-sm h-9 px-5 rounded-md disabled:opacity-40 transition-colors"
        >
          {isBusy ? (
            <span className="flex items-center justify-center gap-2">
              <span className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white pulse-dot inline-block"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </span>
              Parsing...
            </span>
          ) : hasFile ? 'Next' : 'Skip upload'}
        </button>
      </div>

      {showSkipModal && (
        <ConfirmModal
          title="Proceed without uploading?"
          body="No data graph or ontology was uploaded. You'll continue in manual mode, answering each step from scratch."
          cancelLabel="Go back"
          confirmLabel="Proceed"
          onCancel={() => setShowSkipModal(false)}
          onConfirm={() => { setShowSkipModal(false); goToWizard() }}
        />
      )}
    </div>
  )
}
