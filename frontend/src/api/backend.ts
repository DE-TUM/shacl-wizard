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

export function parseNaturalLanguage(state: WizardState): Promise<ParseNLResponse> {
  return requestJson<ParseNLResponse>('/api/parse-nl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: state.nlDescription,
      targetType: state.targetType,
      targetValue: state.targetValue,
      shapeName: state.shapeName,
    }),
  })
}

export function suggestProperties(
  shapeName: string,
  targetValue: string,
  targetType: string
): Promise<ParseNLResponse> {
  const name = shapeName || targetValue || 'Entity'
  return requestJson<ParseNLResponse>('/api/parse-nl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: `Suggest the most common properties for a ${name} shape`,
      targetType: targetType || 'class',
      targetValue: targetValue,
      shapeName: shapeName,
    }),
  })
}

export function generateShapes(state: WizardState): Promise<GenerateResponse> {
  // state already contains completedShapes — serialising the whole object is intentional
  return requestJson<GenerateResponse>('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
}

export function parseRdfFile(file: File): Promise<ParseResponse> {
  const formData = new FormData()
  formData.append('data_file', file)

  return requestJson<ParseResponse>('/api/parse-rdf', {
    method: 'POST',
    body: formData,
  })
}

export function parseRdfText(graphText: string): Promise<ParseResponse> {
  const formData = new FormData()
  formData.append('graph_text', graphText)
  formData.append('rdf_format', 'turtle')

  return requestJson<ParseResponse>('/api/parse-rdf', {
    method: 'POST',
    body: formData,
  })
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
