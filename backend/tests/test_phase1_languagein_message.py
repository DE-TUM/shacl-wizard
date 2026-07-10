"""Phase 1 regression tests:
  1. sh:languageIn is emitted by the backend generator (was silently dropped).
  2. sh:message is emitted at both property-shape and node-shape level.
  3. A custom sh:message surfaces in the PySHACL validation report, while a
     shape WITHOUT sh:message still produces the engine's default message
     (no regression to the existing plain-English report).

Run from backend/ with the venv python:
    python -m tests.test_phase1_languagein_message
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rdflib import Graph, Literal
from rdflib.namespace import SH

from app.models import PropertyConstraints, PropertyShape, WizardState
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


def test_languagein_emitted() -> None:
    state = WizardState(
        shapeName="LabelShape",
        targetType="class",
        targetValue="Thing",
        properties=[
            PropertyShape(path="label", constraints=PropertyConstraints(languageIn="en, de, fr")),
        ],
    )
    graph, _ = build_shapes_graph(state, BASE, PREFIX)
    lang_lists = list(graph.objects(None, SH.languageIn))
    check("sh:languageIn is present in the graph", len(lang_lists) == 1)

    turtle = serialize_shapes_graph(graph, BASE, PREFIX)["turtle"]
    check(
        "sh:languageIn serialises as an RDF list of tags",
        'sh:languageIn ( "en" "de" "fr" )' in turtle,
        turtle,
    )


def test_message_emitted_both_levels() -> None:
    state = WizardState(
        shapeName="PersonShape",
        shapeMessage="This node must be a valid Person.",
        targetType="class",
        targetValue="Person",
        properties=[
            PropertyShape(
                path="email",
                constraints=PropertyConstraints(minCount="1", message="Every person needs an email."),
            ),
        ],
    )
    graph, shape_uri = build_shapes_graph(state, BASE, PREFIX)

    shape_msgs = list(graph.objects(None, SH.message))
    check("two sh:message triples emitted (shape + property)", len(shape_msgs) == 2,
          f"found {len(shape_msgs)}")

    from rdflib import URIRef
    node_level = (URIRef(shape_uri), SH.message, Literal("This node must be a valid Person.")) in graph
    check("NodeShape-level sh:message present", node_level)


def test_custom_message_in_report() -> None:
    # Shape WITH a custom property-level message.
    state = WizardState(
        shapeName="PersonShape",
        targetType="class",
        targetValue="Person",
        properties=[
            PropertyShape(
                path="email",
                constraints=PropertyConstraints(minCount="1", message="Every person needs an email."),
            ),
        ],
    )
    graph, _ = build_shapes_graph(state, BASE, PREFIX)
    shapes_ttl = serialize_shapes_graph(graph, BASE, PREFIX)["turtle"]

    # Data with a Person that has NO email -> violates minCount 1.
    data = f"@prefix ex: <{BASE}> . ex:alice a ex:Person ."
    report = run_pyshacl_validation(data, shapes_ttl, "data.ttl", "turtle", "turtle")
    check("invalid data reported as non-conforming", report.status == "invalid")
    msg_blob = " ".join(v.message for v in report.violations)
    check(
        "custom sh:message surfaces in the validation report",
        "Every person needs an email." in msg_blob,
        msg_blob,
    )


def test_default_message_still_works() -> None:
    # Same shape but WITHOUT any sh:message -> PySHACL's default message path.
    state = WizardState(
        shapeName="PersonShape",
        targetType="class",
        targetValue="Person",
        properties=[
            PropertyShape(path="email", constraints=PropertyConstraints(minCount="1")),
        ],
    )
    graph, _ = build_shapes_graph(state, BASE, PREFIX)
    shapes_ttl = serialize_shapes_graph(graph, BASE, PREFIX)["turtle"]
    data = f"@prefix ex: <{BASE}> . ex:alice a ex:Person ."
    report = run_pyshacl_validation(data, shapes_ttl, "data.ttl", "turtle", "turtle")
    check("invalid data reported as non-conforming (no custom msg)", report.status == "invalid")
    msg_blob = " ".join(v.message for v in report.violations)
    check(
        "default engine message present and non-empty when no sh:message",
        len(msg_blob.strip()) > 0 and "Every person needs an email." not in msg_blob,
        msg_blob,
    )


def main() -> int:
    test_languagein_emitted()
    test_message_emitted_both_levels()
    test_custom_message_in_report()
    test_default_message_still_works()
    print()
    if _failures:
        print(f"{len(_failures)} check(s) FAILED: {_failures}")
        return 1
    print("All Phase 1 checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
