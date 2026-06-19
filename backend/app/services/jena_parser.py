from __future__ import annotations

import atexit
import json
import re
import shlex
import subprocess
import threading
import time
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.models import ParseRDFResponse

RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"

BUILTIN_NAMESPACES = (
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "http://www.w3.org/2000/01/rdf-schema#",
    "http://www.w3.org/2002/07/owl#",
    "http://www.w3.org/2001/XMLSchema#",
    "http://www.w3.org/ns/shacl#",
)

XSD_CURIE_MAP: dict[str, str] = {
    "http://www.w3.org/2001/XMLSchema#string":             "xsd:string",
    "http://www.w3.org/2001/XMLSchema#integer":            "xsd:integer",
    "http://www.w3.org/2001/XMLSchema#decimal":            "xsd:decimal",
    "http://www.w3.org/2001/XMLSchema#date":               "xsd:date",
    "http://www.w3.org/2001/XMLSchema#dateTime":           "xsd:dateTime",
    "http://www.w3.org/2001/XMLSchema#boolean":            "xsd:boolean",
    "http://www.w3.org/2001/XMLSchema#anyURI":             "xsd:anyURI",
    "http://www.w3.org/2001/XMLSchema#float":              "xsd:float",
    "http://www.w3.org/2001/XMLSchema#double":             "xsd:double",
    "http://www.w3.org/2001/XMLSchema#int":                "xsd:int",
    "http://www.w3.org/2001/XMLSchema#long":               "xsd:long",
    "http://www.w3.org/2001/XMLSchema#nonNegativeInteger": "xsd:nonNegativeInteger",
}

NON_STRING_DATATYPE_URIS = frozenset([
    "http://www.w3.org/2001/XMLSchema#integer",
    "http://www.w3.org/2001/XMLSchema#decimal",
    "http://www.w3.org/2001/XMLSchema#float",
    "http://www.w3.org/2001/XMLSchema#double",
    "http://www.w3.org/2001/XMLSchema#int",
    "http://www.w3.org/2001/XMLSchema#long",
    "http://www.w3.org/2001/XMLSchema#short",
    "http://www.w3.org/2001/XMLSchema#byte",
    "http://www.w3.org/2001/XMLSchema#nonNegativeInteger",
    "http://www.w3.org/2001/XMLSchema#positiveInteger",
    "http://www.w3.org/2001/XMLSchema#negativeInteger",
    "http://www.w3.org/2001/XMLSchema#nonPositiveInteger",
    "http://www.w3.org/2001/XMLSchema#unsignedInt",
    "http://www.w3.org/2001/XMLSchema#unsignedLong",
    "http://www.w3.org/2001/XMLSchema#unsignedShort",
    "http://www.w3.org/2001/XMLSchema#unsignedByte",
    "http://www.w3.org/2001/XMLSchema#boolean",
    "http://www.w3.org/2001/XMLSchema#date",
    "http://www.w3.org/2001/XMLSchema#dateTime",
    "http://www.w3.org/2001/XMLSchema#time",
    "http://www.w3.org/2001/XMLSchema#gYear",
    "http://www.w3.org/2001/XMLSchema#gYearMonth",
    "http://www.w3.org/2001/XMLSchema#gMonthDay",
    "http://www.w3.org/2001/XMLSchema#gDay",
    "http://www.w3.org/2001/XMLSchema#gMonth",
    "http://www.w3.org/2001/XMLSchema#anyURI",
])

MIME_BY_FORMAT = {
    "turtle": "text/turtle; charset=utf-8",
    "trig": "application/trig; charset=utf-8",
    "json-ld": "application/ld+json; charset=utf-8",
    "xml": "application/rdf+xml; charset=utf-8",
    "nt": "application/n-triples; charset=utf-8",
    "n3": "text/n3; charset=utf-8",
}

PREFIX_RE = re.compile(
    r"(?:@prefix|PREFIX)\s+([A-Za-z][\w.-]*):\s*<([^>]+)>",
    flags=re.IGNORECASE,
)


