"""
src/core/qdrant_client.py — Qdrant client singleton.

Supports both:
- Cloud Qdrant (QDRANT_URL set) — uses full HTTPS URL + API key
- Local Qdrant (QDRANT_URL empty) — uses QDRANT_HOST:QDRANT_PORT

⚠️ get_vector_store(tenant_id) is the ONLY authorized way to get a vector store.
   Every caller MUST pass tenant_id. Never call without it.
   Every query AUTOMATICALLY filters by tenant_id in Qdrant payload.
"""
import structlog
from qdrant_client import AsyncQdrantClient, QdrantClient

from src.core.config import get_settings

log = structlog.get_logger(__name__)

_sync_client: QdrantClient | None = None
_async_client: AsyncQdrantClient | None = None


def _make_client_kwargs() -> dict:
    """Build connection kwargs for both sync and async Qdrant clients."""
    settings = get_settings()
    if settings.qdrant_is_cloud:
        log.info("qdrant_using_cloud", url=settings.qdrant_url)
        kwargs = {"url": settings.qdrant_url}
        if settings.qdrant_api_key:
            kwargs["api_key"] = settings.qdrant_api_key
        return kwargs
    else:
        log.info("qdrant_using_local", host=settings.qdrant_host, port=settings.qdrant_port)
        return {"host": settings.qdrant_host, "port": settings.qdrant_port}


def get_sync_qdrant_client() -> QdrantClient:
    """Return sync Qdrant client (needed by IngestionPipeline + LlamaIndex)."""
    global _sync_client
    if _sync_client is None:
        _sync_client = QdrantClient(**_make_client_kwargs())
    return _sync_client


def get_async_qdrant_client() -> AsyncQdrantClient:
    """Return async Qdrant client (for FastAPI health checks and queries)."""
    global _async_client
    if _async_client is None:
        _async_client = AsyncQdrantClient(**_make_client_kwargs())
    return _async_client


def get_vector_store(tenant_id: str):
    """
    ⚠️ THE ONLY AUTHORIZED WAY TO GET A VECTOR STORE.
    Returns a QdrantVectorStore pre-filtered by tenant_id.
    Every Qdrant query will automatically include the tenant_id payload filter.
    """
    from llama_index.vector_stores.qdrant import QdrantVectorStore
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue

    settings = get_settings()

    # tenant_id filter is MANDATORY — never call without it
    payload_filter = Filter(
        must=[
            FieldCondition(
                key="tenant_id",
                match=MatchValue(value=tenant_id),
            )
        ]
    )

    return QdrantVectorStore(
        client=get_sync_qdrant_client(),
        aclient=get_async_qdrant_client(),
        collection_name=settings.collection_name,
        enable_hybrid=True,
        fastembed_sparse_model="Qdrant/bm25",
        sparse_vector_name="sparse",
        dense_vector_name="dense",
        payload_filter=payload_filter,
    )


async def init_qdrant_connection() -> None:
    """Verify Qdrant is reachable at startup."""
    try:
        client = get_async_qdrant_client()
        settings = get_settings()
        info = await client.get_collection(settings.collection_name)
        log.info(
            "qdrant_connected",
            collection=settings.collection_name,
            vectors_count=info.vectors_count,
        )
    except Exception as exc:
        log.warning("qdrant_collection_not_found",
                    error=str(exc),
                    hint="Run: python scripts/init_qdrant.py")
