"""
benchmark_all.py – Comprehensive benchmark of all DBpedia TTL files.
Tests every file end-to-end and produces a full report.
No app imports — stdlib only, plus rdflib for load-time measurement.

Usage: python benchmark_all.py
"""
from __future__ import annotations

import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import NamedTuple

# ── Config ────────────────────────────────────────────────────────────────────
JENA_JAVA_BIN  = r"C:\Program Files\JetBrains\IntelliJ IDEA 2024.2.3\jbr\bin\java.exe"
JENA_CLASS_DIR = r"C:\Users\msi\Documents\TUM\BPC Data Engineering\apache-jena-6.1.0"
DBPEDIA_DIR    = r"C:\Users\msi\Documents\TUM\BPC Data Engineering\Examples\DBpedia"
JENA_TIMEOUT   = 600  # seconds per file

# Sampling tier config — matches app defaults
TIER1_THRESHOLD = 100_000
TIER2_THRESHOLD = 1_000_000
TIER1_RATE      = 0.5
TIER2_RATE      = 0.2
SAMPLE_MAX      = 500_000

# ── NT parsing helpers ────────────────────────────────────────────────────────
TYPE_MARKER = b"rdf-syntax-ns#type>"
OBJ_IRI_RE  = re.compile(rb"<([^>]+)>\s*\.\s*$")
PRED_RE     = re.compile(rb"^(?:<[^>]+>|_:\S+)\s+<([^>]+)>")


def _is_triple(line: bytes) -> bool:
    s = line.strip()
    return bool(s) and (s[0:1] == b"<" or s[:2] == b"_:")


# ── Stage 1: Jena conversion ──────────────────────────────────────────────────

def jena_ttl_to_nt(ttl_path: str, nt_path: str) -> float:
    """Convert TTL → N-Triples via TurtleParser. Returns elapsed seconds."""
    classpath = (
        JENA_CLASS_DIR
        + os.pathsep
        + os.path.join(JENA_CLASS_DIR, "lib", "*")
    )
    t0 = time.monotonic()
    with open(nt_path, "wb") as fh:
        proc = subprocess.run(
            [JENA_JAVA_BIN, "-cp", classpath, "TurtleParser", ttl_path],
            stdout=fh,
            stderr=subprocess.PIPE,
            timeout=JENA_TIMEOUT,
        )
    elapsed = time.monotonic() - t0
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"TurtleParser rc={proc.returncode}: {err[:400]}")
    return elapsed


# ── Stage 2: Analyze NT file ──────────────────────────────────────────────────

def analyze_nt(nt_path: str) -> tuple[int, set[str], set[str]]:
    """Single-pass: return (total_triples, class_uris, predicate_uris)."""
    total: int = 0
    classes: set[str] = set()
    props: set[str] = set()

    with open(nt_path, "rb") as f:
        for line in f:
            if not _is_triple(line):
                continue
            total += 1
            if TYPE_MARKER in line:
                m = OBJ_IRI_RE.search(line)
                if m:
                    classes.add(m.group(1).decode("utf-8", errors="replace"))
            else:
                m = PRED_RE.match(line)
                if m:
                    props.add(m.group(1).decode("utf-8", errors="replace"))

    return total, classes, props


# ── Stage 3: Adaptive sampling ────────────────────────────────────────────────

def adaptive_sample(
    nt_path: str, sampled_path: str
) -> tuple[int, int, str, int]:
    """Apply the same tier logic as rdf_parser.py _sample_nt_file().

    Returns (total_triples, sampled_triples, tier_name, target).
    tier_name is one of: 'none', 'tier1', 'tier2'.
    """
    # Pass 0: count (O(1) memory)
    total = 0
    with open(nt_path, "rb") as f:
        for line in f:
            if _is_triple(line):
                total += 1

    if total < TIER1_THRESHOLD:
        shutil.copy2(nt_path, sampled_path)
        return total, total, "none", total

    if total < TIER2_THRESHOLD:
        tier_name = "tier1"
        target = max(TIER1_THRESHOLD, int(total * TIER1_RATE))
    else:
        tier_name = "tier2"
        target = min(SAMPLE_MAX, int(total * TIER2_RATE))

    rng = random.Random()

    # Pass 1: reservoir-sample type lines, cap at target
    type_res: list[bytes] = []
    type_seen = 0
    with open(nt_path, "rb") as f:
        for line in f:
            if not _is_triple(line):
                continue
            if TYPE_MARKER in line:
                type_seen += 1
                if len(type_res) < target:
                    type_res.append(line)
                else:
                    j = rng.randint(0, type_seen - 1)
                    if j < target:
                        type_res[j] = line

    quota = max(0, target - len(type_res))

    # Pass 2: reservoir-sample non-type lines for remaining quota
    data_res: list[bytes] = []
    data_seen = 0
    with open(nt_path, "rb") as f:
        for line in f:
            if not _is_triple(line):
                continue
            if TYPE_MARKER in line:
                continue
            data_seen += 1
            if len(data_res) < quota:
                data_res.append(line)
            elif quota > 0:
                j = rng.randint(0, data_seen - 1)
                if j < quota:
                    data_res[j] = line

    with open(sampled_path, "wb") as out:
        for line in type_res:
            out.write(line)
        for line in data_res:
            out.write(line)

    sampled = len(type_res) + len(data_res)
    return total, sampled, tier_name, target


