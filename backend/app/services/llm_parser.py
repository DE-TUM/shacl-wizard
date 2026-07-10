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
                            "node": {"type": "string"},
                            "languageIn": {"type": "string"},
                            "hasValue": {"type": "string"},
                            "uniqueLang": {"type": "string"},
                            "message": {"type": "string"},
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

Return JSON matching the schema exactly. Constraint values must be strings
because the frontend stores wizard input as strings. Only use these constraint
fields: minCount, maxCount, datatype, nodeKind, pattern, minInclusive,
maxInclusive, minExclusive, maxExclusive, minLength, maxLength, in, class, node,
languageIn, hasValue, uniqueLang, message.

"hasValue" is a single required value the property must include (e.g. "must
have the value 'active'"). "uniqueLang" is the string "true" only when the user
says each language may appear at most once among the values (e.g. "at most one
label per language"); otherwise omit it.

"message" is NOT a validating constraint — it is an optional custom
sh:message string shown in the validation report when this property is
violated. Only set it if the user explicitly asks for a custom error/validation
message for a property (e.g. "show the message 'Email looks invalid'"). Never
invent one.

Use SHACL/XSD CURIEs such as xsd:string, xsd:integer, xsd:decimal, xsd:date,
xsd:boolean, xsd:anyURI, sh:IRI, sh:Literal, and sh:BlankNode only when the
user explicitly specifies a value type. Do NOT infer or add datatype unless the
user names one (e.g. "must be an integer", "must be a date"). Never set
sh:datatype on a property that has sh:nodeKind sh:IRI or sh:node.

Property path naming — the input includes "availablePrefixes" (a map of
prefix -> namespace) and "selectedPrefix":
- If the user writes a property explicitly as a CURIE (prefix:localName, e.g.
  "ub:name", "ub:worksFor"), preserve that exact CURIE verbatim in "path",
  including the prefix — even if that prefix is not in availablePrefixes. The
  user chose it deliberately; do not strip or rename it.
- Otherwise, if a property clearly belongs to one of the availablePrefixes
  vocabularies (e.g. a person's name under foaf, a job title under schema), use
  that CURIE form for "path", such as foaf:name or schema:jobTitle.
- Otherwise use a bare local name with no prefix (e.g. "salary"); the wizard
  automatically applies the selectedPrefix to bare names.
- Never use the ex: prefix and never invent a prefix the user did not write and
  that is not in availablePrefixes.

Shape references (node) — the input includes "existingShapes", a list of
NodeShape names already defined in this graph:
- If the description says a property's value must itself conform to / be a /
  link to another shape (e.g. "worksFor ... must conform to ub:DepartmentShape",
  "each worksFor must be a valid Organization"), set "node" to that shape name.
- If the user names the shape explicitly (e.g. "ub:DepartmentShape"), use that
  exact name verbatim — preserve its prefix — even if it is not yet in
  existingShapes. The user is referencing a shape they intend to define.
- When the user does not name a shape but existingShapes contains an obvious
  match, use that exact name from existingShapes.
- Never invent a shape name the user did not write and that is not in
  existingShapes.

For nodeKind: default to sh:IRI when a property references another entity or
resource. Only use sh:BlankNode if the user explicitly describes an anonymous,
embedded, or structureless value with no separate identity. In most cases,
resource references are IRIs.

Never set both minInclusive and minExclusive at the same time, and never set
both maxInclusive and maxExclusive at the same time. When a user says "between
X and Y", use only minInclusive and maxInclusive. Only use exclusive bounds if
the user explicitly says "more than" or "less than" (strictly).

Cardinality rules — follow the user's explicit wording exactly; never infer from
datatype:
- "exactly one", "exactly one value", "one and only one" → minCount "1" AND
  maxCount "1".
- "at least one", "one or more", "required" → minCount "1", maxCount null.
  NEVER add maxCount here even if the property is a string or date.
- "at most one", "no more than one", "optional but at most one" → maxCount "1",
  minCount null.
- "optional", "zero or more", "can have multiple" → leave both null.
- "exactly N" → minCount "N" AND maxCount "N".
Only add maxCount when the user explicitly said "exactly one" or "at most one".
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
    allowed_shapes = set(request.existing_shapes)
    properties = [
        PropertyShape(
            path=item["path"],
            constraints=PropertyConstraints(**_normalize_constraints(item.get("constraints", {}), allowed_shapes, request.description)),
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
    allowed_shapes = set(request.existing_shapes)
    properties = [
        PropertyShape(
            path=item["path"],
            constraints=PropertyConstraints(**_normalize_constraints(item.get("constraints", {}), allowed_shapes, request.description)),
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


def _normalize_constraints(
    raw: dict,
    allowed_shapes: set[str] | None = None,
    description: str = "",
) -> dict:
    result = dict(raw)
    if result.get("in"):
        result["in"] = _normalize_in_value(result["in"])
    if result.get("minInclusive"):
        result["minExclusive"] = None
    if result.get("maxInclusive"):
        result["maxExclusive"] = None
    # Strip datatype from IRI/node-reference properties — datatypes apply only to literals.
    if result.get("nodeKind") in ("sh:IRI", "IRI") or result.get("node"):
        result["datatype"] = None
    # Keep a node reference when it is a real, defined shape OR when the user named
    # that shape verbatim in the request — referencing a shape they intend to define
    # later (e.g. "must conform to ub:DepartmentShape") is legitimate. Only drop a
    # reference the model invented that the user never mentioned.
    if result.get("node") and not _node_is_allowed(result["node"], allowed_shapes, description):
        result["node"] = None
    return result


def _node_is_allowed(
    node: str,
    allowed_shapes: set[str] | None,
    description: str,
) -> bool:
    if node in (allowed_shapes or set()):
        return True
    if not description:
        return False
    # Match the user's verbatim mention of the shape, by full CURIE or local name,
    # so "ub:DepartmentShape" and "DepartmentShape" both survive.
    local = node.split(":", 1)[-1]
    folded = description.lower()
    return node.lower() in folded or (bool(local) and local.lower() in folded)


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
        "availablePrefixes": request.prefixes,
        "selectedPrefix": request.selected_prefix,
        "existingShapes": request.existing_shapes,
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
