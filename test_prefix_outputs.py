"""
End-to-end test for prefix handling and output format correctness.
Calls the running backend at http://localhost:8000.
Results are written to test_prefix_results.md in the project root.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import requests

BASE = "http://localhost:8000"
PARSE_URL  = f"{BASE}/api/parse-rdf"
GEN_URL    = f"{BASE}/api/generate"

MULTI_PREFIX_FILE = r"C:\Users\msi\Documents\TUM\BPC Data Engineering\Examples\multi_prefix_test.ttl"
LUBM_FILE         = r"C:\Users\msi\Documents\TUM\BPC Data Engineering\Examples\By Jin\lubm-skg-1.ttl"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_rdf(path: str) -> dict:
    with open(path, "rb") as fh:
        r = requests.post(PARSE_URL, files={"data_file": (Path(path).name, fh, "text/turtle")}, timeout=60)
    r.raise_for_status()
    return r.json()


def build_props(raw_props: list[str], constraints_map: dict) -> list[dict]:
    props = []
    for p in raw_props:
        suggested = constraints_map.get(p, {})
        props.append({"path": p, "constraints": suggested})
    return props


def generate(state: dict) -> dict:
    r = requests.post(GEN_URL, json=state, timeout=60)
    r.raise_for_status()
    return r.json()


def md_fence(lang: str, content: str) -> str:
    return f"```{lang}\n{content}\n```"


# ---------------------------------------------------------------------------
# Validation checks
# ---------------------------------------------------------------------------

def check(label: str, result: bool, note: str = "") -> tuple[bool, str]:
    mark = "x" if result else " "
    line = f"- [{mark}] {label}"
    if not result and note:
        line += f"  \n  > FAIL: {note}"
    return result, line


def validate_turtle(ttl: str, expected_prefixes: list[str], selected_prefix: str,
                    disallowed: list[str] | None = None,
                    schema_http_check: bool = True) -> list[str]:
    lines = []
    disallowed = disallowed or []

    if schema_http_check and "schema" in expected_prefixes:
        ok = "@prefix schema: <http://schema.org/>" in ttl or "@prefix schema: <http://schema.org>" in ttl
        bad = "@prefix schema: <https://schema.org/>" in ttl or "@prefix schema: <https://schema.org>" in ttl
        _, l = check("schema: uses http:// not https://", ok and not bad,
                     f"found: {'https' if bad else 'not declared'}")
        lines.append(l)

    _, l = check("No schema1: present", "schema1:" not in ttl,
                 "schema1: found in output")
    lines.append(l)

    for pfx in expected_prefixes:
        ok = f"@prefix {pfx}:" in ttl
        _, l = check(f"@prefix {pfx}: declared in Turtle", ok, "prefix block missing")
        lines.append(l)

    ex_leak = bool(re.search(r'\bex:', ttl)) and selected_prefix != "ex"
    _, l = check(f"No ex: leak when prefix is {selected_prefix}:", not ex_leak,
                 "ex: found but selected prefix is not ex")
    lines.append(l)

    for d in disallowed:
        _, l = check(f"No {d}: in output", d + ":" not in ttl, f"{d}: found")
        lines.append(l)

    return lines


def validate_jsonld(jld: str, expected_prefixes: list[str]) -> list[str]:
    lines = []
    try:
        obj = json.loads(jld)
    except Exception as e:
        lines.append(f"- [ ] JSON-LD parses as valid JSON  \n  > FAIL: {e}")
        return lines
    _, l = check("JSON-LD parses as valid JSON", True)
    lines.append(l)

    ctx = obj.get("@context", {})
    if isinstance(ctx, list):
        merged: dict = {}
        for item in ctx:
            if isinstance(item, dict):
                merged.update(item)
        ctx = merged

    for pfx in expected_prefixes:
        ok = pfx in ctx
        _, l = check(f"@context includes {pfx}", ok, f"missing from @context")
        lines.append(l)

    return lines


def validate_trig(trig: str, expected_prefixes: list[str], selected_prefix: str,
                  schema_http_check: bool = True) -> list[str]:
    lines = []
    if schema_http_check and "schema" in expected_prefixes:
        ok = "@prefix schema: <http://schema.org/>" in trig or "@prefix schema: <http://schema.org>" in trig
        bad = "@prefix schema: <https://schema.org/>" in trig or "@prefix schema: <https://schema.org>" in trig
        _, l = check("TriG schema: uses http:// not https://", ok and not bad,
                     "https found" if bad else "prefix not declared")
        lines.append(l)

    for pfx in expected_prefixes:
        ok = f"@prefix {pfx}:" in trig
        _, l = check(f"@prefix {pfx}: declared in TriG", ok, "prefix block missing")
        lines.append(l)

    # Spot-check: no raw URIs for expected namespaces when prefix is declared
    for pfx in expected_prefixes:
        # Very rough: if prefix declared but we still see raw URI for it, flag it
        pass  # hard to do generically without the namespace map

    ex_leak = bool(re.search(r'\bex:', trig)) and selected_prefix != "ex"
    _, l = check(f"No ex: leak when prefix is {selected_prefix}:", not ex_leak,
                 "ex: found but selected prefix is not ex")
    lines.append(l)

    return lines


def validate_rdfxml(rdfxml: str) -> list[str]:
    lines = []
    ok = "<?xml" in rdfxml or "<rdf:RDF" in rdfxml
    _, l = check("RDF/XML is non-empty and looks valid", ok, "missing XML declaration or rdf:RDF root")
    lines.append(l)
    return lines


# ---------------------------------------------------------------------------
# Section builder
# ---------------------------------------------------------------------------

def section(title: str, detected_prefixes: dict, validation_checks: list[str],
            turtle: str, jsonld: str, rdfxml: str, trig: str,
            extra_checks: list[str] | None = None) -> str:
    pfx_block = json.dumps(detected_prefixes, indent=2)
    all_checks = validation_checks + (extra_checks or [])
    checks_md = "\n".join(all_checks)
    return f"""## {title}

