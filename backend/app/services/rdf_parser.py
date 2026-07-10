from __future__ import annotations

import os
import re as _re
from pathlib import Path
from typing import Any

from rdflib import BNode, Dataset, Graph, Literal, URIRef
from rdflib.namespace import OWL, RDF, RDFS, SH, XSD

from app.models import ParseRDFResponse

FORMAT_BY_EXTENSION = {
    ".ttl": "turtle",
    ".turtle": "turtle",
    ".jsonld": "json-ld",
    ".json": "json-ld",
    ".rdf": "xml",
    ".xml": "xml",
    ".n3": "n3",
    ".nt": "nt",
    ".trig": "trig",
}

BUILTIN_NAMESPACES = tuple(str(ns) for ns in (RDF, RDFS, OWL, XSD, SH))

_XSD_CURIE_MAP: dict[str, str] = {
    str(XSD.string):             "xsd:string",
    str(XSD.integer):            "xsd:integer",
    str(XSD.decimal):            "xsd:decimal",
    str(XSD.date):               "xsd:date",
    str(XSD.dateTime):           "xsd:dateTime",
    str(XSD.boolean):            "xsd:boolean",
    str(XSD.anyURI):             "xsd:anyURI",
    str(XSD.float):              "xsd:float",
    str(XSD.double):             "xsd:double",
    str(XSD.int):                "xsd:int",
    str(XSD.long):               "xsd:long",
    str(XSD.nonNegativeInteger): "xsd:nonNegativeInteger",
}

# Datatypes that are never string literals — used as a negative filter for sh:in inference.
_NON_STRING_DATATYPES: frozenset = frozenset([
    XSD.integer, XSD.decimal, XSD.float, XSD.double,
    XSD.int, XSD.long, XSD.short, XSD.byte,
    XSD.nonNegativeInteger, XSD.positiveInteger,
    XSD.negativeInteger, XSD.nonPositiveInteger,
    XSD.unsignedInt, XSD.unsignedLong, XSD.unsignedShort, XSD.unsignedByte,
    XSD.boolean,
    XSD.date, XSD.dateTime, XSD.time,
    XSD.gYear, XSD.gYearMonth, XSD.gMonthDay, XSD.gDay, XSD.gMonth,
    XSD.anyURI,
])


_WELL_KNOWN_EXTENSIONS = ('.owl', '.rdf', '.ttl', '.n3', '.xml', '.jsonld', '.nt')

# Conventional prefix labels for namespaces that frequently appear in N-Triples
# files without @prefix declarations. Checked before the RDFLib namespace
# manager and before path-derived synthesis, so e.g. LUBM data always yields
# "ub" rather than "univbench".
KNOWN_NAMESPACES: dict[str, str] = {
    "http://swat.cse.lehigh.edu/onto/univ-bench.owl#":  "ub",
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#":      "rdf",
    "http://www.w3.org/2000/01/rdf-schema#":            "rdfs",
    "http://www.w3.org/2002/07/owl#":                   "owl",
    "http://www.w3.org/2001/XMLSchema#":                "xsd",
    "http://www.w3.org/ns/shacl#":                      "sh",
    "http://xmlns.com/foaf/0.1/":                       "foaf",
    "http://schema.org/":                               "schema",
    "https://schema.org/":                              "schema",
    "http://purl.org/dc/elements/1.1/":                "dc",
    "http://purl.org/dc/terms/":                       "dcterms",
    "http://www.w3.org/2004/02/skos/core#":            "skos",
    "http://www.w3.org/ns/dcat#":                      "dcat",
    "http://purl.org/vocab/vann/":                     "vann",
    "http://rdfs.org/ns/void#":                        "void",
    "http://www.w3.org/ns/prov#":                      "prov",
    "http://www.w3.org/2006/vcard/ns#":                "vcard",
    "http://www.geonames.org/ontology#":               "gn",
    "http://dbpedia.org/ontology/":                    "dbo",
    "http://dbpedia.org/property/":                    "dbp",
    "http://dbpedia.org/resource/":                    "dbr",
    "http://www.wikidata.org/entity/":                 "wd",
    "http://www.wikidata.org/prop/direct/":            "wdt",
}