def _local_name(uri: str) -> str:
    if "#" in uri:
        return uri.rsplit("#", 1)[1]
    return uri.rstrip("/").rsplit("/", 1)[-1]


# ── Stage 4: RDFLib load ──────────────────────────────────────────────────────

def rdflib_load_time(nt_path: str) -> float:
    """Load the sampled NT file with RDFLib and return elapsed seconds."""
    try:
        import rdflib  # type: ignore[import]
    except ImportError:
        raise RuntimeError("rdflib is not installed; run: pip install rdflib")
    g = rdflib.Graph()
    t0 = time.monotonic()
    g.parse(nt_path, format="nt")
    return time.monotonic() - t0


# ── Result record ─────────────────────────────────────────────────────────────

class FileResult(NamedTuple):
    name: str
    size_mb: float
    jena_time: float
    total_triples: int
    tier: str
    target: int
    sampled: int
    full_classes: int
    sampled_classes: int
    full_props: int
    sampled_props: int
    rdflib_time: float
    total_time: float
    error: str | None
    missing_classes: tuple[str, ...] = ()
    missing_props: tuple[str, ...] = ()


# ── Per-file benchmark ────────────────────────────────────────────────────────

def benchmark_file(ttl_path: Path, idx: int, n_files: int) -> FileResult:
    size_mb = ttl_path.stat().st_size / (1 << 20)
    print(f"\n[{idx}/{n_files}] {ttl_path.name} ({size_mb:.1f} MB) ...", flush=True)

    nt_tmp      = tempfile.NamedTemporaryFile(delete=False, suffix=".nt")
    sampled_tmp = tempfile.NamedTemporaryFile(delete=False, suffix="_sampled.nt")
    nt_tmp.close()
    sampled_tmp.close()

    t_pipeline = time.monotonic()
    try:
        # 1. Jena parse
        t_jena = jena_ttl_to_nt(str(ttl_path), nt_tmp.name)

        # 2. Analyze full graph
        full_total, full_cls_set, full_prop_set = analyze_nt(nt_tmp.name)
        print(f"  Jena parse: {t_jena:.1f}s | Triples: {full_total:,}", flush=True)

        # 3. Sample
        total, sampled_count, tier_name, target = adaptive_sample(
            nt_tmp.name, sampled_tmp.name
        )
        rate_pct = sampled_count / max(total, 1) * 100
        print(
            f"  Sampling: {tier_name} | target={target:,} | "
            f"actual={sampled_count:,} ({rate_pct:.0f}%)",
            flush=True,
        )

        # 4. Analyze sampled graph
        _, samp_cls_set, samp_prop_set = analyze_nt(sampled_tmp.name)
        n_fc, n_sc = len(full_cls_set),  len(samp_cls_set)
        n_fp, n_sp = len(full_prop_set), len(samp_prop_set)

        miss_cls  = tuple(sorted(_local_name(u) for u in full_cls_set  - samp_cls_set))
        miss_prop = tuple(sorted(_local_name(u) for u in full_prop_set - samp_prop_set))

        cls_str  = f"{n_sc}/{n_fc} ({n_sc / max(n_fc, 1) * 100:.0f}%)"
        prop_str = (
            f"{n_sp}/{n_fp} ({n_sp / n_fp * 100:.0f}%)" if n_fp > 0 else "N/A"
        )
        print(f"  Coverage: classes={cls_str} | props={prop_str}", flush=True)

        # 5. RDFLib load of sampled file
        t_rdflib = rdflib_load_time(sampled_tmp.name)
        print(f"  RDFLib load: {t_rdflib:.1f}s", flush=True)

        t_total = time.monotonic() - t_pipeline
        print(f"  Total: {t_total:.1f}s", flush=True)

        return FileResult(
            name=ttl_path.name,
            size_mb=size_mb,
            jena_time=t_jena,
            total_triples=full_total,
            tier=tier_name,
            target=target,
            sampled=sampled_count,
            full_classes=n_fc,
            sampled_classes=n_sc,
            full_props=n_fp,
            sampled_props=n_sp,
            rdflib_time=t_rdflib,
            total_time=t_total,
            error=None,
            missing_classes=miss_cls,
            missing_props=miss_prop,
        )

    except Exception as exc:
        t_total = time.monotonic() - t_pipeline
        msg = str(exc)
        print(f"  ERROR after {t_total:.1f}s: {msg}", flush=True)
        return FileResult(
            name=ttl_path.name,
            size_mb=size_mb,
            jena_time=0.0,
            total_triples=0,
            tier="FAILED",
            target=0,
            sampled=0,
            full_classes=0,
            sampled_classes=0,
            full_props=0,
            sampled_props=0,
            rdflib_time=0.0,
            total_time=t_total,
            error=msg,
        )

    finally:
        for p in (nt_tmp.name, sampled_tmp.name):
            try:
                os.unlink(p)
            except OSError:
                pass


