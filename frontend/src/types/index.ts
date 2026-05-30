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
  languageIn?:   string   // comma-separated language tags
}

export interface PropertyShape {
  id:          string
  path:        string
  constraints: PropertyConstraints
}

export interface CompletedShape {
  shapeName:   string
  targetType:  TargetType
  targetValue: string
  properties:  PropertyShape[]
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
  properties:           PropertyShape[]
  nlDescription:        string
  useNL:                boolean
  nlParsed:             boolean
  outputTab:            'turtle' | 'jsonld' | 'rdfxml' | 'trig'
  uploadedFileName:     string
  suggestedClasses:     string[]
  suggestedProperties:  string[]
  suggestedConstraints: Record<string, Partial<PropertyConstraints>>
  completedShapes:      CompletedShape[]
}

export const INITIAL_STATE: WizardState = {
  mode:                 '',
  step:                 0,
  targetType:           '',
  targetValue:          '',
  shapeName:            '',
  properties:           [],
  nlDescription:        '',
  useNL:                false,
  nlParsed:             false,
  outputTab:            'turtle',
  uploadedFileName:     '',
  suggestedClasses:     [],
  suggestedProperties:  [],
  suggestedConstraints: {},
  completedShapes:      [],
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
  prefixes:             Record<string, string>
  detectedDatatypes:    Record<string, string>
  suggestedConstraints?: Record<string, Partial<PropertyConstraints>>
}
