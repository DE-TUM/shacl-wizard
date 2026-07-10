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
    rdf_llm_verify_limit_triples: int
    jena_java_bin: str | None
    jena_class_dir: str | None
    jena_request_timeout_seconds: float
    jena_min_file_size_mb: float
    rdf_sample_tier1_threshold: int
    rdf_sample_tier2_threshold: int
    rdf_sample_tier1_rate: float
    rdf_sample_tier2_rate: float
    rdf_sample_max: int

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
        return bool(self.jena_java_bin and self.jena_class_dir)

    @property
    def should_try_jena(self) -> bool:
        return self.rdf_parser_backend in {"auto", "jena"} and self.jena_configured

    @property
    def requires_jena(self) -> bool:
        return self.rdf_parser_backend == "jena"


def get_settings() -> Settings:
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
        rdf_llm_verify_limit_triples=_int_env("RDF_LLM_VERIFY_LIMIT_TRIPLES", 500_000),
        jena_java_bin=os.getenv("JENA_JAVA_BIN") or None,
        jena_class_dir=os.getenv("JENA_CLASS_DIR") or None,
        jena_request_timeout_seconds=_float_env("JENA_REQUEST_TIMEOUT_SECONDS", 600.0),
        jena_min_file_size_mb=_float_env("JENA_MIN_FILE_SIZE_MB", 200.0),
        rdf_sample_tier1_threshold=_int_env("RDF_SAMPLE_TIER1_THRESHOLD", 100_000),
        rdf_sample_tier2_threshold=_int_env("RDF_SAMPLE_TIER2_THRESHOLD", 1_000_000),
        rdf_sample_tier1_rate=_float_env("RDF_SAMPLE_TIER1_RATE", 0.5),
        rdf_sample_tier2_rate=_float_env("RDF_SAMPLE_TIER2_RATE", 0.2),
        rdf_sample_max=_int_env("RDF_SAMPLE_MAX", 500_000),
    )
