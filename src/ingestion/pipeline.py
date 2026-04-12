"""
src/ingestion/pipeline.py — LlamaIndex IngestionPipeline with swappable chunker.

⚠️ Module-level singletons: the embed model is loaded ONCE per worker process.
   Reloading it per task would cause OOM at scale.
⚠️ num_workers=2 max for Celery workers to avoid OOM.
⚠️ CHUNKING_STRATEGY=semantic doubles memory (embed model used during chunking).
"""
import time

import structlog
from llama_index.core import SimpleDirectoryReader
from llama_index.core.extractors import KeywordExtractor, TitleExtractor
from llama_index.core.ingestion import IngestionPipeline
from llama_index.core.storage.docstore import SimpleDocumentStore

from src.core.config import get_settings
from src.core.providers import get_chunker, get_embed_model, get_llm

log = structlog.get_logger(__name__)

# ─── Module-level singletons ──────────────────────────────────
# These are initialized ONCE per worker process at first use.
_embed_model_singleton = None


def get_embed_model_singleton():
    """
    Return the embedding model singleton.
    Loads BAAI/bge-large-en-v1.5 on first call, reused on subsequent calls.
    This is the memory-intensive component — do NOT reload per task.
    """
    global _embed_model_singleton
    if _embed_model_singleton is None:
        settings = get_settings()
        log.info("embed_model_loading_singleton", model=settings.embed_model_name)
        _embed_model_singleton = get_embed_model()
        log.info("embed_model_ready")
    return _embed_model_singleton


def build_pipeline(vector_store) -> IngestionPipeline:
    """
    Build a LlamaIndex IngestionPipeline with:
    - Swappable chunker (recursive/sentence/semantic via CHUNKING_STRATEGY)
    - Optional: TitleExtractor + KeywordExtractor metadata enrichment (requires ENABLE_LLM_METADATA=true)
    - HuggingFace local embeddings
    - Qdrant vector store backend (tenant-scoped)
    
    ⚠️ LLM extractors are DISABLED by default because they use async internally,
       which conflicts with Celery's prefork worker pool. Enable only if using
       Celery with --pool=threads or --pool=solo.
    """
    import os
    settings = get_settings()
    chunker = get_chunker()
    embed_model = get_embed_model_singleton()
    
    enable_llm_metadata = os.environ.get("ENABLE_LLM_METADATA", "false").lower() == "true"

    log.info("pipeline_building",
             chunker=settings.chunking_strategy,
             chunk_size=settings.chunk_size,
             llm_metadata=enable_llm_metadata)

    # Base transformations: chunk + embed
    transformations = [
        chunker,                                        # Split → nodes
    ]
    
    # Optional: Add LLM-based metadata extractors
    # These call async LLM and conflict with Celery prefork workers
    if enable_llm_metadata:
        llm = get_llm()
        transformations.extend([
            TitleExtractor(nodes=3, llm=llm),           # Section title metadata
            KeywordExtractor(keywords=6, llm=llm),      # Keyword metadata
        ])
    
    transformations.append(embed_model)                 # Embed nodes

    # Note: IngestionCache with Valkey
    # ValkeyKVStore may not be available yet — RedisKVStore works with
    # Valkey's wire-compatible protocol (same API as Redis).
    # TODO: Switch to ValkeyKVStore once llama-index-storage-kvstore-valkey is released.
    pipeline = IngestionPipeline(
        transformations=transformations,
        vector_store=vector_store,
        docstore=SimpleDocumentStore(),   # dedup: skip already-ingested nodes
    )

    return pipeline


def run_pipeline(
    documents: list,
    doc_id: str,
    tenant_id: str,
    vector_store,
) -> int:
    """
    Run the ingestion pipeline and return the count of upserted nodes.

    ⚠️ This is a SYNC function — called from Celery tasks.
       The documents list comes from asyncio.run(load_document(...)).
    """
    # Enrich ALL node metadata before running
    for doc in documents:
        doc.metadata.update({
            "tenant_id": tenant_id,
            "doc_id": doc_id,
        })

    pipeline = build_pipeline(vector_store)

    t0 = time.monotonic()
    nodes = pipeline.run(
        documents=documents,
        num_workers=1,          # Must be 1 — Celery prefork workers are daemonic
        show_progress=False,
    )
    duration_ms = (time.monotonic() - t0) * 1000

    node_count = len(nodes) if nodes else 0
    log.info(
        "pipeline_complete",
        tenant_id=tenant_id,
        doc_id=doc_id,
        doc_count=len(documents),
        node_count=node_count,
        duration_ms=round(duration_ms, 1),
    )
    return node_count