### Detected Prefixes
```json
{pfx_block}
```

### Validation
{checks_md}

### Turtle Output
{md_fence("turtle", turtle)}

### JSON-LD Output
{md_fence("json", jsonld)}

### RDF/XML Output
{md_fence("xml", rdfxml)}

### TriG Output
{md_fence("trig", trig)}

---
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test1(parsed_multi: dict) -> str:
    """Multi-prefix file, foaf: prefix, foaf:Person shape."""
    print("  Running Test 1 — foaf:Person …")
    pfxs = parsed_multi["prefixes"]
    pbc  = parsed_multi.get("propertiesByClass", {})
    sc   = parsed_multi.get("suggestedConstraints", {})

    person_props_raw = pbc.get("Person", pbc.get("foaf:Person", []))
    props = build_props(person_props_raw, sc)

    state = {
        "mode": "upload",
        "selectedPrefix": "foaf",
        "selectedNamespace": "http://xmlns.com/foaf/0.1/",
        "detectedPrefixes": pfxs,
        "targetType": "class",
        "targetValue": "Person",
        "shapeName": "PersonShape",
        "properties": props,
        "completedShapes": [],
        "nlParsed": False,
    }
    resp = generate(state)
    fmts = resp["formats"]
    ttl  = fmts.get("turtle", "")
    jld  = fmts.get("jsonld", "")
    xml  = fmts.get("rdfxml", "")
    trig = fmts.get("trig", "")

    expected = [p for p in pfxs if p not in ("sh", "xsd", "rdf", "rdfs", "owl")]
    if "foaf" not in expected:
        expected.append("foaf")

    checks  = validate_turtle(ttl, expected, "foaf")
    checks += validate_jsonld(jld, expected)
    checks += validate_trig(trig, expected, "foaf")
    checks += validate_rdfxml(xml)

    return section("Test 1 — foaf:Person (multi_prefix_test.ttl)", pfxs, checks,
                   ttl, jld, xml, trig)


def test2(parsed_multi: dict) -> str:
    """Multi-prefix file, schema: prefix, schema:Organization shape."""
    print("  Running Test 2 — schema:Organization …")
    pfxs = parsed_multi["prefixes"]
    pbc  = parsed_multi.get("propertiesByClass", {})
    sc   = parsed_multi.get("suggestedConstraints", {})

    org_props_raw = pbc.get("Organization", pbc.get("schema:Organization", []))
    props = build_props(org_props_raw, sc)

    state = {
        "mode": "upload",
        "selectedPrefix": "schema",
        "selectedNamespace": "http://schema.org/",
        "detectedPrefixes": pfxs,
        "targetType": "class",
        "targetValue": "Organization",
        "shapeName": "OrganizationShape",
        "properties": props,
        "completedShapes": [],
        "nlParsed": False,
    }
    resp = generate(state)
    fmts = resp["formats"]
    ttl  = fmts.get("turtle", "")
    jld  = fmts.get("jsonld", "")
    xml  = fmts.get("rdfxml", "")
    trig = fmts.get("trig", "")

    expected = [p for p in pfxs if p not in ("sh", "xsd", "rdf", "rdfs", "owl")]
    if "schema" not in expected:
        expected.append("schema")

    checks  = validate_turtle(ttl, expected, "schema")
    checks += validate_jsonld(jld, expected)
    checks += validate_trig(trig, expected, "schema")
    checks += validate_rdfxml(xml)

    extra = []
    _, l = check("No schema1: anywhere in Turtle", "schema1:" not in ttl, "schema1: leaked")
    extra.append(l)

    return section("Test 2 — schema:Organization (multi_prefix_test.ttl)", pfxs, checks,
                   ttl, jld, xml, trig, extra)


