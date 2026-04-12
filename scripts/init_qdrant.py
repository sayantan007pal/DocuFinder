"""
scripts/init_qdrant.py — Idempotent Qdrant collection initialization.

Run this ONCE before starting the application:
    python scripts/init_qdrant.py

This script is IDEMPOTENT — safe to run multiple times.
It will:
1. Create the 'company_docs' collection if it doesn't exist
2. Configure hybrid search (dense + sparse BM25 vectors)
3. Set up tenant_id + doc_id payload indexes for fast filtering
4. Create named vector config for BAAI/bge-large-en-v1.5 (1024 dims)
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    Distance,
    HnswConfigDiff,
    OptimizersConfigDiff,
    PayloadSchemaType,
    SparseVectorParams,
    SparseIndexParams,
    VectorParams,
    VectorsConfig,
    SparseVectorsConfig,
)

from src.core.config import get_settings

# BAAI/bge-large-en-v1.5 output dimension
DENSE_VECTOR_DIM = 1024


def get_client(settings) -> QdrantClient:
    if settings.qdrant_is_cloud:
        print(f"Connecting to Qdrant Cloud: {settings.qdrant_url}")
        kwargs = {"url": settings.qdrant_url}
        if settings.qdrant_api_key:
            kwargs["api_key"] = settings.qdrant_api_key
        return QdrantClient(**kwargs)
    else:
        print(f"Connecting to local Qdrant: {settings.qdrant_host}:{settings.qdrant_port}")
        return QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)


def init_collection(client: QdrantClient, collection_name: str) -> bool:
    """
    Create collection with hybrid search config.
    Returns True if created, False if already exists.
    """
    # Check if collection exists
    try:
        info = client.get_collection(collection_name)
        print(f"Collection '{collection_name}' already exists.")
        print(f"  Vectors: {info.vectors_count or 0}")
        return False
    except Exception:
        pass

    print(f"Creating collection '{collection_name}'...")

    client.create_collection(
        collection_name=collection_name,
        # Hybrid = dense vectors + sparse BM25 vectors
        vectors_config=VectorsConfig(
            dense=VectorParams(
                size=DENSE_VECTOR_DIM,
                distance=Distance.COSINE,
                hnsw_config=HnswConfigDiff(
                    ef_construct=128,
                    m=16,
                    on_disk=True,               # Store HNSW graph on disk for large collections
                ),
                on_disk=True,                   # Store vectors on disk (memory-efficient)
            )
        ),
        sparse_vectors_config=SparseVectorsConfig(
            sparse=SparseVectorParams(
                index=SparseIndexParams(
                    on_disk=True,
                )
            )
        ),
        optimizers_config=OptimizersConfigDiff(
            indexing_threshold=10_000,          # Don't build HNSW until 10K vectors
            default_segment_number=4,           # Better write throughput
        ),
    )

    print(f"Collection '{collection_name}' created successfully.")
    return True


def create_payload_indexes(client: QdrantClient, collection_name: str) -> None:
    """
    Create payload indexes for fast tenant_id and doc_id filtering.
    These are CRITICAL for multi-tenancy performance.
    """
    indexes = [
        ("tenant_id", PayloadSchemaType.KEYWORD),   # Exact match filtering
        ("doc_id", PayloadSchemaType.KEYWORD),       # Per-document retrieval
        ("filename", PayloadSchemaType.KEYWORD),     # Filter by filename
        ("page_number", PayloadSchemaType.INTEGER),  # Range queries
    ]

    existing_indexes = set()
    try:
        collection_info = client.get_collection(collection_name)
        existing_indexes = set(collection_info.payload_schema.keys())
    except Exception:
        pass

    for field, schema_type in indexes:
        if field in existing_indexes:
            print(f"  Index '{field}' already exists.")
            continue

        client.create_payload_index(
            collection_name=collection_name,
            field_name=field,
            field_schema=schema_type,
        )
        print(f"  Created payload index: {field} ({schema_type})")


def verify(client: QdrantClient, collection_name: str) -> None:
    """Verify the collection is accessible and properly configured."""
    info = client.get_collection(collection_name)
    print("\n── Verification ──────────────────────────────")
    print(f"  Collection: {collection_name}")
    print(f"  Vectors: {info.vectors_count or 0}")
    print(f"  Status: {info.status}")

    # Verify dense vector config
    if hasattr(info, "config") and info.config:
        dense = info.config.params.vectors.get("dense") if hasattr(info.config.params.vectors, "get") else None
        if dense:
            print(f"  Dense vector dim: {dense.size}")
            print(f"  Distance metric: {dense.distance}")

    print("  ✓ Collection ready for hybrid search")


def main():
    settings = get_settings()
    collection_name = settings.collection_name

    print("=" * 55)
    print("  DocuFinder v2 — Qdrant Initialization")
    print("=" * 55)
    print(f"  Collection: {collection_name}")
    print(f"  Vector dim: {DENSE_VECTOR_DIM} (BAAI/bge-large-en-v1.5)")
    print(f"  Mode: {'Cloud' if settings.qdrant_is_cloud else 'Local'}")
    print()

    client = get_client(settings)

    # 1. Create collection (idempotent)
    init_collection(client, collection_name)

    # 2. Create payload indexes (idempotent)
    print("\nCreating payload indexes...")
    create_payload_indexes(client, collection_name)

    # 3. Verify
    verify(client, collection_name)

    print("\n✓ Qdrant initialization complete. Ready to ingest documents.")


if __name__ == "__main__":
    main()
