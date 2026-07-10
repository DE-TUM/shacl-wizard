from __future__ import annotations

import anyio
import functools
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import (
    GenerateResponse,
    ParseNLRequest,
    ParseNLResponse,
    ParseRDFResponse,
    ValidationResponse,
    WizardState,
)
from app.services.llm_parser import parse_natural_language
from app.services.rdf_parser import guess_rdf_format, parse_rdf_from_file, parse_rdf_full
from app.services.shapes import build_shapes_response
from app.services.validator import run_pyshacl_validation

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

router = APIRouter(prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "SHACL Wizard backend is running. See /docs for API docs."}


@router.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "llmProvider": settings.llm_provider,
        "groqConfigured": bool(settings.groq_api_key),
        "groqModel": settings.groq_model,
        "geminiConfigured": bool(settings.gemini_api_key),
        "geminiModel": settings.gemini_model,
        "rdfParserBackend": settings.rdf_parser_backend,
        "jenaConfigured": settings.jena_configured,
        "jenaClassDir": settings.jena_class_dir or "",
    }


@router.post("/parse-nl", response_model=ParseNLResponse)
def parse_nl(request: ParseNLRequest) -> ParseNLResponse:
    return parse_natural_language(request, settings)


@router.post("/generate", response_model=GenerateResponse)
def generate(state: WizardState) -> GenerateResponse:
    base_uri = state.selected_namespace.strip() or settings.base_uri
    prefix   = state.selected_prefix.strip()   or "ex"
    try:
        formats, shape_uri, summary = build_shapes_response(state, base_uri, prefix)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return GenerateResponse(formats=formats, shapeUri=shape_uri, summary=summary)


@router.post("/parse-rdf", response_model=ParseRDFResponse)
async def parse_rdf(
    data_file: UploadFile | None = File(default=None),
    graph_text: str | None = Form(default=None),
    rdf_format: str | None = Form(default=None),
) -> ParseRDFResponse:
    if data_file is None and not graph_text:
        raise HTTPException(status_code=400, detail="Provide data_file or graph_text.")

    filename = data_file.filename if data_file else "pasted-graph.ttl"

    _file_size = data_file.size if data_file and hasattr(data_file, "size") else "unknown"
    print(
        f"[UPLOAD DEBUG] data_file present: {data_file is not None} | "
        f"graph_text present: {bool(graph_text)} | "
        f"filename: {filename} | file size: {_file_size} bytes",
        flush=True,
    )

    if data_file is not None:
        # Stream upload to disk in 1 MB chunks — the file is never held in RAM as a
        # Python string, so this works for files of any size.
        suffix = Path(filename).suffix or ".ttl"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp_path = tmp.name
        try:
            while chunk := await data_file.read(1024 * 1024):
                tmp.write(chunk)
            tmp.close()
            fn = functools.partial(parse_rdf_from_file, tmp_path, filename, rdf_format, settings)
            return await anyio.to_thread.run_sync(fn)
        except Exception as exc:
            msg = str(exc)
            if "too large for RDFLib fallback" in msg:
                detail = (
                    "This file is too large to process without the Jena parser. "
                    "Please ensure Jena is configured correctly, or upload a smaller file."
                )
            else:
                detail = f"Could not parse RDF graph: {exc}"
            raise HTTPException(status_code=400, detail=detail) from exc
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    else:
        try:
            fn = functools.partial(parse_rdf_full, graph_text or "", filename, rdf_format, settings)
            return await anyio.to_thread.run_sync(fn)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not parse RDF graph: {exc}") from exc


@router.post("/validate", response_model=ValidationResponse)
async def validate(
    data_file: UploadFile = File(...),
    shapes_graph: str | None = Form(default=None),
    shapes_file: UploadFile | None = File(default=None),
    data_format: str | None = Form(default=None),
    shapes_format: str | None = Form(default=None),
) -> ValidationResponse:
    if not shapes_graph and shapes_file is None:
        raise HTTPException(status_code=400, detail="Provide shapes_graph or shapes_file.")

    data_text = _decode_bytes(await data_file.read(), data_file.filename)
    if shapes_file is not None:
        shapes_text = _decode_bytes(await shapes_file.read(), shapes_file.filename)
        inferred_shapes_format = shapes_format or guess_rdf_format(shapes_file.filename)
    else:
        shapes_text = shapes_graph or ""
        inferred_shapes_format = shapes_format or "turtle"

    inferred_data_format = data_format or guess_rdf_format(data_file.filename)

    try:
        return await anyio.to_thread.run_sync(
            run_pyshacl_validation,
            data_text,
            shapes_text,
            data_file.filename,
            inferred_data_format,
            inferred_shapes_format,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Validation failed: {exc}") from exc


def _decode_bytes(content: bytes, filename: str | None = None) -> str:
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError as exc:
        label = filename or "uploaded file"
        raise HTTPException(status_code=400, detail=f"{label} must be UTF-8 encoded.") from exc


app.include_router(router)