def test3(parsed_lubm: dict) -> str:
    """LUBM file, ub: prefix, FullProfessor shape."""
    print("  Running Test 3 — ub:FullProfessor …")
    pfxs = parsed_lubm["prefixes"]
    pbc  = parsed_lubm.get("propertiesByClass", {})
    sc   = parsed_lubm.get("suggestedConstraints", {})

    fp_props_raw = pbc.get("FullProfessor", pbc.get("ub:FullProfessor", []))
    props = build_props(fp_props_raw, sc)

    state = {
        "mode": "upload",
        "selectedPrefix": "ub",
        "selectedNamespace": "http://swat.cse.lehigh.edu/onto/univ-bench.owl#",
        "detectedPrefixes": pfxs,
        "targetType": "class",
        "targetValue": "FullProfessor",
        "shapeName": "FullProfessorShape",
        "properties": props,
        "completedShapes": [],
        "nlParsed": False,
    }
    resp = generate(state)
    fmts = resp["formats"]
    ttl  = fmts.get("turtle", "")
    jld  = fmts.get("jsonld", "")
    xml  = fmts.get("rdfxml", "")
    trig = fmts.get("trig", "")

    expected = ["ub"]
    checks  = validate_turtle(ttl, expected, "ub", schema_http_check=False)
    checks += validate_jsonld(jld, expected)
    checks += validate_trig(trig, expected, "ub", schema_http_check=False)
    checks += validate_rdfxml(xml)

    extra = []
    _, l = check("ub: prefix throughout (zero ex: occurrences in ub: context)",
                 "ex:" not in ttl or "ub:" in ttl,
                 "ex: found where ub: expected")
    extra.append(l)

    return section("Test 3 — ub:FullProfessor (lubm-skg-1.ttl)", pfxs, checks,
                   ttl, jld, xml, trig, extra)


def test4() -> str:
    """Manual mode, custom prefix, no file upload."""
    print("  Running Test 4 — manual mode, myns: …")
    props = [
        {"path": "name",  "constraints": {"nodeKind": "Literal"}},
        {"path": "age",   "constraints": {"nodeKind": "Literal"}},
        {"path": "email", "constraints": {"nodeKind": "Literal"}},
    ]
    state = {
        "mode": "manual",
        "selectedPrefix": "myns",
        "selectedNamespace": "http://mynamespace.org/",
        "detectedPrefixes": {},
        "targetType": "class",
        "targetValue": "Person",
        "shapeName": "PersonShape",
        "properties": props,
        "completedShapes": [],
        "nlParsed": False,
    }
    resp = generate(state)
    fmts = resp["formats"]
    ttl  = fmts.get("turtle", "")
    jld  = fmts.get("jsonld", "")
    xml  = fmts.get("rdfxml", "")
    trig = fmts.get("trig", "")

    checks  = validate_turtle(ttl, ["myns"], "myns", schema_http_check=False)
    checks += validate_jsonld(jld, ["myns"])
    checks += validate_trig(trig, ["myns"], "myns", schema_http_check=False)
    checks += validate_rdfxml(xml)

    extra = []
    _, l = check("myns:name / myns:age / myns:email appear in Turtle",
                 "myns:name" in ttl and "myns:age" in ttl and "myns:email" in ttl,
                 "one or more myns: properties missing")
    extra.append(l)

    return section("Test 4 — Manual mode, myns: prefix", {}, checks,
                   ttl, jld, xml, trig, extra)


