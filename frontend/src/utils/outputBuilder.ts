import type { WizardState, CompletedShape, PropertyShape, PropertyConstraints, SubShape } from '@/types'

// Well-known namespace URIs used to emit @prefix declarations for property
// paths that carry a foreign CURIE (e.g. "schema:name", "foaf:Person").
const WELL_KNOWN_NS: Record<string, string> = {
  rdf:     'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:    'http://www.w3.org/2000/01/rdf-schema#',
  owl:     'http://www.w3.org/2002/07/owl#',
  foaf:    'http://xmlns.com/foaf/0.1/',
  schema:  'https://schema.org/',
  dc:      'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  skos:    'http://www.w3.org/2004/02/skos/core#',
  dcat:    'http://www.w3.org/ns/dcat#',
  prov:    'http://www.w3.org/ns/prov#',
  vcard:   'http://www.w3.org/2006/vcard/ns#',
  void:    'http://rdfs.org/ns/void#',
  dbo:     'http://dbpedia.org/ontology/',
  dbp:     'http://dbpedia.org/property/',
  dbr:     'http://dbpedia.org/resource/',
  wd:      'http://www.wikidata.org/entity/',
  wdt:     'http://www.wikidata.org/prop/direct/',
  ub:      'http://swat.cse.lehigh.edu/onto/univ-bench.owl#',
  gn:      'http://www.geonames.org/ontology#',
}

const SH_NODE_KIND_NAMES = new Set(['Literal', 'IRI', 'BlankNode', 'BlankNodeOrIRI', 'BlankNodeOrLiteral', 'IRIOrLiteral'])

// Ensure sh:nodeKind values always carry the sh: prefix regardless of how they
// were stored (e.g. bare "Literal" from manual mode or "sh:Literal" from inferred constraints).
function shNodeKind(value: string): string {
  const bare = value.startsWith('sh:') ? value.slice(3) : value
  return SH_NODE_KIND_NAMES.has(bare) ? `sh:${bare}` : value
}

function anchorPattern(pattern: string): string {
  let p = pattern
  if (!p.startsWith('^')) p = '^' + p
  if (!p.endsWith('$') || (p.length >= 2 && p[p.length - 2] === '\\')) p = p + '$'
  return p
}

// Escape a free-text string for use inside a Turtle/quoted literal.
function ttlEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

// Escape a free-text string for use inside an XML text node.
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Unified shape data used internally by all builders
type ShapeSource = {
  shapeName:    string
  targetType:   string
  targetValue:  string
  properties:   PropertyShape[]
  shapeMessage?: string
  closed?:      boolean
  ignoredProperties?: string
}

type PrefixInfo = {
  prefix:    string   // e.g. 'ub'
  namespace: string   // e.g. 'http://swat.cse.lehigh.edu/onto/univ-bench.owl#'
}

function getPrefixInfo(state: WizardState): PrefixInfo {
  return {
    prefix:    state.selectedPrefix    || 'ex',
    namespace: state.selectedNamespace || 'http://example.org/',
  }
}

// Ensure the namespace ends with / or # for safe URI construction
function nsBase(ns: string): string {
  return ns.endsWith('/') || ns.endsWith('#') ? ns : ns + '/'
}

function toShapeSource(s: CompletedShape | WizardState): ShapeSource {
  return {
    shapeName:    s.shapeName,
    targetType:   s.targetType ?? '',
    targetValue:  s.targetValue,
    properties:   s.properties,
    shapeMessage: s.shapeMessage,
    closed:       s.closed,
    ignoredProperties: s.ignoredProperties,
  }
}

function allShapes(state: WizardState, completedShapes: CompletedShape[]): ShapeSource[] {
  return [...completedShapes.map(toShapeSource), toShapeSource(state)]
}

// ─── Prefix utilities ─────────────────────────────────────────────────────────

