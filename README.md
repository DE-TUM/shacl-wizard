# SHACL Wizard

A wizard-style web application that enables non-expert users to generate valid SHACL shapes graphs without writing Turtle syntax. Users are guided through a step-by-step interface that maps their plain-English choices to correct SHACL Core constraints, producing a ready-to-use shapes graph in Turtle, JSON-LD, RDF/XML, and TriG formats.

Built as part of the Bachelor Practical Course in Data Engineering at TU Munich (SoSe 2026).

[![Watch the demo](docs/thumbnail.png)](https://github.com/DE-TUM/shacl-wizard/releases/download/iswc2026/ISWC.Demo.mp4)
---

## Features

- **Step-by-step wizard** — no RDF or SHACL knowledge required, with contextual tooltips explaining each choice
- **Manual mode** — build shapes from scratch with guided natural language questions
- **Upload-assisted mode** — upload an existing RDF data graph and get classes, properties, and constraints automatically inferred and pre-filled
- **AI-assisted NL parsing** — describe your data in plain English and get properties and constraints suggested automatically (Groq / Gemini / heuristic fallback)
- **Multi-NodeShape support with referenced shapes** — define multiple shapes in one session, link a property to another shape (`sh:node`), and jump straight into defining that referenced shape
- **Custom namespace prefixes** — reuse prefixes detected from an uploaded file, pick from common vocabularies (FOAF, schema.org, Dublin Core, OWL), or define your own
- **Built-in PySHACL validation** — drop a data graph on Step 5 to validate it against your shapes instantly
- **Four output formats** — Turtle (.ttl), JSON-LD, RDF/XML, TriG
- **Constraint inference from uploaded data** — Python statistical analysis + LLM verification layer, with an optional Apache Jena backend for large graphs

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite 8 |
| Backend | Python 3.10+, FastAPI, Uvicorn |
| RDF parsing & serialization | RDFLib 7 |
| SHACL validation | PySHACL |
| LLM integration | Groq (llama-3.3-70b-versatile) / Google Gemini 2.5 Flash / heuristic fallback |

---

## Project Structure

```
shacl-wizard/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app, route definitions
│   │   ├── config.py                  # Environment settings (LLM provider, URIs)
│   │   ├── models.py                  # Pydantic request/response models
│   │   └── services/
│   │       ├── llm_parser.py          # Natural language → SHACL property shapes
│   │       ├── rdf_parser.py          # RDF upload parsing + constraint inference
│   │       ├── jena_parser.py         # Optional Apache Jena TurtleParser subprocess wrapper
│   │       ├── constraint_verifier.py # LLM verification layer for inferred constraints
│   │       ├── shapes.py              # SHACL graph generation with RDFLib
│   │       └── validator.py           # PySHACL validation runner
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.tsx                    # Root component, wizard state, step routing
    │   ├── api/backend.ts             # All fetch calls to the backend API
    │   ├── components/wizard/         # Step1–Step5, ModeSelect, UploadScreen, InfoTip, TargetCard
    │   ├── types/index.ts             # Shared TypeScript types and constants
    │   └── utils/outputBuilder.ts     # Client-side fallback shape builder
    ├── package.json
    └── vite.config.ts
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env — add your GROQ_API_KEY (free at console.groq.com)

uvicorn app.main:app --reload --port 8000
```

### Apache Jena (optional, for large RDF uploads)

For large file uploads, the backend can shell out to a small Apache Jena `TurtleParser` Java program instead of parsing with `rdflib` in-process. This is optional; if Jena is not configured, the app falls back to `rdflib` when `RDF_PARSER_BACKEND=auto`.

This does **not** use Fuseki or SPARQL — it's a one-shot `java -cp ... TurtleParser <file>` subprocess call that streams Turtle to N-Triples, which is then loaded into RDFLib.

#### `.env` configuration

```env
RDF_PARSER_BACKEND=auto
JENA_JAVA_BIN=/path/to/java
JENA_CLASS_DIR=/path/to/compiled/jena/classes   # must contain TurtleParser.class and a lib/ dir with Jena's jars
JENA_MIN_FILE_SIZE_MB=200        # skip Jena below this size — JVM cold-start outweighs the speedup
JENA_REQUEST_TIMEOUT_SECONDS=600
```

`RDF_PARSER_BACKEND` values:

- `auto` — try Jena when `JENA_JAVA_BIN` and `JENA_CLASS_DIR` are both set, otherwise fall back to `rdflib`
- `rdflib` — always use in-process RDFLib
- `jena` — require Jena configuration and fail instead of falling back

#### Large-graph sampling

Once a graph is loaded, constraint inference can sample instead of scanning every triple, controlled by:

| Variable | Default | Description |
|---|---|---|
| `RDF_SAMPLE_TIER1_THRESHOLD` | `100000` | Below this many triples, no sampling |
| `RDF_SAMPLE_TIER2_THRESHOLD` | `1000000` | Below this, sample at `RDF_SAMPLE_TIER1_RATE` |
| `RDF_SAMPLE_TIER1_RATE` | `0.5` | Sampling rate for the tier1–tier2 range |
| `RDF_SAMPLE_TIER2_RATE` | `0.2` | Sampling rate at/above tier2 |
| `RDF_SAMPLE_MAX` | `500000` | Hard cap on sampled triples |

`rdf:type` triples are always kept in full so every class stays represented; the rest are reservoir-sampled.

> **Note:** `backend/.env.example` currently still documents the older Fuseki-based setup (`JENA_BASE_URL`, `JENA_SPARQL_ENDPOINT`, `JENA_FUSEKI_COMMAND`, etc.), which `config.py` no longer reads. It should be updated separately to match the variables above.

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

Both processes must run simultaneously. The frontend proxies all `/api/*` requests to `http://localhost:8000` via Vite's dev server proxy.

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Health check — reports configured LLM providers |
| POST | `/api/parse-nl` | Parse a natural language description into SHACL property shapes |
| POST | `/api/parse-rdf` | Upload an RDF file and extract classes, properties, and inferred constraints |
| POST | `/api/generate` | Generate a shapes graph from the current wizard state (all four formats) |
| POST | `/api/validate` | Validate an RDF data graph against a shapes graph using PySHACL |

---

## Environment Variables

All variables are set in `backend/.env` (copy from `backend/.env.example`).

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | — | Groq API key (free at [console.groq.com](https://console.groq.com)) |
| `GEMINI_API_KEY` | — | Google Gemini API key (optional fallback) |
| `LLM_PROVIDER` | `auto` | `auto`, `groq`, `gemini`, or `heuristic` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model name |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name |
| `BASE_URI` | `http://example.org/` | Base namespace for generated shapes |
| `BACKEND_CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins (comma-separated) |
| `RDF_PARSER_BACKEND` | `auto` | `auto`, `rdflib`, or `jena` |
| `RDF_INFERENCE_LIMIT_TRIPLES` | `10000` | Graphs above this size skip minCount/maxCount/`sh:in` inference |
| `JENA_JAVA_BIN` / `JENA_CLASS_DIR` | — | Enable the optional Jena `TurtleParser` path (see below) |

**LLM provider priority:** Groq → Gemini → heuristic fallback. The application works fully without any API key using the built-in heuristic parser.

---

## License

TU Munich — Bachelor Practical Course, Data Engineering, SoSe 2026.

