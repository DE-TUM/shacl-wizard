from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from rdflib import BNode, Dataset, Graph, Literal, Namespace, URIRef
from rdflib.collection import Collection
from rdflib.namespace import OWL, RDF, RDFS, SH, XSD

from app.models import CompletedShape, PropertyConstraints, PropertyShape, WizardState


def build_shapes_response(state: WizardState, base_uri: str, prefix: str = "ex") -> tuple[dict[str, str], str, list[str]]:
    detected = dict(state.detected_prefixes)
    graph, shape_uri = build_shapes_graph(state, base_uri, prefix)
    formats = serialize_shapes_graph(graph, base_uri, prefix, detected)
    total = 1 + len(state.completed_shapes)
    summary = [
        f"Generated {total} NodeShape{'s' if total > 1 else ''}: {shape_uri}.",
        f"Added {len(state.properties)} propert{'y' if len(state.properties) == 1 else 'ies'} to {state.shape_name}.",
        "Produced Turtle, JSON-LD, RDF/XML, and TriG serializations.",
    ]
    return formats, shape_uri, summary


def build_shapes_graph(state: WizardState, base_uri: str, prefix: str = "ex") -> tuple[Graph, str]:
    if not state.shape_name.strip():
        raise ValueError("shapeName is required")

    detected = dict(state.detected_prefixes)
    graph = Graph()
    _bind_namespaces(graph, base_uri, prefix, detected)

    for cs in state.completed_shapes:
        _add_shape_to_graph(
            graph, cs.shape_name, cs.target_type, cs.target_value, cs.properties, base_uri, prefix, detected
        )

    shape_uri = _add_shape_to_graph(
        graph, state.shape_name, state.target_type, state.target_value, state.properties, base_uri, prefix, detected
    )
    return graph, str(shape_uri)


def _add_shape_to_graph(
    graph: Graph,
    shape_name: str,
    target_type: str | None,
    target_value: str,
    properties: list[PropertyShape],
    base_uri: str,
    prefix: str = "ex",
    detected_prefixes: dict[str, str] | None = None,
) -> URIRef:
    shape = _resource(shape_name, base_uri, prefix, detected_prefixes)
    graph.add((shape, RDF.type, SH.NodeShape))

    if target_type and target_value.strip():
        target_predicate = {
            "class": SH.targetClass,
            "node": SH.targetNode,
            "subjectsOf": SH.targetSubjectsOf,
            "objectsOf": SH.targetObjectsOf,
        }.get(target_type, SH.targetClass)
        graph.add((shape, target_predicate, _resource(target_value, base_uri, prefix, detected_prefixes)))

    for prop in properties:
        if not prop.path.strip():
            continue
        prop_node = BNode()
        graph.add((shape, SH.property, prop_node))
        graph.add((prop_node, RDF.type, SH.PropertyShape))
        graph.add((prop_node, SH.path, _resource(prop.path, base_uri, prefix, detected_prefixes)))
        _add_constraints(graph, prop_node, prop.constraints, base_uri, prefix, detected_prefixes)

    return shape


def serialize_shapes_graph(
    graph: Graph,
    base_uri: str,
    prefix: str = "ex",
    detected_prefixes: dict[str, str] | None = None,
) -> dict[str, str]:
    return {
        "turtle": _serialize(graph, "turtle"),
        "jsonld": _serialize_as_jsonld(graph, base_uri, prefix, detected_prefixes),
        "rdfxml": _serialize(graph, "xml"),
        "trig":   _serialize_as_trig(graph, base_uri, prefix, detected_prefixes),
    }


_SH_NODE_KINDS = frozenset([
    "Literal", "IRI", "BlankNode",
    "BlankNodeOrIRI", "BlankNodeOrLiteral", "IRIOrLiteral",
])


def _resolve_node_kind(value: str) -> URIRef:
    bare = value[3:] if value.startswith("sh:") else value
    if bare in _SH_NODE_KINDS:
        return SH[bare]
    return URIRef(value)