// Collect every foreign namespace prefix used across all shape property paths
// and constraint values, then return @prefix declaration lines for them.
function extraPrefixLines(
  shapes: ShapeSource[],
  mainPrefix: string,
  detectedPrefixes: Record<string, string>,
): string[] {
  const allNs = { ...WELL_KNOWN_NS, ...detectedPrefixes }
  const used = new Set<string>()

  const scan = (value: string) => {
    const m = value.match(/^([a-zA-Z][a-zA-Z0-9]*):[^/]/)
    if (m && m[1] !== 'sh' && m[1] !== 'xsd' && m[1] !== mainPrefix) {
      used.add(m[1])
    }
  }

  for (const shape of shapes) {
    if (shape.ignoredProperties) {
      shape.ignoredProperties.split(',').forEach(p => scan(p.trim()))
    }
    for (const prop of shape.properties) {
      scan(prop.path)
      const c = prop.constraints
      if (c.class) scan(c.class)
      if (c.node)  scan(c.node)
      if (c.equals)           scan(c.equals)
      if (c.disjoint)         scan(c.disjoint)
      if (c.lessThan)         scan(c.lessThan)
      if (c.lessThanOrEquals) scan(c.lessThanOrEquals)
    }
  }

  return [...used].sort().flatMap(pfx => {
    const uri = allNs[pfx]
    return uri ? [`@prefix ${pfx}: <${uri}> .`] : []
  })
}

// ─── Turtle ───────────────────────────────────────────────────────────────────

export function buildTurtle(state: WizardState, completedShapes: CompletedShape[] = []): string {
  const { prefix, namespace } = getPrefixInfo(state)
  const ns = nsBase(namespace)
  const shapes = allShapes(state, completedShapes)
  const extras = extraPrefixLines(shapes, prefix, state.detectedPrefixes)
  const lines: string[] = [
    '@prefix sh:  <http://www.w3.org/ns/shacl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    `@prefix ${prefix}: <${ns}> .`,
    ...extras,
  ]
  for (const shape of shapes) {
    lines.push('')
    lines.push(...buildShapeBlock(shape, prefix))
  }
  return lines.join('\n')
}

function buildShapeBlock(shape: ShapeSource, prefix: string): string[] {
  // If a value already carries its own CURIE prefix (e.g. "schema:jobTitle"),
  // use it as-is; otherwise prepend the selected namespace prefix.
  const p = (local: string) => local.includes(':') ? local : `${prefix}:${local}`
  const lines: string[] = [
    `${p(shape.shapeName)}`,
    '    a sh:NodeShape ;',
  ]

  if (shape.targetValue) {
    const map: Record<string, string> = {
      class:      'sh:targetClass',
      node:       'sh:targetNode',
      subjectsOf: 'sh:targetSubjectsOf',
      objectsOf:  'sh:targetObjectsOf',
    }
    lines.push(`    ${map[shape.targetType] ?? 'sh:targetClass'} ${p(shape.targetValue)} ;`)
  }

  // sh:message on the NodeShape - annotation only, not a validating constraint.
  if (shape.shapeMessage && shape.shapeMessage.trim()) {
    lines.push(`    sh:message "${ttlEscape(shape.shapeMessage.trim())}" ;`)
  }

  // sh:closed (+ sh:ignoredProperties) - NodeShape-level.
  if (shape.closed) {
    lines.push('    sh:closed true ;')
    const ignored = (shape.ignoredProperties ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (ignored.length > 0) {
      lines.push(`    sh:ignoredProperties ( ${ignored.map(p => p.includes(':') ? p : `${prefix}:${p}`).join(' ')} ) ;`)
    }
  }

  shape.properties.forEach((prop, idx) => {
    const isLast = idx === shape.properties.length - 1
    lines.push('    sh:property [')
    lines.push('        a sh:PropertyShape ;')
    lines.push(`        sh:path ${p(prop.path)} ;`)
    lines.push(...buildConstraintLines(prop.constraints, prefix))
    lines.push(`    ]${isLast ? ' .' : ' ;'}`)
  })

  if (shape.properties.length === 0) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(' ;', ' .')
  }

  return lines
}

