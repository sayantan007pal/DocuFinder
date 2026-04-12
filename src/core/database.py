"""
src/core/database.py — MongoDB initialization via Motor + Beanie.
"""
import structlog
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from src.core.config import get_settings
from src.models.db import ALL_DOCUMENT_MODELS

log = structlog.get_logger(__name__)

_motor_client: AsyncIOMotorClient | None = None


async def init_db() -> None:
    """
    Initialize Beanie ODM with Motor async client.
    Creates all collections and indexes if they don't exist.
    Call this at application startup.
    """
    global _motor_client
    settings = get_settings()

    log.info("db_connecting", url=settings.mongodb_url.split("@")[-1])  # hide credentials
    _motor_client = AsyncIOMotorClient(settings.mongodb_url)

    await init_beanie(
        database=_motor_client[settings.mongodb_db_name],
        document_models=ALL_DOCUMENT_MODELS,
    )
    log.info("db_initialized", db=settings.mongodb_db_name,
             collections=[m.Settings.name for m in ALL_DOCUMENT_MODELS])


async def close_db_connections() -> None:
    """Close Motor client. Call at application shutdown."""
    global _motor_client
    if _motor_client is not None:
        _motor_client.close()
        _motor_client = None
        log.info("db_connections_closed")


def get_motor_client() -> AsyncIOMotorClient:
    """Return the Motor client (for raw queries if needed)."""
    if _motor_client is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _motor_client