def _add_constraints(
    graph: Graph,
    subject: BNode,
    c: PropertyConstraints,
    base_uri: str,
    prefix: str = "ex",
    detected_prefixes: dict[str, str] | None = None,
) -> None:
    _add_int(graph, subject, SH.minCount, c.min_count, "minCount")
    _add_int(graph, subject, SH.maxCount, c.max_count, "maxCount")
    _add_int(graph, subject, SH.minLength, c.min_length, "minLength")
    _add_int(graph, subject, SH.maxLength, c.max_length, "maxLength")

    _add_numeric(graph, subject, SH.minInclusive, c.min_inclusive, "minInclusive", c.datatype)
    _add_numeric(graph, subject, SH.maxInclusive, c.max_inclusive, "maxInclusive", c.datatype)
    _add_numeric(graph, subject, SH.minExclusive, c.min_exclusive, "minExclusive", c.datatype)
    _add_numeric(graph, subject, SH.maxExclusive, c.max_exclusive, "maxExclusive", c.datatype)

    if c.datatype:
        graph.add((subject, SH.datatype, _curie_or_uri(c.datatype, base_uri, prefix, detected_prefixes=detected_prefixes)))
    if c.node_kind:
        graph.add((subject, SH.nodeKind, _resolve_node_kind(c.node_kind)))
    if c.pattern:
        graph.add((subject, SH.pattern, Literal(_anchor_pattern(c.pattern))))
    if c.class_:
        graph.add((subject, SH["class"], _resource(c.class_, base_uri, prefix, detected_prefixes)))
    if c.node_:
        graph.add((subject, SH.node, _resource(c.node_, base_uri, prefix, detected_prefixes)))
    if c.in_:
        _add_rdf_list(graph, subject, SH["in"], [Literal(item) for item in _split_in_values(c.in_)])


def _add_int(graph: Graph, subject: BNode, predicate: URIRef, value: str | None, label: str) -> None:
    if value is None:
        return
    try:
        literal = Literal(int(value), datatype=XSD.integer)
    except ValueError as exc:
        raise ValueError(f"{label} must be an integer") from exc
    graph.add((subject, predicate, literal))


def _add_numeric(graph: Graph, subject: BNode, predicate: URIRef, value: str | None, label: str, datatype: str | None = None) -> None:
    if value is None:
        return
    try:
        if _is_integer_datatype(datatype):
            literal = Literal(int(value), datatype=XSD.integer)
        else:
            literal = Literal(Decimal(value), datatype=XSD.decimal)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{label} must be a number") from exc
    graph.add((subject, predicate, literal))


def _is_integer_datatype(datatype: str | None) -> bool:
    if not datatype:
        return False
    return datatype.strip() in {"xsd:integer", str(XSD.integer)}


def _add_rdf_list(graph: Graph, subject: BNode, predicate: URIRef, values: list[Literal]) -> None:
    if not values:
        return
    head = BNode()
    Collection(graph, head, values)
    graph.add((subject, predicate, head))


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _split_in_values(value: str) -> list[str]:
    if "," in value:
        parts = value.split(",")
    else:
        parts = re.findall(r'"[^"]*"|\'[^\']*\'|\S+', value)
    return [p.strip().strip("\"'") for p in parts if p.strip().strip("\"'")]


def _bind_namespaces(
    graph: Graph | Dataset,
    base_uri: str,
    prefix: str = "ex",
    detected_prefixes: dict[str, str] | None = None,
) -> None:
    graph.bind("sh", SH)
    graph.bind("xsd", XSD)
    graph.bind("rdf", RDF)
    graph.bind("rdfs", RDFS)
    graph.bind("owl", OWL)
    # If the selected prefix is also in detected_prefixes, use the file-declared
    # namespace rather than base_uri (which may come from COMMON_PREFIXES and use
    # a different http/https variant).
    _dp = detected_prefixes or {}
    effective_ns = _dp.get(prefix) or _base(base_uri)
    # replace=True removes any existing RDFLib built-in binding for the same prefix
    # (e.g. schema → https://schema.org/) before adding the file-declared one,
    # preventing RDFLib from renaming ours to schema1.
    graph.bind(prefix, Namespace(effective_ns), replace=True)
    for pfx_name, pfx_ns in _dp.items():
        if pfx_name not in ("sh", "xsd", "rdf", "rdfs", "owl", prefix):
            graph.bind(pfx_name, Namespace(pfx_ns), replace=True)


