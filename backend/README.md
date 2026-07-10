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

## Apache Jena RDF Parser

Large RDF uploads can be parsed by shelling out to a small Apache Jena `TurtleParser` Java program instead of RDFLib. This is a one-shot subprocess call (`java -cp <classpath> TurtleParser <file>`) that streams Turtle to N-Triples on disk; there is no Fuseki server or SPARQL endpoint involved.

RDFLib remains the fallback unless Jena is required explicitly:

```bash
# auto   = use Jena when JENA_JAVA_BIN and JENA_CLASS_DIR are set, otherwise RDFLib
# rdflib = always use RDFLib
# jena   = require Jena; fail instead of falling back
RDF_PARSER_BACKEND=auto

JENA_JAVA_BIN=/path/to/java
JENA_CLASS_DIR=/path/to/compiled/jena/classes   # must contain TurtleParser.class and a lib/ dir with Jena's jars
JENA_MIN_FILE_SIZE_MB=200        # below this file size, RDFLib is used even if Jena is configured (JVM cold-start isn't worth it)
JENA_REQUEST_TIMEOUT_SECONDS=600
```

For very large graphs, the statistical inference pass samples triples instead of scanning all of them, tiered by `RDF_SAMPLE_TIER1_THRESHOLD` / `RDF_SAMPLE_TIER2_THRESHOLD` / `RDF_SAMPLE_TIER1_RATE` / `RDF_SAMPLE_TIER2_RATE` / `RDF_SAMPLE_MAX`. `rdf:type` triples are always kept in full so class coverage isn't lost.

The Jena path intentionally skips the optional LLM verification pass because that pass expects an in-process RDFLib graph sample; RDFLib mode keeps the LLM verification behavior.

> **Note:** `backend/.env.example` still documents the older Fuseki-based setup (`JENA_BASE_URL`, `JENA_SPARQL_ENDPOINT`, `JENA_FUSEKI_COMMAND`, etc.), which `config.py` no longer reads — it needs to be refreshed to match the variables above.

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
    ├── jena_parser.py         # Optional Apache Jena TurtleParser subprocess wrapper
    ├── constraint_verifier.py # LLM verification pass over Python-inferred constraints
    ├── shapes.py              # SHACL graph construction with RDFLib + serialization
    └── validator.py           # PySHACL runner, violation extraction and message cleaning
```

### Constraint inference pipeline (`/api/parse-rdf`)

1. **Parser selection** — `RDF_PARSER_BACKEND=auto` tries the Jena `TurtleParser` subprocess when `JENA_JAVA_BIN`/`JENA_CLASS_DIR` are configured and the file is above `JENA_MIN_FILE_SIZE_MB`, otherwise RDFLib parses in-process. `jena` requires that configuration; `rdflib` disables Jena.
2. **Python statistical pass** — runs over the resulting RDFLib graph either way (Jena's output is converted to N-Triples and loaded into RDFLib, optionally sampled per the tiers above). The pass computes minCount/maxCount per property, detects XSD datatypes, flags sh:IRI vs sh:Literal, and identifies `sh:in` candidates for low-cardinality categorical values.
3. **LLM verification pass** — RDFLib mode (small/medium graphs) can make a second Groq/Gemini call to review inferred constraints against a sample of real triples. The Jena path skips this pass.
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
