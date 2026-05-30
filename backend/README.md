# SHACL Wizard — Backend

FastAPI backend for the SHACL Wizard. Handles natural language parsing, RDF constraint inference, SHACL graph generation, and PySHACL validation.

---

## Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Reports status and which LLM providers are configured |
| POST | `/api/parse-nl` | Parse a plain-English description into SHACL property shapes |
| POST | `/api/parse-rdf` | Upload an RDF file and extract classes, properties, and inferred constraints |
| POST | `/api/generate` | Build a shapes graph from the wizard state (Turtle, JSON-LD, RDF/XML, TriG) |
| POST | `/api/validate` | Validate an RDF data graph against a shapes graph using PySHACL |

---

## Setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Add your GROQ_API_KEY to .env (free at console.groq.com)

uvicorn app.main:app --reload --port 8000
```

The Vite dev server proxies all `/api/*` requests to `http://localhost:8000`.

---

## LLM Provider Configuration

The NL parser works without any API key using a built-in heuristic parser. When keys are configured, the backend uses them automatically.

**Priority order: Groq → Gemini → heuristic fallback**

```bash
# .env

# Recommended: Groq (fast, free tier at console.groq.com)
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile

# Optional fallback: Google Gemini
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash

# Provider selection: auto | groq | gemini | heuristic
LLM_PROVIDER=auto
```

With `LLM_PROVIDER=auto`, Groq is tried first. If Groq fails or has no key, Gemini is tried. If both fail, the heuristic parser runs and a warning is returned in the response.

---

## Service Architecture

```
app/
├── main.py                    # FastAPI router, request validation
├── config.py                  # Settings from environment variables
├── models.py                  # Pydantic models (WizardState, PropertyShape, etc.)
└── services/
    ├── llm_parser.py          # NL description → property shapes via LLM or heuristic
    ├── rdf_parser.py          # RDF graph parsing + two-layer constraint inference
    ├── constraint_verifier.py # LLM verification pass over Python-inferred constraints
    ├── shapes.py              # SHACL graph construction with RDFLib + serialization
    └── validator.py           # PySHACL runner, violation extraction and message cleaning
```

### Constraint inference pipeline (`/api/parse-rdf`)

1. **Python statistical pass** — RDFLib iterates the uploaded graph, computes minCount/maxCount per property, detects XSD datatypes, flags sh:IRI vs sh:Literal, and identifies `sh:in` candidates for low-cardinality categorical values.
2. **LLM verification pass** — a second call (Groq/Gemini) reviews the inferred constraints against a sample of real triples. It can add `sh:pattern` for recognisable formats (email, phone), tighten numeric ranges, and remove false positives. Python guardrails restore any cardinality values the LLM incorrectly drops.
3. **Large graph optimisation** — graphs with more than 10,000 triples skip minCount/maxCount/sh:in inference (`inferenceLimited: true` in the response) to keep response times acceptable.

---

## Request/Response Shapes

### `POST /api/parse-nl`

```json
{
  "description": "A person must have exactly one name (string) and an optional age (integer, 0–150)",
  "targetType": "class",
  "targetValue": "Person",
  "shapeName": "PersonShape"
}
```

Response: `{ "properties": [...], "source": "groq", "warnings": [], "summary": [...] }`

### `POST /api/generate`

Accepts the full `WizardState` as JSON — including `completedShapes` for multi-NodeShape sessions. Returns all four serialization formats in one response.

```json
{
  "shapeName": "PersonShape",
  "targetType": "class",
  "targetValue": "Person",
  "properties": [
    { "id": "p1", "path": "name", "constraints": { "minCount": "1", "datatype": "xsd:string" } }
  ],
  "completedShapes": []
}
```

Response: `{ "formats": { "turtle": "...", "jsonld": "...", "rdfxml": "...", "trig": "..." }, "shapeUri": "...", "summary": [...] }`

### `POST /api/validate`

Multipart form:
- `data_file` — the RDF data graph file to validate
- `shapes_graph` — the shapes graph as a Turtle string (from `/api/generate`)

Response: `{ "status": "valid"|"invalid", "conforms": true|false, "violations": [...], "dataFile": "...", "reportText": "..." }`
