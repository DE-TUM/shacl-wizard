from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from rdflib import BNode, Dataset, Graph, Literal, Namespace, URIRef
from rdflib.collection import Collection
from rdflib.namespace import OWL, RDF, RDFS, SH, XSD

from app.models import PropertyConstraints, WizardState


def build_shapes_response(state: WizardState, base_uri: str) -> tuple[dict[str, str], str, list[str]]:
    graph, shape_uri = build_shapes_graph(state, base_uri)
    formats = serialize_shapes_graph(graph, base_uri)
    summary = [
        f"Generated NodeShape {shape_uri}.",
        f"Added {len(state.properties)} propert{'y' if len(state.properties) == 1 else 'ies'}.",
        "Produced Turtle, JSON-LD, RDF/XML, and TriG serializations.",
    ]
    return formats, shape_uri, summary


def build_shapes_graph(state: WizardState, base_uri: str) -> tuple[Graph, str]:
    if not state.shape_name.strip():
        raise ValueError("shapeName is required")

    graph = Graph()
    _bind_namespaces(graph, base_uri)

    shape = _resource(state.shape_name, base_uri)
    graph.add((shape, RDF.type, SH.NodeShape))

    if state.target_type and state.target_value.strip():
        target_predicate = {
            "class": SH.targetClass,
            "node": SH.targetNode,
            "subjectsOf": SH.targetSubjectsOf,
            "objectsOf": SH.targetObjectsOf,
        }[state.target_type]
        graph.add((shape, target_predicate, _resource(state.target_value, base_uri)))

    for prop in state.properties:
        if not prop.path.strip():
            continue
        prop_node = BNode()
        graph.add((shape, SH.property, prop_node))
        graph.add((prop_node, RDF.type, SH.PropertyShape))
        graph.add((prop_node, SH.path, _resource(prop.path, base_uri)))
        _add_constraints(graph, prop_node, prop.constraints, base_uri)

    return graph, str(shape)


def serialize_shapes_graph(graph: Graph, base_uri: str) -> dict[str, str]:
    return {
        "turtle": _serialize(graph, "turtle"),
        "jsonld": _serialize_as_jsonld(graph, base_uri),
        "rdfxml": _serialize(graph, "xml"),
        "trig": _serialize_as_trig(graph, base_uri),
    }


def _add_constraints(graph: Graph, subject: BNode, c: PropertyConstraints, base_uri: str) -> None:
    _add_int(graph, subject, SH.minCount, c.min_count, "minCount")
    _add_int(graph, subject, SH.maxCount, c.max_count, "maxCount")
    _add_int(graph, subject, SH.minLength, c.min_length, "minLength")
    _add_int(graph, subject, SH.maxLength, c.max_length, "maxLength")

    _add_numeric(graph, subject, SH.minInclusive, c.min_inclusive, "minInclusive", c.datatype)
    _add_numeric(graph, subject, SH.maxInclusive, c.max_inclusive, "maxInclusive", c.datatype)
    _add_numeric(graph, subject, SH.minExclusive, c.min_exclusive, "minExclusive", c.datatype)
    _add_numeric(graph, subject, SH.maxExclusive, c.max_exclusive, "maxExclusive", c.datatype)

    if c.datatype:
        graph.add((subject, SH.datatype, _curie_or_uri(c.datatype, base_uri)))
    if c.node_kind:
        graph.add((subject, SH.nodeKind, _curie_or_uri(c.node_kind, base_uri)))
    if c.pattern:
        graph.add((subject, SH.pattern, Literal(c.pattern)))
    if c.class_:
        graph.add((subject, SH["class"], _resource(c.class_, base_uri)))
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


def _bind_namespaces(graph: Graph | Dataset, base_uri: str) -> None:
    graph.bind("sh", SH)
    graph.bind("xsd", XSD)
    graph.bind("rdf", RDF)
    graph.bind("rdfs", RDFS)
    graph.bind("owl", OWL)
    graph.bind("ex", Namespace(_base(base_uri)))


def _resource(value: str, base_uri: str) -> URIRef:
    return _curie_or_uri(value, base_uri, default_to_base=True)


def _curie_or_uri(value: str, base_uri: str, default_to_base: bool = False) -> URIRef:
    text = value.strip()
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", text) or text.startswith("urn:"):
        return URIRef(text)

    if ":" in text:
        prefix, local = text.split(":", 1)
        namespaces = {
            "sh": SH,
            "xsd": XSD,
            "rdf": RDF,
            "rdfs": RDFS,
            "owl": OWL,
            "ex": Namespace(_base(base_uri)),
        }
        if prefix in namespaces:
            return URIRef(namespaces[prefix][local])
        if not default_to_base:
            return URIRef(text)
        text = local

    return URIRef(Namespace(_base(base_uri))[_safe_local_name(text)])


def _safe_local_name(value: str) -> str:
    cleaned = re.sub(r"\s+", "", value.strip())
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", cleaned)
    return cleaned or "Unnamed"


def _base(base_uri: str) -> str:
    return base_uri if base_uri.endswith(("/", "#")) else f"{base_uri}/"


def _serialize(graph: Graph, rdf_format: str) -> str:
    serialized = graph.serialize(format=rdf_format)
    return serialized.decode("utf-8") if isinstance(serialized, bytes) else serialized


def _serialize_as_jsonld(graph: Graph, base_uri: str) -> str:
    context = {
        "sh":   str(SH),
        "xsd":  str(XSD),
        "rdf":  str(RDF),
        "rdfs": str(RDFS),
        "owl":  str(OWL),
        "ex":   _base(base_uri),
    }
    serialized = graph.serialize(format="json-ld", context=context)
    return serialized.decode("utf-8") if isinstance(serialized, bytes) else serialized


def _serialize_as_trig(graph: Graph, base_uri: str) -> str:
    dataset = Dataset()
    _bind_namespaces(dataset, base_uri)
    named_graph = dataset.graph(_resource("ShapesGraph", base_uri))
    for triple in graph:
        named_graph.add(triple)
    serialized = dataset.serialize(format="trig")
    return serialized.decode("utf-8") if isinstance(serialized, bytes) else serialized
