from __future__ import annotations

import json
from typing import Any

from rdflib import Graph, Literal, URIRef

from app.config import Settings

VERIFIER_SYSTEM_PROMPT = """
You are a SHACL constraint verifier. Python has already extracted constraints from an RDF graph by statistical analysis. You are given:
1. The Python-inferred constraints for each property
2. A sample of actual RDF triples from the graph

Your ONLY job is to check whether the Python extraction is correct based on what you can see in the data sample. You are a verifier, not a suggester. You must never add, invent, or infer anything that is not explicitly present in the provided data sample.

For each property, you may only do the following:

DATATYPE: If the Python-inferred datatype is clearly wrong based on the actual values in the sample (e.g. Python said xsd:integer but values are clearly decimals like 3.14), correct it. If it looks correct or you are unsure, omit the field.

NODEKIND: If Python said sh:IRI but the values in the sample are clearly literals, or vice versa, correct it. If correct or unsure, omit the field. Default to sh:IRI for resource references; only use sh:BlankNode if explicitly justified by the data sample (the values are anonymous nodes with no separate identity).

SH:IN: Check whether every value in the Python-inferred sh:in list actually appears in the data sample. If a value is in the list but NOT in the sample, remove it. If a value appears in the sample but is MISSING from the Python list, add it back. Never add values you do not see in the sample. If the list looks correct, omit the field. IMPORTANT: if the number of distinct sh:in values equals the number of subjects visible in the sample for that property, the values are unique per entity (e.g. names, emails, phone numbers, IDs) — always discard sh:in entirely by returning "in": null in this case.

MINCOUNT / MAXCOUNT: Python computed cardinality by scanning every triple in the full graph — it is far more reliable than what you can see in a partial sample. You only see a subset of subjects. Do NOT remove or set these to null just because you cannot see enough subjects in the sample to verify. Only correct if the contradiction is completely unambiguous: e.g. Python said minCount 1 but literally every visible subject for that property has zero values. If there is any doubt at all, omit entirely.

PATTERN: You may suggest a sh:pattern only if ALL values in the sample for that property clearly conform to a recognisable format — for example email addresses, phone numbers, UUIDs, URLs, postal codes, or structured IDs. Base the regex strictly on the actual values you can see; do not infer it from the property name alone. Use a concise, permissive regex that captures the general format (not an exact string match of a single value). If the values vary in format, are plain prose strings, or you have any doubt, omit the field entirely. Never invent a pattern you cannot directly justify from the sample values.
CLASS: Do not touch. Never return a class field.

Return ONLY a JSON object mapping property local names to partial constraint dicts containing only the fields you are correcting. If you have no corrections for a property, omit it entirely. If you have no corrections at all, return an empty JSON object {}.

Never add properties that Python did not already include. Never add constraint fields based on guessing or general knowledge. Only correct based on what you explicitly see in the data sample.
""".strip()

KNOWN_DATATYPES: frozenset[str] = frozenset([
    "xsd:string", "xsd:integer", "xsd:decimal", "xsd:float", "xsd:double",
    "xsd:boolean", "xsd:date", "xsd:dateTime", "xsd:time", "xsd:anyURI",
    "xsd:int", "xsd:long", "xsd:nonNegativeInteger",
])

KNOWN_NODEKINDS: frozenset[str] = frozenset(["sh:IRI", "sh:Literal", "sh:BlankNode"])


def verify_constraints_with_llm(
    inferred: dict[str, dict],
    graph: Graph,
    settings: Settings,
) -> dict[str, dict]:
    if not inferred:
        return inferred
    if not (settings.should_try_groq or settings.should_try_gemini):
        return inferred

    turtle_sample = _sample_triples(graph)
    user_message = _build_message(inferred, turtle_sample)

    # Pre-capture Python sh:in sets and graph string values before any LLM merge
    python_in_sets: dict[str, set[str]] = {}
    for prop, constraints in inferred.items():
        if "in" in constraints:
            python_in_sets[prop] = {v.strip() for v in constraints["in"].split(",") if v.strip()}

    graph_string_values = _extract_graph_string_values(graph)

    llm_updates: dict[str, Any] | None = None

    if settings.should_try_groq:
        try:
            llm_updates = _call_groq(user_message, settings)
        except Exception:
            pass

    if llm_updates is None and settings.should_try_gemini:
        try:
            llm_updates = _call_gemini(user_message, settings)
        except Exception:
            pass

    if llm_updates is None:
        return inferred

    merged = _merge(inferred, llm_updates)
    return _apply_guards(merged, inferred, python_in_sets, graph_string_values)


def _sample_triples(graph: Graph, max_triples: int = 50) -> str:
    # Guarantee at least one triple per predicate so the LLM always sees a real value
    # for every property, regardless of graph size or RDFLib's iteration order.
    seen_predicates: set = set()
    representative: list = []
    rest: list = []

    for triple in graph:
        pred = triple[1]
        if pred not in seen_predicates:
            seen_predicates.add(pred)
            representative.append(triple)
        else:
            rest.append(triple)

    selected = representative + rest[: max(0, max_triples - len(representative))]

    mini = Graph()
    for triple in selected:
        mini.add(triple)
    for prefix, ns in graph.namespace_manager.namespaces():
        mini.bind(prefix, ns)
    serialized = mini.serialize(format="turtle")
    return serialized.decode("utf-8") if isinstance(serialized, bytes) else serialized


