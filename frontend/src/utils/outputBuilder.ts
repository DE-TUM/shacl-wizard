import type { WizardState, CompletedShape, PropertyShape, PropertyConstraints } from '@/types'

// Unified shape data used internally by all builders
type ShapeSource = {
  shapeName:   string
  targetType:  string
  targetValue: string
  properties:  PropertyShape[]
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

// ─── Turtle ───────────────────────────────────────────────────────────────────

export function buildTurtle(state: WizardState, completedShapes: CompletedShape[] = []): string {
  const lines: string[] = [
    '@prefix sh:  <http://www.w3.org/ns/shacl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '@prefix ex:  <http://example.org/> .',
  ]
  for (const shape of allShapes(state, completedShapes)) {
    lines.push('')
    lines.push(...buildShapeBlock(shape))
  }
  return lines.join('\n')
}

function buildShapeBlock(shape: ShapeSource): string[] {
  const lines: string[] = [
    `ex:${shape.shapeName}`,
    '    a sh:NodeShape ;',
  ]

  if (shape.targetValue) {
    const map: Record<string, string> = {
      class:      'sh:targetClass',
      node:       'sh:targetNode',
      subjectsOf: 'sh:targetSubjectsOf',
      objectsOf:  'sh:targetObjectsOf',
    }
    lines.push(`    ${map[shape.targetType] ?? 'sh:targetClass'} ex:${shape.targetValue} ;`)
  }

  shape.properties.forEach((prop, idx) => {
    const isLast = idx === shape.properties.length - 1
    lines.push('    sh:property [')
    lines.push('        a sh:PropertyShape ;')
    lines.push(`        sh:path ex:${prop.path} ;`)
    lines.push(...buildConstraintLines(prop.constraints))
    lines.push(`    ]${isLast ? ' .' : ' ;'}`)
  })

  if (shape.properties.length === 0) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(' ;', ' .')
  }

  return lines
}

function buildConstraintLines(c: PropertyConstraints): string[] {
  const lines: string[] = []
  if (c.minCount)     lines.push(`        sh:minCount ${c.minCount} ;`)
  if (c.maxCount)     lines.push(`        sh:maxCount ${c.maxCount} ;`)
  if (c.datatype)     lines.push(`        sh:datatype ${c.datatype} ;`)
  if (c.nodeKind)     lines.push(`        sh:nodeKind ${c.nodeKind} ;`)
  if (c.pattern)      lines.push(`        sh:pattern "${c.pattern}" ;`)
  if (c.minInclusive) lines.push(`        sh:minInclusive ${c.minInclusive} ;`)
  if (c.maxInclusive) lines.push(`        sh:maxInclusive ${c.maxInclusive} ;`)
  if (c.minExclusive) lines.push(`        sh:minExclusive ${c.minExclusive} ;`)
  if (c.maxExclusive) lines.push(`        sh:maxExclusive ${c.maxExclusive} ;`)
  if (c.minLength)    lines.push(`        sh:minLength ${c.minLength} ;`)
  if (c.maxLength)    lines.push(`        sh:maxLength ${c.maxLength} ;`)
  if (c.class)        lines.push(`        sh:class ex:${c.class} ;`)
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
  const shapes = allShapes(state, completedShapes)
  const context = {
    sh:  'http://www.w3.org/ns/shacl#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    ex:  'http://example.org/',
  }

  if (shapes.length === 1) {
    const doc: Record<string, unknown> = { '@context': context, ...buildJsonLdShapeObj(shapes[0]) }
    return JSON.stringify(doc, null, 2)
  }

  return JSON.stringify({
    '@context': context,
    '@graph':   shapes.map(buildJsonLdShapeObj),
  }, null, 2)
}

function buildJsonLdShapeObj(shape: ShapeSource): Record<string, unknown> {
  const targetPredicateMap: Record<string, string> = {
    class:      'sh:targetClass',
    node:       'sh:targetNode',
    subjectsOf: 'sh:targetSubjectsOf',
    objectsOf:  'sh:targetObjectsOf',
  }

  const obj: Record<string, unknown> = {
    '@id':   `ex:${shape.shapeName}`,
    '@type': 'sh:NodeShape',
  }

  if (shape.targetValue) {
    const pred = targetPredicateMap[shape.targetType] ?? 'sh:targetClass'
    obj[pred] = { '@id': `ex:${shape.targetValue}` }
  }

  obj['sh:property'] = shape.properties.map(buildJsonLdProperty)
  return obj
}

function buildJsonLdProperty(prop: PropertyShape): Record<string, unknown> {
  const c = prop.constraints
  const obj: Record<string, unknown> = {
    '@type':   'sh:PropertyShape',
    'sh:path': { '@id': `ex:${prop.path}` },
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
  if (c.nodeKind) obj['sh:nodeKind'] = { '@id': c.nodeKind }
  if (c.class)    obj['sh:class']    = { '@id': `ex:${c.class}` }
  if (c.pattern)  obj['sh:pattern']  = c.pattern

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
  const targetPredicateMap: Record<string, string> = {
    class:      'sh:targetClass',
    node:       'sh:targetNode',
    subjectsOf: 'sh:targetSubjectsOf',
    objectsOf:  'sh:targetObjectsOf',
  }

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rdf:RDF',
    '  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    '  xmlns:sh="http://www.w3.org/ns/shacl#"',
    '  xmlns:xsd="http://www.w3.org/2001/XMLSchema#"',
    '  xmlns:ex="http://example.org/">',
  ]

  for (const shape of allShapes(state, completedShapes)) {
    lines.push('')
    lines.push(`  <sh:NodeShape rdf:about="http://example.org/${shape.shapeName}">`)

    if (shape.targetValue) {
      const pred = targetPredicateMap[shape.targetType] ?? 'sh:targetClass'
      lines.push(`    <${pred} rdf:resource="http://example.org/${shape.targetValue}"/>`)
    }

    for (const prop of shape.properties) {
      const c = prop.constraints
      lines.push('    <sh:property>')
      lines.push('      <sh:PropertyShape>')
      lines.push(`        <sh:path rdf:resource="http://example.org/${prop.path}"/>`)
      if (c.minCount)     lines.push(`        <sh:minCount rdf:datatype="xsd:integer">${c.minCount}</sh:minCount>`)
      if (c.maxCount)     lines.push(`        <sh:maxCount rdf:datatype="xsd:integer">${c.maxCount}</sh:maxCount>`)
      if (c.datatype)     lines.push(`        <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#${c.datatype.replace('xsd:', '')}"/>`)
      if (c.nodeKind)     lines.push(`        <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#${c.nodeKind.replace('sh:', '')}"/>`)
      if (c.pattern)      lines.push(`        <sh:pattern>${c.pattern}</sh:pattern>`)
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
  const bodyLines: string[] = []
  for (const shape of allShapes(state, completedShapes)) {
    if (bodyLines.length > 0) bodyLines.push('')
    bodyLines.push(...buildShapeBlock(shape))
  }
  const indented = bodyLines.map(l => '  ' + l).join('\n')

  return [
    '@prefix sh:  <http://www.w3.org/ns/shacl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '@prefix ex:  <http://example.org/> .',
    '',
    'ex:ShapesGraph {',
    indented,
    '}',
  ].join('\n')
}
