"""Regression fixtures + golden-snapshot guard for the SHACL generator (shapes.py).

The three reference shapes (University, Department, FullProfessor) mirror the
LUBM-style schemas used in the existing evaluation. They exercise ONLY the
constraint types that already emit today, so the generated shapes graph must
stay semantically identical across every phase of the full-coverage work.

NOTE on "byte-for-byte": RDFLib's Turtle serializer does not order blank nodes
deterministically across process runs (it depends on the interpreter hash
seed), so a raw string comparison fails even for unchanged code. The meaningful
regression guard for a blank-node graph is RDF graph *isomorphism* — every
triple identical, blank nodes matched up to renaming. That is what this script
checks. The golden .ttl is kept as a human-readable reference serialization.

Usage:
    # Capture the baseline (run once, before any changes):
    python -m tests.regression_shapes --write

    # Verify current output matches the captured baseline (run after each phase):
    python -m tests.regression_shapes

Run from the backend/ directory with the venv python so `app` imports resolve.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rdflib import Graph
from rdflib.compare import graph_diff, isomorphic

from app.models import PropertyConstraints, PropertyShape, WizardState
from app.services.shapes import build_shapes_graph, serialize_shapes_graph

GOLDEN = Path(__file__).resolve().parent / "golden_reference_shapes.ttl"

BASE_URI = "http://swat.cse.lehigh.edu/onto/univ-bench.owl#"
PREFIX = "ub"


def _prop(path: str, **constraints: str) -> PropertyShape:
    return PropertyShape(path=path, constraints=PropertyConstraints(**constraints))


def reference_state() -> WizardState:
    """University + Department completed shapes, FullProfessor as the active shape.

    Covers every currently-emitting constraint: minCount, maxCount, minLength,
    maxLength, minInclusive, maxInclusive, minExclusive, maxExclusive, datatype,
    nodeKind, pattern, class, node, and in.
    """
    university = {
        "shapeName": "UniversityShape",
        "targetType": "class",
        "targetValue": "University",
        "properties": [
            _prop("name", minCount="1", maxCount="1", datatype="xsd:string", minLength="2", maxLength="120"),
            _prop("homepage", nodeKind="sh:IRI", maxCount="1"),
        ],
    }
    department = {
        "shapeName": "DepartmentShape",
        "targetType": "class",
        "targetValue": "Department",
        "properties": [
            _prop("name", minCount="1", datatype="xsd:string"),
            _prop("subOrganizationOf", nodeKind="sh:IRI", node="UniversityShape", minCount="1", maxCount="1"),
        ],
    }
    full_professor = WizardState(
        shapeName="FullProfessorShape",
        targetType="class",
        targetValue="FullProfessor",
        selectedPrefix=PREFIX,
        selectedNamespace=BASE_URI,
        completedShapes=[university, department],
        properties=[
            _prop("name", minCount="1", maxCount="1", datatype="xsd:string"),
            _prop("age", datatype="xsd:integer", minInclusive="18", maxInclusive="100"),
            _prop("emailAddress", datatype="xsd:string", pattern=r"^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$"),
            _prop("researchInterest", datatype="xsd:string", in_="AI, Databases, Semantic Web"),
            _prop("worksFor", nodeKind="sh:IRI", node="DepartmentShape", minCount="1"),
            _prop("teachingRating", datatype="xsd:decimal", minExclusive="0", maxExclusive="5"),
            _prop("advisorOf", **{"class": "GraduateStudent"}),
        ],
    )
    return full_professor


def generate_turtle() -> str:
    state = reference_state()
    graph, _ = build_shapes_graph(state, BASE_URI, PREFIX)
    return serialize_shapes_graph(graph, BASE_URI, PREFIX, dict(state.detected_prefixes))["turtle"]


def main() -> int:
    turtle = generate_turtle()
    if "--write" in sys.argv:
        GOLDEN.write_text(turtle, encoding="utf-8")
        print(f"Wrote golden baseline ({len(turtle)} bytes) to {GOLDEN}")
        return 0

    if not GOLDEN.exists():
        print("No golden baseline found. Run with --write first.")
        return 2

    current = Graph().parse(data=turtle, format="turtle")
    golden = Graph().parse(str(GOLDEN), format="turtle")

    if isomorphic(current, golden):
        print(
            f"PASS: generated shapes graph is isomorphic to the golden baseline "
            f"({len(current)} triples)."
        )
        return 0

    print("FAIL: generated shapes graph DIFFERS from the golden baseline.")
    in_both, only_golden, only_current = graph_diff(golden, current)
    if only_golden:
        print(f"\n-- Triples in golden but NOT in current ({len(only_golden)}):")
        for s, p, o in sorted(only_golden, key=str):
            print(f"  - {s} {p} {o}")
    if only_current:
        print(f"\n-- Triples in current but NOT in golden ({len(only_current)}):")
        for s, p, o in sorted(only_current, key=str):
            print(f"  + {s} {p} {o}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
