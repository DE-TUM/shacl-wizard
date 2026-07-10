"""
Standalone benchmark: RDFLib vs Jena subprocess parser on large TTL files.
Run from the project root: python benchmark_parsers.py
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# ── Settings ────────────────────────────────────────────────────────────────
JENA_JAVA_BIN  = r"C:\Program Files\JetBrains\IntelliJ IDEA 2024.2.3\jbr\bin\java.exe"
JENA_CLASS_DIR = r"C:\Users\msi\Documents\TUM\BPC Data Engineering\apache-jena-6.1.0"
TIMEOUT_SECONDS = 600   # per parser per file
CHUNK = 1 << 20         # 1 MiB read chunks for line counting

FILES = [
    r"C:\Users\msi\Documents\TUM\BPC Data Engineering\Examples\instance-types_lang=en_specific.ttl",
    r"C:\Users\msi\Documents\TUM\BPC Data Engineering\Examples\mappingbased-objects-uncleaned_lang=en.ttl",
]

# ── Helpers ──────────────────────────────────────────────────────────────────

def count_data_lines(path: str) -> int:
    """Count non-empty, non-comment lines without loading into memory."""
    count = 0
    with open(path, "rb") as f:
        leftover = b""
        while True:
            chunk = f.read(CHUNK)
            if not chunk:
                break
            data = leftover + chunk
            lines = data.split(b"\n")
            leftover = lines[-1]
            for line in lines[:-1]:
                stripped = line.strip()
                if stripped and not stripped.startswith(b"#"):
                    count += 1
        if leftover.strip() and not leftover.strip().startswith(b"#"):
            count += 1
    return count


def bench_rdflib(path: str) -> tuple[float, str]:
    """Parse with RDFLib; returns (elapsed_seconds, status)."""
    from rdflib import Graph
    t0 = time.monotonic()
    try:
        g = Graph()
        g.parse(path, format="turtle")   # positional — accepts str path
        elapsed = time.monotonic() - t0
        return elapsed, "ok"
    except Exception as exc:
        elapsed = time.monotonic() - t0
        return elapsed, f"error: {repr(exc)[:120]}"


def bench_jena(path: str) -> tuple[float, str]:
    """Parse with TurtleParser subprocess; returns (elapsed_seconds, status)."""
    classpath = (
        JENA_CLASS_DIR
        + os.pathsep
        + os.path.join(JENA_CLASS_DIR, "lib", "*")
    )
    t0 = time.monotonic()
    try:
        completed = subprocess.run(
            [JENA_JAVA_BIN, "-cp", classpath, "TurtleParser", path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=TIMEOUT_SECONDS,
        )
        elapsed = time.monotonic() - t0
        if completed.returncode != 0:
            # Find first non-WARN line in stderr as likely cause
            lines = completed.stderr.strip().splitlines()
            error_lines = [l for l in lines if "WARN" not in l and l.strip()]
            cause = error_lines[0] if error_lines else (lines[-1] if lines else "")
            return elapsed, f"rc={completed.returncode}: {cause.strip()[:100]}"
        return elapsed, "ok"
    except subprocess.TimeoutExpired:
        elapsed = time.monotonic() - t0
        return elapsed, f"TIMEOUT (>{TIMEOUT_SECONDS}s)"
    except Exception as exc:
        elapsed = time.monotonic() - t0
        return elapsed, f"error: {exc}"


# ── Main ─────────────────────────────────────────────────────────────────────

def fmt_time(seconds: float) -> str:
    if seconds >= 60:
        return f"{seconds/60:.1f}m"
    return f"{seconds:.1f}s"


def short_name(path: str) -> str:
    name = Path(path).stem
    return name[:38] if len(name) > 38 else name


def main():
    print("\nBenchmark: RDFLib vs Jena subprocess parser")
    print(f"Timeout per run: {TIMEOUT_SECONDS}s\n")

    results = []

    for filepath in FILES:
        if not Path(filepath).exists():
            print(f"[SKIP] File not found: {filepath}")
            continue

        size_gb = Path(filepath).stat().st_size / (1 << 30)
        name = short_name(filepath)
        print(f"-- {name}  ({size_gb:.2f} GB) --")

        print("  Counting data lines...", end="", flush=True)
        t_count = time.monotonic()
        line_count = count_data_lines(filepath)
        print(f" {line_count:,}  ({time.monotonic()-t_count:.1f}s)", flush=True)

        print("  RDFLib parse...", end="", flush=True)
        rdflib_time, rdflib_status = bench_rdflib(filepath)
        rdflib_label = fmt_time(rdflib_time) if rdflib_status == "ok" else rdflib_status
        print(f" {rdflib_label}", flush=True)

        print("  Jena parse...", end="", flush=True)
        jena_time, jena_status = bench_jena(filepath)
        jena_label = fmt_time(jena_time) if jena_status == "ok" else jena_status
        print(f" {jena_label}", flush=True)

        if rdflib_status == "ok" and jena_status == "ok":
            winner = "Jena" if jena_time < rdflib_time else "RDFLib"
            speedup = max(rdflib_time, jena_time) / max(min(rdflib_time, jena_time), 0.001)
            winner_label = f"{winner} ({speedup:.1f}x)"
        else:
            winner_label = "N/A"

        results.append((name, line_count, rdflib_label, jena_label, winner_label))
        print()

    # ── Table ────────────────────────────────────────────────────────────────
    col_name = max(38, max((len(r[0]) for r in results), default=8))
    header = (
        f"{'File':<{col_name}} | {'Data lines':>12} | {'RDFLib':>10} | {'Jena':>10} | Winner"
    )
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)
    for name, lines, rdflib_t, jena_t, winner in results:
        rt = rdflib_t[:10] if len(rdflib_t) > 10 else rdflib_t
        jt = jena_t[:10]   if len(jena_t)   > 10 else jena_t
        print(f"{name:<{col_name}} | {lines:>12,} | {rt:>10} | {jt:>10} | {winner}")
        if len(rdflib_t) > 10:
            print(f"  RDFLib detail: {rdflib_t}")
        if len(jena_t) > 10:
            print(f"  Jena detail:   {jena_t}")
    print(sep)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent / "backend"))
    main()
