"""
src/api/routes/health.py — Health check endpoint.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class ServiceStatus(BaseModel):
    qdrant: bool
    mongodb: bool
    valkey: bool
    ollama: bool
    unstructured: bool


class HealthResponse(BaseModel):
    status: str                    # "healthy" | "degraded"
    services: ServiceStatus
    version: str
    environment: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Check all service dependencies.
    Returns 200 even if some services are degraded — use status field.
    """
    from src.core.config import get_settings
    import httpx

    settings = get_settings()
    services = {}

    # Valkey
    try:
        from src.core.valkey_client import health_check as valkey_health
        services["valkey"] = await valkey_health()
    except Exception:
        services["valkey"] = False

    # MongoDB — try a simple ping
    try:
        from src.core.database import get_motor_client
        client = get_motor_client()
        await client.admin.command("ping")
        services["mongodb"] = True
    except Exception:
        services["mongodb"] = False

    # Qdrant
    try:
        from src.core.qdrant_client import get_async_qdrant_client
        qdrant = get_async_qdrant_client()
        await qdrant.get_collection(settings.collection_name)
        services["qdrant"] = True
    except Exception:
        services["qdrant"] = False

    # Ollama
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{settings.ollama_base_url}/api/tags")
            services["ollama"] = r.status_code == 200
    except Exception:
        services["ollama"] = False

    # Unstructured
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{settings.unstructured_url}/healthcheck")
            services["unstructured"] = r.status_code == 200
    except Exception:
        services["unstructured"] = False

    all_ok = all(services.values())
    status = "healthy" if all_ok else "degraded"

    return HealthResponse(
        status=status,
        services=ServiceStatus(**services),
        version=settings.git_sha,
        environment=settings.environment,
    )
