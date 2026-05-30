from __future__ import annotations

import re as _re

from rdflib import Graph, Literal, URIRef
from rdflib.namespace import RDF, SH

from app.models import ValidationResponse, Violation
from app.services.rdf_parser import guess_rdf_format


def _clean_message(msg: str) -> str:
    """Strip RDFLib Literal() repr strings from pyshacl violation messages."""
    if not msg:
        return msg

    # Pattern 5 — "Value Literal("X") not in list [...]"
    def _fmt_not_in(m: _re.Match) -> str:
        value = m.group(1)
        items = _re.findall(r'Literal\("([^"]+)"\)', m.group(2))
        items_str = ", ".join(f'"{v}"' for v in items) if items else m.group(2)
        return f'"{value}" is not one of: {items_str}'

    msg = _re.sub(
        r'Value Literal\("([^"]+)"\)\s*not in list\s*\[([^\]]+)\]',
        _fmt_not_in,
        msg,
    )

    # Pattern 4 — "Value is not >= / <= Literal("X", ...)"
    msg = _re.sub(
        r'Value is not (>=|<=|>|<) Literal\("([^"]+)"[^)]*\)',
        lambda m: f'Value must be {m.group(1)} {m.group(2)}',
        msg,
    )

    # Pattern 3 — standalone list repr of Literal strings
    def _fmt_literal_list(m: _re.Match) -> str:
        items = _re.findall(r'Literal\("([^"]+)"\)', m.group(0))
        return ", ".join(f'"{v}"' for v in items)

    msg = _re.sub(
        r"\['Literal\(\"[^\"]+\"\)'(?:,\s*'Literal\(\"[^\"]+\"\)')*\]",
        _fmt_literal_list,
        msg,
    )

    # Pattern 1 — Literal("X", datatype=...) → X
    msg = _re.sub(r'Literal\("([^"]+)",\s*datatype=[^)]+\)', r'\1', msg)

    # Pattern 2 — Literal("X") → X
    msg = _re.sub(r'Literal\("([^"]+)"\)', r'\1', msg)

    return msg


def run_pyshacl_validation(
    data_graph: str,
    shapes_graph: str,
    data_file: str,
    data_format: str | None = None,
    shapes_format: str | None = None,
) -> ValidationResponse:
    try:
        from pyshacl import validate
    except ImportError as exc:  # pragma: no cover - dependency is installed by requirements
        raise RuntimeError("pyshacl package is not installed") from exc

    conforms, results_graph, results_text = validate(
        data_graph,
        shacl_graph=shapes_graph,
        data_graph_format=data_format or guess_rdf_format(data_file),
        shacl_graph_format=shapes_format or "turtle",
        inference="rdfs",
        abort_on_first=False,
        allow_infos=False,
        allow_warnings=False,
        meta_shacl=False,
        advanced=False,
        debug=False,
    )

    violations = [] if conforms else extract_violations(results_graph)
    return ValidationResponse(
        status="valid" if conforms else "invalid",
        conforms=bool(conforms),
        violations=violations,
        dataFile=data_file,
        reportText=_clean_message(results_text),
    )


def extract_violations(results_graph: Graph) -> list[Violation]:
    _bind_result_prefixes(results_graph)
    violations: list[Violation] = []

    for result in results_graph.subjects(RDF.type, SH.ValidationResult):
        focus_node = _term_to_display(results_graph, results_graph.value(result, SH.focusNode))
        path = _term_to_display(results_graph, results_graph.value(result, SH.resultPath))
        raw_message = _message(results_graph, result)
        severity = _term_to_display(results_graph, results_graph.value(result, SH.resultSeverity))
        source_constraint = _term_to_display(
            results_graph,
            results_graph.value(result, SH.sourceConstraintComponent),
        )
        value = _term_to_display(results_graph, results_graph.value(result, SH.value))

        violations.append(
            Violation(
                focusNode=focus_node or "-",
                property=path or "-",
                message=_clean_message(raw_message) if raw_message else "SHACL validation result",
                severity=severity,
                sourceConstraint=source_constraint,
                value=value,
            )
        )

    return violations


def _message(graph: Graph, result: URIRef) -> str | None:
    values = list(graph.objects(result, SH.resultMessage))
    if not values:
        return None
    return " ".join(str(value) for value in values)


def _term_to_display(graph: Graph, value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, Literal):
        return str(value)
    try:
        return graph.namespace_manager.normalizeUri(value)  # type: ignore[arg-type]
    except Exception:
        return str(value)


def _bind_result_prefixes(graph: Graph) -> None:
    graph.bind("sh", SH)
