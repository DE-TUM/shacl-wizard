import type { GenerateResponse, ParseResponse, PropertyShape, WizardState } from '@/types'

export interface ParseNLResponse {
  properties: PropertyShape[]
  summary: string[]
  source: 'groq' | 'gemini' | 'heuristic'
  warnings: string[]
}

export interface ValidationViolation {
  focusNode: string
  property: string
  message: string
  severity?: string | null
  sourceConstraint?: string | null
  value?: string | null
}

export interface ValidationResult {
  status: 'valid' | 'invalid'
  conforms: boolean
  violations: ValidationViolation[]
  dataFile: string
  reportText: string
}

async function requestJson<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options)

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : response.statusText
    throw new Error(detail || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

// LLM-backed NL parsing can hang server-side on a slow/stuck provider call.
// Without an abort the caller's fetch never settles (e.g. Step 3's suggestion
// spinner would spin forever). 45s comfortably covers a normal Groq/Gemini
// round-trip while still failing fast enough to show a retry affordance.
const NL_PARSE_TIMEOUT_MS = 45_000

function postJsonWithTimeout<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  return requestJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId))
}

export function parseNaturalLanguage(state: WizardState): Promise<ParseNLResponse> {
  return postJsonWithTimeout<ParseNLResponse>('/api/parse-nl', {
    description: state.nlDescription,
    targetType: state.targetType,
    targetValue: state.targetValue,
    shapeName: state.shapeName,
    prefixes: state.detectedPrefixes,
    selectedPrefix: state.selectedPrefix,
    existingShapes: state.completedShapes.map(s => s.shapeName),
  }, NL_PARSE_TIMEOUT_MS)
}

export function suggestProperties(
  shapeName: string,
  targetValue: string,
  targetType: string,
  opts: { prefixes?: Record<string, string>; selectedPrefix?: string } = {},
): Promise<ParseNLResponse> {
  const name = shapeName || targetValue || 'Entity'
  return postJsonWithTimeout<ParseNLResponse>('/api/parse-nl', {
    description: `Suggest the most common properties for a ${name} shape`,
    targetType: targetType || 'class',
    targetValue: targetValue,
    shapeName: shapeName,
    prefixes: opts.prefixes ?? {},
    selectedPrefix: opts.selectedPrefix,
  }, NL_PARSE_TIMEOUT_MS)
}

export function generateShapes(state: WizardState): Promise<GenerateResponse> {
  // state already contains completedShapes - serialising the whole object is intentional
  return requestJson<GenerateResponse>('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
}

const RDF_PARSE_TIMEOUT_MS = 600_000 // 10 minutes - matches backend Jena timeout

export function parseRdfFile(file: File): Promise<ParseResponse> {
  const formData = new FormData()
  formData.append('data_file', file)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RDF_PARSE_TIMEOUT_MS)

  return requestJson<ParseResponse>('/api/parse-rdf', {
    method: 'POST',
    body: formData,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId))
}

export function parseRdfText(graphText: string): Promise<ParseResponse> {
  const formData = new FormData()
  formData.append('graph_text', graphText)
  formData.append('rdf_format', 'turtle')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), RDF_PARSE_TIMEOUT_MS)

  return requestJson<ParseResponse>('/api/parse-rdf', {
    method: 'POST',
    body: formData,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId))
}

export function validateGraph(file: File, shapesGraph: string): Promise<ValidationResult> {
  const formData = new FormData()
  formData.append('data_file', file)
  formData.append('shapes_graph', shapesGraph)
  formData.append('shapes_format', 'turtle')

  return requestJson<ValidationResult>('/api/validate', {
    method: 'POST',
    body: formData,
  })
}
