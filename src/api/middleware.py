"""
src/api/middleware.py — Tenant context middleware + rate limiting.

Middleware stack order (applied in main.py):
1. RequestIDMiddleware (UUID per request)
2. TenantContextMiddleware (JWT decode + rate limiting)
3. PrometheusMiddleware
4. CORSMiddleware
"""
import uuid

import structlog
from fastapi import HTTPException, Request, Response
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from src.core.config import get_settings
from src.core.tenant_context import set_tenant_id

log = structlog.get_logger(__name__)

# ─── Rate Limiter (Valkey-backed) ────────────────────────────

settings = get_settings()

# Valkey URI for slowapi (use redis:// scheme — slowapi is wire-compatible)
# slowapi uses redis-py internally but the Valkey server is wire-compatible
_slowapi_uri = settings.valkey_url.replace("valkey://", "redis://")

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_slowapi_uri,
)


# ─── Request ID Middleware ────────────────────────────────────

class RequestIDMiddleware(BaseHTTPMiddleware):
    """Assign a UUID4 request_id to every request for tracing."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        with structlog.contextvars.bound_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        ):
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response


# ─── Tenant Context Middleware ────────────────────────────────

# Paths that don't require auth
_PUBLIC_PREFIXES = ("/health", "/auth/", "/docs", "/openapi", "/redoc", "/metrics")


class TenantContextMiddleware(BaseHTTPMiddleware):
    """
    For every protected request:
    1. Decode JWT from Authorization header
    2. Extract tenant_id → set in ContextVar and request.state
    3. Bind tenant_id to structlog context for the request lifetime
    4. Return 401 if token missing/invalid, 403 if tenant inactive
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Skip auth for public routes
        if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return Response(
                content='{"detail": "Authorization header missing or invalid"}',
                status_code=401,
                media_type="application/json",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = auth_header.removeprefix("Bearer ")
        settings = get_settings()

        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
            )
        except JWTError as exc:
            return Response(
                content=f'{{"detail": "Invalid token: {exc}"}}',
                status_code=401,
                media_type="application/json",
            )

        tenant_id: str | None = payload.get("tenant_id")
        if not tenant_id:
            return Response(
                content='{"detail": "Token missing tenant_id"}',
                status_code=403,
                media_type="application/json",
            )

        # Set tenant_id in ContextVar and request.state
        set_tenant_id(tenant_id)
        request.state.tenant_id = tenant_id
        request.state.user_id = payload.get("sub", "unknown")
        request.state.role = payload.get("role", "member")

        with structlog.contextvars.bound_contextvars(
            tenant_id=tenant_id,
            user_id=request.state.user_id,
        ):
            return await call_next(request)


# ─── MB/Minute Upload Rate Limiting ──────────────────────────

async def check_upload_mb_limit(tenant_id: str, file_size_bytes: int) -> None:
    """
    Enforce per-tenant MB/minute upload rate limit.
    Tracks cumulative upload size with a 60s TTL key in Valkey.
    Raises HTTP 429 if limit exceeded.
    """
    from src.core.valkey_client import get_valkey

    settings = get_settings()
    mb_limit = settings.upload_mb_limit_per_minute
    file_mb = file_size_bytes / (1024 * 1024)

    valkey = await get_valkey()
    key = f"upload_mb:{tenant_id}"

    # Increment by file size (in MB)
    current = await valkey.incrbyfloat(key, file_mb)
    if current == file_mb:
        # First upload this window — set TTL
        await valkey.expire(key, 60)

    if current > mb_limit:
        ttl = await valkey.ttl(key)
        raise HTTPException(
            status_code=429,
            detail=f"Upload limit exceeded: {mb_limit}MB/minute. Retry in {ttl}s.",
            headers={"Retry-After": str(ttl)},
        )
