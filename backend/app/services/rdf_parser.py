from __future__ import annotations

from pathlib import Path
from typing import Any

from rdflib import BNode, Dataset, Graph, Literal, URIRef
from rdflib.namespace import OWL, RDF, RDFS, SH, XSD

from app.models import ParseRDFResponse

FORMAT_BY_EXTENSION = {
    ".ttl": "turtle",
    ".turtle": "turtle",
    ".jsonld": "json-ld",
    ".json": "json-ld",
    ".rdf": "xml",
    ".xml": "xml",
    ".n3": "n3",
    ".nt": "nt",
    ".trig": "trig",
}

BUILTIN_NAMESPACES = tuple(str(ns) for ns in (RDF, RDFS, OWL, XSD, SH))

_XSD_CURIE_MAP: dict[str, str] = {
    str(XSD.string):             "xsd:string",
    str(XSD.integer):            "xsd:integer",
    str(XSD.decimal):            "xsd:decimal",
    str(XSD.date):               "xsd:date",
    str(XSD.dateTime):           "xsd:dateTime",
    str(XSD.boolean):            "xsd:boolean",
    str(XSD.anyURI):             "xsd:anyURI",
    str(XSD.float):              "xsd:float",
    str(XSD.double):             "xsd:double",
    str(XSD.int):                "xsd:int",
    str(XSD.long):               "xsd:long",
    str(XSD.nonNegativeInteger): "xsd:nonNegativeInteger",
}

# Datatypes that are never string literals — used as a negative filter for sh:in inference.
_NON_STRING_DATATYPES: frozenset = frozenset([
    XSD.integer, XSD.decimal, XSD.float, XSD.double,
    XSD.int, XSD.long, XSD.short, XSD.byte,
    XSD.nonNegativeInteger, XSD.positiveInteger,
    XSD.negativeInteger, XSD.nonPositiveInteger,
    XSD.unsignedInt, XSD.unsignedLong, XSD.unsignedShort, XSD.unsignedByte,
    XSD.boolean,
    XSD.date, XSD.dateTime, XSD.time,
    XSD.gYear, XSD.gYearMonth, XSD.gMonthDay, XSD.gDay, XSD.gMonth,
    XSD.anyURI,
])


def guess_rdf_format(filename: str | None, fallback: str = "turtle") -> str:
    if not filename:
        return fallback
    return FORMAT_BY_EXTENSION.get(Path(filename).suffix.lower(), fallback)


def parse_rdf_hints(graph_text: str, filename: str | None = None, rdf_format: str | None = None) -> ParseRDFResponse:
    resolved_format = rdf_format or guess_rdf_format(filename)
    graph = Dataset(default_union=True) if resolved_format == "trig" else Graph()
    graph.parse(data=graph_text, format=resolved_format)
    return extract_rdf_hints(graph)


def parse_rdf_full(
    graph_text: str,
    filename: str | None,
    rdf_format: str | None,
    settings: Any | None = None,
) -> ParseRDFResponse:
    resolved_format = rdf_format or guess_rdf_format(filename)
    graph: Graph | Dataset = Dataset(default_union=True) if resolved_format == "trig" else Graph()
    graph.parse(data=graph_text, format=resolved_format)

    response = extract_rdf_hints(graph)
    inferred, limited = infer_constraints(graph, response.properties)
    response.inference_limited = limited

    if not limited and settings is not None and (settings.should_try_groq or settings.should_try_gemini):
        try:
            from app.services.constraint_verifier import verify_constraints_with_llm
            inferred = verify_constraints_with_llm(inferred, graph, settings)
        except Exception:
            pass

    response.suggested_constraints = inferred
    return response


def extract_rdf_hints(graph: Graph | Dataset) -> ParseRDFResponse:
    classes: set[str] = set()
    properties: set[str] = set()
    detected_datatypes: dict[str, str] = {}

    for _subject, _predicate, obj in graph.triples((None, RDF.type, None)):
        if isinstance(obj, URIRef) and not _is_builtin_uri(obj):
            classes.add(_local_name(obj))

    for _subject, predicate, obj in graph:
        if predicate == RDF.type or not isinstance(predicate, URIRef):
            continue

        prop_name = _local_name(predicate)
        properties.add(prop_name)

        if isinstance(obj, Literal) and obj.datatype and prop_name not in detected_datatypes:
            detected_datatypes[prop_name] = _qname_or_uri(graph, obj.datatype)

    prefixes = {
        prefix: str(namespace)
        for prefix, namespace in graph.namespace_manager.namespaces()
        if prefix
    }

    return ParseRDFResponse(
        classes=sorted(classes)[:50],
        properties=sorted(properties)[:100],
        prefixes=dict(sorted(prefixes.items())),
        detectedDatatypes=dict(sorted(detected_datatypes.items())),
    )


def _looks_like_unique_identifiers(values: list[str]) -> bool:
    """Return True if the value set looks like per-entity unique identifiers rather than
    a shared fixed vocabulary. Used to avoid treating names/emails/phones/IDs as sh:in."""
    import re as _re
    for v in values:
        if "@" in v:
            return True
        if v.startswith("http://") or v.startswith("https://"):
            return True
        if _re.fullmatch(r"[\d\-+\s]{9,}", v):
            return True
        if _re.fullmatch(r"\d+", v):
            return True
        if " " in v or (len(v) > 8 and v != v.lower() and v != v.upper()):
            return True
    return False