// Serialise a one-level nested sub-shape as an inline Turtle blank node:
//   [ sh:datatype xsd:string ; sh:minInclusive 0 ]
function subShapeInline(sub: SubShape, prefix: string): string {
  const p = (local: string) => local.includes(':') ? local : `${prefix}:${local}`
  const parts: string[] = []
  if (sub.datatype)     parts.push(`sh:datatype ${sub.datatype}`)
  if (sub.nodeKind)     parts.push(`sh:nodeKind ${shNodeKind(sub.nodeKind)}`)
  if (sub.class)        parts.push(`sh:class ${p(sub.class)}`)
  if (sub.node)         parts.push(`sh:node ${sub.node.includes(':') ? sub.node : p(sub.node)}`)
  if (sub.pattern)      parts.push(`sh:pattern "${anchorPattern(sub.pattern)}"`)
  if (sub.minInclusive) parts.push(`sh:minInclusive ${sub.minInclusive}`)
  if (sub.maxInclusive) parts.push(`sh:maxInclusive ${sub.maxInclusive}`)
  if (sub.minExclusive) parts.push(`sh:minExclusive ${sub.minExclusive}`)
  if (sub.maxExclusive) parts.push(`sh:maxExclusive ${sub.maxExclusive}`)
  if (sub.minLength)    parts.push(`sh:minLength ${sub.minLength}`)
  if (sub.maxLength)    parts.push(`sh:maxLength ${sub.maxLength}`)
  if (sub.in)           parts.push(`sh:in ( ${sub.in.split(',').map((v: string) => `"${v.trim()}"`).join(' ')} )`)
  if (sub.hasValue)     parts.push(`sh:hasValue "${ttlEscape(sub.hasValue)}"`)
  if (sub.languageIn)   parts.push(`sh:languageIn ( ${sub.languageIn.split(',').map((t: string) => `"${t.trim()}"`).join(' ')} )`)
  return parts.length ? `[ ${parts.join(' ; ')} ]` : '[ ]'
}

// Serialise a sub-shape as a JSON-LD node object.
function subShapeJsonLd(sub: SubShape, prefix: string): Record<string, unknown> {
  const p = (local: string) => local.includes(':') ? local : `${prefix}:${local}`
  const obj: Record<string, unknown> = {}
  const nums = ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'] as const
  for (const k of nums) if (sub[k]) obj[`sh:${k}`] = { '@value': sub[k], '@type': 'xsd:decimal' }
  const ints = ['minLength', 'maxLength'] as const
  for (const k of ints) if (sub[k]) obj[`sh:${k}`] = { '@value': sub[k], '@type': 'xsd:integer' }
  if (sub.datatype)   obj['sh:datatype'] = { '@id': sub.datatype }
  if (sub.nodeKind)   obj['sh:nodeKind'] = { '@id': shNodeKind(sub.nodeKind) }
  if (sub.class)      obj['sh:class']    = { '@id': p(sub.class) }
  if (sub.node)       obj['sh:node']     = { '@id': sub.node.includes(':') ? sub.node : p(sub.node) }
  if (sub.pattern)    obj['sh:pattern']  = anchorPattern(sub.pattern)
  if (sub.in)         obj['sh:in'] = { '@list': sub.in.split(',').map((v: string) => v.trim()) }
  if (sub.hasValue)   obj['sh:hasValue'] = sub.hasValue
  if (sub.languageIn) obj['sh:languageIn'] = { '@list': sub.languageIn.split(',').map((t: string) => t.trim()) }
  return obj
}

