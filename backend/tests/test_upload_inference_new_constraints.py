"""Upload-assisted inference: the additive detectors for the newer constraint
types (sh:class, sh:minInclusive/maxInclusive, sh:languageIn, sh:uniqueLang),
plus a guard that the original five detections (datatype, nodeKind, minCount,
maxCount, sh:in) are unchanged for a simple graph.

Run from backend/ with the venv python:
    python -m tests.test_upload_inference_new_constraints
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rdflib import Graph

from app.services.rdf_parser import extract_rdf_hints, infer_constraints

DATA = """@prefix ex: <http://example.org/> .
ex:Dept a ex:Department ; ex:deptName "Engineering" .
ex:E1 a ex:Employee ;
    ex:name "Alice" ; ex:age 25 ; ex:status "active" ;
    ex:dept ex:Dept ; ex:label "Engineer"@en , "Ingenieurin"@de .
ex:E2 a ex:Employee ;
    ex:name "Bob" ; ex:age 40 ; ex:status "inactive" ;
    ex:dept ex:Dept ; ex:label "Manager"@en , "Manager"@de .
"""

_failures: list[str] = []


def check(label: str, cond: bool, extra: str = "") -> None:
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" — {extra}" if extra and not cond else ""))
    if not cond:
        _failures.append(label)


def main() -> int:
    g = Graph()
    g.parse(data=DATA, format="turtle")
    h = extract_rdf_hints(g)
    inf, _ = infer_constraints(g, h.properties, inference_limit_triples=2_000_000, prefixes=h.prefixes)

    age = inf.get("ex:age", {})
    dept = inf.get("ex:dept", {})
    label = inf.get("ex:label", {})
    status = inf.get("ex:status", {})

    # ── New additive detectors ──
    check("sh:class inferred from typed IRI objects", dept.get("class") == "ex:Department", str(dept))
    check("sh:minInclusive from observed numeric range", age.get("minInclusive") == "25", str(age))
    check("sh:maxInclusive from observed numeric range", age.get("maxInclusive") == "40", str(age))
    check("sh:languageIn from language tags", label.get("languageIn") == "en,de", str(label))
    check("sh:uniqueLang when langs unique per subject", label.get("uniqueLang") == "true", str(label))

    # ── Original five detections unchanged (regression guard) ──
    check("datatype still inferred", age.get("datatype") == "xsd:integer", str(age))
    check("nodeKind still inferred (IRI)", dept.get("nodeKind") == "sh:IRI", str(dept))
    check("nodeKind still inferred (Literal)", label.get("nodeKind") == "sh:Literal", str(label))
    check("maxCount still inferred", age.get("maxCount") == "1", str(age))
    check("sh:in still inferred", status.get("in") == "active,inactive", str(status))

    # ── No false positives ──
    check("no sh:class on a literal property", "class" not in label, str(label))
    check("no languageIn on a plain-string property", "languageIn" not in inf.get("ex:name", {}), str(inf.get("ex:name", {})))
    check("no numeric range on a string property", "minInclusive" not in status, str(status))

    print()
    if _failures:
        print(f"{len(_failures)} check(s) FAILED: {_failures}")
        return 1
    print("All upload-inference checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
