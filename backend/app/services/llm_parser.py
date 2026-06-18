from __future__ import annotations

import json
import re
from typing import Any

from app.config import Settings
from app.models import (
    ParseNLRequest,
    ParseNLResponse,
    PropertyConstraints,
    PropertyShape,
)


LLM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "properties": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "constraints": {
                        "type": "object",
                        "properties": {
                            "minCount": {"type": "string"},
                            "maxCount": {"type": "string"},
                            "datatype": {"type": "string"},
                            "nodeKind": {"type": "string"},
                            "pattern": {"type": "string"},
                            "minInclusive": {"type": "string"},
                            "maxInclusive": {"type": "string"},
                            "minExclusive": {"type": "string"},
                            "maxExclusive": {"type": "string"},
                            "minLength": {"type": "string"},
                            "maxLength": {"type": "string"},
                            "in": {"type": "string"},
                            "class": {"type": "string"},
                            "languageIn": {"type": "string"},
                        },
                    },
                },
                "required": ["path", "constraints"],
            },
        },
        "summary": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["properties", "summary"],
}


SYSTEM_INSTRUCTIONS = """
You convert natural-language validation requirements into SHACL Core property
shapes for a beginner-friendly wizard.

Return JSON matching the schema exactly. Use local property names only, without
the ex: prefix. Constraint values must be strings because the frontend stores
wizard input as strings. Only use these constraint fields:
minCount, maxCount, datatype, nodeKind, pattern, minInclusive, maxInclusive,
minExclusive, maxExclusive, minLength, maxLength, in, class, languageIn.

Prefer common SHACL/XSD CURIEs such as xsd:string, xsd:integer, xsd:decimal,
xsd:date, xsd:boolean, xsd:anyURI, sh:IRI, sh:Literal, and sh:BlankNode.

For nodeKind: default to sh:IRI when a property references another entity or
resource. Only use sh:BlankNode if the user explicitly describes an anonymous,
embedded, or structureless value with no separate identity. In most cases,
resource references are IRIs.

Never set both minInclusive and minExclusive at the same time, and never set
both maxInclusive and maxExclusive at the same time. When a user says "between
X and Y", use only minInclusive and maxInclusive. Only use exclusive bounds if
the user explicitly says "more than" or "less than" (strictly).

Cardinality rules — you MUST follow these precisely:
- If the description says "must have", "exactly one", "required", or implies a
  single mandatory value per entity (e.g. "the X must be"), set BOTH minCount
  AND maxCount to "1". Never leave maxCount null when minCount is "1" and the
  description implies a single value.
- If the description says "at least one" or "required" but can have more than
  one value, set minCount to "1" and leave maxCount null.
- If the description says "optional" or "can have multiple", leave both null.
- Do NOT leave minCount and maxCount null for properties the description treats
  as singular and mandatory. When in doubt and the property has a datatype that
  typically holds one value (integer, string, date), set BOTH minCount and
  maxCount to "1".
""".strip()


def parse_natural_language(request: ParseNLRequest, settings: Settings) -> ParseNLResponse:
    if settings.requires_groq and not settings.groq_api_key:
        h = parse_with_heuristics(request)
        h.warnings.append("LLM_PROVIDER=groq but GROQ_API_KEY is missing.")
        return h

    if settings.requires_gemini and not settings.gemini_api_key:
        h = parse_with_heuristics(request)
        h.warnings.append("LLM_PROVIDER=gemini but GEMINI_API_KEY is missing.")
        return h

    groq_warning: str | None = None

    if settings.should_try_groq:
        try:
            return parse_with_groq(request, settings)
        except Exception as exc:
            groq_warning = f"Groq parser failed: {exc}"

    if settings.should_try_gemini:
        try:
            result = parse_with_gemini(request, settings)
            if groq_warning:
                result.warnings.append(groq_warning)
            return result
        except Exception as exc:
            h = parse_with_heuristics(request)
            if groq_warning:
                h.warnings.append(groq_warning)
            h.warnings.append(f"Gemini parser failed; heuristic parser used instead: {exc}")
            return h

    h = parse_with_heuristics(request)
    if groq_warning:
        h.warnings.append(groq_warning)
    elif not settings.should_try_groq and not settings.should_try_gemini:
        h.warnings.append("No LLM API keys configured; using heuristic parser.")
    return h