def _ns_base(uri: str) -> str | None:
    """Return the namespace base of *uri* (up to and including the last # or /)."""
    if '#' in uri:
        return uri.rsplit('#', 1)[0] + '#'
    stripped = uri.rstrip('/')
    slash_idx = stripped.rfind('/')
    if slash_idx > 8:  # skip past 'http://'
        return stripped[:slash_idx + 1]
    return None


def _derive_prefix_name(ns_str: str, used: set[str]) -> str:
    """Derive a short, collision-free prefix name from a namespace URI.

    Used when the namespace is not already bound in the RDFLib namespace manager
    (common for domain-specific ontologies in NT files that have no @prefix lines).
    """
    base = ns_str.rstrip('#/')
    last = base.rsplit('/', 1)[-1] if '/' in base else base
    lower = last.lower()
    for ext in _WELL_KNOWN_EXTENSIONS:
        if lower.endswith(ext):
            last = last[: -len(ext)]
            break
    clean = _re.sub(r'[^a-z0-9]', '', last.lower())[:10]
    if not clean:
        clean = 'ns'
    candidate = clean
    i = 1
    while candidate in used:
        candidate = f'{clean}{i}'
        i += 1
    return candidate


def guess_rdf_format(filename: str | None, fallback: str = "turtle") -> str:
    if not filename:
        return fallback
    return FORMAT_BY_EXTENSION.get(Path(filename).suffix.lower(), fallback)


def parse_rdf_hints(graph_text: str, filename: str | None = None, rdf_format: str | None = None) -> ParseRDFResponse:
    resolved_format = rdf_format or guess_rdf_format(filename)
    graph = Dataset(default_union=True) if resolved_format == "trig" else Graph()
    graph.parse(data=graph_text, format=resolved_format)
    return extract_rdf_hints(graph)


def parse_rdf_full(
    graph_text: str,
    filename: str | None,
    rdf_format: str | None,
    settings: Any | None = None,
) -> ParseRDFResponse:
    import time as _time
    resolved_format = rdf_format or guess_rdf_format(filename)

    # --- CONFIG DUMP ---
    _should_try_jena  = settings is not None and getattr(settings, "should_try_jena",  False)
    _requires_jena    = settings is not None and getattr(settings, "requires_jena",    False)
    _java_bin         = (settings is not None and getattr(settings, "jena_java_bin",   None)) or "NOT SET"
    _class_dir        = (settings is not None and getattr(settings, "jena_class_dir",  None)) or "NOT SET"
    print(f"[CONFIG] should_try_jena: {_should_try_jena} | requires_jena: {_requires_jena}", flush=True)
    print(f"[CONFIG] JENA_JAVA_BIN: {_java_bin}", flush=True)
    print(f"[CONFIG] JENA_CLASS_DIR: {_class_dir}", flush=True)

    if settings is not None and getattr(settings, "requires_jena", False) and not settings.jena_configured:
        raise RuntimeError(
            "RDF_PARSER_BACKEND=jena requires JENA_JAVA_BIN and JENA_CLASS_DIR."
        )

    # Jena is now just a parser: it loads the text into an RDFLib graph via the
    # TurtleParser subprocess. RDFLib is the fallback on any error. Both feed the
    # same downstream extraction / inference / LLM-verify pipeline below.
    graph: Graph | Dataset | None = None
    used_parser = "RDFLib"
    _file_prefixes_text: dict[str, str] | None = None  # set only on the Jena path
    _t0 = _time.monotonic()

    if settings is not None and getattr(settings, "should_try_jena", False):
        try:
            from app.services.jena_parser import parse_ttl_with_jena, PREFIX_RE as _PREFIX_RE_TEXT
            graph = parse_ttl_with_jena(graph_text, settings)
            # Extract declared prefixes directly from the source text — ground truth.
            _head_text = graph_text[:262_144]
            print(f"[PREFIX_RE DEBUG] parse_rdf_full head (first 500 chars): {repr(_head_text[:500])}", flush=True)
            _file_prefixes_text = {
                _m.group(1): _m.group(2)
                for _m in _PREFIX_RE_TEXT.finditer(_head_text)
            }
            print(f"[PREFIX_RE DEBUG] parse_rdf_full scanned prefixes: {_file_prefixes_text}", flush=True)
            used_parser = "Jena"
        except Exception as _jena_exc:
            if getattr(settings, "requires_jena", False):
                raise
            print(f"[PARSER] Jena failed — falling back to RDFLib | Error: {_jena_exc}", flush=True)
            graph = None

    if graph is None:
        graph = Dataset(default_union=True) if resolved_format == "trig" else Graph()
        graph.parse(data=graph_text, format=resolved_format)
        used_parser = "RDFLib"

    _elapsed = _time.monotonic() - _t0
    triple_count = sum(1 for _ in graph)
    print(f"[PARSER] Used: {used_parser} | Time: {_elapsed:.2f}s | Triples: {triple_count}", flush=True)

    response = extract_rdf_hints(graph, declared_prefixes=_file_prefixes_text)
    inference_limit = getattr(settings, "rdf_inference_limit_triples", 10_000)
    llm_verify_limit = getattr(settings, "rdf_llm_verify_limit_triples", 500_000)
    inferred, limited = infer_constraints(graph, response.properties, inference_limit, prefixes=response.prefixes)
    response.inference_limited = limited

    if settings is None or (not settings.should_try_groq and not settings.should_try_gemini):
        print("[LLM VERIFY] Skipped — reason: LLM not configured", flush=True)
    elif triple_count > llm_verify_limit:
        print(f"[LLM VERIFY] Skipped — reason: llm_verify_limit_exceeded (triples: {triple_count}, threshold: {llm_verify_limit})", flush=True)
    else:
        try:
            from app.services.constraint_verifier import verify_constraints_with_llm
            _t_llm = _time.monotonic()
            inferred = verify_constraints_with_llm(inferred, graph, settings)
            _llm_elapsed = _time.monotonic() - _t_llm
            print(f"[LLM VERIFY] Time: {_llm_elapsed:.2f}s | Input triples: {triple_count}", flush=True)
        except Exception as _llm_exc:
            print(f"[LLM VERIFY] Failed — error: {_llm_exc}", flush=True)

    response.suggested_constraints = inferred
    return response