# ── Reporting ─────────────────────────────────────────────────────────────────

def _sample_rate_str(r: FileResult) -> str:
    if r.tier == "none":
        return "100% (none)"
    pct = r.sampled / max(r.total_triples, 1) * 100
    return f"{pct:.0f}% ({r.tier})"


def _cls_str(r: FileResult) -> str:
    if r.full_classes == 0:
        return "N/A"
    pct = r.sampled_classes / r.full_classes * 100
    return f"{r.sampled_classes}/{r.full_classes} ({pct:.0f}%)"


def _prop_str(r: FileResult) -> str:
    if r.full_props == 0:
        return "N/A"
    pct = r.sampled_props / r.full_props * 100
    return f"{r.sampled_props}/{r.full_props} ({pct:.0f}%)"


def print_summary_table(results: list[FileResult]) -> None:
    col_file = max((len(r.name) for r in results), default=4)
    col_file = max(col_file, len("File"))

    # Pre-compute column values so we can size them
    rows: list[dict] = []
    for r in results:
        if r.error:
            rows.append({
                "name": r.name,
                "size":    f"{r.size_mb:.1f}",
                "triples": "FAILED",
                "jena":    "—",
                "rate":    "—",
                "cls":     "—",
                "prop":    "—",
                "total":   f"{r.total_time:.1f}s",
            })
        else:
            rows.append({
                "name": r.name,
                "size":    f"{r.size_mb:.1f}",
                "triples": f"{r.total_triples:,}",
                "jena":    f"{r.jena_time:.1f}s",
                "rate":    _sample_rate_str(r),
                "cls":     _cls_str(r),
                "prop":    _prop_str(r),
                "total":   f"{r.total_time:.1f}s",
            })

    # Column widths
    w = {
        "name":    col_file,
        "size":    max(len(d["size"])    for d in rows + [{"size":    "Size MB"}]),
        "triples": max(len(d["triples"]) for d in rows + [{"triples": "Triples"}]),
        "jena":    max(len(d["jena"])    for d in rows + [{"jena":    "Jena"}]),
        "rate":    max(len(d["rate"])    for d in rows + [{"rate":    "Sample rate"}]),
        "cls":     max(len(d["cls"])     for d in rows + [{"cls":     "Class cov"}]),
        "prop":    max(len(d["prop"])    for d in rows + [{"prop":    "Prop cov"}]),
        "total":   max(len(d["total"])   for d in rows + [{"total":   "Total"}]),
    }

    def fmt(d: dict) -> str:
        return (
            f"{d['name']:<{w['name']}} | {d['size']:>{w['size']}} | "
            f"{d['triples']:>{w['triples']}} | {d['jena']:>{w['jena']}} | "
            f"{d['rate']:>{w['rate']}} | {d['cls']:>{w['cls']}} | "
            f"{d['prop']:>{w['prop']}} | {d['total']:>{w['total']}}"
        )

    header = fmt({
        "name": "File", "size": "Size MB", "triples": "Triples",
        "jena": "Jena", "rate": "Sample rate", "cls": "Class cov",
        "prop": "Prop cov", "total": "Total",
    })
    sep = "-" * len(header)
    wide = "=" * len(header)

    print(f"\n{wide}")
    print("SUMMARY TABLE")
    print(wide)
    print(header)
    print(sep)
    for row in rows:
        print(fmt(row))
    print(sep)


