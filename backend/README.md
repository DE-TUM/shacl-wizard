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

## Apache Jena / Fuseki RDF Parser

Large RDF uploads can be parsed through Apache Jena Fuseki instead of RDFLib. The Python backend uploads the graph to a temporary named graph through Fuseki's Graph Store endpoint, queries hints and inferred constraints through SPARQL, then deletes the temporary graph.

RDFLib remains the fallback unless Jena is required explicitly:

```bash
# auto   = use Jena when configured, otherwise RDFLib
# rdflib = always use RDFLib
# jena   = require Jena; fail instead of falling back
RDF_PARSER_BACKEND=auto
```

Use an already running Fuseki dataset:

```bash
fuseki-server --mem /shacl-wizard

JENA_BASE_URL=http://127.0.0.1:3030
JENA_DATASET=shacl-wizard
```

Or set the endpoints directly:

```bash
JENA_SPARQL_ENDPOINT=http://127.0.0.1:3030/shacl-wizard/sparql
JENA_GRAPH_STORE_ENDPOINT=http://127.0.0.1:3030/shacl-wizard/data
```

The backend can also start Fuseki itself when `JENA_FUSEKI_COMMAND` is configured:

```bash
JENA_FUSEKI_COMMAND=fuseki-server --mem /shacl-wizard
JENA_BASE_URL=http://127.0.0.1:3030
JENA_DATASET=shacl-wizard
```

The Jena path intentionally skips the optional LLM verification pass because that pass expects an in-process RDFLib graph sample. Python statistical inference still runs through SPARQL, and RDFLib mode keeps the previous LLM verification behavior.

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
    ├── jena_parser.py         # Optional Apache Jena/Fuseki parser over SPARQL
    ├── constraint_verifier.py # LLM verification pass over Python-inferred constraints
    ├── shapes.py              # SHACL graph construction with RDFLib + serialization
    └── validator.py           # PySHACL runner, violation extraction and message cleaning
```

### Constraint inference pipeline (`/api/parse-rdf`)

1. **Parser selection** — `RDF_PARSER_BACKEND=auto` tries Apache Jena when Fuseki endpoints are configured, otherwise RDFLib runs in-process. `jena` requires Fuseki; `rdflib` disables Jena.
2. **Python statistical pass** — RDFLib iterates the graph directly, or Jena is queried through SPARQL. The pass computes minCount/maxCount per property, detects XSD datatypes, flags sh:IRI vs sh:Literal, and identifies `sh:in` candidates for low-cardinality categorical values.
3. **LLM verification pass** — RDFLib mode can make a second Groq/Gemini call to review inferred constraints against a sample of real triples. Jena mode skips this pass to avoid reloading large graphs into RDFLib.
4. **Large graph optimisation** — graphs with more than `RDF_INFERENCE_LIMIT_TRIPLES` triples skip minCount/maxCount/sh:in inference (`inferenceLimited: true` in the response) to keep response times acceptable.

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