def parse_rdf_full_with_jena(
    graph_text: str,
    filename: str | None,
    rdf_format: str,
    settings: Any,
) -> ParseRDFResponse:
    del filename

    content_type = MIME_BY_FORMAT.get(rdf_format)
    if content_type is None:
        raise ValueError(f"Apache Jena parser does not support RDF format: {rdf_format}")

    client = JenaClient(settings)
    graph_uri = f"urn:shacl-wizard:parse:{uuid.uuid4().hex}"

    client.ensure_ready()
    client.put_graph(graph_uri, graph_text, content_type)
    try:
        response = extract_rdf_hints_with_jena(client, graph_uri, graph_text)
        inferred, limited = infer_constraints_with_jena(
            client,
            graph_uri,
            response.properties,
            settings.rdf_inference_limit_triples,
        )
        response.inference_limited = limited
        response.suggested_constraints = inferred
        return response
    finally:
        client.delete_graph(graph_uri)


def extract_rdf_hints_with_jena(
    client: "JenaClient",
    graph_uri: str,
    graph_text: str,
) -> ParseRDFResponse:
    graph = _sparql_iri(graph_uri)

    classes = [
        _local_name(row["class"])
        for row in client.select(f"""
            SELECT DISTINCT ?class WHERE {{
              GRAPH {graph} {{
                ?s {_sparql_iri(RDF_TYPE)} ?class .
                FILTER(isIRI(?class))
                FILTER({_not_builtin_filter("?class")})
              }}
            }}
            ORDER BY ?class
            LIMIT 50
        """)
    ]

    predicate_rows = client.select(f"""
        SELECT DISTINCT ?p WHERE {{
          GRAPH {graph} {{
            ?s ?p ?o .
            FILTER(isIRI(?p) && ?p != {_sparql_iri(RDF_TYPE)})
          }}
        }}
        ORDER BY ?p
        LIMIT 5000
    """)

    properties = sorted({_local_name(row["p"]) for row in predicate_rows})[:100]
    prefixes = _extract_prefixes(graph_text)
    detected_datatypes = _detect_datatypes(client, graph_uri)

    return ParseRDFResponse(
        classes=sorted(set(classes))[:50],
        properties=properties,
        prefixes=prefixes,
        detectedDatatypes=detected_datatypes,
    )


def infer_constraints_with_jena(
    client: "JenaClient",
    graph_uri: str,
    properties: list[str],
    inference_limit_triples: int,
) -> tuple[dict[str, dict], bool]:
    triple_count = _single_count(
        client,
        f"""
        SELECT (COUNT(*) AS ?count) WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{ ?s ?p ?o }}
        }}
        """,
    )
    limited = triple_count > inference_limit_triples

    prop_set = set(properties)
    prop_uri_map = _property_uri_map(client, graph_uri, prop_set)
    datatype_counts = _datatype_counts(client, graph_uri, prop_set)
    node_stats = _node_stats(client, graph_uri, prop_set)

    total_subjects, subject_mode = _target_subject_count(client, graph_uri)
    result: dict[str, dict] = {}

    for prop_local, predicates in prop_uri_map.items():
        stats = node_stats.get(prop_local)
        if not stats or stats["total"] <= 0:
            continue

        constraints: dict[str, str] = {}

        dt_counts = datatype_counts.get(prop_local, {})
        if dt_counts:
            total_typed = sum(dt_counts.values())
            best_dt, best_count = max(dt_counts.items(), key=lambda item: item[1])
            if total_typed and best_count / total_typed >= 0.8:
                constraints["datatype"] = _datatype_curie(best_dt)

        if stats["iris"] == stats["total"]:
            constraints["nodeKind"] = "sh:IRI"
        elif stats["literals"] == stats["total"]:
            constraints["nodeKind"] = "sh:Literal"

        if not limited:
            predicate_values = _sparql_iri_values(predicates)
            if not predicate_values:
                continue

            subject_count = _property_subject_count(
                client,
                graph_uri,
                predicate_values,
                subject_mode,
            )
            if subject_count == total_subjects and subject_count / max(total_subjects, 1) > 0.5:
                constraints["minCount"] = "1"

            if not _has_subject_with_multiple_values(client, graph_uri, predicate_values):
                constraints["maxCount"] = "1"

            if stats["literals"] == stats["total"]:
                fixed_list = _fixed_string_values(
                    client,
                    graph_uri,
                    predicate_values,
                    stats["total"],
                    subject_count,
                )
                if fixed_list:
                    constraints["in"] = ",".join(fixed_list)

        if constraints:
            result[prop_local] = constraints

    return result, limited


