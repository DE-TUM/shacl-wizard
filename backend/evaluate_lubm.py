"""
BPC report evaluation script.

Compares the SHACL Wizard's upload-assisted statistical inference (Steps 3-4's
"detected properties" + auto-filled constraints, before any AI/NL parsing) against
three hand-authored LUBM reference schemas (supervisor: Jin Ke).

Calls the wizard's own extraction/inference functions directly:
    app.services.rdf_parser.extract_rdf_hints   -- class + per-class property detection
    app.services.rdf_parser.infer_constraints   -- datatype / nodeKind / minCount / maxCount / sh:in

These are the exact functions `parse_rdf_from_file` (the /api/parse-rdf upload
handler) calls. This script bypasses that outer wrapper deliberately:
  - No Jena subprocess (the LUBM file is below the configured 200 MB Jena
    threshold anyway, so the real wizard would use RDFLib for it too).
  - No LLM constraint verification (`constraint_verifier.py`) -- that step calls
    a paid external API and is nondeterministic; this script evaluates the
    deterministic statistical layer only, which is what actually prefills
    Steps 3-4 before a user ever touches AI parsing.

Design notes worth citing in the report:

1. INFERENCE_LIMIT_OVERRIDE -- the wizard's default `RDF_INFERENCE_LIMIT_TRIPLES`
   is 10,000 (app/config.py). The LUBM file used here has ~1M triples, so under
   default settings `infer_constraints` would report `limited=True` and skip
   ALL minCount/maxCount/sh:in inference (see rdf_parser.py:641,714). That would
   make the cardinality-accuracy metric meaningless (always "not inferred").
   This script explicitly raises the limit so the evaluation exercises the
   inference LOGIC rather than just its size guard. The value used is printed
   in the console/markdown output for transparency.

2. Expected nodeKind ground truth is derived EMPIRICALLY from the actual value
   types in the LUBM data (IRI vs Literal), not from the reference schemas'
   sh:node annotations. Reason: the reference schemas do not consistently
   declare sh:node for every object property (e.g. ub:advisor never gets a
   sh:node block in any of the 3 files, even though its values are IRIs in the
   data) -- so using "sh:node present" as ground truth would incorrectly
   penalise the wizard for correctly detecting nodeKind=IRI on such properties.
   Because this empirical check uses the same all-IRI/all-Literal logic
   `infer_constraints` itself uses, nodeKind and datatype agreement are
   expected to land near 100% by construction; cardinality is the metric that
   carries real signal (the wizard's statistical inference only ever produces
   minCount=1 / maxCount=1, so it structurally cannot match reference bounds
   like maxCount=2, 3, 4, 7).

3. Properties detected per class come from `properties_by_class` (correctly
   scoped per rdf:type). Constraints for a property come from the flat,
   graph-wide `suggested_constraints` dict -- there is no per-class constraint
   inference in the current implementation (confirmed against
   Step3Properties.tsx / Step2Shape.tsx: `state.suggestedConstraints[path]` is
   looked up by property path only, never filtered by target class). This
   script reproduces that behaviour faithfully rather than "fixing" it.
"""

from __future__ import annotations

import csv
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from rdflib import Graph, Literal, URIRef
from rdflib.namespace import RDF

from app.services.rdf_parser import extract_rdf_hints, infer_constraints

# ─── Paths ──────────────────────────────────────────────────────────────────

EXAMPLES_DIR = Path(r"C:\Users\msi\Documents\TUM\BPC Data Engineering\Examples\By Jin")
LUBM_FILE = EXAMPLES_DIR / "lubm-skg-1.ttl"
REFERENCE_SCHEMAS = {
    "Schema 1": EXAMPLES_DIR / "schema1.ttl",
    "Schema 2": EXAMPLES_DIR / "schema2.ttl",
    "Schema 3": EXAMPLES_DIR / "schema3.ttl",
}

OUT_DIR = Path(__file__).parent / "evaluation_results"
RAW_CSV = OUT_DIR / "raw_results.csv"
SUMMARY_JSON = OUT_DIR / "summary.json"
SUMMARY_CSV = OUT_DIR / "summary.csv"
SUMMARY_MD = OUT_DIR / "summary.md"
CHART_PNG = OUT_DIR / "chart.png"

# See module docstring, note 1.
INFERENCE_LIMIT_OVERRIDE = 2_000_000

