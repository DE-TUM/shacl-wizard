"""
Standalone benchmark: adaptive sampling class/property coverage on a TTL file.
No app imports — fully self-contained.

Usage: python benchmark_sampling.py
"""
from __future__ import annotations

import os
import random
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
JENA_JAVA_BIN  = r"C:\Program Files\JetBrains\IntelliJ IDEA 2024.2.3\jbr\bin\java.exe"
JENA_CLASS_DIR = r"C:\Users\msi\Documents\TUM\BPC Data Engineering\apache-jena-6.1.0"
TTL_FILE       = r"C:\Users\msi\Documents\TUM\BPC Data Engineering\Examples\By Jin\lubm-skg-1.ttl"
JENA_TIMEOUT   = 600  # seconds

# Sampling tier config — matches app defaults in .env
TIER1_THRESHOLD = 100_000
TIER2_THRESHOLD = 1_000_000
TIER1_RATE      = 0.5
TIER2_RATE      = 0.2
SAMPLE_MAX      = 500_000

# ── NT parsing helpers ────────────────────────────────────────────────────────
TYPE_MARKER = b"rdf-syntax-ns#type>"

# Matches the object IRI in a type triple: last <...> before the trailing " ."
OBJ_IRI_RE  = re.compile(rb"<([^>]+)>\s*\.\s*$")

# Matches the predicate IRI (second token) after a subject IRI or blank node
PRED_RE     = re.compile(rb"^(?:<[^>]+>|_:\S+)\s+<([^>]+)>")


def _is_triple(line: bytes) -> bool:
    s = line.strip()
    return bool(s) and (s[0:1] == b"<" or s[:2] == b"_:")


def _local_name(uri: str) -> str:
    if "#" in uri:
        return uri.rsplit("#", 1)[1]
    return uri.rstrip("/").rsplit("/", 1)[-1]


# ── Stage 1: Jena conversion ──────────────────────────────────────────────────

def jena_ttl_to_nt(ttl_path: str, nt_path: str) -> float:
    """Run TurtleParser on ttl_path, stream N-Triples to nt_path.
    Returns elapsed seconds. Raises RuntimeError on failure.
    """
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
        raise RuntimeError(f"TurtleParser rc={proc.returncode}: {err[:300]}")
    return elapsed


# ── Stage 2: analysis (count + classes + properties in one pass) ──────────────

def analyze_nt(nt_path: str) -> tuple[int, set[str], set[str]]:
    """Stream nt_path once, returning (total_triples, class_uris, predicate_uris)."""
    total   = 0
    classes: set[str] = set()
    props:   set[str] = set()

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


# ── Stage 3: adaptive sampling ────────────────────────────────────────────────

