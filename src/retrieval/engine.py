"""
src/retrieval/engine.py — Hybrid retrieval + synthesis query engine.

Uses dense + sparse hybrid search via Qdrant + LlamaIndex.
Caches results in Valkey for 5 minutes.
Module-level singletons for LLM + embed model (expensive to load).
"""
import hashlib
import json
import time
from dataclasses import dataclass, field

import structlog
from llama_index.core import Settings as LISettings, VectorStoreIndex
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.response_synthesizers import ResponseMode, get_response_synthesizer
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.core.vector_stores.types import VectorStoreQueryMode

from src.core.config import get_settings
from src.core.providers import get_embed_model, get_llm

log = structlog.get_logger(__name__)

# ─── Module-level singletons ──────────────────────────────────
_llm_singleton = None
_embed_singleton = None


def get_llm_singleton():
    global _llm_singleton
    if _llm_singleton is None:
        _llm_singleton = get_llm()
    return _llm_singleton


def get_embed_singleton():
    global _embed_singleton
    if _embed_singleton is None:
        _embed_singleton = get_embed_model()
    return _embed_singleton


def configure_llamaindex():
    """
    Configure LlamaIndex global settings at app startup.
    Called once in main.py lifespan startup.
    """
    settings = get_settings()
    LISettings.llm = get_llm_singleton()
    LISettings.embed_model = get_embed_singleton()
    LISettings.chunk_size = settings.chunk_size
    LISettings.chunk_overlap = settings.chunk_overlap
    log.info("llamaindex_configured",
             llm=settings.ollama_model,
             embed=settings.embed_model_name,
             chunk_size=settings.chunk_size)


# ─── Response Dataclasses ─────────────────────────────────────

@dataclass
class SourceNodeInfo:
    text: str
    score: float
    filename: str
    page_number: int | None
    doc_id: str


@dataclass
class QueryResult:
    answer: str
    source_nodes: list[SourceNodeInfo]
    latency_ms: float
    provider_used: str
    cached: bool = False


# ─── Query Engine Factory ─────────────────────────────────────

def build_query_engine(tenant_id: str, top_k: int = 8) -> RetrieverQueryEngine:
    """
    Build a hybrid (dense+sparse) retrieval + synthesis engine.
    [SWAP] Uses LlamaCloud index if INDEX_PROVIDER=llamacloud.
    """
    settings = get_settings()

    if settings.index_provider == "llamacloud":
        return _build_llamacloud_query_engine(tenant_id, top_k)

    # Default: local Qdrant
    from src.core.qdrant_client import get_vector_store
    vector_store = get_vector_store(tenant_id)
    index = VectorStoreIndex.from_vector_store(vector_store)

    retriever = VectorIndexRetriever(
        index=index,
        similarity_top_k=top_k,
        vector_store_query_mode=VectorStoreQueryMode.HYBRID,
    )

    response_synthesizer = get_response_synthesizer(
        response_mode=ResponseMode.COMPACT,
        llm=get_llm_singleton(),
        streaming=False,
    )

    # Optional: LLMRerank (ENABLE_RERANK=true, adds ~2s latency)
    node_postprocessors = []
    if settings.enable_rerank:
        from llama_index.core.postprocessor import LLMRerank
        node_postprocessors.append(
            LLMRerank(top_n=4, llm=get_llm_singleton())
        )
        log.info("reranking_enabled", top_n=4)

    return RetrieverQueryEngine(
        retriever=retriever,
        response_synthesizer=response_synthesizer,
        node_postprocessors=node_postprocessors,
    )


def _build_llamacloud_query_engine(tenant_id: str, top_k: int):
    """
    [SWAP] LlamaCloud managed index.
    Requires: INDEX_PROVIDER=llamacloud + LLAMA_CLOUD_API_KEY
    ⚠️ Data leaves your infrastructure. Only use for non-sensitive documents.
    """
    from llama_index.indices.managed.llama_cloud import LlamaCloudIndex
    settings = get_settings()
    index = LlamaCloudIndex(
        name=f"company_docs_{tenant_id}",
        api_key=settings.llama_cloud_api_key,
    )
    log.info("llamacloud_index_query_engine", tenant_id=tenant_id)
    return index.as_query_engine(similarity_top_k=top_k)


# ─── Main Search Function ─────────────────────────────────────

async def search(
    query: str,
    tenant_id: str,
    top_k: int = 8,
) -> QueryResult:
    """
    Perform hybrid semantic search over tenant's document collection.
    Results cached in Valkey for 5 minutes.
    """
    from src.core.valkey_client import get_valkey
    from src.core.metrics import rag_search_latency, rag_nodes_retrieved

    settings = get_settings()

    # Cache key
    cache_key = (
        f"search:{tenant_id}:"
        f"{hashlib.sha256(f'{query}{top_k}'.encode()).hexdigest()[:16]}"
    )

    valkey = await get_valkey()
    cached = await valkey.get(cache_key)
    if cached:
        data = json.loads(cached)
        return QueryResult(**{**data, "cached": True})

    t0 = time.monotonic()
    engine = build_query_engine(tenant_id, top_k)
    response = engine.query(query)
    latency_ms = (time.monotonic() - t0) * 1000

    # Extract source nodes
    source_nodes = []
    for node_with_score in (response.source_nodes or []):
        node = node_with_score.node
        meta = node.metadata or {}
        source_nodes.append(
            SourceNodeInfo(
                text=node.get_content()[:1000],
                score=node_with_score.score or 0.0,
                filename=meta.get("filename", "unknown"),
                page_number=meta.get("page_number"),
                doc_id=meta.get("doc_id", ""),
            )
        )

    result = QueryResult(
        answer=str(response),
        source_nodes=source_nodes,
        latency_ms=round(latency_ms, 1),
        provider_used=settings.index_provider,
    )

    # Record metrics
    rag_search_latency.labels(
        tenant_id=tenant_id[:8],
        provider=settings.index_provider,
    ).observe(latency_ms / 1000)
    rag_nodes_retrieved.labels(tenant_id=tenant_id[:8]).observe(len(source_nodes))

    # Cache 5 minutes
    cache_data = {
        "answer": result.answer,
        "source_nodes": [
            {
                "text": n.text,
                "score": n.score,
                "filename": n.filename,
                "page_number": n.page_number,
                "doc_id": n.doc_id,
            }
            for n in source_nodes
        ],
        "latency_ms": result.latency_ms,
        "provider_used": result.provider_used,
        "cached": True,
    }
    await valkey.setex(cache_key, 300, json.dumps(cache_data))

    log.info("search_complete",
             tenant_id=tenant_id,
             query_len=len(query),
             results=len(source_nodes),
             latency_ms=result.latency_ms,
             cached=False)

    return result