def infer_constraints(g: Graph | Dataset, properties: list[str]) -> tuple[dict[str, dict], bool]:
    triple_count = sum(1 for _ in g)
    limited = triple_count > 10_000

    prop_set = set(properties)

    # Map local name → set of full predicate URIs found in graph
    prop_uri_map: dict[str, set[URIRef]] = {}
    for _, predicate, _ in g:
        if not isinstance(predicate, URIRef) or predicate == RDF.type:
            continue
        ln = _local_name(predicate)
        if ln in prop_set:
            prop_uri_map.setdefault(ln, set()).add(predicate)

    # Collect typed instance nodes (subjects of rdf:type with a non-builtin class).
    # These are the "real" data nodes — used for accurate minCount inference.
    # Fall back to all non-builtin subject nodes if the graph has no rdf:type triples.
    typed_subjects: set[Any] = set()
    for s, _, o in g.triples((None, RDF.type, None)):
        if isinstance(o, URIRef) and not _is_builtin_uri(o):
            typed_subjects.add(s)

    if not typed_subjects:
        for s, _, _ in g:
            if (isinstance(s, URIRef) and not _is_builtin_uri(s)) or isinstance(s, BNode):
                typed_subjects.add(s)

    total_subjects = max(len(typed_subjects), 1)

    result: dict[str, dict] = {}

    for prop_local, predicates in prop_uri_map.items():
        subject_values: dict[Any, list] = {}
        for pred in predicates:
            for s, _, o in g.triples((None, pred, None)):
                subject_values.setdefault(s, []).append(o)

        if not subject_values:
            continue

        all_values = [o for vals in subject_values.values() for o in vals]
        constraints: dict[str, str] = {}

        # datatype — 80% threshold over typed literals
        dt_counts: dict[str, int] = {}
        for o in all_values:
            if isinstance(o, Literal) and o.datatype:
                dt = _datatype_curie(o.datatype)
                dt_counts[dt] = dt_counts.get(dt, 0) + 1
        if dt_counts:
            total_typed = sum(dt_counts.values())
            best_dt, best_count = max(dt_counts.items(), key=lambda x: x[1])
            if best_count / total_typed >= 0.8:
                constraints["datatype"] = best_dt

        # nodeKind
        all_iris = all(isinstance(o, URIRef) for o in all_values)
        all_literals = all(isinstance(o, Literal) for o in all_values)
        if all_iris:
            constraints["nodeKind"] = "sh:IRI"
        elif all_literals:
            constraints["nodeKind"] = "sh:Literal"

        if not limited:
            # minCount — every typed subject node (including those with zero values) has ≥1
            # value, AND the property covers more than 50% of all typed subjects.
            all_have_one = all(len(subject_values.get(s, [])) >= 1 for s in typed_subjects)
            covers_majority = len(subject_values) / total_subjects > 0.5
            if all_have_one and covers_majority:
                constraints["minCount"] = "1"

            # maxCount — no subject has more than 1 value
            if all(len(vals) <= 1 for vals in subject_values.values()):
                constraints["maxCount"] = "1"

            # sh:in — string literals only, ≤6 distinct values.
            # Use a negative filter (exclude numeric/boolean/date datatypes) instead of a
            # positive xsd:string equality check — more robust across RDFLib versions where
            # plain Turtle strings may be stored with datatype=None or datatype=XSD.string.
            # Uniqueness guard: if every subject has a different value AND the values look
            # like unique identifiers (names, emails, phones, IDs, URLs), skip sh:in.
            # Short categorical strings (e.g. blood types, status codes) pass through even
            # when distinct count == subject count.
            if all_literals:
                string_values = [
                    str(o) for o in all_values
                    if isinstance(o, Literal)
                    and not o.language
                    and o.datatype not in _NON_STRING_DATATYPES
                ]
                if string_values and len(string_values) == len(all_values):
                    distinct = list(dict.fromkeys(string_values))
                    all_unique = len(distinct) == len(subject_values)
                    if len(distinct) <= 6 and (not all_unique or not _looks_like_unique_identifiers(distinct)):
                        constraints["in"] = ",".join(distinct)

        if constraints:
            result[prop_local] = constraints

    return result, limited


def _datatype_curie(datatype: URIRef) -> str:
    return _XSD_CURIE_MAP.get(str(datatype), str(datatype))


def _is_builtin_uri(uri: URIRef) -> bool:
    return str(uri).startswith(BUILTIN_NAMESPACES)


def _local_name(uri: URIRef) -> str:
    text = str(uri)
    if "#" in text:
        return text.rsplit("#", 1)[1]
    return text.rstrip("/").rsplit("/", 1)[-1]


def _qname_or_uri(graph: Graph, uri: URIRef) -> str:
    try:
        return graph.namespace_manager.normalizeUri(uri)
    except Exception:
        return str(uri)