def print_coverage_gaps(results: list[FileResult]) -> None:
    gaps = [
        r for r in results
        if not r.error and (r.missing_classes or r.missing_props)
    ]
    sep = "=" * 60
    print(f"\n{sep}")
    print("COVERAGE GAPS DETAIL")
    print(sep)
    if not gaps:
        print("No coverage gaps — all sampled files retained 100% of classes and properties.")
        print(sep)
        return
    for r in gaps:
        if r.missing_classes:
            print(f"\n{r.name} -- {len(r.missing_classes)} missing class(es):")
            for name in r.missing_classes:
                print(f"  - {name}")
        if r.missing_props:
            print(f"\n{r.name} -- {len(r.missing_props)} missing propert(ies):")
            for name in r.missing_props:
                print(f"  - {name}")
    print(sep)


def print_findings(results: list[FileResult]) -> None:
    ok     = [r for r in results if not r.error]
    failed = [r for r in results if r.error]

    sep = "=" * 60
    print(f"\n{sep}")
    print("FINDINGS")
    print(sep)

    if ok:
        fastest = min(ok, key=lambda r: r.total_time)
        slowest = max(ok, key=lambda r: r.total_time)
        print(f"Fastest file : {fastest.name}  ({fastest.total_time:.1f}s total)")
        print(f"Slowest file : {slowest.name}  ({slowest.total_time:.1f}s total)")

    low_cls = [
        r for r in ok
        if r.full_classes > 0 and r.sampled_classes < r.full_classes
    ]
    low_prop = [
        r for r in ok
        if r.full_props > 0 and r.sampled_props < r.full_props
    ]

    print()
    if low_cls:
        print("Files with class coverage < 100%:")
        for r in low_cls:
            pct = r.sampled_classes / r.full_classes * 100
            print(
                f"  {r.name}: {r.sampled_classes}/{r.full_classes} "
                f"({pct:.1f}%) — {r.full_classes - r.sampled_classes} missing"
            )
    else:
        print("Class coverage   : 100% on all files (or no classes present).")

    print()
    if low_prop:
        print("Files with property coverage < 100%:")
        for r in low_prop:
            pct = r.sampled_props / r.full_props * 100
            print(
                f"  {r.name}: {r.sampled_props}/{r.full_props} "
                f"({pct:.1f}%) — {r.full_props - r.sampled_props} missing"
            )
    else:
        print("Property coverage: 100% on all files (or no properties present).")

    print()
    if failed:
        print(f"Failed / timed-out files ({len(failed)}):")
        for r in failed:
            print(f"  {r.name}: {r.error}")
    else:
        print(f"All {len(results)} files completed without errors.")

    print(sep)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    dbpedia = Path(DBPEDIA_DIR)
    if not dbpedia.is_dir():
        print(f"ERROR: directory not found:\n  {DBPEDIA_DIR}")
        sys.exit(1)

    ttl_files = sorted(dbpedia.glob("*.ttl"))
    if not ttl_files:
        print(f"ERROR: no .ttl files found in {DBPEDIA_DIR}")
        sys.exit(1)

    total_size_mb = sum(f.stat().st_size for f in ttl_files) / (1 << 20)
    print(f"Found {len(ttl_files)} TTL file(s) in:")
    print(f"  {DBPEDIA_DIR}")
    print(f"Total dataset size: {total_size_mb:,.1f} MB\n")
    print("Jena timeout per file:", JENA_TIMEOUT, "s")
    print("Sampling tiers:")
    print(f"  Tier 1: {TIER1_THRESHOLD:,}-{TIER2_THRESHOLD:,} triples  =>  {TIER1_RATE*100:.0f}% rate, min {TIER1_THRESHOLD:,}")
    print(f"  Tier 2: >{TIER2_THRESHOLD:,} triples             =>  {TIER2_RATE*100:.0f}% rate, max {SAMPLE_MAX:,}")

    t_all_start = time.monotonic()
    results: list[FileResult] = []

    for i, ttl_path in enumerate(ttl_files, 1):
        result = benchmark_file(ttl_path, i, len(ttl_files))
        results.append(result)

    total_wall = time.monotonic() - t_all_start
    print(f"\n{'='*60}")
    print(f"All {len(ttl_files)} files processed in {total_wall:.1f}s wall time.")

    print_summary_table(results)
    print_coverage_gaps(results)
    print_findings(results)


if __name__ == "__main__":
    main()
