"""Regression tests for sh:in enumeration parsing/generation.

The LLM is inconsistent about how it formats an enumerated sh:in value. Besides
the clean 'BMW, Audi, Mercedes', it sometimes returns the list in RDF-list /
SHACL / JSON syntax, e.g. '( "BMW" "Audi" "Mercedes" )', '("BMW","Audi")',
'["BMW","Audi"]', or with a 'sh:in' prefix. Previously the wrapper characters
leaked into the values (e.g. '(,BMW,Audi,)'), which then rendered as a single
malformed term. These tests confirm every form normalises to individual values
that generate valid Turtle PySHACL can parse and enforce.

Run from backend/ with the venv python:
    python -m tests.test_sh_in_enumeration
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models import PropertyConstraints, PropertyShape, WizardState
from app.services.llm_parser import _normalize_constraints, _normalize_in_value
from app.services.shapes import build_shapes_graph, serialize_shapes_graph
from app.services.validator import run_pyshacl_validation

BASE = "http://example.org/"
PREFIX = "ex"

_failures: list[str] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}" + (f" — {extra}" if extra and not cond else ""))
    if not cond:
        _failures.append(label)


# Every one of these is a form the LLM has been observed to emit for
# "either BMW, Audi, or Mercedes"; all must yield the same three clean values.
_EQUIVALENT_FORMS = [
    "BMW, Audi, Mercedes",
    "BMW, Audi, or Mercedes",
    ["BMW", "Audi", "Mercedes"],
    '( "BMW" "Audi" "Mercedes" )',
    '("BMW","Audi","Mercedes")',
    '["BMW", "Audi", "Mercedes"]',
    '"BMW" "Audi" "Mercedes"',
    'sh:in ( "BMW" "Audi" "Mercedes" )',
    ",BMW,Audi,Mercedes",          # stray leading comma
    "  BMW ,  Audi , Mercedes  ",  # irregular spacing
]


def test_normalise_all_forms() -> None:
    for form in _EQUIVALENT_FORMS:
        got = _normalize_in_value(form)
        check(f"normalises {form!r} -> 'BMW,Audi,Mercedes'", got == "BMW,Audi,Mercedes", got)


def test_multiword_quoted_values_preserved() -> None:
    # A comma inside a quoted value must not split it into two terms.
    got = _normalize_in_value('"New York", "Los Angeles"')
    check("multi-word quoted values preserved", got == "New York,Los Angeles", got)


def _car_shape_with_in(raw_in: object) -> str:
    """Simulate the real pipeline: normalise the LLM value, build the shape,
    and serialise it to Turtle."""
    normalized = _normalize_constraints({"in": raw_in})
    state = WizardState(
        shapeName="CarShape",
        targetType="class",
        targetValue="Car",
        properties=[PropertyShape(path="make", constraints=PropertyConstraints(**normalized))],
    )
    graph, _ = build_shapes_graph(state, BASE, PREFIX)
    return serialize_shapes_graph(graph, BASE, PREFIX)["turtle"]


def test_generates_valid_turtle_and_enforces_enum() -> None:
    # Use the worst-offending RDF-list-syntax form as the input.
    turtle = _car_shape_with_in('( "BMW" "Audi" "Mercedes" )')
    check(
        "sh:in serialises as three individually quoted terms",
        'sh:in ( "BMW" "Audi" "Mercedes" )' in turtle,
        turtle,
    )
    check("no stray parenthesis leaked into a term", '"("' not in turtle and '(,' not in turtle, turtle)

    # A conforming car and a violating car.
    data = (
        f"@prefix ex: <{BASE}> .\n"
        "ex:car1 a ex:Car ; ex:make \"BMW\" .\n"
        "ex:car2 a ex:Car ; ex:make \"Toyota\" .\n"
    )
    report = run_pyshacl_validation(data, turtle, "data.ttl", "turtle", "turtle")
    check("PySHACL parses the generated shapes graph and reports non-conformance", report.status == "invalid")
    values = " ".join((v.value or "") for v in report.violations)
    check("the disallowed value 'Toyota' is the one flagged", "Toyota" in values, values)
    check("the allowed value 'BMW' is NOT flagged", "BMW" not in values, values)


def test_leading_comma_form_also_valid() -> None:
    turtle = _car_shape_with_in(",BMW,Audi,Mercedes")
    check(
        "leading-comma form still produces a clean sh:in list",
        'sh:in ( "BMW" "Audi" "Mercedes" )' in turtle,
        turtle,
    )
    data = f"@prefix ex: <{BASE}> .\nex:car1 a ex:Car ; ex:make \"BMW\" .\n"
    report = run_pyshacl_validation(data, turtle, "data.ttl", "turtle", "turtle")
    check("conforming data passes against the generated shape", report.status == "valid", report.report_text)


def main() -> int:
    test_normalise_all_forms()
    test_multiword_quoted_values_preserved()
    test_generates_valid_turtle_and_enforces_enum()
    test_leading_comma_form_also_valid()
    print()
    if _failures:
        print(f"{len(_failures)} check(s) FAILED: {_failures}")
        return 1
    print("All sh:in enumeration checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