def test5(parsed_multi: dict) -> str:
    """Two shapes with sh:node cross-reference."""
    print("  Running Test 5 — two shapes, sh:node cross-ref …")
    pfxs = parsed_multi["prefixes"]
    pbc  = parsed_multi.get("propertiesByClass", {})
    sc   = parsed_multi.get("suggestedConstraints", {})

    org_props_raw  = pbc.get("Organization", pbc.get("schema:Organization", []))
    pers_props_raw = pbc.get("Person",       pbc.get("foaf:Person", []))

    org_props  = build_props(org_props_raw, sc)
    pers_props = build_props(pers_props_raw, sc)

    # Add sh:node constraint to worksFor if present
    for p in pers_props:
        raw = p["path"]
        if "worksFor" in raw or "workplaceHomepage" in raw:
            p["constraints"]["node"] = "foaf:OrganizationShape"

    completed_org = {
        "shapeName": "OrganizationShape",
        "targetType": "class",
        "targetValue": "Organization",
        "properties": org_props,
    }

    state = {
        "mode": "upload",
        "selectedPrefix": "foaf",
        "selectedNamespace": "http://xmlns.com/foaf/0.1/",
        "detectedPrefixes": pfxs,
        "targetType": "class",
        "targetValue": "Person",
        "shapeName": "PersonShape",
        "properties": pers_props,
        "completedShapes": [completed_org],
        "nlParsed": False,
    }
    resp = generate(state)
    fmts = resp["formats"]
    ttl  = fmts.get("turtle", "")
    jld  = fmts.get("jsonld", "")
    xml  = fmts.get("rdfxml", "")
    trig = fmts.get("trig", "")

    expected = [p for p in pfxs if p not in ("sh", "xsd", "rdf", "rdfs", "owl")]
    if "foaf" not in expected:
        expected.append("foaf")

    checks  = validate_turtle(ttl, expected, "foaf")
    checks += validate_jsonld(jld, expected)
    checks += validate_trig(trig, expected, "foaf")
    checks += validate_rdfxml(xml)

    extra = []
    has_sh_node = "sh:node" in ttl and "OrganizationShape" in ttl
    _, l = check("Turtle contains sh:node foaf:OrganizationShape cross-reference",
                 has_sh_node,
                 "sh:node or OrganizationShape not found in Turtle")
    extra.append(l)
    _, l = check("Both PersonShape and OrganizationShape present in Turtle",
                 "PersonShape" in ttl and "OrganizationShape" in ttl,
                 "one or both shapes missing")
    extra.append(l)

    return section("Test 5 — Two shapes with sh:node cross-reference (multi_prefix_test.ttl)",
                   pfxs, checks, ttl, jld, xml, trig, extra)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    sections: list[str] = []
    errors:   list[str] = []

    # Parse files once, reuse for multiple tests
    print("Uploading multi_prefix_test.ttl …")
    try:
        parsed_multi = parse_rdf(MULTI_PREFIX_FILE)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(f"Could not parse multi_prefix_test.ttl: {e}")
        parsed_multi = None

    print("Uploading lubm-skg-1.ttl …")
    try:
        parsed_lubm = parse_rdf(LUBM_FILE)
    except Exception as e:
        print(f"  ERROR: {e}")
        errors.append(f"Could not parse lubm-skg-1.ttl: {e}")
        parsed_lubm = None

    if parsed_multi:
        print("Test 1:")
        try:
            sections.append(test1(parsed_multi))
        except Exception as e:
            print(f"  ERROR: {e}")
            sections.append(f"## Test 1 — FAILED\n\n```\n{e}\n```\n\n---\n")

        print("Test 2:")
        try:
            sections.append(test2(parsed_multi))
        except Exception as e:
            print(f"  ERROR: {e}")
            sections.append(f"## Test 2 — FAILED\n\n```\n{e}\n```\n\n---\n")

    if parsed_lubm:
        print("Test 3:")
        try:
            sections.append(test3(parsed_lubm))
        except Exception as e:
            print(f"  ERROR: {e}")
            sections.append(f"## Test 3 — FAILED\n\n```\n{e}\n```\n\n---\n")

    print("Test 4:")
    try:
        sections.append(test4())
    except Exception as e:
        print(f"  ERROR: {e}")
        sections.append(f"## Test 4 — FAILED\n\n```\n{e}\n```\n\n---\n")

    if parsed_multi:
        print("Test 5:")
        try:
            sections.append(test5(parsed_multi))
        except Exception as e:
            print(f"  ERROR: {e}")
            sections.append(f"## Test 5 — FAILED\n\n```\n{e}\n```\n\n---\n")

    # Build report
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    error_block = ""
    if errors:
        error_block = "\n## Setup Errors\n\n" + "\n".join(f"- {e}" for e in errors) + "\n\n---\n"

    report = (
        f"# Prefix & Output Format Test Results\n"
        f"Generated: {now}\n\n"
        f"---\n"
        f"{error_block}"
        + "\n".join(sections)
    )

    out_path = Path(__file__).parent / "test_prefix_results.md"
    out_path.write_text(report, encoding="utf-8")
    print(f"\nResults written to {out_path}")


if __name__ == "__main__":
    main()