function buildConstraintLines(c: PropertyConstraints, prefix: string): string[] {
  const p = (local: string) => local.includes(':') ? local : `${prefix}:${local}`
  const lines: string[] = []
  if (c.minCount)     lines.push(`        sh:minCount ${c.minCount} ;`)
  if (c.maxCount)     lines.push(`        sh:maxCount ${c.maxCount} ;`)
  if (c.datatype)     lines.push(`        sh:datatype ${c.datatype} ;`)
  if (c.nodeKind)     lines.push(`        sh:nodeKind ${shNodeKind(c.nodeKind)} ;`)
  if (c.pattern)      lines.push(`        sh:pattern "${anchorPattern(c.pattern)}" ;`)
  if (c.minInclusive) lines.push(`        sh:minInclusive ${c.minInclusive} ;`)
  if (c.maxInclusive) lines.push(`        sh:maxInclusive ${c.maxInclusive} ;`)
  if (c.minExclusive) lines.push(`        sh:minExclusive ${c.minExclusive} ;`)
  if (c.maxExclusive) lines.push(`        sh:maxExclusive ${c.maxExclusive} ;`)
  if (c.minLength)    lines.push(`        sh:minLength ${c.minLength} ;`)
  if (c.maxLength)    lines.push(`        sh:maxLength ${c.maxLength} ;`)
  if (c.class)        lines.push(`        sh:class ${p(c.class)} ;`)
  if (c.node) {
    // Preserve an already-qualified CURIE (e.g. typed manually); otherwise prefix it.
    const nodeRef = c.node.includes(':') ? c.node : p(c.node)
    lines.push(`        sh:node ${nodeRef} ;`)
  }
  if (c.in) {
    const values = c.in.split(',').map((v: string) => `"${v.trim()}"`).join(' ')
    lines.push(`        sh:in ( ${values} ) ;`)
  }
  if (c.languageIn) {
    const tags = c.languageIn.split(',').map((t: string) => `"${t.trim()}"`).join(' ')
    lines.push(`        sh:languageIn ( ${tags} ) ;`)
  }
  if (c.hasValue)   lines.push(`        sh:hasValue "${ttlEscape(c.hasValue)}" ;`)
  if (c.uniqueLang === 'true') lines.push('        sh:uniqueLang true ;')
  if (c.equals)           lines.push(`        sh:equals ${p(c.equals)} ;`)
  if (c.disjoint)         lines.push(`        sh:disjoint ${p(c.disjoint)} ;`)
  if (c.lessThan)         lines.push(`        sh:lessThan ${p(c.lessThan)} ;`)
  if (c.lessThanOrEquals) lines.push(`        sh:lessThanOrEquals ${p(c.lessThanOrEquals)} ;`)
  // Logical / qualified constraints (Phase 5) - one level of nested sub-shapes.
  const logicalList = (groups: SubShape[] | undefined): string =>
    (groups ?? []).map(g => subShapeInline(g, prefix)).join(' ')
  if (c.and && c.and.length)   lines.push(`        sh:and ( ${logicalList(c.and)} ) ;`)
  if (c.or && c.or.length)     lines.push(`        sh:or ( ${logicalList(c.or)} ) ;`)
  if (c.xone && c.xone.length) lines.push(`        sh:xone ( ${logicalList(c.xone)} ) ;`)
  if (c.not)                   lines.push(`        sh:not ${subShapeInline(c.not, prefix)} ;`)
  if (c.qualifiedValueShape) {
    lines.push(`        sh:qualifiedValueShape ${subShapeInline(c.qualifiedValueShape, prefix)} ;`)
    if (c.qualifiedMinCount) lines.push(`        sh:qualifiedMinCount ${c.qualifiedMinCount} ;`)
    if (c.qualifiedMaxCount) lines.push(`        sh:qualifiedMaxCount ${c.qualifiedMaxCount} ;`)
  }
  // sh:message - annotation only, not a validating constraint.
  if (c.message) lines.push(`        sh:message "${ttlEscape(c.message)}" ;`)
  return lines
}

// ─── JSON-LD ──────────────────────────────────────────────────────────────────

