# SHACL Wizard

A wizard-style web application that enables non-expert users to generate valid SHACL shapes graphs without writing Turtle syntax. Users are guided through a step-by-step interface that maps their plain-English choices to correct SHACL Core constraints, producing a ready-to-use shapes graph in Turtle, JSON-LD, RDF/XML, and TriG formats.

Built as part of the Bachelor Practical Course in Data Engineering at TU Munich (SoSe 2026).

---

## Features

- **Step-by-step wizard** — no RDF or SHACL knowledge required
- **Manual mode** — build shapes from scratch with guided natural language questions
- **Upload-assisted mode** — upload an existing RDF data graph and get classes, properties, and constraints automatically inferred and pre-filled
- **AI-assisted NL parsing** — describe your data in plain English and get properties and constraints suggested automatically (Groq / Gemini / heuristic fallback)
- **Multi-NodeShape support** — define multiple shapes in one session and export them as a single shapes graph
- **Built-in PySHACL validation** — drop a data graph on Step 5 to validate it against your shapes instantly
- **Four output formats** — Turtle (.ttl), JSON-LD, RDF/XML, TriG
- **Constraint inference from uploaded data** — Python statistical analysis + LLM verification layer

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
│   │       ├── constraint_verifier.py # LLM verification layer for inferred constraints
│   │       ├── shapes.py              # SHACL graph generation with RDFLib
│   │       └── validator.py           # PySHACL validation runner
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.tsx                    # Root component, wizard state, step routing
    │   ├── api/backend.ts             # All fetch calls to the backend API
    │   ├── components/wizard/         # Step1–Step5, ModeSelect, UploadScreen
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

**LLM provider priority:** Groq → Gemini → heuristic fallback. The application works fully without any API key using the built-in heuristic parser.

---

## License

TU Munich — Bachelor Practical Course, Data Engineering, SoSe 2026.
