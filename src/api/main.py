"""
src/api/main.py — FastAPI application entry point.

Middleware stack (in order of execution):
1. CORSMiddleware
2. RequestIDMiddleware
3. TenantContextMiddleware
4. PrometheusInstrumentatorMiddleware
"""
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.api.middleware import RequestIDMiddleware, TenantContextMiddleware, limiter
from src.api.routes import auth, documents, extract, health, ingest, search, summarize
from src.core.config import get_settings
from src.core.tracing import setup_tracing
from src.core.providers import log_active_providers

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: initialize all services.
    Shutdown: close all connections.
    """
    settings = get_settings()
    log.info("docufinder_starting", environment=settings.environment)

    # 1. Init tracing (non-fatal if Phoenix not running)
    setup_tracing()

    # 2. Init MongoDB + Beanie (creates indexes on first run)
    from src.core.database import init_db
    await init_db()

    # 3. Configure LlamaIndex global settings
    from src.retrieval.engine import configure_llamaindex
    configure_llamaindex()

    # 4. Verify Qdrant connection
    from src.core.qdrant_client import init_qdrant_connection
    await init_qdrant_connection()

    # 5. Log active providers
    log_active_providers()

    log.info("docufinder_ready",
             api_url="http://0.0.0.0:8001",
             docs_url="http://0.0.0.0:8001/docs")

    yield

    # Shutdown
    log.info("docufinder_shutting_down")
    from src.core.database import close_db_connections
    from src.core.valkey_client import close_valkey
    await close_db_connections()
    await close_valkey()
    log.info("docufinder_stopped")


# ─── App Creation ─────────────────────────────────────────────

settings = get_settings()

app = FastAPI(
    title="Company Document Finder API",
    description=(
        "Multi-tenant document ingestion, semantic search, "
        "and summarization API powered by LlamaIndex + Qdrant + Ollama (Gemma 4)."
    ),
    version="2.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ─── Rate Limiter State ───────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Middleware Stack ─────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantContextMiddleware)
app.add_middleware(RequestIDMiddleware)

# ─── Prometheus Instrumentation ───────────────────────────────
Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    excluded_handlers=["/health", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics")

# ─── Routers ─────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(health.router)
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(ingest.router, prefix=API_PREFIX)
app.include_router(documents.router, prefix=API_PREFIX)
app.include_router(search.router, prefix=API_PREFIX)
app.include_router(summarize.router, prefix=API_PREFIX)
app.include_router(extract.router, prefix=API_PREFIX)

# ─── Global Error Handler ─────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all: log the error with request context, return 500.
    Never expose internal error details in production.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "unauthenticated")

    log.error(
        "unhandled_exception",
        request_id=request_id,
        tenant_id=tenant_id,
        path=request.url.path,
        method=request.method,
        error_type=type(exc).__name__,
        error=str(exc),
        exc_info=True,
    )

    if settings.is_production:
        detail = "Internal server error"
    else:
        detail = f"{type(exc).__name__}: {str(exc)}"

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": detail, "request_id": request_id},
    )