class JenaClient:
    def __init__(self, settings: Any) -> None:
        if not settings.jena_sparql_endpoint or not settings.jena_graph_store_endpoint:
            raise RuntimeError(
                "Apache Jena requires JENA_SPARQL_ENDPOINT and "
                "JENA_GRAPH_STORE_ENDPOINT, or JENA_BASE_URL/JENA_DATASET."
            )

        self.sparql_endpoint = settings.jena_sparql_endpoint
        self.graph_store_endpoint = settings.jena_graph_store_endpoint
        self.fuseki_command = settings.jena_fuseki_command
        self.startup_timeout = settings.jena_startup_timeout_seconds
        self.request_timeout = settings.jena_request_timeout_seconds

    def ensure_ready(self) -> None:
        if self.fuseki_command:
            _FUSEKI_PROCESS.ensure_started(self.fuseki_command)
            self._wait_until_ready()

    def select(self, query: str) -> list[dict[str, str]]:
        data = self._post_sparql(query)
        bindings = data.get("results", {}).get("bindings", [])
        rows: list[dict[str, str]] = []
        for binding in bindings:
            row: dict[str, str] = {}
            for key, value in binding.items():
                row[key] = value.get("value", "")
            rows.append(row)
        return rows

    def put_graph(self, graph_uri: str, graph_text: str, content_type: str) -> None:
        request = Request(
            self._graph_store_url(graph_uri),
            data=graph_text.encode("utf-8"),
            headers={"Content-Type": content_type},
            method="PUT",
        )
        self._open(request)

    def delete_graph(self, graph_uri: str) -> None:
        request = Request(self._graph_store_url(graph_uri), method="DELETE")
        try:
            self._open(request)
        except RuntimeError:
            pass

    def _post_sparql(self, query: str) -> dict[str, Any]:
        body = urlencode({"query": query}).encode("utf-8")
        request = Request(
            self.sparql_endpoint,
            data=body,
            headers={
                "Accept": "application/sparql-results+json",
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
            },
            method="POST",
        )
        with self._open(request) as response:
            payload = response.read().decode("utf-8")
        return json.loads(payload)

    def _wait_until_ready(self) -> None:
        deadline = time.monotonic() + self.startup_timeout
        last_error: Exception | None = None
        while time.monotonic() < deadline:
            try:
                self._post_sparql("ASK {}")
                return
            except Exception as exc:
                last_error = exc
                time.sleep(0.2)
        raise RuntimeError(f"Apache Jena SPARQL endpoint did not become ready: {last_error}")

    def _graph_store_url(self, graph_uri: str) -> str:
        separator = "&" if "?" in self.graph_store_endpoint else "?"
        return f"{self.graph_store_endpoint}{separator}{urlencode({'graph': graph_uri})}"

    def _open(self, request: Request):
        try:
            return urlopen(request, timeout=self.request_timeout)
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Jena HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"Could not reach Apache Jena: {exc.reason}") from exc


class FusekiProcessManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process: subprocess.Popen[bytes] | None = None
        self._command: str | None = None

    def ensure_started(self, command: str) -> None:
        with self._lock:
            if self._process and self._process.poll() is None and self._command == command:
                return

            args = shlex.split(command)
            if not args:
                raise RuntimeError("JENA_FUSEKI_COMMAND is empty.")

            self._process = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self._command = command
            atexit.register(self.stop)

    def stop(self) -> None:
        with self._lock:
            if not self._process or self._process.poll() is not None:
                return
            self._process.terminate()


_FUSEKI_PROCESS = FusekiProcessManager()


def _property_uri_map(
    client: JenaClient,
    graph_uri: str,
    prop_set: set[str],
) -> dict[str, set[str]]:
    rows = client.select(f"""
        SELECT DISTINCT ?p WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            ?s ?p ?o .
            FILTER(isIRI(?p) && ?p != {_sparql_iri(RDF_TYPE)})
          }}
        }}
    """)
    result: dict[str, set[str]] = {}
    for row in rows:
        predicate = row["p"]
        local = _local_name(predicate)
        if local in prop_set:
            result.setdefault(local, set()).add(predicate)
    return result