def _run_jena_to_file(file_path: str, nt_path: str, settings: Any) -> None:
    """Run TurtleParser and stream N-Triples stdout to nt_path.

    No graph parsing and no temp-file cleanup — the caller owns both.
    Raises RuntimeError on non-zero exit code.
    """
    import subprocess as _sp
    java_bin  = getattr(settings, "jena_java_bin",  None)
    class_dir = getattr(settings, "jena_class_dir", None)
    classpath = f"{class_dir}{os.pathsep}{os.path.join(class_dir, 'lib', '*')}"
    timeout   = getattr(settings, "jena_request_timeout_seconds", 600.0)

    with open(nt_path, "wb") as nt_fh:
        proc = _sp.run(
            [java_bin, "-Xmx6g", "-cp", classpath, "TurtleParser", file_path],
            stdout=nt_fh,
            stderr=_sp.PIPE,
            timeout=timeout,
        )

    if proc.returncode != 0:
        stderr_text = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            f"TurtleParser exited with code {proc.returncode}: {stderr_text}"
        )


def _sample_nt_file(
    nt_path: str,
    settings: Any,
) -> tuple[str | None, int, int]:
    """Adaptively sample an N-Triples file to keep RDFLib's in-memory graph bounded.

    Triple count tiers (configurable via settings):
      < tier1 (100k)          — no sampling, load everything
      tier1 .. tier2 (1M)     — sample at rate1 (50%), minimum tier1 triples
      >= tier2                 — sample at rate2 (20%), maximum sample_max triples

    Sampling is stratified: all rdf:type triples are kept unconditionally so
    that every class remains represented. Remaining slots are reservoir-sampled
    from non-type triples.

    Returns:
        (None, total, total)             if no sampling needed
        (sampled_path, total, loaded)    if sampling applied — caller must delete sampled_path
    """
    import random   as _random
    import tempfile as _tempfile

    tier1 = int(getattr(settings, "rdf_sample_tier1_threshold", 100_000))
    tier2 = int(getattr(settings, "rdf_sample_tier2_threshold", 1_000_000))
    rate1 = float(getattr(settings, "rdf_sample_tier1_rate",    0.5))
    rate2 = float(getattr(settings, "rdf_sample_tier2_rate",    0.2))
    max_s = int(getattr(settings, "rdf_sample_max",             500_000))

    # ── Pass 0: count valid triples (streaming, O(1) memory) ─────────────────
    total = 0
    with open(nt_path, "rb") as f:
        for line in f:
            s = line.strip()
            if s and (s[0:1] == b"<" or s[:2] == b"_:"):
                total += 1

    print(
        f"[SAMPLER DEBUG] total={total:,} | tier1={tier1:,} | tier2={tier2:,} "
        f"| rate1={rate1} | rate2={rate2} | max={max_s:,}",
        flush=True,
    )

    if total < tier1:
        print(f"[SAMPLER] Skipped — triples under threshold ({total:,})", flush=True)
        return None, total, total

    if total < tier2:
        tier_num, target = 1, max(tier1, int(total * rate1))
    else:
        tier_num, target = 2, min(max_s, int(total * rate2))

    print(f"[SAMPLER DEBUG] tier={tier_num} | target={target:,}", flush=True)

    # ── Pass 1: reservoir-sample rdf:type lines capped at target ─────────────
    # Reservoir sampling ensures all classes stay proportionally represented
    # even when type triples dominate the file (e.g. instance-types dumps).
    rng = _random.Random()
    type_reservoir: list[bytes] = []
    type_seen = 0
    with open(nt_path, "rb") as f:
        for line in f:
            s = line.strip()
            if s and (s[0:1] == b"<" or s[:2] == b"_:"):
                if b"rdf-syntax-ns#type>" in s:
                    type_seen += 1
                    if len(type_reservoir) < target:
                        type_reservoir.append(line)
                    else:
                        j = rng.randint(0, type_seen - 1)
                        if j < target:
                            type_reservoir[j] = line

    quota = max(0, target - len(type_reservoir))

    # ── Pass 2: reservoir-sample non-type triples ─────────────────────────────
    reservoir: list[bytes] = []
    seen = 0
    with open(nt_path, "rb") as f:
        for line in f:
            s = line.strip()
            if s and (s[0:1] == b"<" or s[:2] == b"_:"):
                if b"rdf-syntax-ns#type>" in s:
                    continue
                seen += 1
                if len(reservoir) < quota:
                    reservoir.append(line)
                elif quota > 0:
                    j = rng.randint(0, seen - 1)
                    if j < quota:
                        reservoir[j] = line

    # ── Write sampled lines to a new temp file ────────────────────────────────
    sampled_tmp = _tempfile.NamedTemporaryFile(mode="wb", suffix=".nt", delete=False)
    try:
        for line in type_reservoir:
            sampled_tmp.write(line)
        for line in reservoir:
            sampled_tmp.write(line)
        sampled_tmp.close()
    except Exception:
        sampled_tmp.close()
        try:
            os.unlink(sampled_tmp.name)
        except OSError:
            pass
        raise

    loaded = len(type_reservoir) + len(reservoir)
    pct = int(loaded / total * 100) if total else 0
    print(
        f"[SAMPLER] Sampled {loaded:,} / {total:,} triples "
        f"({pct}% adaptive rate) for RDFLib pipeline",
        flush=True,
    )
    return sampled_tmp.name, total, loaded