def parse_with_groq(request: ParseNLRequest, settings: Settings) -> ParseNLResponse:
    try:
        from groq import Groq
    except ImportError as exc:
        raise RuntimeError("groq package is not installed") from exc

    client = Groq(api_key=settings.groq_api_key)
    response = client.chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": SYSTEM_INSTRUCTIONS},
            {"role": "user", "content": _build_user_message(request)},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )
    raw_text = response.choices[0].message.content or ""
    payload = json.loads(raw_text)
    properties = [
        PropertyShape(
            path=item["path"],
            constraints=PropertyConstraints(**_normalize_constraints(item.get("constraints", {}))),
        )
        for item in payload.get("properties", [])
        if item.get("path")
    ]
    if not properties:
        raise ValueError("LLM returned no properties")

    return ParseNLResponse(
        properties=properties,
        summary=payload.get("summary", []),
        source="groq",
    )


def parse_with_gemini(request: ParseNLRequest, settings: Settings) -> ParseNLResponse:
    try:
        from google import genai
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("google-genai package is not installed") from exc

    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=_build_prompt(request),
        config={
            "response_mime_type": "application/json",
            "response_json_schema": LLM_SCHEMA,
        },
    )

    raw_text = _extract_response_text(response)
    payload = json.loads(raw_text)
    properties = [
        PropertyShape(
            path=item["path"],
            constraints=PropertyConstraints(**_normalize_constraints(item.get("constraints", {}))),
        )
        for item in payload.get("properties", [])
        if item.get("path")
    ]
    if not properties:
        raise ValueError("LLM returned no properties")

    return ParseNLResponse(
        properties=properties,
        summary=payload.get("summary", []),
        source="gemini",
    )


def _normalize_constraints(raw: dict) -> dict:
    result = dict(raw)
    if result.get("in"):
        result["in"] = _normalize_in_value(result["in"])
    if result.get("minInclusive"):
        result["minExclusive"] = None
    if result.get("maxInclusive"):
        result["maxExclusive"] = None
    # If LLM set minCount "1" but left maxCount null on a scalar property (has a
    # datatype), the description almost certainly implied a single value — enforce it.
    if result.get("minCount") == "1" and not result.get("maxCount") and result.get("datatype"):
        result["maxCount"] = "1"
    return result


def _normalize_in_value(value: str) -> str:
    if "," in value:
        tokens = [t.strip().strip("\"'") for t in value.split(",")]
    else:
        tokens = re.findall(r'"[^"]*"|\'[^\']*\'|\S+', value)
        tokens = [t.strip("\"'") for t in tokens]
    return ",".join(t for t in tokens if t)


def _build_user_message(request: ParseNLRequest) -> str:
    context = {
        "description": request.description,
        "targetType": request.target_type,
        "targetValue": request.target_value,
        "shapeName": request.shape_name,
    }
    return (
        "Parse this wizard request into SHACL property constraints. "
        "Return JSON only and match this JSON schema:\n"
        f"{json.dumps(LLM_SCHEMA, ensure_ascii=True, indent=2)}\n\n"
        "Input:\n"
        f"{json.dumps(context, ensure_ascii=True, indent=2)}"
    )


def _build_prompt(request: ParseNLRequest) -> str:
    return f"{SYSTEM_INSTRUCTIONS}\n\n{_build_user_message(request)}"


def _extract_response_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if text:
        return text

    output_text = getattr(response, "output_text", None)
    if output_text:
        return output_text

    chunks: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                chunks.append(text)
    if chunks:
        return "".join(chunks)

    raise ValueError("LLM response did not contain output text")


def parse_with_heuristics(request: ParseNLRequest) -> ParseNLResponse:
    text = _fold_text(request.description)
    properties: list[PropertyShape] = []

    for rule in _candidate_rules():
        if any(keyword in text for keyword in rule["keywords"]):
            constraints = PropertyConstraints(**rule["constraints"])
            _apply_cardinality(text, rule["keywords"], constraints)
            _apply_numeric_range(text, rule["keywords"], constraints)
            properties.append(PropertyShape(path=rule["path"], constraints=constraints))

    if not properties:
        properties.append(
            PropertyShape(
                path="label",
                constraints=PropertyConstraints(minCount="1", datatype="xsd:string"),
            )
        )

    return ParseNLResponse(
        properties=_dedupe_properties(properties),
        summary=[f"Suggested {len(properties)} propert{'y' if len(properties) == 1 else 'ies'} from the description."],
        source="heuristic",
    )