def _detect_datatypes(client: JenaClient, graph_uri: str) -> dict[str, str]:
    rows = client.select(f"""
        SELECT ?p ?dt (COUNT(?o) AS ?count) WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            ?s ?p ?o .
            FILTER(isIRI(?p) && ?p != {_sparql_iri(RDF_TYPE)} && isLiteral(?o))
            BIND(DATATYPE(?o) AS ?dt)
          }}
        }}
        GROUP BY ?p ?dt
        ORDER BY ?p DESC(?count)
    """)

    result: dict[str, str] = {}
    for row in rows:
        prop_name = _local_name(row["p"])
        if prop_name not in result:
            result[prop_name] = _datatype_curie(row["dt"])
    return dict(sorted(result.items()))


def _datatype_counts(
    client: JenaClient,
    graph_uri: str,
    prop_set: set[str],
) -> dict[str, dict[str, int]]:
    rows = client.select(f"""
        SELECT ?p ?dt (COUNT(?o) AS ?count) WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            ?s ?p ?o .
            FILTER(isIRI(?p) && ?p != {_sparql_iri(RDF_TYPE)} && isLiteral(?o))
            BIND(DATATYPE(?o) AS ?dt)
          }}
        }}
        GROUP BY ?p ?dt
    """)
    result: dict[str, dict[str, int]] = {}
    for row in rows:
        prop_name = _local_name(row["p"])
        if prop_name not in prop_set:
            continue
        result.setdefault(prop_name, {})
        result[prop_name][row["dt"]] = result[prop_name].get(row["dt"], 0) + _int(row["count"])
    return result


def _node_stats(
    client: JenaClient,
    graph_uri: str,
    prop_set: set[str],
) -> dict[str, dict[str, int]]:
    rows = client.select(f"""
        SELECT ?p
               (COUNT(?o) AS ?total)
               (SUM(IF(isIRI(?o), 1, 0)) AS ?iris)
               (SUM(IF(isLiteral(?o), 1, 0)) AS ?literals)
        WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            ?s ?p ?o .
            FILTER(isIRI(?p) && ?p != {_sparql_iri(RDF_TYPE)})
          }}
        }}
        GROUP BY ?p
    """)
    result: dict[str, dict[str, int]] = {}
    for row in rows:
        prop_name = _local_name(row["p"])
        if prop_name not in prop_set:
            continue
        stats = result.setdefault(prop_name, {"total": 0, "iris": 0, "literals": 0})
        stats["total"] += _int(row["total"])
        stats["iris"] += _int(row["iris"])
        stats["literals"] += _int(row["literals"])
    return result


def _target_subject_count(client: JenaClient, graph_uri: str) -> tuple[int, str]:
    typed_count = _single_count(
        client,
        f"""
        SELECT (COUNT(DISTINCT ?s) AS ?count) WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            ?s {_sparql_iri(RDF_TYPE)} ?type .
            FILTER(isIRI(?type))
            FILTER({_not_builtin_filter("?type")})
          }}
        }}
        """,
    )
    if typed_count:
        return typed_count, "typed"

    fallback_count = _single_count(
        client,
        f"""
        SELECT (COUNT(DISTINCT ?s) AS ?count) WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            ?s ?p ?o .
            FILTER(isBlank(?s) || (isIRI(?s) && {_not_builtin_filter("?s")}))
          }}
        }}
        """,
    )
    return max(fallback_count, 1), "fallback"


def _property_subject_count(
    client: JenaClient,
    graph_uri: str,
    predicate_values: str,
    subject_mode: str,
) -> int:
    if subject_mode == "typed":
        subject_pattern = f"""
            ?s {_sparql_iri(RDF_TYPE)} ?type .
            FILTER(isIRI(?type))
            FILTER({_not_builtin_filter("?type")})
        """
    else:
        subject_pattern = f"FILTER(isBlank(?s) || (isIRI(?s) && {_not_builtin_filter('?s')}))"

    return _single_count(
        client,
        f"""
        SELECT (COUNT(DISTINCT ?s) AS ?count) WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            VALUES ?p {{ {predicate_values} }}
            {subject_pattern}
            ?s ?p ?o .
          }}
        }}
        """,
    )