def parse_rdf_from_file(
    file_path: str,
    filename: str | None,
    rdf_format: str | None,
    settings: Any | None = None,
) -> ParseRDFResponse:
    """Like ``parse_rdf_full`` but accepts a file path instead of a text string.

    The file is never loaded into a Python string — RDFLib and Jena both receive
    the path directly, so RAM usage is bounded by the parser's own buffers rather
    than by the file size.
    """
    import time as _time
    resolved_format = rdf_format or guess_rdf_format(filename)

    _should_try_jena  = settings is not None and getattr(settings, "should_try_jena",  False)
    _requires_jena    = settings is not None and getattr(settings, "requires_jena",    False)
    _java_bin         = (settings is not None and getattr(settings, "jena_java_bin",   None)) or "NOT SET"
    _class_dir        = (settings is not None and getattr(settings, "jena_class_dir",  None)) or "NOT SET"
    _jena_min_mb      = float(getattr(settings, "jena_min_file_size_mb", 200.0)) if settings is not None else 200.0
    print(f"[CONFIG] should_try_jena: {_should_try_jena} | requires_jena: {_requires_jena}", flush=True)
    print(f"[CONFIG] JENA_JAVA_BIN: {_java_bin}", flush=True)
    print(f"[CONFIG] JENA_CLASS_DIR: {_class_dir}", flush=True)
    print(f"[CONFIG] JENA_MIN_FILE_SIZE_MB: {_jena_min_mb}", flush=True)

    if settings is not None and _requires_jena and not settings.jena_configured:
        raise RuntimeError(
            "RDF_PARSER_BACKEND=jena requires JENA_JAVA_BIN and JENA_CLASS_DIR."
        )

    # Skip Jena for small files — JVM cold-start overhead (~1s) outweighs any
    # parsing speedup below the crossover point.
    if _should_try_jena and not _requires_jena:
        _file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if _file_size_mb < _jena_min_mb:
            print(
                f"[PARSER] Skipped Jena — file under threshold "
                f"({_file_size_mb:.1f} MB < {_jena_min_mb:.0f} MB), using RDFLib",
                flush=True,
            )
            _should_try_jena = False

    graph: Graph | Dataset | None = None
    used_parser = "RDFLib"
    _file_prefixes: dict[str, str] | None = None  # set only on the Jena path
    _t0 = _time.monotonic()

    _RDFLIB_SIZE_LIMIT = 200 * 1024 * 1024  # 200 MB

    if _should_try_jena:
        _nt_path: str | None = None
        _sampled_path: str | None = None
        try:
            import tempfile as _tempfile
            _nt_tmp = _tempfile.NamedTemporaryFile(mode="wb", suffix=".nt", delete=False)
            _nt_path = _nt_tmp.name
            _nt_tmp.close()

            _run_jena_to_file(file_path, _nt_path, settings)
            _sampled_path, _, _ = _sample_nt_file(_nt_path, settings)
            _parse_path = _sampled_path if _sampled_path else _nt_path

            graph = Graph()
            graph.parse(_parse_path, format="nt")

            from app.services.jena_parser import PREFIX_RE as _PREFIX_RE
            with open(file_path, "rb") as _pf:
                _head = _pf.read(262_144).decode("utf-8", errors="replace")

            print(f"[PREFIX_RE DEBUG] file head (first 500 bytes): {repr(_head[:500])}", flush=True)
            print(f"[PREFIX_RE DEBUG] PREFIX_RE pattern: {_PREFIX_RE.pattern}", flush=True)

            # Sanity-check: test the regex against a known LUBM declaration
            _test_str = "@prefix ub: <http://swat.cse.lehigh.edu/onto/univ-bench.owl#> ."
            _test_match = _PREFIX_RE.search(_test_str)
            print(f"[PREFIX_RE DEBUG] test match against '{_test_str}': {_test_match}", flush=True)
            if _test_match:
                print(f"[PREFIX_RE DEBUG] test groups: prefix={_test_match.group(1)!r} ns={_test_match.group(2)!r}", flush=True)

            _file_prefixes: dict[str, str] = {}
            for _m in _PREFIX_RE.finditer(_head):
                try:
                    _pfx, _ns = _m.group(1), _m.group(2)
                    _file_prefixes[_pfx] = _ns
                    graph.bind(_pfx, _ns)
                except Exception:
                    pass

            print(f"[PREFIX_RE DEBUG] scanned file prefixes: {_file_prefixes}", flush=True)
            used_parser = "Jena"
        except Exception as _jena_exc:
            if _requires_jena:
                raise
            file_size = os.path.getsize(file_path)
            if file_size > _RDFLIB_SIZE_LIMIT:
                size_mb = file_size // (1024 * 1024)
                raise RuntimeError(
                    f"File too large for RDFLib fallback ({size_mb} MB). "
                    f"Jena is required for files above 200 MB but failed: {_jena_exc}"
                ) from _jena_exc
            print(f"[PARSER] Jena failed — falling back to RDFLib | Error: {_jena_exc}", flush=True)
            graph = None
        finally:
            for _p in (_nt_path, _sampled_path):
                if _p:
                    try:
                        os.unlink(_p)
                    except OSError:
                        pass

    if graph is None:
        graph = Dataset(default_union=True) if resolved_format == "trig" else Graph()
        graph.parse(file_path, format=resolved_format)
        used_parser = "RDFLib"

    _elapsed = _time.monotonic() - _t0
    triple_count = sum(1 for _ in graph)
    print(f"[PARSER] Used: {used_parser} | Time: {_elapsed:.2f}s | Triples: {triple_count}", flush=True)

    response = extract_rdf_hints(graph, declared_prefixes=_file_prefixes)
    inference_limit  = getattr(settings, "rdf_inference_limit_triples",     10_000)
    llm_verify_limit = getattr(settings, "rdf_llm_verify_limit_triples",   500_000)
    inferred, limited = infer_constraints(graph, response.properties, inference_limit, prefixes=response.prefixes)
    response.inference_limited = limited

    if settings is None or (not settings.should_try_groq and not settings.should_try_gemini):
        print("[LLM VERIFY] Skipped — reason: LLM not configured", flush=True)
    elif triple_count > llm_verify_limit:
        print(f"[LLM VERIFY] Skipped — reason: llm_verify_limit_exceeded (triples: {triple_count}, threshold: {llm_verify_limit})", flush=True)
    else:
        try:
            from app.services.constraint_verifier import verify_constraints_with_llm
            _t_llm = _time.monotonic()
            inferred = verify_constraints_with_llm(inferred, graph, settings)
            _llm_elapsed = _time.monotonic() - _t_llm
            print(f"[LLM VERIFY] Time: {_llm_elapsed:.2f}s | Input triples: {triple_count}", flush=True)
        except Exception as _llm_exc:
            print(f"[LLM VERIFY] Failed — error: {_llm_exc}", flush=True)

    response.suggested_constraints = inferred
    return response


