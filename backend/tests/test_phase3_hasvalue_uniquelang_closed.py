"""Phase 3 regression tests: sh:hasValue, sh:uniqueLang, sh:closed (+ ignoredProperties).

Checks emission AND functional behaviour through PySHACL (a closed shape must
reject an undeclared property, and permit an ignored one).

Run from backend/ with the venv python:
    python -m tests.test_phase3_hasvalue_uniquelang_closed
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


def _shapes_ttl(state: WizardState) -> str:
    g, _ = build_shapes_graph(state, BASE, PREFIX)
    return serialize_shapes_graph(g, BASE, PREFIX)["turtle"]


def test_emission() -> None:
    state = WizardState(
        shapeName="PersonShape", targetType="class", targetValue="Person",
        closed=True, ignoredProperties="rdf:type",
        properties=[
            PropertyShape(path="status", constraints=PropertyConstraints(hasValue="active")),
            PropertyShape(path="label", constraints=PropertyConstraints(uniqueLang="true")),
        ],
    )
    g, _ = build_shapes_graph(state, BASE, PREFIX)
    preds = {p for _, p, _ in g}
    check("sh:hasValue emitted", SH.hasValue in preds)
    check("sh:uniqueLang emitted", SH.uniqueLang in preds)
    check("sh:closed emitted", SH.closed in preds)
    check("sh:ignoredProperties emitted", SH.ignoredProperties in preds)


def test_closed_rejects_undeclared() -> None:
    state = WizardState(
        shapeName="PersonShape", targetType="class", targetValue="Person",
        closed=True, ignoredProperties="rdf:type",
        properties=[PropertyShape(path="name", constraints=PropertyConstraints(minCount="1"))],
    )
    shapes = _shapes_ttl(state)

    # Conforming: only declared "name" (+ ignored rdf:type).
    ok_data = f'@prefix ex: <{BASE}> . ex:a a ex:Person ; ex:name "Al" .'
    r_ok = run_pyshacl_validation(ok_data, shapes, "ok.ttl", "turtle", "turtle")
    check("closed shape accepts only declared+ignored properties", r_ok.status == "valid",
          r_ok.report_text)

    # Non-conforming: an undeclared "ex:nickname" must be rejected by sh:closed.
    bad_data = f'@prefix ex: <{BASE}> . ex:a a ex:Person ; ex:name "Al" ; ex:nickname "Ally" .'
    r_bad = run_pyshacl_validation(bad_data, shapes, "bad.ttl", "turtle", "turtle")
    check("closed shape rejects an undeclared property", r_bad.status == "invalid",
          r_bad.report_text)


def test_hasvalue_functional() -> None:
    state = WizardState(
        shapeName="FlagShape", targetType="class", targetValue="Item",
        properties=[PropertyShape(path="status", constraints=PropertyConstraints(hasValue="active"))],
    )
    shapes = _shapes_ttl(state)
    ok = run_pyshacl_validation(f'@prefix ex: <{BASE}> . ex:i a ex:Item ; ex:status "active" .', shapes, "d.ttl", "turtle", "turtle")
    bad = run_pyshacl_validation(f'@prefix ex: <{BASE}> . ex:i a ex:Item ; ex:status "inactive" .', shapes, "d.ttl", "turtle", "turtle")
    check("hasValue accepts the required value", ok.status == "valid", ok.report_text)
    check("hasValue rejects when required value is absent", bad.status == "invalid", bad.report_text)


def main() -> int:
    test_emission()
    test_closed_rejects_undeclared()
    test_hasvalue_functional()
    print()
    if _failures:
        print(f"{len(_failures)} check(s) FAILED: {_failures}")
        return 1
    print("All Phase 3 checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