def _has_subject_with_multiple_values(
    client: JenaClient,
    graph_uri: str,
    predicate_values: str,
) -> bool:
    rows = client.select(f"""
        SELECT ?s (COUNT(?o) AS ?count) WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            VALUES ?p {{ {predicate_values} }}
            ?s ?p ?o .
          }}
        }}
        GROUP BY ?s
        HAVING(COUNT(?o) > 1)
        LIMIT 1
    """)
    return bool(rows)


def _fixed_string_values(
    client: JenaClient,
    graph_uri: str,
    predicate_values: str,
    total_values: int,
    subject_count: int,
) -> list[str]:
    rows = client.select(f"""
        SELECT ?value ?lang ?dt (COUNT(?o) AS ?count) WHERE {{
          GRAPH {_sparql_iri(graph_uri)} {{
            VALUES ?p {{ {predicate_values} }}
            ?s ?p ?o .
            FILTER(isLiteral(?o))
            BIND(STR(?o) AS ?value)
            BIND(LANG(?o) AS ?lang)
            BIND(DATATYPE(?o) AS ?dt)
          }}
        }}
        GROUP BY ?value ?lang ?dt
        ORDER BY ?value
    """)

    string_count = 0
    distinct: list[str] = []
    seen: set[str] = set()

    for row in rows:
        datatype = row.get("dt", "")
        value = row.get("value", "")
        if row.get("lang") or datatype in NON_STRING_DATATYPE_URIS:
            continue

        string_count += _int(row["count"])
        if value not in seen:
            seen.add(value)
            distinct.append(value)

    if not distinct or string_count != total_values:
        return []

    all_unique = len(distinct) == subject_count
    if len(distinct) <= 6 and (not all_unique or not _looks_like_unique_identifiers(distinct)):
        return distinct
    return []


def _single_count(client: JenaClient, query: str) -> int:
    rows = client.select(query)
    if not rows:
        return 0
    return _int(rows[0].get("count", "0"))


def _extract_prefixes(graph_text: str) -> dict[str, str]:
    # Prefix declarations are normally at the top of Turtle/TriG. Avoid scanning
    # very large uploads just to recover display metadata.
    sample = graph_text[:262_144]
    prefixes = {
        match.group(1): match.group(2)
        for match in PREFIX_RE.finditer(sample)
    }
    return dict(sorted(prefixes.items()))


def _sparql_iri(uri: str) -> str:
    if any(char in uri for char in "<>\n\r"):
        raise ValueError(f"Invalid IRI for SPARQL query: {uri}")
    return f"<{uri}>"


def _sparql_iri_values(uris: set[str]) -> str:
    values = [_sparql_iri(uri) for uri in sorted(uris)]
    return " ".join(values)


def _not_builtin_filter(var: str) -> str:
    checks = " || ".join(
        f"STRSTARTS(STR({var}), {json.dumps(namespace)})"
        for namespace in BUILTIN_NAMESPACES
    )
    return f"!({checks})"


def _datatype_curie(datatype_uri: str) -> str:
    return XSD_CURIE_MAP.get(datatype_uri, datatype_uri)


def _local_name(uri: str) -> str:
    if "#" in uri:
        return uri.rsplit("#", 1)[1]
    return uri.rstrip("/").rsplit("/", 1)[-1]


def _int(value: str) -> int:
    try:
        return int(Decimal(value))
    except (InvalidOperation, ValueError):
        return 0


def _looks_like_unique_identifiers(values: list[str]) -> bool:
    for value in values:
        if "@" in value:
            return True
        if value.startswith("http://") or value.startswith("https://"):
            return True
        if re.fullmatch(r"[\d\-+\s]{9,}", value):
            return True
        if re.fullmatch(r"\d+", value):
            return True
        if " " in value or (len(value) > 8 and value != value.lower() and value != value.upper()):
            return True
    return False