def extract_rdf_hints(
    graph: Graph | Dataset,
    declared_prefixes: dict[str, str] | None = None,
) -> ParseRDFResponse:
    classes: set[str] = set()

    used_uris: set[str] = set()
    meaningful_ns_bases: set[str] = set()

    # Collect raw predicate URIRefs during the loop; resolve to CURIEs after
    # the prefix map is built (the prefix map depends on meaningful_ns_bases,
    # which is also populated in the loop).
    _pred_uris: set[URIRef] = set()
    _pbc_uris: dict[str, set[URIRef]] = {}  # class_local → predicate URIRefs
    _dt_by_pred: dict[URIRef, str] = {}     # predicate URI → xsd datatype CURIE

    # Map each subject node → set of class local-names it belongs to
    subject_classes: dict[Any, set[str]] = {}
    for subject, _, obj in graph.triples((None, RDF.type, None)):
        if isinstance(subject, URIRef):
            used_uris.add(str(subject))
        if isinstance(obj, URIRef):
            used_uris.add(str(obj))
            _b = _ns_base(str(obj))
            if _b:
                meaningful_ns_bases.add(_b)
            if not _is_builtin_uri(obj):
                cls = _local_name(obj)
                classes.add(cls)
                subject_classes.setdefault(subject, set()).add(cls)

    for subject, predicate, obj in graph:
        if isinstance(subject, URIRef):
            used_uris.add(str(subject))
        if isinstance(predicate, URIRef):
            used_uris.add(str(predicate))
            _b = _ns_base(str(predicate))
            if _b:
                meaningful_ns_bases.add(_b)
        if isinstance(obj, URIRef):
            used_uris.add(str(obj))

        if predicate == RDF.type or not isinstance(predicate, URIRef):
            continue

        _pred_uris.add(predicate)

        for cls in subject_classes.get(subject, ()):
            _pbc_uris.setdefault(cls, set()).add(predicate)

        if isinstance(obj, Literal) and obj.datatype and predicate not in _dt_by_pred:
            _dt_by_pred[predicate] = _qname_or_uri(graph, obj.datatype)

    if declared_prefixes is not None:
        prefixes = {p: ns for p, ns in declared_prefixes.items() if p}
    else:
        ns_to_prefix: dict[str, str] = {
            str(ns): pfx
            for pfx, ns in graph.namespace_manager.namespaces()
            if pfx
        }
        _used_names: set[str] = set()
        prefixes: dict[str, str] = {}
        for _ns_str in sorted(meaningful_ns_bases):
            if _ns_str in KNOWN_NAMESPACES:
                _name = KNOWN_NAMESPACES[_ns_str]
            elif _ns_str in ns_to_prefix:
                _name = ns_to_prefix[_ns_str]
            else:
                _name = _derive_prefix_name(_ns_str, _used_names)
            _used_names.add(_name)
            prefixes[_name] = _ns_str

    print(f"[PREFIX DEBUG] returning prefixes: {prefixes}", flush=True)

    # Build inverse map (namespace URI → prefix label) and resolve all collected
    # predicate URIRefs to CURIEs now that the prefix dict is finalised.
    _ns_inv: dict[str, str] = {ns: pfx for pfx, ns in prefixes.items()}

    def _pred_curie(uri: URIRef) -> str:
        s = str(uri)
        nb = _ns_base(s)
        if nb and nb in _ns_inv:
            return f"{_ns_inv[nb]}:{s[len(nb):]}"
        return s  # fallback: full URI string

    properties: set[str] = {_pred_curie(u) for u in _pred_uris}
    properties_by_class: dict[str, set[str]] = {
        cls: {_pred_curie(u) for u in uris}
        for cls, uris in _pbc_uris.items()
    }
    detected_datatypes: dict[str, str] = {
        _pred_curie(u): dt for u, dt in _dt_by_pred.items()
    }

    sorted_pbc = {
        cls: sorted(props)
        for cls, props in sorted(properties_by_class.items())
    }

    return ParseRDFResponse(
        classes=sorted(classes)[:50],
        properties=sorted(properties)[:100],
        propertiesByClass=sorted_pbc,
        prefixes=dict(sorted(prefixes.items())),
        detectedDatatypes=dict(sorted(detected_datatypes.items())),
    )