def _resource(
    value: str,
    base_uri: str,
    prefix: str = "ex",
    detected_prefixes: dict[str, str] | None = None,
) -> URIRef:
    return _curie_or_uri(value, base_uri, prefix, default_to_base=True, detected_prefixes=detected_prefixes)


def _curie_or_uri(
    value: str,
    base_uri: str,
    prefix: str = "ex",
    default_to_base: bool = False,
    detected_prefixes: dict[str, str] | None = None,
) -> URIRef:
    text = value.strip()
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", text) or text.startswith("urn:"):
        return URIRef(text)

    if ":" in text:
        curie_prefix, local = text.split(":", 1)
        _dp = detected_prefixes or {}
        # Use the file-declared namespace for the selected prefix when available,
        # so http:// vs https:// mismatches don't corrupt generated URIs.
        _prefix_ns = _dp.get(prefix) or _base(base_uri)
        namespaces: dict[str, Namespace] = {
            "sh":    SH,
            "xsd":   XSD,
            "rdf":   RDF,
            "rdfs":  RDFS,
            "owl":   OWL,
            "ex":    Namespace(_base(base_uri)),
            prefix:  Namespace(_prefix_ns),
        }
        # Extend with the detected/uploaded-file prefixes
        for pfx_name, pfx_ns in _dp.items():
            if pfx_name not in namespaces:
                namespaces[pfx_name] = Namespace(pfx_ns)
        if curie_prefix in namespaces:
            return URIRef(namespaces[curie_prefix][local])
        if not default_to_base:
            return URIRef(text)
        text = local

    return URIRef(Namespace(_base(base_uri))[_safe_local_name(text)])


def _safe_local_name(value: str) -> str:
    cleaned = re.sub(r"\s+", "", value.strip())
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", cleaned)
    return cleaned or "Unnamed"


def _anchor_pattern(pattern: str) -> str:
    p = pattern
    if not p.startswith("^"):
        p = "^" + p
    if not p.endswith("$") or (len(p) >= 2 and p[-2] == "\\"):
        p = p + "$"
    return p


def _base(base_uri: str) -> str:
    return base_uri if base_uri.endswith(("/", "#")) else f"{base_uri}/"


def _serialize(graph: Graph, rdf_format: str) -> str:
    serialized = graph.serialize(format=rdf_format)
    return serialized.decode("utf-8") if isinstance(serialized, bytes) else serialized


def _serialize_as_jsonld(
    graph: Graph,
    base_uri: str,
    prefix: str = "ex",
    detected_prefixes: dict[str, str] | None = None,
) -> str:
    _dp = detected_prefixes or {}
    # Use the file-declared namespace for the selected prefix when available.
    _prefix_ns = _dp.get(prefix) or _base(base_uri)
    context: dict[str, str] = {
        "sh":   str(SH),
        "xsd":  str(XSD),
        "rdf":  str(RDF),
        "rdfs": str(RDFS),
        "owl":  str(OWL),
        prefix: _prefix_ns,
    }
    # Add all detected prefixes so foreign CURIEs resolve correctly in the output.
    for pfx_name, pfx_ns in _dp.items():
        if pfx_name not in context:
            context[pfx_name] = pfx_ns
    serialized = graph.serialize(format="json-ld", context=context)
    return serialized.decode("utf-8") if isinstance(serialized, bytes) else serialized


def _serialize_as_trig(
    graph: Graph,
    base_uri: str,
    prefix: str = "ex",
    detected_prefixes: dict[str, str] | None = None,
) -> str:
    dataset = Dataset()
    _bind_namespaces(dataset, base_uri, prefix, detected_prefixes)
    named_graph = dataset.graph(_resource("ShapesGraph", base_uri, prefix, detected_prefixes))
    for triple in graph:
        named_graph.add(triple)
    serialized = dataset.serialize(format="trig")
    return serialized.decode("utf-8") if isinstance(serialized, bytes) else serialized