SH = "http://www.w3.org/ns/shacl#"
SH_NODESHAPE = URIRef(SH + "NodeShape")
SH_TARGETCLASS = URIRef(SH + "targetClass")
SH_PROPERTY = URIRef(SH + "property")
SH_PATH = URIRef(SH + "path")
SH_MINCOUNT = URIRef(SH + "minCount")
SH_MAXCOUNT = URIRef(SH + "maxCount")
SH_NODE = URIRef(SH + "node")


# ─── Helpers ────────────────────────────────────────────────────────────────

def local_name(uri: str) -> str:
    if "#" in uri:
        return uri.rsplit("#", 1)[1]
    return uri.rstrip("/").rsplit("/", 1)[-1]


def parse_reference_schema(path: Path) -> dict[str, dict]:
    """Returns {target_class_local_name: {"shape_name": str, "properties": {curie: {...}}}}.

    Duplicate sh:property blocks for the same path within one shape (e.g.
    ub:teacherOf appears twice in FullProfessorShape/LecturerShape -- once
    targeting ub:Course, once ub:GraduateCourse) are merged: the first
    non-null minCount/maxCount/node found across the duplicate blocks wins.
    This also transparently absorbs the "sh:manCount" typo in schema3.ttl
    (lines defining teacherOf/Course), since the sibling teacherOf/GraduateCourse
    block supplies the correct maxCount for the same property path.
    """
    g = Graph()
    g.parse(str(path), format="turtle")
    ns_map = {str(ns): pfx for pfx, ns in g.namespace_manager.namespaces() if pfx}

    def curie(uri) -> str:
        s = str(uri)
        if "#" in s:
            base = s.rsplit("#", 1)[0] + "#"
            if base in ns_map:
                return f"{ns_map[base]}:{s.rsplit('#', 1)[1]}"
        idx = s.rfind("/")
        if idx > 0:
            base2 = s[: idx + 1]
            if base2 in ns_map:
                return f"{ns_map[base2]}:{s[idx + 1:]}"
        return s

    shapes: dict[str, dict] = {}
    for shape_node in g.subjects(RDF.type, SH_NODESHAPE):
        target = g.value(shape_node, SH_TARGETCLASS)
        if target is None:
            continue
        class_local = local_name(str(target))
        props: dict[str, dict] = {}
        for prop_bnode in g.objects(shape_node, SH_PROPERTY):
            path_uri = g.value(prop_bnode, SH_PATH)
            if path_uri is None:
                continue
            prop_curie = curie(path_uri)
            min_count = g.value(prop_bnode, SH_MINCOUNT)
            max_count = g.value(prop_bnode, SH_MAXCOUNT)
            node_ref = g.value(prop_bnode, SH_NODE)
            entry = props.setdefault(prop_curie, {"minCount": None, "maxCount": None, "node": None})
            if min_count is not None and entry["minCount"] is None:
                entry["minCount"] = str(min_count)
            if max_count is not None and entry["maxCount"] is None:
                entry["maxCount"] = str(max_count)
            if node_ref is not None and entry["node"] is None:
                entry["node"] = local_name(str(node_ref))
        shapes[class_local] = {"shape_name": local_name(str(shape_node)), "properties": props}
    return shapes


def compute_empirical_nodekind(
    graph: Graph, prop_curies: set[str], prefixes: dict[str, str]
) -> dict[str, str | None]:
    """Ground-truth nodeKind per property, derived from actual value types in
    the LUBM data (see module docstring, note 2) -- not from the reference
    schemas' (incomplete) sh:node annotations.
    """
    result: dict[str, str | None] = {}
    for curie in prop_curies:
        if ":" not in curie:
            result[curie] = None
            continue
        pfx, local = curie.split(":", 1)
        ns = prefixes.get(pfx)
        if not ns:
            result[curie] = None
            continue
        full_uri = URIRef(ns + local)
        objs = list(graph.objects(None, full_uri))
        if not objs:
            result[curie] = None
            continue
        all_iri = all(isinstance(o, URIRef) for o in objs)
        all_lit = all(isinstance(o, Literal) for o in objs)
        result[curie] = "sh:IRI" if all_iri else ("sh:Literal" if all_lit else "mixed")
    return result


# ─── Main evaluation ────────────────────────────────────────────────────────

