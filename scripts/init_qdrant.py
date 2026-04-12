"""
scripts/init_qdrant.py — Idempotent Qdrant collection initialization.

Run this ONCE before starting the application:
    python scripts/init_qdrant.py

This script is IDEMPOTENT — safe to run multiple times.
It will:
1. Create the 'company_docs' collection if it doesn't exist
2. Configure hybrid search (dense 'text-dense' + sparse BM25 'text-sparse')
3. Set up tenant_id + doc_id payload indexes for fast tenant filtering
4. Uses BAAI/bge-large-en-v1.5 embedding dim (1024)
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from qdrant_client import QdrantClient
from qdrant_client.http import models

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


def collection_exists(client: QdrantClient, name: str) -> bool:
    """Check if a collection exists."""
    try:
        client.get_collection(name)
        return True
    except Exception:
        return False


def init_collection(client: QdrantClient, collection_name: str) -> bool:
    """
    Create collection with hybrid dense + sparse vectors.
    Returns True if created, False if already exists.

    API note (qdrant-client >= 1.11):
      vectors_config = {name: VectorParams}  ← named multi-vector config
      sparse_vectors_config = {name: SparseVectorParams}
    """
    if collection_exists(client, collection_name):
        info = client.get_collection(collection_name)
        print(f"Collection '{collection_name}' already exists.")
        print(f"  Status:        {info.status}")
        print(f"  Vectors count: {info.vectors_count or 0}")
        return False

    print(f"Creating collection '{collection_name}'...")

    client.create_collection(
        collection_name=collection_name,
        # Named dense vector for BAAI/bge-large-en-v1.5
        vectors_config={
            "text-dense": models.VectorParams(
                size=DENSE_VECTOR_DIM,
                distance=models.Distance.COSINE,
                hnsw_config=models.HnswConfigDiff(
                    ef_construct=128,
                    m=16,
                    on_disk=True,      # HNSW graph on disk — memory efficient
                ),
                on_disk=True,          # Vector data on disk
            )
        },
        # Sparse BM25 vector for keyword/hybrid search
        sparse_vectors_config={
            "text-sparse": models.SparseVectorParams(
                index=models.SparseIndexParams(on_disk=True)
            )
        },
        optimizers_config=models.OptimizersConfigDiff(
            indexing_threshold=10_000,     # Don't build HNSW until 10K vectors
            default_segment_number=4,      # Better write throughput
        ),
    )

    print(f"✓ Collection '{collection_name}' created.")
    return True


def create_payload_indexes(client: QdrantClient, collection_name: str) -> None:
    """
    Create payload indexes for fast tenant_id / doc_id filtering.
    CRITICAL: without these, every query does a full collection scan.
    """
    existing: set[str] = set()
    try:
        info = client.get_collection(collection_name)
        if hasattr(info, "payload_schema") and info.payload_schema:
            existing = set(info.payload_schema.keys())
    except Exception:
        pass

    index_specs = [
        ("tenant_id",  models.PayloadSchemaType.KEYWORD),
        ("doc_id",     models.PayloadSchemaType.KEYWORD),
        ("filename",   models.PayloadSchemaType.KEYWORD),
        ("page_number",models.PayloadSchemaType.INTEGER),
    ]

    for field, schema_type in index_specs:
        if field in existing:
            print(f"  Index '{field}' already exists. Skipping.")
            continue
        client.create_payload_index(
            collection_name=collection_name,
            field_name=field,
            field_schema=schema_type,
        )
        print(f"  ✓ Created payload index: {field} ({schema_type.value})")


def verify(client: QdrantClient, collection_name: str) -> None:
    """Verify the collection is accessible and show key config."""
    info = client.get_collection(collection_name)

    print()
    print("── Verification ──────────────────────────────────")
    print(f"  Collection:  {collection_name}")
    print(f"  Status:      {info.status}")
    print(f"  Vectors:     {info.vectors_count or 0}")

    # Show vector config
    if hasattr(info, "config") and info.config and hasattr(info.config, "params"):
        p = info.config.params
        # Named vectors (new API)
        if hasattr(p, "vectors") and isinstance(p.vectors, dict):
            for vname, vcfg in p.vectors.items():
                print(f"  Dense vector '{vname}': dim={vcfg.size}, dist={vcfg.distance}")
        # Sparse vectors
        if hasattr(p, "sparse_vectors") and p.sparse_vectors:
            for sname in p.sparse_vectors:
                print(f"  Sparse vector '{sname}': BM25 keyword search")

    print("  ✓ Collection ready for hybrid search")


def main():
    settings = get_settings()
    collection_name = settings.collection_name

    print("=" * 55)
    print("  DocuFinder v2 — Qdrant Initialization")
    print("=" * 55)
    print(f"  Collection:  {collection_name}")
    print(f"  Dense dim:   {DENSE_VECTOR_DIM} (BAAI/bge-large-en-v1.5)")
    print(f"  Mode:        {'Cloud' if settings.qdrant_is_cloud else 'Local'}")
    print()

    client = get_client(settings)

    # 1. Create collection (idempotent)
    init_collection(client, collection_name)

    # 2. Create payload indexes (idempotent)
    print("\nCreating payload indexes...")
    create_payload_indexes(client, collection_name)

    # 3. Verify
    verify(client, collection_name)

    print()
    print("✓ Qdrant initialization complete.")
    print("  Next step: docker compose up -d && uvicorn src.api.main:app --port 8001")


if __name__ == "__main__":
    main()
