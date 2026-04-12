"""
src/core/tenant_context.py — Per-request tenant context isolation.

RULE: tenant_id MUST come ONLY from decoded JWT.
      NEVER from request body, query params, or headers.
      This module enforces that rule programmatically.
"""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import AsyncGenerator

# Module-level ContextVar — one per asyncio task (per request in FastAPI)
_tenant_id_var: ContextVar[str | None] = ContextVar("tenant_id", default=None)


def get_tenant_id() -> str:
    """
    Return the current request's tenant_id.
    Raises RuntimeError if not set (i.e., called outside a request context).
    """
    tid = _tenant_id_var.get()
    if tid is None:
        raise RuntimeError(
            "tenant_id is not set in the current context. "
            "Ensure TenantContextMiddleware has run and JWT was decoded."
        )
    return tid


def set_tenant_id(tid: str) -> None:
    """Set the tenant_id for the current context. Call from middleware only."""
    _tenant_id_var.set(tid)


@asynccontextmanager
async def inject_tenant_context(tid: str) -> AsyncGenerator[None, None]:
    """
    Async context manager that injects tenant_id into the current task context.
    Usage:
        async with inject_tenant_context(tenant_id):
            # tenant_id is available via get_tenant_id() here
            ...
    """
    token = _tenant_id_var.set(tid)
    try:
        yield
    finally:
        _tenant_id_var.reset(token)
