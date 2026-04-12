"""
src/core/valkey_client.py — Valkey (BSD-licensed Redis fork) client singleton.

Import from `valkey` NOT from `redis`. This is Valkey, not Redis.
Wire-compatible with Redis — all Redis client libraries work unchanged.
"""
from functools import lru_cache

import structlog
from valkey.asyncio import Valkey as AsyncValkey
from valkey import Valkey as SyncValkey

from src.core.config import get_settings

log = structlog.get_logger(__name__)

_async_client: AsyncValkey | None = None
_sync_client: SyncValkey | None = None


async def get_valkey() -> AsyncValkey:
    """Return async Valkey client (for FastAPI routes)."""
    global _async_client
    if _async_client is None:
        settings = get_settings()
        _async_client = AsyncValkey.from_url(
            settings.valkey_url,
            decode_responses=True,
            max_connections=20,
        )
        log.info("valkey_async_client_created", url=settings.valkey_url)
    return _async_client


def get_sync_valkey() -> SyncValkey:
    """Return sync Valkey client (for Celery tasks — not async context)."""
    global _sync_client
    if _sync_client is None:
        settings = get_settings()
        _sync_client = SyncValkey.from_url(
            settings.valkey_url,
            decode_responses=True,
            max_connections=10,
        )
        log.info("valkey_sync_client_created", url=settings.valkey_url)
    return _sync_client


async def health_check() -> bool:
    """Ping Valkey and return True if reachable."""
    try:
        client = await get_valkey()
        result = await client.ping()
        return result is True
    except Exception as exc:
        log.error("valkey_health_check_failed", error=str(exc))
        return False


async def close_valkey() -> None:
    """Close async Valkey client at shutdown."""
    global _async_client
    if _async_client is not None:
        await _async_client.aclose()
        _async_client = None
        log.info("valkey_client_closed")
