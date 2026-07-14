// ─── Target types (maps to SHACL target declarations) ────────────────────────

export type TargetType = 'class' | 'node' | 'subjectsOf' | 'objectsOf'

export const TARGET_OPTIONS = [
  {
    value: 'class' as TargetType,
    label: 'A specific class',
    description: 'Validate all nodes of a given RDF class, e.g. ex:Person or ex:Car',
    shacl: 'sh:targetClass',
  },
  {
    value: 'node' as TargetType,
    label: 'A specific individual',
    description: 'Validate one specific named entity only, e.g. ex:Alice',
    shacl: 'sh:targetNode',
  },
  {
    value: 'subjectsOf' as TargetType,
    label: 'Any node using a property',
    description: 'Validate every node that has a given property, regardless of type',
    shacl: 'sh:targetSubjectsOf',
  },
  {
    value: 'objectsOf' as TargetType,
    label: 'Any node pointed to by a property',
    description: 'Validate every node that appears as the value of a given property',
    shacl: 'sh:targetObjectsOf',
  },
] as const

// ─── Constraint types ─────────────────────────────────────────────────────────

// A one-level nested shape used inside a logical / qualified constraint.
// Value-level constraints only - no path, no cardinality, no further nesting.
export interface SubShape {
  datatype?:     string
  nodeKind?:     string
  class?:        string
  node?:         string
  pattern?:      string
  minInclusive?: string
  maxInclusive?: string
  minExclusive?: string
  maxExclusive?: string
  minLength?:    string
  maxLength?:    string
  in?:           string
  hasValue?:     string
  languageIn?:   string
}

export interface PropertyConstraints {
  minCount?:     string
  maxCount?:     string
  datatype?:     string   // e.g. 'xsd:string'
  nodeKind?:     string   // e.g. 'sh:IRI', 'sh:Literal'
  pattern?:      string
  minInclusive?: string
  maxInclusive?: string
  minExclusive?: string
  maxExclusive?: string
  minLength?:    string
  maxLength?:    string
  in?:           string   // comma-separated list of allowed values
  class?:        string   // sh:class constraint
  node?:         string   // sh:node - references another NodeShape by local name or CURIE
  languageIn?:   string   // comma-separated language tags
  hasValue?:     string   // sh:hasValue - a value the property must include
  uniqueLang?:   string   // sh:uniqueLang - 'true' when enabled
  // Property-pair constraints - each references another property path in the shape
  equals?:           string
  disjoint?:         string
  lessThan?:         string
  lessThanOrEquals?: string
  // Logical / qualified constraints (one level of nesting)
  and?:                 SubShape[]
  or?:                  SubShape[]
  xone?:                SubShape[]
  not?:                 SubShape
  qualifiedValueShape?: SubShape
  qualifiedMinCount?:   string
  qualifiedMaxCount?:   string
  // sh:message - a human-readable annotation for the validation report, NOT one
  // of the 28 SHACL Core constraint components. Never counted toward coverage.
  message?:      string
}

export interface PropertyShape {
  id:          string
  path:        string
  constraints: PropertyConstraints
}

export interface CompletedShape {
  shapeName:    string
  targetType:   TargetType
  targetValue:  string
  properties:   PropertyShape[]
  shapeMessage?: string        // optional sh:message annotation for the whole shape
  closed?:      boolean        // sh:closed - only declared properties allowed
  ignoredProperties?: string   // comma-separated extra paths permitted when closed
}

// ─── Input mode ───────────────────────────────────────────────────────────────

export type InputMode = '' | 'manual' | 'upload'

// ─── Full wizard state ────────────────────────────────────────────────────────

export interface WizardState {
  mode:                 InputMode
  step:                 number        // 0–4
  targetType:           TargetType | ''
  targetValue:          string
  shapeName:            string
  shapeMessage:         string        // optional sh:message annotation for the NodeShape
  closed:               boolean       // sh:closed - only declared properties allowed
  ignoredProperties:    string        // comma-separated extra paths permitted when closed
  properties:           PropertyShape[]
  nlDescription:        string
  useNL:                boolean
  nlParsed:             boolean
  outputTab:            'turtle' | 'jsonld' | 'rdfxml' | 'trig'
  uploadedFileName:     string
  suggestedClasses:     string[]
  suggestedProperties:  string[]
  propertiesByClass:    Record<string, string[]>
  suggestedConstraints: Record<string, Partial<PropertyConstraints>>
  completedShapes:      CompletedShape[]
  // Namespace / prefix selection
  detectedPrefixes:     Record<string, string>   // from uploaded file, e.g. { ub: 'http://...' }
  selectedPrefix:       string                   // e.g. 'ub'
  selectedNamespace:    string                   // e.g. 'http://swat.cse.lehigh.edu/onto/univ-bench.owl#'
  // sh:node refs from the previous shape that don't yet have a completed shape -
  // shown as quick-pick suggestions in Step 1 of the next shape
  pendingNodeRefs:      string[]
  // Transient "jump to error" target: set by Step 5's per-violation button to
  // send the user back to Step 4, select the property, open its constraint
  // section, and highlight the failed field. Cleared by Step 4 once consumed.
  jumpTarget:           { propertyId: string; field: string | null } | null
}

export const INITIAL_STATE: WizardState = {
  mode:                 '',
  step:                 0,
  targetType:           '',
  targetValue:          '',
  shapeName:            '',
  shapeMessage:         '',
  closed:               false,
  ignoredProperties:    '',
  properties:           [],
  nlDescription:        '',
  useNL:                false,
  nlParsed:             false,
  outputTab:            'turtle',
  uploadedFileName:     '',
  suggestedClasses:     [],
  suggestedProperties:  [],
  propertiesByClass:    {},
  suggestedConstraints: {},
  completedShapes:      [],
  detectedPrefixes:     {},
  selectedPrefix:       'ex',
  selectedNamespace:    'http://example.org/',
  pendingNodeRefs:      [],
  jumpTarget:           null,
}

// ─── Datatype options (shown in Step 4 constraint panel) ─────────────────────

export const DATATYPE_OPTIONS = [
  { label: 'Text (string)',  value: 'xsd:string' },
  { label: 'Integer',        value: 'xsd:integer' },
  { label: 'Decimal',        value: 'xsd:decimal' },
  { label: 'Date',           value: 'xsd:date' },
  { label: 'Boolean',        value: 'xsd:boolean' },
  { label: 'URL / IRI',      value: 'xsd:anyURI' },
] as const

export const NODEKIND_OPTIONS = [
  { label: 'IRI (named resource)', value: 'sh:IRI' },
  { label: 'Blank node',           value: 'sh:BlankNode' },
  { label: 'Literal (value)',      value: 'sh:Literal' },
] as const

// ─── Backend response types ───────────────────────────────────────────────────

export interface GenerateResponse {
  formats:  Record<WizardState['outputTab'], string>
  shapeUri: string
  summary:  string[]
}

export interface ParseResponse {
  classes:              string[]
  properties:           string[]
  propertiesByClass?:   Record<string, string[]>
  prefixes:             Record<string, string>
  detectedDatatypes:    Record<string, string>
  suggestedConstraints?: Record<string, Partial<PropertyConstraints>>
}
