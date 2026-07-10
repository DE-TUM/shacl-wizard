// Cross-field validation for the Step 4 constraint editor.
//
// SHACL does not forbid writing an unsatisfiable shape, so these checks NEVER
// block the user - they only surface a warning explaining why a combination can
// never be satisfied (or is redundant). The audit behind this lives in the
// project's Phase 0.5 notes; each case is tagged with its audit id (C#/R#).
//
// New detectors are added as later phases introduce the fields they need.

import type { PropertyConstraints } from '@/types'

export type IssueLevel = 'contradiction' | 'redundant'

export interface ConstraintIssue {
  id:      string                        // audit id, e.g. 'C2'
  level:   IssueLevel
  fields:  (keyof PropertyConstraints)[] // fields involved (for section markers)
  message: string                        // short, shown inline
  why:     string                        // plain-language explanation (tooltip)
}

// Parse a stored string value to a number, or null when blank / non-numeric.
function num(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value.trim() === '') return null
  const n = Number(value.trim())
  return Number.isNaN(n) ? null : n
}

// nodeKind is stored as 'sh:IRI' | 'sh:BlankNode' | 'sh:Literal' (manual mode)
// but inference may leave a bare 'IRI'. Normalise before comparing.
function bareNodeKind(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.startsWith('sh:') ? value.slice(3) : value
}

// Two property paths refer to the same property (targets come from a dropdown
// of exact paths, so a trimmed string comparison is exact).
function samePath(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim() === b.trim()
}

