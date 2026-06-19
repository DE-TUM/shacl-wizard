from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional convenience dependency
    load_dotenv = None

if load_dotenv:
    load_dotenv()


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _llm_provider(value: str) -> str:
    provider = value.strip().lower()
    return provider if provider in {"auto", "groq", "gemini", "heuristic"} else "auto"


def _rdf_parser_backend(value: str) -> str:
    backend = value.strip().lower()
    return backend if backend in {"auto", "rdflib", "jena"} else "auto"


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _jena_endpoints() -> tuple[str | None, str | None]:
    sparql_endpoint = os.getenv("JENA_SPARQL_ENDPOINT") or None
    graph_store_endpoint = os.getenv("JENA_GRAPH_STORE_ENDPOINT") or None
    if sparql_endpoint and graph_store_endpoint:
        return sparql_endpoint, graph_store_endpoint

    base_url = os.getenv("JENA_BASE_URL") or None
    fuseki_command = os.getenv("JENA_FUSEKI_COMMAND") or None
    if not base_url and not fuseki_command:
        return sparql_endpoint, graph_store_endpoint

    base = (base_url or "http://127.0.0.1:3030").rstrip("/")
    dataset = os.getenv("JENA_DATASET", "shacl-wizard").strip("/")
    return (
        sparql_endpoint or f"{base}/{dataset}/sparql",
        graph_store_endpoint or f"{base}/{dataset}/data",
    )


@dataclass(frozen=True)
class Settings:
    app_name: str
    base_uri: str
    cors_origins: list[str]
    llm_provider: str
    groq_api_key: str | None
    groq_model: str
    gemini_api_key: str | None
    gemini_model: str
    rdf_parser_backend: str
    rdf_inference_limit_triples: int
    jena_sparql_endpoint: str | None
    jena_graph_store_endpoint: str | None
    jena_fuseki_command: str | None
    jena_startup_timeout_seconds: float
    jena_request_timeout_seconds: float

    @property
    def should_try_groq(self) -> bool:
        provider = self.llm_provider.lower()
        return provider in {"auto", "groq"} and bool(self.groq_api_key)

    @property
    def requires_groq(self) -> bool:
        return self.llm_provider.lower() == "groq"

    @property
    def should_try_gemini(self) -> bool:
        provider = self.llm_provider.lower()
        return provider in {"auto", "gemini"} and bool(self.gemini_api_key)

    @property
    def requires_gemini(self) -> bool:
        return self.llm_provider.lower() == "gemini"

    @property
    def jena_configured(self) -> bool:
        return bool(self.jena_sparql_endpoint and self.jena_graph_store_endpoint)

    @property
    def should_try_jena(self) -> bool:
        return self.rdf_parser_backend in {"auto", "jena"} and self.jena_configured

    @property
    def requires_jena(self) -> bool:
        return self.rdf_parser_backend == "jena"


def get_settings() -> Settings:
    jena_sparql_endpoint, jena_graph_store_endpoint = _jena_endpoints()

    return Settings(
        app_name=os.getenv("APP_NAME", "SHACL Wizard Backend"),
        base_uri=os.getenv("BASE_URI", "http://example.org/"),
        cors_origins=_split_csv(
            os.getenv(
                "BACKEND_CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            )
        ),
        llm_provider=_llm_provider(os.getenv("LLM_PROVIDER", "auto")),
        groq_api_key=os.getenv("GROQ_API_KEY") or None,
        groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        rdf_parser_backend=_rdf_parser_backend(os.getenv("RDF_PARSER_BACKEND", "auto")),
        rdf_inference_limit_triples=_int_env("RDF_INFERENCE_LIMIT_TRIPLES", 10_000),
        jena_sparql_endpoint=jena_sparql_endpoint,
        jena_graph_store_endpoint=jena_graph_store_endpoint,
        jena_fuseki_command=os.getenv("JENA_FUSEKI_COMMAND") or None,
        jena_startup_timeout_seconds=_float_env("JENA_STARTUP_TIMEOUT_SECONDS", 10.0),
        jena_request_timeout_seconds=_float_env("JENA_REQUEST_TIMEOUT_SECONDS", 30.0),
    )
