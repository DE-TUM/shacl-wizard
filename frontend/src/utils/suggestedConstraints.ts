// Shared helper for consuming WizardState.suggestedConstraints (the tuple-
// with-source suggestion pool) at the point a suggestion is accepted into a
// property. The source tag only matters for merge precedence upstream (see
// UploadScreen's mergeSuggestedConstraints) - once accepted, a property's own
// `constraints` stays a plain bare-value PropertyConstraints object.

import type { PropertyConstraints, SuggestedConstraints } from '@/types'

export function unwrapSuggested(entry: SuggestedConstraints[string]): PropertyConstraints {
  const result: Record<string, string> = {}
  const bySource = entry as Record<string, { value: string; source: string } | undefined>
  for (const field of Object.keys(entry)) {
    const sourced = bySource[field]
    if (sourced) result[field] = sourced.value
  }
  return result as PropertyConstraints
}

// Single source of the "what should this property's suggested constraints be,
// given the shape's target class" precedence rule. A class-scoped owl:Restriction
// is more specific than the flat suggestion pool (which is never class-scoped),
// so it wins per field when present; otherwise falls back to whatever the flat
// pool already resolved to (itself already tagged 'ontology' or 'dataGraph' by
// UploadScreen's merge - this function doesn't need to know which).
// Used by both Step 2 (AI-NL merge) and Step 3 (pill/manual add), so the same
// class-scoped behavior applies no matter how a property enters the shape.
export function lookupSuggestedConstraint(
  suggestedConstraints: SuggestedConstraints,
  ontologyConstraintsByClass: Record<string, Record<string, Partial<PropertyConstraints>>>,
  targetClass: string,
  propertyPath: string,
): SuggestedConstraints[string] {
  const flat = suggestedConstraints[propertyPath] ?? {}
  const classScoped = ontologyConstraintsByClass[targetClass]?.[propertyPath]
  if (!classScoped) return flat

  const fields = new Set([...Object.keys(flat), ...Object.keys(classScoped)]) as Set<keyof PropertyConstraints>
  const scopedBySource = classScoped as Record<string, string | undefined>
  const merged: SuggestedConstraints[string] = {}
  for (const field of fields) {
    const scopedValue = scopedBySource[field as string]
    if (typeof scopedValue === 'string' && scopedValue !== '') {
      merged[field] = { value: scopedValue, source: 'ontology' }
    } else if (flat[field]) {
      merged[field] = flat[field]
    }
  }
  return merged
}
