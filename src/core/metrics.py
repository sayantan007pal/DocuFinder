"""
src/core/metrics.py — Prometheus metrics for the RAG system.
"""
from prometheus_client import Counter, Histogram, Gauge


# Search latency per tenant and provider
rag_search_latency = Histogram(
    "rag_search_latency_seconds",
    "End-to-end search latency",
    ["tenant_id", "provider"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0],
)

# Ingestion latency per file type and parser
rag_ingest_latency = Histogram(
    "rag_ingest_latency_seconds",
    "Document ingestion latency",
    ["file_type", "parser"],
    buckets=[1.0, 5.0, 15.0, 30.0, 60.0, 120.0, 300.0],
)

# Total documents processed
rag_documents_total = Counter(
    "rag_documents_total",
    "Total documents ingested",
    ["tenant_id", "status"],
)

# Nodes returned per search
rag_nodes_retrieved = Histogram(
    "rag_nodes_retrieved",
    "Number of nodes returned per search query",
    ["tenant_id"],
    buckets=[1, 2, 4, 6, 8, 10, 15, 20],
)

# Active parser provider (gauge with label)
rag_active_parser = Gauge(
    "rag_active_parser_info",
    "Active parser provider",
    ["provider"],
)

# Upload file size distribution
rag_upload_file_size = Histogram(
    "rag_upload_file_size_bytes",
    "Uploaded file sizes",
    ["mime_type"],
    buckets=[1e5, 5e5, 1e6, 5e6, 1e7, 2.5e7, 5e7],
)
