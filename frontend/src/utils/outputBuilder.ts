import type { WizardState, CompletedShape, PropertyShape, PropertyConstraints } from '@/types'

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

// Unified shape data used internally by all builders
type ShapeSource = {
  shapeName:   string
  targetType:  string
  targetValue: string
  properties:  PropertyShape[]
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
    shapeName:   s.shapeName,
    targetType:  s.targetType ?? '',
    targetValue: s.targetValue,
    properties:  s.properties,
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
    for (const prop of shape.properties) {
      scan(prop.path)
      const c = prop.constraints
      if (c.class) scan(c.class)
      if (c.node)  scan(c.node)
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

    for (const prop of shape.properties) {
      const c = prop.constraints
      lines.push('    <sh:property>')
      lines.push('      <sh:PropertyShape>')
      lines.push(`        <sh:path rdf:resource="${toUri(prop.path)}"/>`)
      if (c.minCount)     lines.push(`        <sh:minCount rdf:datatype="xsd:integer">${c.minCount}</sh:minCount>`)
      if (c.maxCount)     lines.push(`        <sh:maxCount rdf:datatype="xsd:integer">${c.maxCount}</sh:maxCount>`)
      if (c.datatype)     lines.push(`        <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#${c.datatype.replace('xsd:', '')}"/>`)
      if (c.nodeKind)     lines.push(`        <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#${c.nodeKind.replace('sh:', '')}"/>`)
      if (c.pattern)      lines.push(`        <sh:pattern>${anchorPattern(c.pattern)}</sh:pattern>`)
      if (c.minInclusive) lines.push(`        <sh:minInclusive>${c.minInclusive}</sh:minInclusive>`)
      if (c.maxInclusive) lines.push(`        <sh:maxInclusive>${c.maxInclusive}</sh:maxInclusive>`)
      if (c.minLength)    lines.push(`        <sh:minLength rdf:datatype="xsd:integer">${c.minLength}</sh:minLength>`)
      if (c.maxLength)    lines.push(`        <sh:maxLength rdf:datatype="xsd:integer">${c.maxLength}</sh:maxLength>`)
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
