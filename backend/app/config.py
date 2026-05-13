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
    )