def adaptive_sample(nt_path: str, sampled_path: str) -> tuple[int, int]:
    """Apply same tier logic as _sample_nt_file() in rdf_parser.py.

    Pass 0: count (O(1) memory)
    Pass 1: reservoir-sample type lines capped at target
    Pass 2: reservoir-sample non-type lines for remaining quota

    Returns (total_triples, sampled_triples).
    """
    # Pass 0: count
    total = 0
    with open(nt_path, "rb") as f:
        for line in f:
            if _is_triple(line):
                total += 1

    if total < TIER1_THRESHOLD:
        import shutil
        shutil.copy2(nt_path, sampled_path)
        print(f"  Under tier-1 threshold ({total:,} < {TIER1_THRESHOLD:,}) — no sampling", flush=True)
        return total, total

    if total < TIER2_THRESHOLD:
        tier   = 1
        target = max(TIER1_THRESHOLD, int(total * TIER1_RATE))
    else:
        tier   = 2
        target = min(SAMPLE_MAX, int(total * TIER2_RATE))

    print(f"  Tier {tier}: target={target:,} ({target / total * 100:.1f}% of {total:,})", flush=True)

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

    # Pass 2: reservoir-sample non-type lines
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

    # Write sampled output
    with open(sampled_path, "wb") as out:
        for line in type_res:
            out.write(line)
        for line in data_res:
            out.write(line)

    loaded = len(type_res) + len(data_res)
    print(
        f"  type_lines={len(type_res):,}  data_lines={len(data_res):,}  "
        f"total_sampled={loaded:,}",
        flush=True,
    )
    return total, loaded


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not Path(TTL_FILE).exists():
        print(f"ERROR: file not found:\n  {TTL_FILE}")
        sys.exit(1)

    nt_tmp      = tempfile.NamedTemporaryFile(delete=False, suffix=".nt")
    sampled_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".nt")
    nt_tmp.close()
    sampled_tmp.close()

    try:
        # ── 1. Convert ────────────────────────────────────────────────────────
        print(f"\n[1] Jena: converting {Path(TTL_FILE).name} to N-Triples ...", flush=True)
        t_jena = jena_ttl_to_nt(TTL_FILE, nt_tmp.name)
        nt_size_mb = os.path.getsize(nt_tmp.name) / (1 << 20)
        print(f"    done in {t_jena:.1f}s  ({nt_size_mb:.1f} MB NT file)", flush=True)

        # ── 2. Analyse full graph ─────────────────────────────────────────────
        print("\n[2] Analysing full N-Triples graph ...", flush=True)
        t0 = time.monotonic()
        full_total, full_classes, full_props = analyze_nt(nt_tmp.name)
        print(
            f"    {full_total:,} triples | {len(full_classes)} classes | "
            f"{len(full_props)} properties  ({time.monotonic()-t0:.1f}s)",
            flush=True,
        )

        # ── 3. Sample ─────────────────────────────────────────────────────────
        print("\n[3] Applying adaptive sampling ...", flush=True)
        t0 = time.monotonic()
        _, sampled_count = adaptive_sample(nt_tmp.name, sampled_tmp.name)
        print(f"    done in {time.monotonic()-t0:.1f}s", flush=True)

        # ── 4. Analyse sampled graph ──────────────────────────────────────────
        print("\n[4] Analysing sampled N-Triples graph ...", flush=True)
        t0 = time.monotonic()
        _, sampled_classes, sampled_props = analyze_nt(sampled_tmp.name)
        print(
            f"    {sampled_count:,} triples | {len(sampled_classes)} classes | "
            f"{len(sampled_props)} properties  ({time.monotonic()-t0:.1f}s)",
            flush=True,
        )

        # ── Report ────────────────────────────────────────────────────────────
        missing_classes = full_classes - sampled_classes
        missing_props   = full_props   - sampled_props
        class_pct = len(sampled_classes) / max(len(full_classes), 1) * 100
        prop_pct  = len(sampled_props)   / max(len(full_props),   1) * 100

        sep = "=" * 64
        print(f"\n{sep}")
        print(
            f"Full graph:    {full_total:>10,} triples | "
            f"{len(full_classes):>4} classes | {len(full_props):>4} properties"
        )
        print(
            f"Sampled graph: {sampled_count:>10,} triples | "
            f"{len(sampled_classes):>4} classes | {len(sampled_props):>4} properties"
        )
        print()
        print(f"Class coverage:    {len(sampled_classes)}/{len(full_classes)} ({class_pct:.1f}%)")
        if missing_classes:
            names = sorted(_local_name(c) for c in missing_classes)
            print(f"Missing classes:   {', '.join(names)}")
        else:
            print("Missing classes:   none")
        print()
        print(f"Property coverage: {len(sampled_props)}/{len(full_props)} ({prop_pct:.1f}%)")
        if missing_props:
            names = sorted(_local_name(p) for p in missing_props)
            print(f"Missing properties: {', '.join(names)}")
        else:
            print("Missing properties: none")
        print(sep)

    finally:
        for p in (nt_tmp.name, sampled_tmp.name):
            try:
                os.unlink(p)
            except OSError:
                pass
        print("\nTemp files cleaned up.")


if __name__ == "__main__":
    main()
