"""Phase 5 regression tests: sh:and / sh:or / sh:xone / sh:not and
sh:qualifiedValueShape (+ qualifiedMinCount / qualifiedMaxCount).

Checks emission plus functional PySHACL behaviour for sh:or and
sh:qualifiedValueShape.

Run from backend/ with the venv python:
    python -m tests.test_phase5_logical
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


def _shapes(state: WizardState) -> str:
    g, _ = build_shapes_graph(state, BASE, PREFIX)
    return serialize_shapes_graph(g, BASE, PREFIX)["turtle"]


def test_emission() -> None:
    state = WizardState(
        shapeName="ThingShape", targetType="class", targetValue="Thing",
        properties=[
            PropertyShape(path="a", constraints=PropertyConstraints(
                **{"and": [{"datatype": "xsd:string"}, {"minLength": "2"}]})),
            PropertyShape(path="b", constraints=PropertyConstraints(
                **{"or": [{"datatype": "xsd:string"}, {"datatype": "xsd:integer"}]})),
            PropertyShape(path="c", constraints=PropertyConstraints(
                xone=[{"nodeKind": "sh:IRI"}, {"nodeKind": "sh:Literal"}])),
            PropertyShape(path="d", constraints=PropertyConstraints(**{"not": {"maxInclusive": "0"}})),
            PropertyShape(path="e", constraints=PropertyConstraints(
                qualifiedValueShape={"class": "ex:Manager"}, qualifiedMinCount="1", qualifiedMaxCount="3")),
        ],
    )
    g, _ = build_shapes_graph(state, BASE, PREFIX)
    preds = {p for _, p, _ in g}
    for name, pred in [("sh:and", SH["and"]), ("sh:or", SH["or"]), ("sh:xone", SH.xone),
                       ("sh:not", SH["not"]), ("sh:qualifiedValueShape", SH.qualifiedValueShape),
                       ("sh:qualifiedMinCount", SH.qualifiedMinCount),
                       ("sh:qualifiedMaxCount", SH.qualifiedMaxCount)]:
        check(f"{name} emitted", pred in preds)


def test_or_functional() -> None:
    state = WizardState(
        shapeName="CodeShape", targetType="class", targetValue="Thing",
        properties=[PropertyShape(path="code", constraints=PropertyConstraints(
            **{"or": [{"datatype": "xsd:string"}, {"datatype": "xsd:integer"}]}))],
    )
    shapes = _shapes(state)
    xsd = '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .'
    s = run_pyshacl_validation(f'@prefix ex: <{BASE}> . {xsd} ex:t a ex:Thing ; ex:code "hi" .', shapes, "d", "turtle", "turtle")
    i = run_pyshacl_validation(f'@prefix ex: <{BASE}> . {xsd} ex:t a ex:Thing ; ex:code 5 .', shapes, "d", "turtle", "turtle")
    b = run_pyshacl_validation(f'@prefix ex: <{BASE}> . {xsd} ex:t a ex:Thing ; ex:code true .', shapes, "d", "turtle", "turtle")
    check("sh:or accepts a string", s.status == "valid", s.report_text)
    check("sh:or accepts an integer", i.status == "valid", i.report_text)
    check("sh:or rejects a boolean", b.status == "invalid", b.report_text)


def test_qualified_functional() -> None:
    state = WizardState(
        shapeName="TeamShape", targetType="class", targetValue="Team",
        properties=[PropertyShape(path="member", constraints=PropertyConstraints(
            qualifiedValueShape={"class": "ex:Manager"}, qualifiedMinCount="1"))],
    )
    shapes = _shapes(state)
    ok = run_pyshacl_validation(
        f'@prefix ex: <{BASE}> . ex:t a ex:Team ; ex:member ex:m . ex:m a ex:Manager .',
        shapes, "d", "turtle", "turtle")
    bad = run_pyshacl_validation(
        f'@prefix ex: <{BASE}> . ex:t a ex:Team ; ex:member ex:p . ex:p a ex:Person .',
        shapes, "d", "turtle", "turtle")
    check("qualifiedMinCount accepts >=1 matching value", ok.status == "valid", ok.report_text)
    check("qualifiedMinCount rejects 0 matching values", bad.status == "invalid", bad.report_text)


def main() -> int:
    test_emission()
    test_or_functional()
    test_qualified_functional()
    print()
    if _failures:
        print(f"{len(_failures)} check(s) FAILED: {_failures}")
        return 1
    print("All Phase 5 checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