export function detectConstraintIssues(c: PropertyConstraints, ownPath?: string): ConstraintIssue[] {
  const issues: ConstraintIssue[] = []
  const nk = bareNodeKind(c.nodeKind)

  // ── C1: minCount > maxCount ──────────────────────────────────────────────
  const minC = num(c.minCount)
  const maxC = num(c.maxCount)
  if (minC !== null && maxC !== null && minC > maxC) {
    issues.push({
      id: 'C1', level: 'contradiction', fields: ['minCount', 'maxCount'],
      message: `minCount (${minC}) is greater than maxCount (${maxC})`,
      why: 'A property cannot be required to have more values than it is allowed to have, so no node could ever satisfy both.',
    })
  }

  // ── C2: numeric lower bound > upper bound (any inclusive/exclusive mix) ───
  const lowers = [
    num(c.minInclusive) !== null ? { v: num(c.minInclusive)!, strict: false, field: 'minInclusive' as const, sym: '≥' } : null,
    num(c.minExclusive) !== null ? { v: num(c.minExclusive)!, strict: true,  field: 'minExclusive' as const, sym: '>' } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null)
  const uppers = [
    num(c.maxInclusive) !== null ? { v: num(c.maxInclusive)!, strict: false, field: 'maxInclusive' as const, sym: '≤' } : null,
    num(c.maxExclusive) !== null ? { v: num(c.maxExclusive)!, strict: true,  field: 'maxExclusive' as const, sym: '<' } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null)
  for (const lo of lowers) {
    for (const up of uppers) {
      const impossible = lo.v > up.v || (lo.v === up.v && (lo.strict || up.strict))
      if (impossible) {
        issues.push({
          id: 'C2', level: 'contradiction', fields: [lo.field, up.field],
          message: `no value can be ${lo.sym} ${lo.v} and ${up.sym} ${up.v}`,
          why: 'The lower bound is above (or equal to, with a strict bound) the upper bound, so the allowed numeric range is empty.',
        })
      }
    }
  }

  // ── R1: two bounds on the same side ──────────────────────────────────────
  if (num(c.minInclusive) !== null && num(c.minExclusive) !== null) {
    issues.push({
      id: 'R1', level: 'redundant', fields: ['minInclusive', 'minExclusive'],
      message: 'both minInclusive and minExclusive are set',
      why: 'Only one lower bound takes effect; the other is redundant and makes the intended minimum ambiguous to readers.',
    })
  }
  if (num(c.maxInclusive) !== null && num(c.maxExclusive) !== null) {
    issues.push({
      id: 'R1', level: 'redundant', fields: ['maxInclusive', 'maxExclusive'],
      message: 'both maxInclusive and maxExclusive are set',
      why: 'Only one upper bound takes effect; the other is redundant and makes the intended maximum ambiguous to readers.',
    })
  }

  // ── C3: minLength > maxLength ────────────────────────────────────────────
  const minL = num(c.minLength)
  const maxL = num(c.maxLength)
  if (minL !== null && maxL !== null && minL > maxL) {
    issues.push({
      id: 'C3', level: 'contradiction', fields: ['minLength', 'maxLength'],
      message: `minLength (${minL}) is greater than maxLength (${maxL})`,
      why: 'No string can be both at least minLength and at most maxLength characters when the minimum exceeds the maximum.',
    })
  }

  // ── C4 / C5: datatype vs nodeKind IRI/BlankNode ──────────────────────────
  if (c.datatype && nk === 'IRI') {
    issues.push({
      id: 'C4', level: 'contradiction', fields: ['datatype', 'nodeKind'],
      message: 'datatype requires a literal but nodeKind is IRI',
      why: 'A datatype only applies to literal values, but sh:nodeKind sh:IRI requires the value to be an IRI - a term cannot be both.',
    })
  }
  if (c.datatype && nk === 'BlankNode') {
    issues.push({
      id: 'C5', level: 'contradiction', fields: ['datatype', 'nodeKind'],
      message: 'datatype requires a literal but nodeKind is Blank node',
      why: 'A datatype only applies to literal values, but sh:nodeKind sh:BlankNode requires a blank node - a term cannot be both.',
    })
  }

  // ── C6 / C7: sh:class vs datatype / nodeKind Literal ─────────────────────
  if (c.class && c.datatype) {
    issues.push({
      id: 'C6', level: 'contradiction', fields: ['class', 'datatype'],
      message: 'class requires a resource but datatype requires a literal',
      why: 'sh:class requires the value to be a class instance (a resource), while sh:datatype requires it to be a literal - no value is both.',
    })
  }
  if (c.class && nk === 'Literal') {
    issues.push({
      id: 'C7', level: 'contradiction', fields: ['class', 'nodeKind'],
      message: 'class requires a resource but nodeKind is Literal',
      why: 'A literal cannot be an rdf:type instance of a class, so sh:class with sh:nodeKind sh:Literal can never be satisfied.',
    })
  }

  // ── C8: sh:node vs datatype / nodeKind Literal ───────────────────────────
  if (c.node && c.datatype) {
    issues.push({
      id: 'C8', level: 'contradiction', fields: ['node', 'datatype'],
      message: 'node requires a resource but datatype requires a literal',
      why: 'Conforming to a referenced NodeShape requires a resource with properties; a literal cannot conform, so it clashes with sh:datatype.',
    })
  }
  if (c.node && nk === 'Literal') {
    issues.push({
      id: 'C8', level: 'contradiction', fields: ['node', 'nodeKind'],
      message: 'node requires a resource but nodeKind is Literal',
      why: 'Conforming to a referenced NodeShape requires a resource; a literal value cannot satisfy sh:node.',
    })
  }

  // ── C14: languageIn vs nodeKind IRI/BlankNode ────────────────────────────
  if (c.languageIn && (nk === 'IRI' || nk === 'BlankNode')) {
    issues.push({
      id: 'C14', level: 'contradiction', fields: ['languageIn', 'nodeKind'],
      message: `languageIn requires a language-tagged literal but nodeKind is ${nk}`,
      why: 'Language tags exist only on literals, so restricting the language while requiring an IRI or blank node can never be satisfied.',
    })
  }

  // ── R4: languageIn + a non-langString datatype ───────────────────────────
  if (c.languageIn && c.datatype && c.datatype !== 'rdf:langString') {
    issues.push({
      id: 'R4', level: 'redundant', fields: ['languageIn', 'datatype'],
      message: `languageIn with datatype ${c.datatype} is usually a mistake`,
      why: 'Language-tagged strings have the datatype rdf:langString, not ' + c.datatype + ', so this pairing typically excludes every value you meant to allow.',
    })
  }

  // ── C9: hasValue not present in the sh:in allowed list ───────────────────
  if (c.hasValue && c.in) {
    const list = c.in.split(',').map((v: string) => v.trim()).filter(Boolean)
    if (list.length > 0 && !list.includes(c.hasValue.trim())) {
      issues.push({
        id: 'C9', level: 'contradiction', fields: ['hasValue', 'in'],
        message: `hasValue "${c.hasValue.trim()}" is not in the allowed list`,
        why: 'sh:hasValue requires this exact value to be present, but sh:in forbids any value outside its list - so the mandatory value is itself disallowed.',
      })
    }
  }

  // ── C10: hasValue violates the property's own datatype / range / pattern ──
  if (c.hasValue) {
    const hv = c.hasValue.trim()
    const hvNum = num(hv)
    if (hvNum !== null) {
      const bad =
        (num(c.minInclusive) !== null && hvNum < num(c.minInclusive)!) ||
        (num(c.minExclusive) !== null && hvNum <= num(c.minExclusive)!) ||
        (num(c.maxInclusive) !== null && hvNum > num(c.maxInclusive)!) ||
        (num(c.maxExclusive) !== null && hvNum >= num(c.maxExclusive)!)
      if (bad) {
        issues.push({
          id: 'C10', level: 'contradiction', fields: ['hasValue', 'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'],
          message: `hasValue ${hv} falls outside the allowed numeric range`,
          why: 'sh:hasValue requires this exact value, but it lies outside the min/max range set on the same property, so no value can satisfy both.',
        })
      }
    }
    // datatype mismatch (clear cases only)
    if (c.datatype === 'xsd:integer' && !/^[+-]?\d+$/.test(hv)) {
      issues.push({
        id: 'C10', level: 'contradiction', fields: ['hasValue', 'datatype'],
        message: `hasValue "${hv}" is not a valid integer`,
        why: 'sh:hasValue requires this exact value, but it is not a valid xsd:integer, so it can never satisfy the datatype constraint.',
      })
    } else if (c.datatype === 'xsd:decimal' && hvNum === null) {
      issues.push({
        id: 'C10', level: 'contradiction', fields: ['hasValue', 'datatype'],
        message: `hasValue "${hv}" is not a valid decimal`,
        why: 'sh:hasValue requires this exact value, but it is not a valid xsd:decimal number.',
      })
    } else if (c.datatype === 'xsd:boolean' && !/^(true|false|0|1)$/.test(hv)) {
      issues.push({
        id: 'C10', level: 'contradiction', fields: ['hasValue', 'datatype'],
        message: `hasValue "${hv}" is not a valid boolean`,
        why: 'sh:hasValue requires this exact value, but it is not true/false, so it cannot satisfy the xsd:boolean datatype.',
      })
    }
    // pattern mismatch
    if (c.pattern) {
      let anchored = c.pattern
      if (!anchored.startsWith('^')) anchored = '^' + anchored
      if (!anchored.endsWith('$') || (anchored.length >= 2 && anchored[anchored.length - 2] === '\\')) anchored += '$'
      try {
        if (!new RegExp(anchored).test(hv)) {
          issues.push({
            id: 'C10', level: 'contradiction', fields: ['hasValue', 'pattern'],
            message: `hasValue "${hv}" does not match the required pattern`,
            why: 'sh:hasValue requires this exact value, but it fails the sh:pattern regex on the same property, so no value can satisfy both.',
          })
        }
      } catch {
        // Invalid regex - skip; the pattern field itself is the user's concern.
      }
    }
  }

  // ── R3: uniqueLang with maxCount 1 ───────────────────────────────────────
  if (c.uniqueLang === 'true' && num(c.maxCount) === 1) {
    issues.push({
      id: 'R3', level: 'redundant', fields: ['uniqueLang', 'maxCount'],
      message: 'uniqueLang has no effect when maxCount is 1',
      why: 'sh:uniqueLang only matters when a property can hold several values; with at most one value there can never be a duplicate language tag.',
    })
  }

  // ── Property-pair constraints (Phase 4) ──────────────────────────────────
  // C11: equals & disjoint on the same target property.
  if (samePath(c.equals, c.disjoint)) {
    issues.push({
      id: 'C11', level: 'contradiction', fields: ['equals', 'disjoint'],
      message: `equals and disjoint both target ${c.equals}`,
      why: 'sh:equals requires identical value sets while sh:disjoint requires no shared value, so both can only hold when the property has no values at all.',
    })
  }
  // C12: equals & lessThan on the same target property.
  if (samePath(c.equals, c.lessThan)) {
    issues.push({
      id: 'C12', level: 'contradiction', fields: ['equals', 'lessThan'],
      message: `equals and lessThan both target ${c.equals}`,
      why: 'A value cannot be equal to and strictly less than the same value, so sh:equals and sh:lessThan on the same property can never both hold.',
    })
  }
  // C13: lessThan / disjoint referencing this property's own path.
  if (samePath(c.lessThan, ownPath)) {
    issues.push({
      id: 'C13', level: 'contradiction', fields: ['lessThan'],
      message: 'lessThan points at this property itself',
      why: 'A value cannot be strictly less than itself, so comparing the property to its own path can never be satisfied.',
    })
  }
  if (samePath(c.disjoint, ownPath)) {
    issues.push({
      id: 'C13', level: 'contradiction', fields: ['disjoint'],
      message: 'disjoint points at this property itself',
      why: 'A non-empty set always shares its values with itself, so a property cannot be disjoint from its own path.',
    })
  }
  // R2: lessThan & lessThanOrEquals on the same target property.
  if (samePath(c.lessThan, c.lessThanOrEquals)) {
    issues.push({
      id: 'R2', level: 'redundant', fields: ['lessThan', 'lessThanOrEquals'],
      message: `lessThan and lessThanOrEquals both target ${c.lessThan}`,
      why: 'sh:lessThan already implies sh:lessThanOrEquals for the same property, so the weaker one is redundant.',
    })
  }
  // R5: equals / lessThanOrEquals referencing this property's own path.
  if (samePath(c.equals, ownPath)) {
    issues.push({
      id: 'R5', level: 'redundant', fields: ['equals'],
      message: 'equals points at this property itself',
      why: 'A property always equals itself, so this constraint is trivially satisfied and has no effect.',
    })
  }
  if (samePath(c.lessThanOrEquals, ownPath)) {
    issues.push({
      id: 'R5', level: 'redundant', fields: ['lessThanOrEquals'],
      message: 'lessThanOrEquals points at this property itself',
      why: 'Every value is less than or equal to itself, so this constraint is trivially satisfied and has no effect.',
    })
  }
  // R6 (new in Phase 4): lessThan & disjoint on the same target - disjoint is
  // implied by lessThan (a<b means a≠b), so it is redundant.
  if (samePath(c.lessThan, c.disjoint)) {
    issues.push({
      id: 'R6', level: 'redundant', fields: ['lessThan', 'disjoint'],
      message: `disjoint is redundant with lessThan (both target ${c.lessThan})`,
      why: 'sh:lessThan already guarantees the values differ from the target, so sh:disjoint on the same property adds nothing.',
    })
  }
  // R7 (new in Phase 4): equals & lessThanOrEquals on the same target - implied
  // by equals (a=b means a≤b), so lessThanOrEquals is redundant.
  if (samePath(c.equals, c.lessThanOrEquals)) {
    issues.push({
      id: 'R7', level: 'redundant', fields: ['equals', 'lessThanOrEquals'],
      message: `lessThanOrEquals is redundant with equals (both target ${c.equals})`,
      why: 'sh:equals forces identical values, which already satisfies sh:lessThanOrEquals on the same property.',
    })
  }

  // ── C15 (Phase 5): qualifiedMinCount > qualifiedMaxCount ─────────────────
  const qMin = num(c.qualifiedMinCount)
  const qMax = num(c.qualifiedMaxCount)
  if (qMin !== null && qMax !== null && qMin > qMax) {
    issues.push({
      id: 'C15', level: 'contradiction', fields: ['qualifiedMinCount', 'qualifiedMaxCount'],
      message: `qualifiedMinCount (${qMin}) is greater than qualifiedMaxCount (${qMax})`,
      why: 'The shape requires more conforming values than it allows, so no data can ever satisfy the qualified cardinality.',
    })
  }

  return issues
}