def _looks_like_unique_identifiers(values: list[str]) -> bool:
    """Return True if the value set looks like per-entity unique identifiers rather than
    a shared fixed vocabulary. Used to avoid treating names/emails/phones/IDs as sh:in."""
    import re as _re
    for v in values:
        if "@" in v:
            return True
        if v.startswith("http://") or v.startswith("https://"):
            return True
        if _re.fullmatch(r"[\d\-+\s]{9,}", v):
            return True
        if _re.fullmatch(r"\d+", v):
            return True
        if " " in v or (len(v) > 8 and v != v.lower() and v != v.upper()):
            return True
    return False


def infer_constraints(
    g: Graph | Dataset,
    properties: list[str],
    inference_limit_triples: int = 10_000,
    prefixes: dict[str, str] | None = None,
) -> tuple[dict[str, dict], bool]:
    triple_count = sum(1 for _ in g)
    limited = triple_count > inference_limit_triples

    # Build inverse namespace map so predicates can be resolved to CURIEs,
    # matching the CURIE-keyed property list produced by extract_rdf_hints.
    _ns_inv: dict[str, str] = {ns: pfx for pfx, ns in (prefixes or {}).items()}

    def _to_curie(uri: URIRef) -> str:
        s = str(uri)
        nb = _ns_base(s)
        if nb and nb in _ns_inv:
            return f"{_ns_inv[nb]}:{s[len(nb):]}"
        return s

    prop_set = set(properties)

    # Map CURIE (or full URI) → set of full predicate URIs found in graph
    prop_uri_map: dict[str, set[URIRef]] = {}
    for _, predicate, _ in g:
        if not isinstance(predicate, URIRef) or predicate == RDF.type:
            continue
        c = _to_curie(predicate)
        if c in prop_set:
            prop_uri_map.setdefault(c, set()).add(predicate)

    # Collect typed instance nodes (subjects of rdf:type with a non-builtin class).
    # These are the "real" data nodes — used for accurate minCount inference.
    # Fall back to all non-builtin subject nodes if the graph has no rdf:type triples.
    typed_subjects: set[Any] = set()
    for s, _, o in g.triples((None, RDF.type, None)):
        if isinstance(o, URIRef) and not _is_builtin_uri(o):
            typed_subjects.add(s)

    if not typed_subjects:
        for s, _, _ in g:
            if (isinstance(s, URIRef) and not _is_builtin_uri(s)) or isinstance(s, BNode):
                typed_subjects.add(s)

    total_subjects = max(len(typed_subjects), 1)

    result: dict[str, dict] = {}

    for prop_local, predicates in prop_uri_map.items():
        subject_values: dict[Any, list] = {}
        for pred in predicates:
            for s, _, o in g.triples((None, pred, None)):
                subject_values.setdefault(s, []).append(o)

        if not subject_values:
            continue

        all_values = [o for vals in subject_values.values() for o in vals]
        constraints: dict[str, str] = {}

        # datatype — 80% threshold over typed literals
        dt_counts: dict[str, int] = {}
        for o in all_values:
            if isinstance(o, Literal) and o.datatype:
                dt = _datatype_curie(o.datatype)
                dt_counts[dt] = dt_counts.get(dt, 0) + 1
        if dt_counts:
            total_typed = sum(dt_counts.values())
            best_dt, best_count = max(dt_counts.items(), key=lambda x: x[1])
            if best_count / total_typed >= 0.8:
                constraints["datatype"] = best_dt

        # nodeKind
        all_iris = all(isinstance(o, URIRef) for o in all_values)
        all_literals = all(isinstance(o, Literal) for o in all_values)
        if all_iris:
            constraints["nodeKind"] = "sh:IRI"
        elif all_literals:
            constraints["nodeKind"] = "sh:Literal"

        if not limited:
            # minCount — every typed subject node (including those with zero values) has ≥1
            # value, AND the property covers more than 50% of all typed subjects.
            all_have_one = all(len(subject_values.get(s, [])) >= 1 for s in typed_subjects)
            covers_majority = len(subject_values) / total_subjects > 0.5
            if all_have_one and covers_majority:
                constraints["minCount"] = "1"

            # maxCount — no subject has more than 1 value
            if all(len(vals) <= 1 for vals in subject_values.values()):
                constraints["maxCount"] = "1"

            # sh:in — string literals only, ≤6 distinct values.
            # Use a negative filter (exclude numeric/boolean/date datatypes) instead of a
            # positive xsd:string equality check — more robust across RDFLib versions where
            # plain Turtle strings may be stored with datatype=None or datatype=XSD.string.
            # Uniqueness guard: if every subject has a different value AND the values look
            # like unique identifiers (names, emails, phones, IDs, URLs), skip sh:in.
            # Short categorical strings (e.g. blood types, status codes) pass through even
            # when distinct count == subject count.
            if all_literals:
                string_values = [
                    str(o) for o in all_values
                    if isinstance(o, Literal)
                    and not o.language
                    and o.datatype not in _NON_STRING_DATATYPES
                ]
                if string_values and len(string_values) == len(all_values):
                    distinct = list(dict.fromkeys(string_values))
                    all_unique = len(distinct) == len(subject_values)
                    if len(distinct) <= 6 and (not all_unique or not _looks_like_unique_identifiers(distinct)):
                        constraints["in"] = ",".join(distinct)

        if constraints:
            result[prop_local] = constraints

    return result, limited


def _datatype_curie(datatype: URIRef) -> str:
    return _XSD_CURIE_MAP.get(str(datatype), str(datatype))


def _is_builtin_uri(uri: URIRef) -> bool:
    return str(uri).startswith(BUILTIN_NAMESPACES)


def _local_name(uri: URIRef) -> str:
    text = str(uri)
    if "#" in text:
        return text.rsplit("#", 1)[1]
    return text.rstrip("/").rsplit("/", 1)[-1]


def _qname_or_uri(graph: Graph, uri: URIRef) -> str:
    try:
        return graph.namespace_manager.normalizeUri(uri)
    except Exception:
        return str(uri)