def _candidate_rules() -> list[dict[str, Any]]:
    return [
        {
            "path": "name",
            "keywords": ["name", "full name", "vollname"],
            "constraints": {"minCount": "1", "maxCount": "1", "datatype": "xsd:string"},
        },
        {
            "path": "email",
            "keywords": ["email", "e-mail", "mail address", "mailadresse"],
            "constraints": {
                "minCount": "1",
                "datatype": "xsd:string",
                "pattern": r"^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$",
            },
        },
        {
            "path": "age",
            "keywords": ["age", "alter"],
            "constraints": {"datatype": "xsd:integer", "minInclusive": "0", "maxInclusive": "150"},
        },
        {
            "path": "birthDate",
            "keywords": ["birth date", "birthdate", "born", "geburtsdatum", "geboren"],
            "constraints": {"datatype": "xsd:date"},
        },
        {
            "path": "homepage",
            "keywords": ["url", "website", "homepage", "webseite"],
            "constraints": {"datatype": "xsd:anyURI", "nodeKind": "sh:IRI"},
        },
        {
            "path": "price",
            "keywords": ["price", "preis", "cost", "kosten"],
            "constraints": {"datatype": "xsd:decimal", "minInclusive": "0"},
        },
        {
            "path": "description",
            "keywords": ["description", "beschreibung"],
            "constraints": {"datatype": "xsd:string"},
        },
        {
            "path": "sku",
            "keywords": ["sku", "article number", "artikelnummer"],
            "constraints": {"datatype": "xsd:string", "minCount": "1", "maxCount": "1"},
        },
        {
            "path": "phone",
            "keywords": ["phone", "telephone", "telefon"],
            "constraints": {"datatype": "xsd:string", "pattern": r"^\+?[0-9\s().-]{6,}$"},
        },
    ]


def _apply_cardinality(text: str, keywords: list[str], constraints: PropertyConstraints) -> None:
    snippet = _nearby_text(text, keywords)
    if re.search(r"\b(exactly one|genau ein(?:e|en)?|one and only one)\b", snippet):
        constraints.min_count = "1"
        constraints.max_count = "1"
    elif re.search(r"\b(at least one|required|mandatory|must have|mindestens ein(?:e|en)?|pflicht)\b", snippet):
        constraints.min_count = constraints.min_count or "1"
    elif re.search(r"\b(at most one|max(?:imum)? one|hoechstens ein(?:e|en)?)\b", snippet):
        constraints.max_count = constraints.max_count or "1"

    if re.search(r"\b(optional|freiwillig|kann)\b", snippet):
        constraints.min_count = None


def _apply_numeric_range(text: str, keywords: list[str], constraints: PropertyConstraints) -> None:
    snippet = _nearby_text(text, keywords)
    match = re.search(r"\bbetween\s+(-?\d+(?:\.\d+)?)\s+(?:and|to)\s+(-?\d+(?:\.\d+)?)\b", snippet)
    if not match:
        match = re.search(r"\bzwischen\s+(-?\d+(?:\.\d+)?)\s+und\s+(-?\d+(?:\.\d+)?)\b", snippet)
    if match:
        constraints.min_inclusive = match.group(1)
        constraints.max_inclusive = match.group(2)


def _nearby_text(text: str, keywords: list[str], radius: int = 80) -> str:
    spans: list[str] = []
    for keyword in keywords:
        idx = text.find(keyword)
        if idx >= 0:
            spans.append(text[max(0, idx - radius) : idx + len(keyword) + radius])
    return " ".join(spans) if spans else text


def _fold_text(text: str) -> str:
    return (
        text.lower()
        .replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )


def _dedupe_properties(properties: list[PropertyShape]) -> list[PropertyShape]:
    seen: set[str] = set()
    deduped: list[PropertyShape] = []
    for prop in properties:
        key = prop.path.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(prop)
    return deduped