def _extract_graph_string_values(graph: Graph) -> dict[str, set[str]]:
    """Collect all string literal values per property local name from the full graph."""
    from rdflib.namespace import XSD
    from app.services.rdf_parser import _local_name, _NON_STRING_DATATYPES

    result: dict[str, set[str]] = {}
    for _, predicate, obj in graph:
        if not isinstance(predicate, URIRef):
            continue
        if not isinstance(obj, Literal):
            continue
        if obj.language:
            continue
        if obj.datatype in _NON_STRING_DATATYPES:
            continue
        ln = _local_name(predicate)
        result.setdefault(ln, set()).add(str(obj))
    return result


def _build_message(inferred: dict[str, dict], turtle_sample: str) -> str:
    return (
        "Inferred constraints:\n"
        f"{json.dumps(inferred, indent=2)}\n\n"
        "RDF sample:\n"
        f"```turtle\n{turtle_sample}\n```\n\n"
        "Return a JSON object with only the properties and fields you want to correct. "
        "Set a field to null to remove it. For sh:in, only use values present in the data sample."
    )


def _call_groq(user_message: str, settings: Settings) -> dict[str, Any]:
    from groq import Groq
    client = Groq(api_key=settings.groq_api_key)
    response = client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": VERIFIER_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


def _call_gemini(user_message: str, settings: Settings) -> dict[str, Any]:
    from google import genai
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=f"{VERIFIER_SYSTEM_PROMPT}\n\n{user_message}",
        config={"response_mime_type": "application/json"},
    )
    raw = getattr(response, "text", None) or "{}"
    return json.loads(raw)


def _merge(inferred: dict[str, dict], updates: dict[str, Any]) -> dict[str, dict]:
    """Merge LLM updates field-by-field into Python-inferred constraints.

    Only touches properties already present in `inferred`. Never creates new
    property entries the LLM invented. Never replaces an entire property dict.
    """
    merged = {k: dict(v) for k, v in inferred.items()}
    for prop, fields in updates.items():
        if not isinstance(fields, dict):
            continue
        if prop not in merged:
            continue
        for field, value in fields.items():
            if value is None:
                merged[prop].pop(field, None)
            else:
                merged[prop][field] = str(value) if not isinstance(value, str) else value
        if not merged[prop]:
            del merged[prop]
    return merged


def _apply_guards(
    merged: dict[str, dict],
    inferred: dict[str, dict],
    python_in_sets: dict[str, set[str]],
    graph_string_values: dict[str, set[str]],
) -> dict[str, dict]:
    """Hard Python guardrails enforced after LLM merge."""
    import re as _re

    for prop in list(merged.keys()):
        constraints = merged[prop]

        # class — LLM must never set this
        constraints.pop("class", None)

        # pattern — accept only if it compiles as a valid regex and is not absurdly long
        if "pattern" in constraints:
            pat = constraints["pattern"]
            if not isinstance(pat, str) or len(pat) > 300:
                del constraints["pattern"]
            else:
                try:
                    _re.compile(pat)
                except _re.error:
                    del constraints["pattern"]

        # datatype: must be a known XSD curie
        if "datatype" in constraints:
            if constraints["datatype"] not in KNOWN_DATATYPES:
                del constraints["datatype"]

        # nodeKind: must be a known sh: value
        if "nodeKind" in constraints:
            if constraints["nodeKind"] not in KNOWN_NODEKINDS:
                del constraints["nodeKind"]

        # minCount / maxCount: Python's values are authoritative — restore if LLM removed them.
        # LLM corrections are accepted only if they are valid non-negative integers.
        for field in ("minCount", "maxCount"):
            python_val = inferred.get(prop, {}).get(field)
            if field in constraints:
                try:
                    val = int(constraints[field])
                    if val < 0:
                        raise ValueError
                    constraints[field] = str(val)
                except (ValueError, TypeError):
                    # Invalid correction — fall back to Python's value
                    if python_val is not None:
                        constraints[field] = python_val
                    else:
                        del constraints[field]
            elif python_val is not None:
                # LLM removed it — restore Python's value unconditionally
                constraints[field] = python_val

        # sh:in: (llm_list ∩ python_list) ∪ (graph_values ∩ python_list that LLM omitted)
        # Net effect: LLM can reduce the list; can restore values it wrongly removed;
        # can never add values outside python_list.
        if "in" in constraints:
            original_set = python_in_sets.get(prop, set())
            if not original_set:
                # Python never inferred sh:in; LLM added it — discard
                del constraints["in"]
            else:
                llm_values = [v.strip() for v in constraints["in"].split(",") if v.strip()]
                # Keep only values from python's original set
                filtered = [v for v in llm_values if v in original_set]
                # Restore any python values that exist in the graph but LLM dropped
                graph_vals_for_prop = graph_string_values.get(prop, set())
                restored = [v for v in original_set if v in graph_vals_for_prop and v not in filtered]
                final = filtered + [v for v in restored if v not in filtered]
                if final:
                    merged[prop]["in"] = ",".join(final)
                else:
                    del constraints["in"]
        elif prop in python_in_sets and python_in_sets[prop]:
            # LLM removed sh:in entirely — restore it from graph values ∩ python set
            graph_vals_for_prop = graph_string_values.get(prop, set())
            restored = [v for v in python_in_sets[prop] if v in graph_vals_for_prop]
            if restored:
                merged[prop]["in"] = ",".join(restored)

        if not merged[prop]:
            del merged[prop]

    return merged