def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)

    print(f"Loading LUBM dataset: {LUBM_FILE}")
    t0 = time.monotonic()
    graph = Graph()
    graph.parse(str(LUBM_FILE), format="nt")
    triple_count = len(graph)
    print(f"  Loaded {triple_count:,} triples in {time.monotonic() - t0:.1f}s")

    print("Running extract_rdf_hints (class + per-class property detection)...")
    t0 = time.monotonic()
    hints = extract_rdf_hints(graph)
    print(f"  Done in {time.monotonic() - t0:.1f}s "
          f"({len(hints.classes)} classes, {len(hints.properties)} properties)")

    print(f"Running infer_constraints (inference_limit_triples={INFERENCE_LIMIT_OVERRIDE:,})...")
    t0 = time.monotonic()
    inferred, limited = infer_constraints(
        graph, hints.properties, inference_limit_triples=INFERENCE_LIMIT_OVERRIDE, prefixes=hints.prefixes
    )
    print(f"  Done in {time.monotonic() - t0:.1f}s | limited={limited} "
          f"(True means minCount/maxCount/sh:in were skipped)")
    hints.suggested_constraints = inferred

    print("Parsing reference schemas...")
    ref_schemas = {name: parse_reference_schema(path) for name, path in REFERENCE_SCHEMAS.items()}
    for name, shapes in ref_schemas.items():
        print(f"  {name}: {len(shapes)} shapes -> {sorted(shapes.keys())}")

    all_ref_props: set[str] = set()
    for shapes in ref_schemas.values():
        for cls_data in shapes.values():
            all_ref_props.update(cls_data["properties"].keys())

    print(f"Computing empirical nodeKind ground truth for {len(all_ref_props)} properties...")
    empirical_nodekind = compute_empirical_nodekind(graph, all_ref_props, hints.prefixes)

    # ── Per-schema comparison ───────────────────────────────────────────────
    raw_rows: list[dict] = []
    per_schema_summary: dict[str, dict] = {}

    for schema_name, shapes in ref_schemas.items():
        schema_rows: list[dict] = []

        for class_local, shape_data in shapes.items():
            ref_props = shape_data["properties"]
            detected = set(hints.properties_by_class.get(class_local, []))
            ref_set = set(ref_props.keys())

            for prop in sorted(ref_set | detected):
                in_ref = prop in ref_set
                in_wizard = prop in detected
                row = {
                    "schema": schema_name,
                    "class": class_local,
                    "property": prop,
                    "in_reference": in_ref,
                    "detected_by_wizard": in_wizard,
                    "ref_minCount": "", "ref_maxCount": "", "ref_node": "",
                    "wiz_minCount": "", "wiz_maxCount": "", "wiz_nodeKind": "", "wiz_datatype": "",
                    "expected_nodeKind": "",
                    "nodeKind_match": "", "cardinality_match": "", "datatype_match": "",
                }
                if in_ref and in_wizard:
                    ref_c = ref_props[prop]
                    wiz_c = inferred.get(prop, {})
                    expected_nk = empirical_nodekind.get(prop)
                    wiz_nk = wiz_c.get("nodeKind")
                    nodeKind_match = wiz_nk == expected_nk
                    ref_min, ref_max = ref_c.get("minCount"), ref_c.get("maxCount")
                    wiz_min, wiz_max = wiz_c.get("minCount"), wiz_c.get("maxCount")
                    cardinality_match = (ref_min == wiz_min) and (ref_max == wiz_max)
                    ref_dt = None  # reference schemas never assert sh:datatype
                    wiz_dt = wiz_c.get("datatype")
                    datatype_match = ref_dt == wiz_dt
                    row.update({
                        "ref_minCount": ref_min or "", "ref_maxCount": ref_max or "", "ref_node": ref_c.get("node") or "",
                        "wiz_minCount": wiz_min or "", "wiz_maxCount": wiz_max or "",
                        "wiz_nodeKind": wiz_nk or "", "wiz_datatype": wiz_dt or "",
                        "expected_nodeKind": expected_nk or "",
                        "nodeKind_match": nodeKind_match, "cardinality_match": cardinality_match,
                        "datatype_match": datatype_match,
                    })
                schema_rows.append(row)

        raw_rows.extend(schema_rows)

        n_ref_total = sum(len(s["properties"]) for s in shapes.values())
        n_hit_total = sum(1 for r in schema_rows if r["in_reference"] and r["detected_by_wizard"])
        n_detected_total = sum(1 for r in schema_rows if r["detected_by_wizard"])
        recall = n_hit_total / n_ref_total if n_ref_total else 0.0
        precision = n_hit_total / n_detected_total if n_detected_total else 0.0

        compared = [r for r in schema_rows if r["nodeKind_match"] != ""]
        if compared:
            nodeKind_acc = sum(bool(r["nodeKind_match"]) for r in compared) / len(compared)
            cardinality_acc = sum(bool(r["cardinality_match"]) for r in compared) / len(compared)
            datatype_acc = sum(bool(r["datatype_match"]) for r in compared) / len(compared)
            constraint_acc = (nodeKind_acc + cardinality_acc + datatype_acc) / 3
        else:
            nodeKind_acc = cardinality_acc = datatype_acc = constraint_acc = 0.0

        per_schema_summary[schema_name] = {
            "shapes_evaluated": len(shapes),
            "ref_properties_total": n_ref_total,
            "properties_detected_total": n_detected_total,
            "properties_matched": n_hit_total,
            "recall": recall,
            "precision": precision,
            "nodeKind_accuracy": nodeKind_acc,
            "cardinality_accuracy": cardinality_acc,
            "datatype_accuracy": datatype_acc,
            "constraint_accuracy": constraint_acc,
        }

    # ── Write raw CSV ───────────────────────────────────────────────────────
    fieldnames = [
        "schema", "class", "property", "in_reference", "detected_by_wizard",
        "ref_minCount", "ref_maxCount", "ref_node",
        "wiz_minCount", "wiz_maxCount", "wiz_nodeKind", "wiz_datatype",
        "expected_nodeKind", "nodeKind_match", "cardinality_match", "datatype_match",
    ]
    with open(RAW_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(raw_rows)

    # ── Write summary JSON + CSV ────────────────────────────────────────────
    with open(SUMMARY_JSON, "w", encoding="utf-8") as f:
        json.dump({
            "lubm_file": str(LUBM_FILE),
            "triple_count": triple_count,
            "inference_limit_triples_used": INFERENCE_LIMIT_OVERRIDE,
            "inference_was_limited": limited,
            "per_schema": per_schema_summary,
        }, f, indent=2)

    with open(SUMMARY_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["schema"] + list(next(iter(per_schema_summary.values())).keys()))
        writer.writeheader()
        for name, s in per_schema_summary.items():
            writer.writerow({"schema": name, **s})

    # ── Write markdown summary ──────────────────────────────────────────────
    md_lines = [
        "# SHACL Wizard vs. LUBM reference schemas -- evaluation summary",
        "",
        f"- LUBM dataset: `{LUBM_FILE.name}` ({triple_count:,} triples)",
        f"- Cardinality-inference limit used: {INFERENCE_LIMIT_OVERRIDE:,} triples "
        f"(default wizard setting is 10,000; raised here so cardinality inference "
        f"actually runs against the full ~1M-triple file -- see script docstring)",
        f"- Inference limited (cardinality skipped)? **{limited}**",
        "",
        "## Per-schema results",
        "",
        "| Schema | Shapes | Ref. properties | Recall | Precision | nodeKind acc. | Cardinality acc. | Datatype acc. | Constraint acc. |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for name, s in per_schema_summary.items():
        md_lines.append(
            f"| {name} | {s['shapes_evaluated']} | {s['ref_properties_total']} | "
            f"{s['recall']*100:.0f}% | {s['precision']*100:.0f}% | "
            f"{s['nodeKind_accuracy']*100:.0f}% | {s['cardinality_accuracy']*100:.0f}% | "
            f"{s['datatype_accuracy']*100:.0f}% | {s['constraint_accuracy']*100:.0f}% |"
        )
    md_lines += [
        "",
        "## Quotable summary",
        "",
    ]
    for name, s in per_schema_summary.items():
        md_lines.append(
            f"- **{name}**: recall {s['recall']*100:.0f}%, precision {s['precision']*100:.0f}%, "
            f"constraint accuracy {s['constraint_accuracy']*100:.0f}% "
            f"(nodeKind {s['nodeKind_accuracy']*100:.0f}% / cardinality {s['cardinality_accuracy']*100:.0f}% / "
            f"datatype {s['datatype_accuracy']*100:.0f}%)"
        )
    md_lines += [
        "",
        "## Methodology notes",
        "",
        "- Properties detected per class come from `properties_by_class` (correctly scoped "
        "per `rdf:type`). Constraints applied to a property come from the flat, graph-wide "
        "`suggested_constraints` dict -- the current implementation does not scope statistical "
        "constraint inference per target class, only per property path (matches the real "
        "wizard's Step 3/4 behaviour, confirmed against the frontend source).",
        "- Expected nodeKind is derived empirically from actual value types in the LUBM data "
        "(IRI vs Literal), not from the reference schemas' sh:node annotations, because the "
        "reference schemas omit sh:node for some object properties (e.g. `ub:advisor`). "
        "Because this check uses the same all-IRI/all-Literal logic the wizard's own inference "
        "uses, nodeKind (and datatype, which is trivially None/None since LUBM literals are "
        "untyped and the reference never asserts datatype) are expected to be near 100% by "
        "construction -- cardinality is the metric with genuine signal, since the wizard's "
        "statistical inference can only ever produce minCount=1/maxCount=1 and therefore "
        "structurally cannot match reference bounds such as maxCount=2, 3, 4, or 7.",
    ]
    with open(SUMMARY_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines) + "\n")

    print("\n" + "\n".join(md_lines[md_lines.index("## Quotable summary") + 1:]))

    # ── Chart ────────────────────────────────────────────────────────────────
    make_chart(per_schema_summary)

    print(f"\nWrote:\n  {RAW_CSV}\n  {SUMMARY_JSON}\n  {SUMMARY_CSV}\n  {SUMMARY_MD}\n  {CHART_PNG}")


def make_chart(per_schema_summary: dict[str, dict]) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    schemas = list(per_schema_summary.keys())
    recall = [per_schema_summary[s]["recall"] * 100 for s in schemas]
    precision = [per_schema_summary[s]["precision"] * 100 for s in schemas]
    constraint_acc = [per_schema_summary[s]["constraint_accuracy"] * 100 for s in schemas]

    # Validated categorical palette (dataviz skill, references/palette.md), fixed order.
    COLOR_RECALL = "#0065BD"      # slot 1 -- TUM Blue
    COLOR_PRECISION = "#64A0C8"   # slot 2 -- TUM Blue Light
    COLOR_CONSTRAINT = "#003359"  # slot 3 -- TUM Blue Dark
    INK_PRIMARY = "#0b0b0b"
    INK_MUTED = "#898781"
    GRIDLINE = "#e1e0d9"
    SURFACE = "#fcfcfb"

    x = np.arange(len(schemas))
    width = 0.25

    fig, ax = plt.subplots(figsize=(7, 4.5), dpi=300)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)

    bars1 = ax.bar(x - width, recall, width, label="Recall", color=COLOR_RECALL,
                    edgecolor=SURFACE, linewidth=0.5)
    bars2 = ax.bar(x, precision, width, label="Precision", color=COLOR_PRECISION,
                    edgecolor=SURFACE, linewidth=0.5)
    bars3 = ax.bar(x + width, constraint_acc, width, label="Constraint accuracy", color=COLOR_CONSTRAINT,
                    edgecolor=SURFACE, linewidth=0.5)

    # Direct value labels (relief rule -- aqua/yellow are sub-3:1 on this surface).
    for bars in (bars1, bars2, bars3):
        for b in bars:
            ax.annotate(f"{b.get_height():.0f}%", (b.get_x() + b.get_width() / 2, b.get_height()),
                        xytext=(0, 3), textcoords="offset points", ha="center", va="bottom",
                        fontsize=8, color=INK_PRIMARY)

    ax.set_ylabel("Percent", color=INK_PRIMARY)
    ax.set_ylim(0, 108)
    ax.set_xticks(x)
    ax.set_xticklabels(schemas, color=INK_PRIMARY)
    ax.set_title("SHACL Wizard vs. LUBM reference schemas", color=INK_PRIMARY, fontsize=12)
    ax.tick_params(colors=INK_MUTED)
    ax.yaxis.grid(True, color=GRIDLINE, linewidth=0.8)
    ax.set_axisbelow(True)
    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color(INK_MUTED)
    legend = ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=3)
    for text in legend.get_texts():
        text.set_color(INK_PRIMARY)

    fig.tight_layout()
    fig.savefig(CHART_PNG, facecolor=SURFACE, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    main()
