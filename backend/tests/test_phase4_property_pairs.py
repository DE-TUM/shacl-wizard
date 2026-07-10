"""Phase 4 regression tests: sh:equals, sh:disjoint, sh:lessThan, sh:lessThanOrEquals.

Checks emission plus functional PySHACL behaviour for sh:lessThan.

Run from backend/ with the venv python:
    python -m tests.test_phase4_property_pairs
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rdflib.namespace import SH

from app.models import PropertyConstraints, PropertyShape, WizardState
from app.services.shapes import build_shapes_graph, serialize_shapes_graph
from app.services.validator import run_pyshacl_validation

BASE = "http://example.org/"
PREFIX = "ex"
_failures: list[str] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" — {extra}" if extra and not cond else ""))
    if not cond:
        _failures.append(label)


def test_emission() -> None:
    state = WizardState(
        shapeName="EventShape", targetType="class", targetValue="Event",
        properties=[
            PropertyShape(path="startDate", constraints=PropertyConstraints(
                datatype="xsd:date", lessThan="endDate")),
            PropertyShape(path="endDate", constraints=PropertyConstraints(datatype="xsd:date")),
            PropertyShape(path="altName", constraints=PropertyConstraints(
                equals="name", disjoint="nickname", lessThanOrEquals="rank")),
        ],
    )
    g, _ = build_shapes_graph(state, BASE, PREFIX)
    preds = {p for _, p, _ in g}
    for name, pred in [("sh:lessThan", SH.lessThan), ("sh:equals", SH.equals),
                       ("sh:disjoint", SH.disjoint), ("sh:lessThanOrEquals", SH.lessThanOrEquals)]:
        check(f"{name} emitted", pred in preds)
    # lessThan target must be a predicate IRI, not a literal.
    ttl = serialize_shapes_graph(g, BASE, PREFIX)["turtle"]
    check("lessThan target is a property IRI", "sh:lessThan ex:endDate" in ttl, ttl)


def test_lessthan_functional() -> None:
    state = WizardState(
        shapeName="EventShape", targetType="class", targetValue="Event",
        properties=[
            PropertyShape(path="startYear", constraints=PropertyConstraints(
                datatype="xsd:integer", lessThan="endYear")),
            PropertyShape(path="endYear", constraints=PropertyConstraints(datatype="xsd:integer")),
        ],
    )
    g, _ = build_shapes_graph(state, BASE, PREFIX)
    shapes = serialize_shapes_graph(g, BASE, PREFIX)["turtle"]

    ok = run_pyshacl_validation(
        f'@prefix ex: <{BASE}> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> . '
        'ex:e a ex:Event ; ex:startYear 2000 ; ex:endYear 2010 .',
        shapes, "ok.ttl", "turtle", "turtle")
    check("lessThan accepts start < end", ok.status == "valid", ok.report_text)

    bad = run_pyshacl_validation(
        f'@prefix ex: <{BASE}> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> . '
        'ex:e a ex:Event ; ex:startYear 2020 ; ex:endYear 2010 .',
        shapes, "bad.ttl", "turtle", "turtle")
    check("lessThan rejects start > end", bad.status == "invalid", bad.report_text)


def main() -> int:
    test_emission()
    test_lessthan_functional()
    print()
    if _failures:
        print(f"{len(_failures)} check(s) FAILED: {_failures}")
        return 1
    print("All Phase 4 checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