export function buildJsonLd(state: WizardState, completedShapes: CompletedShape[] = []): string {
  const { prefix, namespace } = getPrefixInfo(state)
  const ns = nsBase(namespace)
  const shapes = allShapes(state, completedShapes)
  const allNs = { ...WELL_KNOWN_NS, ...state.detectedPrefixes }
  const extraCtx: Record<string, string> = {}
  for (const pfxName of Object.keys(allNs)) {
    if (pfxName !== 'sh' && pfxName !== 'xsd' && pfxName !== prefix) {
      extraCtx[pfxName] = allNs[pfxName]
    }
  }
  const context = {
    sh:    'http://www.w3.org/ns/shacl#',
    xsd:   'http://www.w3.org/2001/XMLSchema#',
    [prefix]: ns,
    ...extraCtx,
  }

  if (shapes.length === 1) {
    const doc: Record<string, unknown> = { '@context': context, ...buildJsonLdShapeObj(shapes[0], prefix) }
    return JSON.stringify(doc, null, 2)
  }

  return JSON.stringify({
    '@context': context,
    '@graph':   shapes.map(s => buildJsonLdShapeObj(s, prefix)),
  }, null, 2)
}

function buildJsonLdShapeObj(shape: ShapeSource, prefix: string): Record<string, unknown> {
  const targetPredicateMap: Record<string, string> = {
    class:      'sh:targetClass',
    node:       'sh:targetNode',
    subjectsOf: 'sh:targetSubjectsOf',
    objectsOf:  'sh:targetObjectsOf',
  }
  const p = (local: string) => local.includes(':') ? local : `${prefix}:${local}`

  const obj: Record<string, unknown> = {
    '@id':   p(shape.shapeName),
    '@type': 'sh:NodeShape',
  }

  if (shape.targetValue) {
    const pred = targetPredicateMap[shape.targetType] ?? 'sh:targetClass'
    obj[pred] = { '@id': p(shape.targetValue) }
  }

  if (shape.shapeMessage && shape.shapeMessage.trim()) {
    obj['sh:message'] = shape.shapeMessage.trim()
  }

  if (shape.closed) {
    obj['sh:closed'] = { '@value': true, '@type': 'xsd:boolean' }
    const ignored = (shape.ignoredProperties ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (ignored.length > 0) {
      obj['sh:ignoredProperties'] = { '@list': ignored.map(p => ({ '@id': p.includes(':') ? p : `${prefix}:${p}` })) }
    }
  }

  obj['sh:property'] = shape.properties.map(prop => buildJsonLdProperty(prop, prefix))
  return obj
}

function buildJsonLdProperty(prop: PropertyShape, prefix: string): Record<string, unknown> {
  const c = prop.constraints
  const p = (local: string) => local.includes(':') ? local : `${prefix}:${local}`
  const obj: Record<string, unknown> = {
    '@type':   'sh:PropertyShape',
    'sh:path': { '@id': p(prop.path) },
  }

  const intProps = ['minCount', 'maxCount', 'minLength', 'maxLength'] as const
  for (const key of intProps) {
    if (c[key]) obj[`sh:${key}`] = { '@value': c[key], '@type': 'xsd:integer' }
  }

  const numProps = ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive'] as const
  for (const key of numProps) {
    if (c[key]) obj[`sh:${key}`] = { '@value': c[key], '@type': 'xsd:decimal' }
  }

  if (c.datatype) obj['sh:datatype'] = { '@id': c.datatype }
  if (c.nodeKind) obj['sh:nodeKind'] = { '@id': shNodeKind(c.nodeKind) }
  if (c.class)    obj['sh:class']    = { '@id': p(c.class) }
  if (c.pattern)  obj['sh:pattern']  = anchorPattern(c.pattern)

  if (c.in) {
    obj['sh:in'] = { '@list': c.in.split(',').map((v: string) => v.trim()) }
  }
  if (c.languageIn) {
    obj['sh:languageIn'] = { '@list': c.languageIn.split(',').map((t: string) => t.trim()) }
  }
  if (c.hasValue) obj['sh:hasValue'] = c.hasValue
  if (c.uniqueLang === 'true') obj['sh:uniqueLang'] = { '@value': true, '@type': 'xsd:boolean' }
  if (c.equals)           obj['sh:equals']           = { '@id': p(c.equals) }
  if (c.disjoint)         obj['sh:disjoint']         = { '@id': p(c.disjoint) }
  if (c.lessThan)         obj['sh:lessThan']         = { '@id': p(c.lessThan) }
  if (c.lessThanOrEquals) obj['sh:lessThanOrEquals'] = { '@id': p(c.lessThanOrEquals) }
  if (c.and && c.and.length)   obj['sh:and']  = { '@list': c.and.map((g: SubShape) => subShapeJsonLd(g, prefix)) }
  if (c.or && c.or.length)     obj['sh:or']   = { '@list': c.or.map((g: SubShape) => subShapeJsonLd(g, prefix)) }
  if (c.xone && c.xone.length) obj['sh:xone'] = { '@list': c.xone.map((g: SubShape) => subShapeJsonLd(g, prefix)) }
  if (c.not)                   obj['sh:not']  = subShapeJsonLd(c.not, prefix)
  if (c.qualifiedValueShape) {
    obj['sh:qualifiedValueShape'] = subShapeJsonLd(c.qualifiedValueShape, prefix)
    if (c.qualifiedMinCount) obj['sh:qualifiedMinCount'] = { '@value': c.qualifiedMinCount, '@type': 'xsd:integer' }
    if (c.qualifiedMaxCount) obj['sh:qualifiedMaxCount'] = { '@value': c.qualifiedMaxCount, '@type': 'xsd:integer' }
  }
  if (c.message) obj['sh:message'] = c.message

  return obj
}

// ─── RDF/XML ──────────────────────────────────────────────────────────────────

export function buildRdfXml(state: WizardState, completedShapes: CompletedShape[] = []): string {
  const { prefix, namespace } = getPrefixInfo(state)
  const ns = nsBase(namespace)
  const allNs = { ...WELL_KNOWN_NS, ...state.detectedPrefixes, [prefix]: ns }

  // Resolve a CURIE or bare local name to a full URI for use in rdf:resource.
  const toUri = (value: string): string => {
    const m = value.match(/^([a-zA-Z][a-zA-Z0-9]*):(.+)$/)
    if (m) {
      const nsUri = allNs[m[1]]
      if (nsUri) return nsUri + m[2]
      return value
    }
    return ns + value
  }

  const targetPredicateMap: Record<string, string> = {
    class:      'sh:targetClass',
    node:       'sh:targetNode',
    subjectsOf: 'sh:targetSubjectsOf',
    objectsOf:  'sh:targetObjectsOf',
  }

  // Collect xmlns declarations for all foreign prefixes used in property paths
  const shapes = allShapes(state, completedShapes)
  const xmlnsExtras: string[] = []
  const seenXmlns = new Set([prefix, 'rdf', 'sh', 'xsd'])
  for (const shape of shapes) {
    for (const prop of shape.properties) {
      const m = prop.path.match(/^([a-zA-Z][a-zA-Z0-9]*):/)
      if (m && !seenXmlns.has(m[1]) && allNs[m[1]]) {
        xmlnsExtras.push(`  xmlns:${m[1]}="${allNs[m[1]]}"`)
        seenXmlns.add(m[1])
      }
    }
  }

  const allXmlns = [
    '  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    '  xmlns:sh="http://www.w3.org/ns/shacl#"',
    '  xmlns:xsd="http://www.w3.org/2001/XMLSchema#"',
    `  xmlns:${prefix}="${ns}"`,
    ...xmlnsExtras,
  ]
  const xmlnsBlock = allXmlns.map((l, i) => i === allXmlns.length - 1 ? l + '>' : l)
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rdf:RDF',
    ...xmlnsBlock,
  ]

  for (const shape of shapes) {
    lines.push('')
    lines.push(`  <sh:NodeShape rdf:about="${ns}${shape.shapeName}">`)

    if (shape.targetValue) {
      const pred = targetPredicateMap[shape.targetType] ?? 'sh:targetClass'
      lines.push(`    <${pred} rdf:resource="${toUri(shape.targetValue)}"/>`)
    }

    if (shape.shapeMessage && shape.shapeMessage.trim()) {
      lines.push(`    <sh:message>${xmlEscape(shape.shapeMessage.trim())}</sh:message>`)
    }

    if (shape.closed) {
      lines.push('    <sh:closed rdf:datatype="http://www.w3.org/2001/XMLSchema#boolean">true</sh:closed>')
      const ignored = (shape.ignoredProperties ?? '').split(',').map(s => s.trim()).filter(Boolean)
      if (ignored.length > 0) {
        lines.push('    <sh:ignoredProperties rdf:parseType="Collection">')
        for (const p of ignored) lines.push(`      <rdf:Description rdf:about="${toUri(p)}"/>`)
        lines.push('    </sh:ignoredProperties>')
      }
    }

    for (const prop of shape.properties) {
      const c = prop.constraints
      lines.push('    <sh:property>')
      lines.push('      <sh:PropertyShape>')
      lines.push(`        <sh:path rdf:resource="${toUri(prop.path)}"/>`)
      if (c.message) lines.push(`        <sh:message>${xmlEscape(c.message)}</sh:message>`)
      if (c.minCount)     lines.push(`        <sh:minCount rdf:datatype="xsd:integer">${c.minCount}</sh:minCount>`)
      if (c.maxCount)     lines.push(`        <sh:maxCount rdf:datatype="xsd:integer">${c.maxCount}</sh:maxCount>`)
      if (c.datatype)     lines.push(`        <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#${c.datatype.replace('xsd:', '')}"/>`)
      if (c.nodeKind)     lines.push(`        <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#${c.nodeKind.replace('sh:', '')}"/>`)
      if (c.pattern)      lines.push(`        <sh:pattern>${anchorPattern(c.pattern)}</sh:pattern>`)
      if (c.minInclusive) lines.push(`        <sh:minInclusive>${c.minInclusive}</sh:minInclusive>`)
      if (c.maxInclusive) lines.push(`        <sh:maxInclusive>${c.maxInclusive}</sh:maxInclusive>`)
      if (c.minLength)    lines.push(`        <sh:minLength rdf:datatype="xsd:integer">${c.minLength}</sh:minLength>`)
      if (c.maxLength)    lines.push(`        <sh:maxLength rdf:datatype="xsd:integer">${c.maxLength}</sh:maxLength>`)
      if (c.hasValue)     lines.push(`        <sh:hasValue>${xmlEscape(c.hasValue)}</sh:hasValue>`)
      if (c.uniqueLang === 'true') lines.push('        <sh:uniqueLang rdf:datatype="http://www.w3.org/2001/XMLSchema#boolean">true</sh:uniqueLang>')
      if (c.equals)           lines.push(`        <sh:equals rdf:resource="${toUri(c.equals)}"/>`)
      if (c.disjoint)         lines.push(`        <sh:disjoint rdf:resource="${toUri(c.disjoint)}"/>`)
      if (c.lessThan)         lines.push(`        <sh:lessThan rdf:resource="${toUri(c.lessThan)}"/>`)
      if (c.lessThanOrEquals) lines.push(`        <sh:lessThanOrEquals rdf:resource="${toUri(c.lessThanOrEquals)}"/>`)
      lines.push('      </sh:PropertyShape>')
      lines.push('    </sh:property>')
    }

    lines.push('  </sh:NodeShape>')
  }

  lines.push('</rdf:RDF>')
  return lines.join('\n')
}

// ─── TriG ─────────────────────────────────────────────────────────────────────

export function buildTrig(state: WizardState, completedShapes: CompletedShape[] = []): string {
  const { prefix, namespace } = getPrefixInfo(state)
  const ns = nsBase(namespace)
  const shapes = allShapes(state, completedShapes)
  const extras = extraPrefixLines(shapes, prefix, state.detectedPrefixes)
  const bodyLines: string[] = []
  for (const shape of shapes) {
    if (bodyLines.length > 0) bodyLines.push('')
    bodyLines.push(...buildShapeBlock(shape, prefix))
  }
  const indented = bodyLines.map(l => '  ' + l).join('\n')

  return [
    '@prefix sh:  <http://www.w3.org/ns/shacl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    `@prefix ${prefix}: <${ns}> .`,
    ...extras,
    '',
    `${prefix}:ShapesGraph {`,
    indented,
    '}',
  ].join('\n')
}
