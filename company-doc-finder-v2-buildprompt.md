# Company Document Finder & Summarizer — v2 Build Prompt
### Emergent AI Build File · Feed this entire file as context

> **Stack:** Python 3.11+ · FastAPI · LlamaIndex Core · Qdrant v1.16 · Gemma 4 via Ollama  
> **Parsing:** Unstructured.io (self-hosted) + LiteParse (local-first) ↔ swappable with LlamaParse Cloud  
> **Cache/Queue:** Valkey (BSD-licensed Redis fork) · Celery  
> **Database:** MongoDB (Motor async driver)  
> **Deployment:** Self-hosted · On-prem · Docker Compose  
> **Multi-tenancy:** Strict per-tenant isolation · Qdrant payload filters + tiered sharding

---

## ⚡ How to use this file

Paste the entire file as context to your AI coding assistant (Cursor, Claude Code, etc.).  
Each `[PHASE N]` is a standalone build unit. Complete gates before proceeding.  
The **Provider Abstraction Layer** (Section 3) is the architectural backbone — build it first.

**Symbols**
```
[PROMPT]    → Paste directly as coding prompt
[CHECK]     → Gate before proceeding to next phase
[SWAP]      → Points where you can toggle between self-hosted and LlamaCloud
⚠️          → Known pitfall at this scale
🔬          → Research finding that informed this decision
```

---

## Section 1 — Technology Decisions & Research Rationale

### 1.1 Valkey (replaces Redis everywhere)

Valkey is an open-source (BSD license), Linux Foundation-stewarded fork of Redis 7.2.4.
Redis changed to AGPLv3 in v8.0 — restrictive for commercial products. Valkey stays BSD forever.

- **Wire-compatible with Redis** — all Redis client libraries work unchanged
- **Python client:** `valkey-py` (`pip install valkey`) — drop-in replacement for `redis-py`
- **Import alias:** `from valkey import Valkey` (same API as `redis.Redis`)
- **Celery:** works identically; set `broker_url = "valkey://localhost:6379/0"`
- **v8.0 additions:** I/O multithreading, bloom filters, vector search
- **Docker image:** `valkey/valkey:8-alpine`

```python
# Before (redis-py)
from redis import Redis
client = Redis.from_url("redis://localhost:6379")

# After (valkey-py — identical API)
from valkey import Valkey
client = Valkey.from_url("valkey://localhost:6379")
```

### 1.2 Document Parsing — Two-Layer Provider System

| Provider | Mode | Where | Best for |
|----------|------|--------|----------|
| **LiteParse** | Local-first | On-prem | Text-dense PDFs, DOCX, fast ingestion |
| **Unstructured.io** | Self-hosted Docker | On-prem | Complex layouts, tables, OCR, scanned docs |
| **LlamaParse** | Cloud API | LlamaCloud | Complex docs with images/charts (requires API key) |

**Default (self-hosted):** Unstructured.io for layout-aware parsing + LiteParse as fast fallback.  
**Upgrade path:** Swap to LlamaParse via `PARSER_PROVIDER=llamaparse` env var.

🔬 **Benchmark (Procycons 2025):** Docling wins on structural fidelity. Unstructured.io wins on OCR breadth. LiteParse wins on speed (~6s per doc vs 51s for Unstructured). Use both via the provider abstraction.

### 1.3 Chunking Strategy — Research Verdict 2025

🔬 **Current industry consensus (2025–2026):**
- `SentenceSplitter` at **512 tokens / 10–15% overlap** remains the recommended baseline (confirmed by NVIDIA NeMo Retriever benchmarks, Chroma research, Vecta Feb 2026 study)
- Semantic chunking improves recall by 2–9% but requires embedding every sentence at parse time (expensive at 100K docs)
- Recursive 512-token splitting ranked #1 in Vecta's 2026 benchmark at 69% accuracy vs semantic at 54%
- **Decision:** Keep `SentenceSplitter(chunk_size=512, chunk_overlap=50)` as default. Expose `SemanticSplitterNodeParser` as opt-in via `CHUNKING_STRATEGY=semantic` env var.

### 1.4 LLM — Gemma 4 via Ollama

Google's Gemma 4 family (released April 2025), fully open-weight (Apache 2.0), day-one Ollama support.

| Variant | VRAM needed | Use case |
|---------|-------------|----------|
| `gemma4:e2b` | ~3 GB | Edge/dev machines |
| `gemma4:e4b` | ~6 GB | **Default — recommended for this system** |
| `gemma4:26b` | ~20 GB (MoE, 4B active) | High-quality production |
| `gemma4:31b` | ~40 GB | Maximum quality |

- Requires **Ollama v0.20.0+**
- Multimodal (text + images), 128K context window on e-series
- Native system prompt support (standard roles: system/user/assistant)
- Ollama model name: `gemma4` (default pulls `e4b`)

```bash
ollama pull gemma4:e4b   # recommended default
```

**LlamaIndex integration:**
```python
from llama_index.llms.ollama import Ollama
llm = Ollama(model="gemma4:e4b", base_url="http://localhost:11434",
             request_timeout=120, temperature=0.1)
```

### 1.5 Database — MongoDB with Motor

MongoDB replaces PostgreSQL for all metadata, tenant registry, document status, and job tracking.

- **Async driver:** `motor` (Motor 3.x with Motor async API)
- **ODM:** `beanie` (async ODM for Motor, Pydantic v2 compatible)
- **Collections:** `tenants`, `users`, `documents`, `ingestion_jobs`
- **Indexing:** compound indexes on `(tenant_id, file_hash)`, `(tenant_id, status)`, `doc_id`

### 1.6 LlamaCloud Swappable Capabilities

LlamaCloud (at `developers.llamaindex.ai/python/cloud/`) provides cloud-hosted versions of:

| LlamaCloud Service | Self-hosted Equivalent | Swap env var |
|-------------------|----------------------|--------------|
| `LlamaParse` — cloud OCR parsing | Unstructured.io + LiteParse | `PARSER_PROVIDER` |
| `LiteParse` — local fast parse | Already local | built-in |
| `LlamaExtract` — structured extraction | Custom Pydantic + Ollama extraction | `EXTRACT_PROVIDER` |
| `LlamaSplit` — split bundled PDFs | Custom page range detection | `SPLIT_PROVIDER` |
| `LlamaClassify` — doc classification | Custom Ollama classifier | `CLASSIFY_PROVIDER` |
| `LlamaIndex Cloud Index` — managed RAG index | Local Qdrant + LlamaIndex | `INDEX_PROVIDER` |
| `LlamaAgents` — deployed agents | Local LlamaIndex Workflows | `AGENT_PROVIDER` |
| `LlamaSheets` — spreadsheet extraction | Unstructured table extraction | `SHEETS_PROVIDER` |

All swaps are controlled by environment variables. Zero code changes required.

---

## Section 2 — System Context Block

**Prepend this to every prompt you send to your AI coding assistant:**

```
You are helping me build a self-hosted, multi-tenant company document finder
and summarizer. Complete stack:

Language: Python 3.11+
API: FastAPI (async handlers, Pydantic v2, structlog)
RAG Framework: LlamaIndex Core (llama-index>=0.12)
Vector Store: Qdrant v1.16 (tiered multi-tenancy, hybrid search)
Cache/Queue: Valkey (BSD Redis fork) via valkey-py + Celery 5.4
Database: MongoDB via Motor 3.x + Beanie ODM (replaces PostgreSQL entirely)
LLM: Gemma 4 (gemma4:e4b) via Ollama (local, no cloud)
Embedding: BAAI/bge-large-en-v1.5 via HuggingFaceEmbedding (local)
Document Parsing (default): Unstructured.io self-hosted + LiteParse local
Document Parsing (upgrade): LlamaParse cloud (env var PARSER_PROVIDER=llamaparse)
Chunking: SentenceSplitter(chunk_size=512, chunk_overlap=50) default
         SemanticSplitterNodeParser optional (env var CHUNKING_STRATEGY=semantic)
Document types: PDF and DOCX
Volume: 10,000 – 100,000 documents
Deployment: On-prem, self-hosted Docker Compose

Architecture principle: PROVIDER ABSTRACTION — every major component
(parser, chunker, LLM, index) has a self-hosted default AND a LlamaCloud
upgrade path, toggled by environment variables. No code changes needed to swap.

Multi-tenancy: Strict. tenant_id always comes from JWT, NEVER from user input.
Every Qdrant query uses a payload filter on tenant_id.
```

---

## Section 3 — Provider Abstraction Layer (Build First)

This is the architectural core. Build this before any other component.

### 3.1 Provider registry pattern

```python
# src/core/providers.py
from enum import Enum
from functools import lru_cache
from src.core.config import get_settings

class ParserProvider(str, Enum):
    UNSTRUCTURED = "unstructured"   # default: self-hosted
    LITEPARSE = "liteparse"         # local-first, fast
    LLAMAPARSE = "llamaparse"       # LlamaCloud cloud API

class ChunkingStrategy(str, Enum):
    SENTENCE = "sentence"           # default: SentenceSplitter 512t
    SEMANTIC = "semantic"           # SemanticSplitterNodeParser (expensive)
    RECURSIVE = "recursive"         # RecursiveCharacterTextSplitter fallback

class LLMProvider(str, Enum):
    OLLAMA = "ollama"               # default: Gemma 4 local
    LLAMACLOUD = "llamacloud"       # LlamaCloud hosted LLM

class IndexProvider(str, Enum):
    LOCAL_QDRANT = "local_qdrant"   # default: self-hosted Qdrant
    LLAMACLOUD = "llamacloud"       # LlamaCloud managed index

class ExtractProvider(str, Enum):
    LOCAL = "local"                 # Ollama extraction
    LLAMAEXTRACT = "llamaextract"   # LlamaCloud LlamaExtract

class AgentProvider(str, Enum):
    LOCAL = "local"                 # LlamaIndex Workflows local
    LLAMAAGENTS = "llamaagents"     # LlamaCloud LlamaAgents

class BackupDestination(str, Enum):
    LOCAL = "local"                 # /backups/ volume mount
    S3 = "s3"                       # AWS S3 or MinIO

class VirusScanProvider(str, Enum):
    DISABLED = "disabled"           # No scanning (default for dev)
    CLAMAV = "clamav"               # ClamAV daemon

class EmbeddingProvider(str, Enum):
    LOCAL = "local"                 # CPU embedding in-process
    GPU_WORKER = "gpu_worker"       # Remote GPU gRPC service
```

### [PROMPT] — Section 3 — Provider Factory

```
Write src/core/providers.py — the provider factory that returns concrete
implementations based on environment variables.

Enums: ParserProvider, ChunkingStrategy, LLMProvider, IndexProvider,
       ExtractProvider, AgentProvider (as shown above in Section 3.1)

Factory functions (each cached with @lru_cache):

1. get_parser(provider: ParserProvider | None = None) -> BaseDocumentParser
   Returns:
   - UnstructuredParser() if PARSER_PROVIDER=unstructured (default)
   - LiteParseParser() if PARSER_PROVIDER=liteparse
   - LlamaParseParser() if PARSER_PROVIDER=llamaparse
     (requires LLAMA_CLOUD_API_KEY, raises ConfigError if missing)

2. get_chunker(strategy: ChunkingStrategy | None = None) -> TransformComponent
   Returns:
   - SentenceSplitter(chunk_size=512, chunk_overlap=50) if CHUNKING_STRATEGY=sentence (default)
   - SemanticSplitterNodeParser(embed_model=get_embed_model(),
       breakpoint_percentile_threshold=90) if CHUNKING_STRATEGY=semantic
   Note: SemanticSplitterNodeParser needs the embed model, load lazily.

3. get_llm(provider: LLMProvider | None = None) -> LLM
   Returns:
   - Ollama(model=settings.ollama_model, base_url=settings.ollama_base_url,
           request_timeout=120, temperature=0.1) if LLM_PROVIDER=ollama (default)
   - LlamaCloud LLM wrapper if LLM_PROVIDER=llamacloud

4. get_embed_model() -> BaseEmbedding
   Always returns HuggingFaceEmbedding(model_name="BAAI/bge-large-en-v1.5",
                                        embed_batch_size=32, device="cpu")
   This is always local — no cloud option for embeddings.

5. get_index_provider() -> str  ("local_qdrant" | "llamacloud")
   Returns the current INDEX_PROVIDER setting.

All functions read from Settings (pydantic-settings). If a required env var is
missing for a cloud provider, raise a clear ConfigError with the missing var name.
Log the active provider for each component at startup.
```

---

## Section 4 — Project Scaffold & Infrastructure

### [PROMPT] — Phase 0 — Docker Compose & Project Structure

```
Generate the complete project scaffold for the company document finder.

Directory structure:
company-doc-finder/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── pyproject.toml
├── Dockerfile
├── src/
│   ├── api/
│   │   ├── main.py
│   │   ├── middleware.py
│   │   └── routes/
│   │       ├── auth.py, ingest.py, documents.py
│   │       ├── search.py, summarize.py, health.py
│   ├── ingestion/
│   │   ├── parsers/
│   │   │   ├── base.py         # Abstract BaseDocumentParser
│   │   │   ├── unstructured.py
│   │   │   ├── liteparse.py
│   │   │   └── llamaparse.py
│   │   ├── pipeline.py
│   │   ├── tasks.py
│   │   └── watcher.py
│   ├── retrieval/
│   │   ├── engine.py
│   │   └── summarizer.py
│   └── core/
│       ├── config.py
│       ├── database.py         # MongoDB Motor + Beanie
│       ├── providers.py        # Provider factory (Section 3)
│       ├── qdrant_client.py
│       ├── valkey_client.py    # Valkey (not redis) client singleton
│       ├── tenant_context.py
│       └── tracing.py
├── scripts/
│   ├── init_qdrant.py
│   └── promote_tenant.py
└── tests/
    └── eval/

docker-compose.yml services:
1. valkey     — valkey/valkey:8-alpine, port 6379, named volume valkey_data
               NOTE: This is Valkey NOT Redis. Use valkey/valkey image.
2. qdrant     — qdrant/qdrant:latest, ports 6333+6334, volume qdrant_data
3. mongodb    — mongo:8, port 27017, volume mongo_data
               env: MONGO_INITDB_ROOT_USERNAME, MONGO_INITDB_ROOT_PASSWORD
4. ollama     — ollama/ollama:latest, port 11434, volume ollama_models
               deploy.resources.reservations.devices for NVIDIA GPU (optional)
5. unstructured — downloads.unstructured.io/unstructured-io/unstructured:latest
               port 8000 (internal), for PDF/DOCX parsing API
               expose as UNSTRUCTURED_URL=http://unstructured:8000
6. api        — build: ., port 8001, all env vars
7. worker     — same image, command: celery -A src.ingestion.tasks worker
               --concurrency=2 --queues=ingest,default
8. beat       — same image, command: celery -A src.ingestion.tasks beat
               --scheduler celery.beat:PersistentScheduler
9. flower     — mher/flower:2, port 5555, broker=valkey://valkey:6379/0
10. phoenix   — arizephoenix/phoenix:latest, port 6006 (tracing observability)

# === SCALED PARSING & SECURITY SERVICES ===
11-14. unstructured-1 through unstructured-4 — scaled parsing containers
               image: downloads.unstructured.io/unstructured-io/unstructured:latest
               deploy.resources.limits.memory=4G
               healthcheck: curl -f http://localhost:8000/healthcheck
15. unstructured-lb — nginx:alpine, port 8000
               Load balancer for Unstructured containers (round-robin)
               volume: ./nginx/unstructured.conf:/etc/nginx/conf.d/default.conf:ro
               UNSTRUCTURED_URL=http://unstructured-lb:8000
16. clamav     — clamav/clamav:latest, port 3310
               Virus scanning for uploads (high-security environments)
               volume: clamav_data:/var/lib/clamav
               deploy.resources.limits.memory=2G
               ⚠️ Downloads virus definitions on startup (5-10 min)
17. embed-worker — build: Dockerfile.embed, port 50051 (gRPC)
               GPU-accelerated batch embedding service (optional)
               deploy.resources.reservations.devices: nvidia GPU
               EMBED_BATCH_SIZE=256
18. minio      — minio/minio:latest, ports 9000 (API) + 9001 (console)
               S3-compatible backup storage (self-hosted alternative to AWS S3)
               command: server /data --console-address ":9001"
               volume: minio_data:/data

# === NGINX CONFIG FOR UNSTRUCTURED LOAD BALANCER ===
# Create nginx/unstructured.conf:
```nginx
upstream unstructured_backend {
    least_conn;
    server unstructured-1:8000 max_fails=3 fail_timeout=30s;
    server unstructured-2:8000 max_fails=3 fail_timeout=30s;
    server unstructured-3:8000 max_fails=3 fail_timeout=30s;
    server unstructured-4:8000 max_fails=3 fail_timeout=30s;
}

server {
    listen 8000;
    client_max_body_size 100M;
    
    location / {
        proxy_pass http://unstructured_backend;
        proxy_connect_timeout 120s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
    
    location /healthcheck {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
```

# === DOCKERFILE WITH NODE.JS FOR LITEPARSE ===
# Dockerfile must include Node.js 20 LTS for LiteParse CLI:
```dockerfile
FROM python:3.11-slim AS base

# Install system dependencies + Node.js 20 LTS
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libmagic1 \
    poppler-utils \
    tesseract-ocr \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @llamaindex/liteparse \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN python --version && node --version && npm --version && liteparse --version

WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir uv && uv pip install --system -e .

COPY src/ src/
COPY scripts/ scripts/

# API runs on port 8001
EXPOSE 8001
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

# === DOCKERFILE.EMBED FOR GPU EMBEDDING WORKER (optional) ===
```dockerfile
FROM nvidia/cuda:12.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3.11 python3-pip
RUN pip install torch transformers sentence-transformers grpcio grpcio-tools

WORKDIR /app
COPY src/embedding/ src/embedding/
COPY protos/ protos/

EXPOSE 50051
CMD ["python", "-m", "src.embedding.service"]
```

pyproject.toml core deps:
  llama-index>=0.12
  llama-index-embeddings-huggingface>=0.5
  llama-index-llms-ollama>=0.5
  llama-index-vector-stores-qdrant>=0.6
  llama-index-node-parser-semantic>=0.1   # SemanticSplitterNodeParser
  fastapi[standard]>=0.115
  celery[valkey]>=5.4                      # Celery Valkey broker support
  valkey>=6.0                              # valkey-py client
  motor>=3.4                               # async MongoDB
  beanie>=1.26                             # async ODM for Motor
  pymupdf>=1.24
  python-docx>=1.1
  unstructured[pdf,docx]>=0.15            # self-hosted parsing
  llama-parse>=0.5                         # LlamaCloud parsing (optional)
  python-jose[cryptography]>=3.3
  passlib[bcrypt]>=1.7
  pydantic-settings>=2.3
  structlog>=25.0
  watchdog>=4.0
  ragas>=0.2
  tenacity>=8.3
  openinference-instrumentation-llama-index>=3.0
  opentelemetry-exporter-otlp-proto-grpc>=1.25
  prometheus-fastapi-instrumentator>=7.0
  python-magic>=0.4
  httpx>=0.27

  # Security & Scanning
  pyclamd>=0.4                          # ClamAV async client

  # Backup - S3/MinIO
  boto3>=1.34                           # AWS S3 SDK
  s3fs>=2024.6                          # S3 filesystem interface

  # GPU Embedding Worker (optional)
  grpcio>=1.60                          # gRPC for embedding service
  grpcio-tools>=1.60

.env.example must include:
  # Valkey
  VALKEY_URL=valkey://valkey:6379/0
  # MongoDB
  MONGODB_URL=mongodb://admin:password@mongodb:27017
  MONGODB_DB_NAME=company_docs
  # Qdrant
  QDRANT_HOST=qdrant
  QDRANT_PORT=6333
  COLLECTION_NAME=company_docs
  # Ollama
  OLLAMA_BASE_URL=http://ollama:11434
  OLLAMA_MODEL=gemma4:e4b
  # Embedding
  EMBED_MODEL_NAME=BAAI/bge-large-en-v1.5
  # Auth
  JWT_SECRET_KEY=change-me-in-production
  JWT_ALGORITHM=HS256
  # Parsing (self-hosted default)
  PARSER_PROVIDER=unstructured
  UNSTRUCTURED_URL=http://unstructured:8000
  # Parsing (LlamaCloud upgrade — set PARSER_PROVIDER=llamaparse to activate)
  LLAMA_CLOUD_API_KEY=
  # Chunking
  CHUNKING_STRATEGY=sentence
  # LLM
  LLM_PROVIDER=ollama
  # Index
  INDEX_PROVIDER=local_qdrant
  # Paths
  WATCH_ROOT=/app/watch_root
  UPLOAD_DIR=/app/uploads
  # Environment
  ENVIRONMENT=development
  GIT_SHA=local

  # === PARSING ROUTER (Section 8.5) ===
  ENABLE_PDF_CLASSIFICATION=true
  UNSTRUCTURED_SCALE=4                  # Number of Unstructured containers

  # === VIRUS SCANNING (Section 8.6) ===
  ENABLE_VIRUS_SCAN=false               # true for high-security (adds ~200ms latency)
  CLAMAV_HOST=clamav
  CLAMAV_PORT=3310

  # === EMBEDDING ===
  EMBED_PROVIDER=local                  # local | gpu_worker
  EMBED_WORKER_URL=http://embed-worker:50051
  EMBED_BATCH_SIZE=256

  # === CHUNKING ===
  # ⚠️ semantic requires 2x memory per worker (embed model loaded during chunking)
  # CHUNKING_STRATEGY=sentence          # default: production-safe
  # CHUNKING_STRATEGY=semantic          # optional: enable with sufficient RAM

  # === BACKUP - S3/MinIO (Section 15.5) ===
  BACKUP_DESTINATION=s3                 # local | s3
  BACKUP_S3_BUCKET=company-docs-backup
  BACKUP_S3_ENDPOINT=http://minio:9000  # Omit for AWS S3
  AWS_ACCESS_KEY_ID=minioadmin
  AWS_SECRET_ACCESS_KEY=minioadmin
  AWS_REGION=us-east-1
  BACKUP_RETENTION_DAYS=30

  # === MinIO (self-hosted S3 alternative) ===
  MINIO_ROOT_USER=minioadmin
  MINIO_ROOT_PASSWORD=minioadmin

  # === RATE LIMITING ===
  UPLOAD_MB_LIMIT_PER_MINUTE=100        # Per-tenant MB/minute limit
```

### [CHECK] Phase 0 complete when:
- [ ] `docker compose up` starts all 10 services with no errors
- [ ] Qdrant dashboard at `http://localhost:6333/dashboard`
- [ ] Flower at `http://localhost:5555` shows Valkey as broker
- [ ] Phoenix at `http://localhost:6006`
- [ ] MongoDB accessible at port 27017 with init credentials
- [ ] `ollama pull gemma4:e4b` completes inside the ollama container
- [ ] Unstructured container health endpoint returns 200

---

## Section 5 — Configuration & Database Layer

### [PROMPT] — Phase 1 — Settings + MongoDB Models

```
Build the configuration and MongoDB database layer.

1. src/core/config.py — pydantic-settings BaseSettings
   All settings from .env.example. Add:
   - valkey_url: str (not redis_url)
   - mongodb_url: str
   - mongodb_db_name: str = "company_docs"
   - ollama_model: str = "gemma4:e4b"
   - parser_provider: ParserProvider = ParserProvider.UNSTRUCTURED
   - chunking_strategy: ChunkingStrategy = ChunkingStrategy.SENTENCE
   - llm_provider: LLMProvider = LLMProvider.OLLAMA
   - index_provider: IndexProvider = IndexProvider.LOCAL_QDRANT
   - unstructured_url: str = "http://unstructured:8000"
   - llama_cloud_api_key: str = ""
   - chunk_size: int = 512
   - chunk_overlap: int = 50
   - top_k: int = 8
   Expose get_settings() with @lru_cache.

2. src/core/database.py — Motor + Beanie initialization
   async def init_db():
     client = AsyncIOMotorClient(settings.mongodb_url)
     await init_beanie(
       database=client[settings.mongodb_db_name],
       document_models=[Tenant, User, Document, IngestionJob]
     )
   get_db() dependency returns the beanie Document class (documents are
   accessed directly via Beanie ORM, not via a session).

3. src/models/db.py — Beanie document models (MongoDB collections)

   class Tenant(Document):
     slug: str           # unique, URL-safe
     name: str
     tier: str = "SHARED"  # "SHARED" | "DEDICATED" (auto-promoted at 20K vectors)
     is_active: bool = True
     created_at: datetime = Field(default_factory=datetime.utcnow)
     class Settings:
       name = "tenants"
       indexes = [IndexModel([("slug", 1)], unique=True)]

   class User(Document):
     tenant_id: PydanticObjectId
     email: str
     hashed_password: str
     role: str = "member"  # "admin" | "member"
     created_at: datetime = Field(default_factory=datetime.utcnow)
     class Settings:
       name = "users"
       indexes = [
         IndexModel([("email", 1), ("tenant_id", 1)], unique=True)
       ]

   class Document(Document):  # rename to DocRecord to avoid clash
     tenant_id: PydanticObjectId
     filename: str
     file_hash: str          # SHA-256
     status: str = "queued"  # queued|processing|completed|failed
     page_count: int = 0
     storage_path: str
     error_msg: str | None = None
     ingested_at: datetime | None = None
     created_at: datetime = Field(default_factory=datetime.utcnow)
     class Settings:
       name = "documents"
       indexes = [
         IndexModel([("tenant_id", 1), ("file_hash", 1)], unique=True),
         IndexModel([("tenant_id", 1), ("status", 1)]),
       ]

   class IngestionJob(Document):
     document_id: PydanticObjectId
     celery_task_id: str
     status: str = "pending"
     started_at: datetime | None = None
     finished_at: datetime | None = None
     error_detail: str | None = None
     class Settings:
       name = "ingestion_jobs"
       indexes = [IndexModel([("document_id", 1)])]

   class ParsedDocumentCache(Document):
     \"\"\"
     Cache raw parsed elements for re-chunking without re-parsing.
     Enables changing chunking strategy without re-uploading documents.
     \"\"\"
     doc_id: PydanticObjectId
     tenant_id: PydanticObjectId
     file_hash: str
     parser_used: str          # "unstructured" | "liteparse" | "llamaparse"
     parser_strategy: str      # "fast" | "hi_res"
     raw_elements: list[dict]  # Raw Unstructured elements or equivalent
     page_count: int
     parsed_at: datetime = Field(default_factory=datetime.utcnow)
     class Settings:
       name = "parsed_document_cache"
       indexes = [
         IndexModel([("doc_id", 1)], unique=True),
         IndexModel([("tenant_id", 1), ("file_hash", 1)]),
         IndexModel([("parsed_at", 1)], expireAfterSeconds=60*60*24*90)  # TTL: 90 days
       ]

4. src/core/valkey_client.py — Valkey singleton
   from valkey import Valkey
   from valkey.asyncio import Valkey as AsyncValkey  # async client
   Use AsyncValkey for FastAPI routes, sync Valkey for Celery tasks.
   get_valkey() returns the async client.
   get_sync_valkey() returns the sync client.
   Both connect to settings.valkey_url.
   Add a health_check() method that runs PING.

NOTE: Import from `valkey` NOT from `redis`. This is Valkey not Redis.
```

### [CHECK] Phase 1 complete when:
- [ ] `await init_db()` creates all collections in MongoDB
- [ ] Indexes visible in MongoDB Compass or `mongosh`
- [ ] `get_valkey()` returns a working async Valkey client
- [ ] `await client.ping()` returns `True`

---

## Section 6 — Auth & Multi-Tenant Middleware

### [PROMPT] — Phase 2 — JWT Auth + Tenant Isolation

```
Implement JWT-based auth and multi-tenant middleware.

1. src/api/auth.py
   POST /auth/register:
     body: {tenant_name, tenant_slug, email, password}
     - Validate slug is URL-safe (regex: ^[a-z0-9-]+$)
     - Create Tenant and User documents in MongoDB via Beanie
     - Hash password with passlib bcrypt
     - Return access_token (JWT) + tenant_slug

   POST /auth/login:
     body: {email, password}
     - Find User by email, verify password
     - Issue JWT with payload:
       {sub: str(user.id), tenant_id: str(user.tenant_id), role: user.role,
        exp: utcnow + 24h}
     - Return {access_token, token_type: "bearer"}

   get_current_user() FastAPI dependency:
     - Extracts Bearer token from Authorization header
     - Decodes with python-jose (settings.jwt_secret_key, settings.jwt_algorithm)
     - Returns (user_doc, tenant_id_str) tuple
     - Raises HTTP 401 on invalid/expired tokens

2. src/api/middleware.py
   TenantContextMiddleware (Starlette BaseHTTPMiddleware):
     - For every request (except /health, /auth/*):
       decode JWT from Authorization header
       extract tenant_id → set in request.state.tenant_id
       set contextvars (see below)
       reject with HTTP 403 if no valid tenant_id found
     - Add request_id (UUID4) to request.state for logging
     - structlog context: bind tenant_id, request_id, method, path

   Rate limiting (slowapi, Valkey backend):
     - /search: 30/minute per tenant_id
     - /ingest/upload: 10/minute per tenant_id
     - /ingest/upload: 100MB/minute per tenant_id (cumulative file size)
     - /auth/login: 5/minute per IP

   MB/minute rate limiting implementation:
     # Track cumulative upload size per tenant in Valkey with 60s TTL
     async def check_upload_mb_limit(tenant_id: str, file_size: int) -> bool:
       key = f"upload_mb:{tenant_id}"
       current = await valkey.incrby(key, file_size // (1024 * 1024))
       if current == file_size // (1024 * 1024):  # First upload this minute
         await valkey.expire(key, 60)
       if current > settings.upload_mb_limit_per_minute:
         raise HTTPException(
           status_code=429,
           detail=f"Upload limit exceeded: {settings.upload_mb_limit_per_minute}MB/minute",
           headers={"Retry-After": str(await valkey.ttl(key))}
         )
       return True

3. src/core/tenant_context.py
   _tenant_id_var: ContextVar[str | None] = ContextVar("tenant_id", default=None)
   def get_tenant_id() -> str  # raises RuntimeError if not set
   def set_tenant_id(tid: str)
   async context manager inject_tenant_context(tid: str)

RULE: tenant_id MUST come ONLY from decoded JWT. Never from request body,
query params, or headers. Add a module-level assertion comment.
```

---

## Section 7 — Qdrant Setup with Tiered Multi-Tenancy

### [PROMPT] — Phase 3 — Qdrant Collection Bootstrap

```
Write scripts/init_qdrant.py — idempotent Qdrant collection setup.

Use qdrant_client.QdrantClient (sync, for one-time scripts).

1. Create collection "company_docs" (skip if exists):
   vectors_config={
     "dense": VectorParams(size=1024, distance=Distance.COSINE)
   }
   sparse_vectors_config={
     "sparse": SparseVectorParams(index=SparseIndexParams(on_disk=False))
   }
   sharding_method=ShardingMethod.CUSTOM
   replication_factor=1  # increment for HA

2. Create fallback shard key "default" (idempotent)

3. Create payload indexes:
   - "tenant_id": PayloadSchemaType.KEYWORD, is_tenant=True  ← CRITICAL
   - "doc_id": PayloadSchemaType.KEYWORD
   - "filename": PayloadSchemaType.KEYWORD

4. Print collection info summary.

Also write src/core/qdrant_client.py:
   Singleton AsyncQdrantClient from settings.qdrant_host/port.
   get_qdrant_client() FastAPI dependency.

   get_vector_store(tenant_id: str) -> QdrantVectorStore:
     Returns QdrantVectorStore(
       client=sync_client,      # QdrantVectorStore needs sync client
       aclient=async_client,
       collection_name=settings.collection_name,
       enable_hybrid=True,
       fastembed_sparse_model="Qdrant/bm25",
       sparse_vector_name="sparse",
       dense_vector_name="dense",
       payload_filter=Filter(must=[
         FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))
       ]),
     )
   ⚠️ This is the ONLY authorized way to get a vector store.
      Every caller must pass tenant_id. Never call without it.

   Both sync and async clients are module-level singletons.
   sync client for IngestionPipeline (LlamaIndex requires sync).
   async client for FastAPI health checks and query operations.
```

---

## Section 8 — Document Parsing — Provider Implementations

### [PROMPT] — Phase 4a — Parser Abstraction + Unstructured

```
Write the document parser abstraction and Unstructured.io implementation.

1. src/ingestion/parsers/base.py
   from abc import ABC, abstractmethod
   from llama_index.core.schema import Document

   class BaseDocumentParser(ABC):
     @abstractmethod
     async def parse(self, file_path: str, doc_id: str,
                     tenant_id: str) -> list[Document]: ...
     
     def sha256(self, path: str) -> str:
       """SHA-256 of file content."""

2. src/ingestion/parsers/unstructured.py — UnstructuredParser
   Uses Unstructured.io's partition API (self-hosted Docker service).
   
   Strategy:
   - POST file to UNSTRUCTURED_URL/general/v0/general
     (multipart form upload — same as Unstructured hosted API format)
   - Parse JSON response: list of elements with type, text, metadata
   - Filter out low-value element types (Header, Footer, PageBreak)
   - Group elements into "page groups" (by page_number in metadata)
   - Return one LlamaIndex Document per page group
   - Set metadata: doc_id, tenant_id, filename, page_number, total_pages,
     element_types (list of unique types found), file_type, parser="unstructured"

   async def parse(file_path, doc_id, tenant_id) -> list[Document]:
     async with httpx.AsyncClient(timeout=120) as client:
       with open(file_path, "rb") as f:
         response = await client.post(
           f"{settings.unstructured_url}/general/v0/general",
           files={"files": (Path(file_path).name, f, "application/octet-stream")},
           data={"strategy": "hi_res", "coordinates": "false"}
         )
     # Parse + group + return Documents

   ⚠️ Unstructured is slow (40–140s per page for hi_res).
      Use strategy="fast" for text-dense docs with no complex tables.
      Expose UNSTRUCTURED_STRATEGY=fast|hi_res env var (default: fast).

3. src/ingestion/parsers/liteparse.py — LiteParseParser
   LiteParse is LlamaIndex's local-first parser (open source).
   Install: pip install liteparse (part of llama-index ecosystem)
   
   from liteparse import LiteParser
   
   async def parse(file_path, doc_id, tenant_id) -> list[Document]:
     parser = LiteParser()
     result = parser.load_data(file_path)  # returns list[Document]
     # Tag each document with metadata: doc_id, tenant_id, filename, parser="liteparse"
     return result

4. src/ingestion/parsers/llamaparse.py — LlamaParseParser (cloud)
   [SWAP] Only instantiated when PARSER_PROVIDER=llamaparse and LLAMA_CLOUD_API_KEY set.
   
   from llama_parse import LlamaParse
   
   async def parse(file_path, doc_id, tenant_id) -> list[Document]:
     parser = LlamaParse(
       api_key=settings.llama_cloud_api_key,
       result_type="markdown",
       verbose=False,
       # Use "cost_effective" tier for standard docs, "agentic" for complex
       parsing_instruction="Extract all text, tables, and structure faithfully."
     )
     documents = await parser.aload_data(file_path)
     # Tag metadata
     return documents

5. Dispatcher — src/ingestion/loaders.py
   async def load_document(file_path, doc_id, tenant_id) -> list[Document]:
     parser = get_parser()   # from src.core.providers
     return await parser.parse(file_path, doc_id, tenant_id)
```

### [PROMPT] — Phase 4b — IngestionPipeline with Swappable Chunker

```
Write src/ingestion/pipeline.py — LlamaIndex IngestionPipeline.

1. Module-level singletons (loaded ONCE at worker startup, NOT per task):
   _embed_model = None
   _valkey_cache = None
   
   def get_embed_model_singleton() -> HuggingFaceEmbedding:
     global _embed_model
     if _embed_model is None:
       _embed_model = HuggingFaceEmbedding(
         model_name=settings.embed_model_name,
         embed_batch_size=32, device="cpu"
       )
     return _embed_model

2. build_pipeline(vector_store: QdrantVectorStore) -> IngestionPipeline
   
   chunker = get_chunker()   # from providers — SentenceSplitter or Semantic
   
   transformations = [
     chunker,                              # Phase 4.1.3 research: 512t is standard
     TitleExtractor(nodes=3, llm=get_llm()),  # section-title metadata
     KeywordExtractor(keywords=6, llm=get_llm()),
     get_embed_model_singleton(),          # must be module-level singleton
   ]
   
   # Valkey-backed embedding cache (NOT Redis cache)
   from llama_index.core.ingestion.cache import IngestionCache
   from llama_index.storage.kvstore.valkey import ValkeyKVStore  # check if available
   # If ValkeyKVStore not available yet, use RedisKVStore with valkey URL
   # (wire-compatible) — document this with a comment
   
   return IngestionPipeline(
     transformations=transformations,
     vector_store=vector_store,
     docstore=SimpleDocumentStore(),   # dedup strategy
   )

3. run_pipeline(docs, doc_id, tenant_id, vector_store) -> int
   - Enrich ALL node metadata before running:
     for doc in docs:
       doc.metadata.update({"tenant_id": tenant_id, "doc_id": doc_id})
   - pipeline.run(documents=docs, num_workers=2, show_progress=False)
   - Return count of upserted nodes
   - Log: tenant_id, doc_id, doc_count, node_count, duration_ms

⚠️ num_workers=2 max for Celery workers to avoid OOM.
    The embed model is the heavy piece — module-level singleton prevents reload.
⚠️ If CHUNKING_STRATEGY=semantic, get_chunker() returns SemanticSplitterNodeParser
    which needs the embed model during chunking (not just embedding stage).
    This doubles memory use. Warn in startup logs.
```

### [CHECK] Phase 4 complete when:
- [ ] Unstructured container parses a sample PDF and returns structured elements
- [ ] `load_document()` returns LlamaIndex `Document` objects with correct metadata
- [ ] `run_pipeline()` upserts nodes to Qdrant with `tenant_id` in payload
- [ ] Switching `PARSER_PROVIDER=liteparse` in .env and restarting uses LiteParse
- [ ] Switching `CHUNKING_STRATEGY=semantic` uses SemanticSplitterNodeParser

---

## Section 8.5 — PDF Classification & Intelligent Parser Routing

Automatically classify PDFs and route to optimal parser/strategy based on content type.

### [PROMPT] — Phase 4c — PDF Classifier + Router

```
Write the document classification and routing system.

1. src/ingestion/classifier.py — PDF Type Classifier
   Uses PyMuPDF to analyze PDF structure and determine optimal parsing strategy.
   
   class PDFType(str, Enum):
     TEXT_DENSE = "text_dense"       # >90% extractable text
     SCANNED = "scanned"             # <10% text, primarily images
     COMPLEX_LAYOUT = "complex"      # Tables, multi-column, charts
     MIXED = "mixed"                 # Combination

   def classify_pdf(file_path: str) -> PDFType:
     import fitz  # PyMuPDF
     doc = fitz.open(file_path)
     
     total_pages = len(doc)
     text_pages = 0
     image_heavy_pages = 0
     table_detected = False
     
     for page in doc:
       text = page.get_text()
       images = page.get_images()
       tables = page.find_tables()
       
       text_ratio = len(text) / max(page.rect.width * page.rect.height, 1)
       
       if text_ratio > 0.001:  # Has substantial text
         text_pages += 1
       if len(images) > 2:
         image_heavy_pages += 1
       if tables:
         table_detected = True
     
     text_pct = text_pages / max(total_pages, 1)
     image_pct = image_heavy_pages / max(total_pages, 1)
     
     if text_pct > 0.9 and not table_detected:
       return PDFType.TEXT_DENSE
     elif text_pct < 0.1 and image_pct > 0.5:
       return PDFType.SCANNED
     elif table_detected or image_pct > 0.3:
       return PDFType.COMPLEX_LAYOUT
     else:
       return PDFType.MIXED

2. src/ingestion/router.py — Intelligent Parser Router
   Routes documents to optimal parser based on classification.
   
   @dataclass
   class ParserConfig:
     provider: ParserProvider
     strategy: str  # "fast" | "hi_res"
     ocr_enabled: bool
     priority: int  # 1=high, 3=low
   
   ROUTING_TABLE = {
     # (mime_type, pdf_type) -> ParserConfig
     ("application/pdf", PDFType.TEXT_DENSE): 
       ParserConfig(ParserProvider.LITEPARSE, "fast", False, 1),
     ("application/pdf", PDFType.SCANNED): 
       ParserConfig(ParserProvider.UNSTRUCTURED, "hi_res", True, 2),
     ("application/pdf", PDFType.COMPLEX_LAYOUT): 
       ParserConfig(ParserProvider.UNSTRUCTURED, "hi_res", False, 2),
     ("application/pdf", PDFType.MIXED): 
       ParserConfig(ParserProvider.UNSTRUCTURED, "fast", True, 2),
     ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", None):
       ParserConfig(ParserProvider.UNSTRUCTURED, "fast", False, 1),
   }
   
   def route_to_parser(file_path: str, mime_type: str) -> ParserConfig:
     pdf_type = None
     if mime_type == "application/pdf":
       pdf_type = classify_pdf(file_path)
       log.info("pdf_classified", file=file_path, type=pdf_type)
     
     key = (mime_type, pdf_type)
     if key in ROUTING_TABLE:
       return ROUTING_TABLE[key]
     
     # Fallback: generic key without pdf_type
     generic_key = (mime_type, None)
     return ROUTING_TABLE.get(generic_key, 
       ParserConfig(ParserProvider.UNSTRUCTURED, "fast", False, 3))

3. Update src/ingestion/loaders.py to use router:
   async def load_document(file_path, doc_id, tenant_id) -> list[Document]:
     mime_type = magic.from_file(file_path, mime=True)
     
     if settings.enable_pdf_classification:
       config = route_to_parser(file_path, mime_type)
       parser = get_parser(config.provider)
       # Apply strategy and OCR settings to parser
     else:
       parser = get_parser()  # Default provider
     
     return await parser.parse(file_path, doc_id, tenant_id)

⚠️ Classification adds ~50-100ms per PDF but saves minutes on parsing decisions.
   Disable with ENABLE_PDF_CLASSIFICATION=false for simpler deployments.
```

### [CHECK] Phase 4c complete when:
- [ ] Text-dense PDF classified as `TEXT_DENSE` and routed to LiteParse
- [ ] Scanned PDF classified as `SCANNED` and routed to Unstructured hi_res + OCR
- [ ] Complex PDF with tables classified as `COMPLEX_LAYOUT`
- [ ] Logs show `pdf_classified type=...` for each upload

---

## Section 8.6 — ClamAV Virus Scanning (High-Security Environments)

Optional virus scanning for uploaded documents before processing.

### [PROMPT] — Phase 4d — Virus Scanner Integration

```
Write the virus scanning integration for uploaded documents.

1. src/ingestion/scanner.py — ClamAV Async Scanner
   
   import pyclamd
   from src.core.config import get_settings
   
   class VirusScanner:
     def __init__(self):
       settings = get_settings()
       if settings.enable_virus_scan:
         self.clamd = pyclamd.ClamdNetworkSocket(
           host=settings.clamav_host,
           port=settings.clamav_port
         )
         # Verify connection on init
         if not self.clamd.ping():
           raise RuntimeError("ClamAV not reachable at {settings.clamav_host}:{settings.clamav_port}")
         log.info("clamav_connected", host=settings.clamav_host)
       else:
         self.clamd = None
         log.info("virus_scanning_disabled")
     
     async def scan_file(self, file_path: str) -> tuple[bool, str | None]:
       """
       Returns (is_clean, threat_name).
       is_clean=True means no virus found.
       """
       if self.clamd is None:
         return (True, None)  # Scanning disabled
       
       result = self.clamd.scan_file(file_path)
       
       if result is None:
         return (True, None)  # Clean
       
       # result format: {'/path/to/file': ('FOUND', 'Virus.Name')}
       status, threat = result.get(file_path, (None, None))
       if status == 'FOUND':
         log.warning("virus_detected", file=file_path, threat=threat)
         return (False, threat)
       
       return (True, None)
   
   # Module-level singleton (init once per worker)
   _scanner: VirusScanner | None = None
   
   def get_scanner() -> VirusScanner:
     global _scanner
     if _scanner is None:
       _scanner = VirusScanner()
     return _scanner

2. Update POST /ingest/upload in src/api/routes/ingest.py:
   
   @router.post("/upload")
   async def upload_document(
     file: UploadFile,
     current_user: tuple = Depends(get_current_user)
   ):
     user, tenant_id = current_user
     
     # Save file temporarily
     temp_path = save_upload(file, tenant_id)
     
     # Virus scan BEFORE any processing
     if settings.enable_virus_scan:
       scanner = get_scanner()
       is_clean, threat = await scanner.scan_file(temp_path)
       if not is_clean:
         os.remove(temp_path)  # Delete infected file immediately
         log.error("upload_rejected_malware", tenant_id=tenant_id, 
                   filename=file.filename, threat=threat)
         raise HTTPException(
           status_code=422,
           detail=f"File rejected: malware detected ({threat})"
         )
     
     # Continue with normal processing (MIME check, hashing, etc.)...

3. Add ClamAV health check to GET /health:
   
   if settings.enable_virus_scan:
     try:
       scanner = get_scanner()
       clamd_ping = scanner.clamd.ping() if scanner.clamd else False
       services["clamav"] = "ok" if clamd_ping else "degraded"
     except Exception as e:
       services["clamav"] = f"error: {str(e)}"

⚠️ ClamAV adds 100-300ms latency per file. Only enable for sensitive environments.
⚠️ ClamAV container needs ~2GB RAM and downloads virus definitions on startup.
   First scan after startup may be slow while definitions load (~5-10 minutes).
⚠️ Test with EICAR test file: https://www.eicar.org/download-anti-malware-testfile/
```

### [CHECK] Phase 4d complete when:
- [ ] ClamAV container starts and downloads virus definitions
- [ ] `get_scanner().clamd.ping()` returns True
- [ ] Upload of EICAR test file returns HTTP 422 "malware detected"
- [ ] Clean files upload normally with no latency spike
- [ ] `/health` endpoint shows `clamav: ok` status

---

## Section 9 — Celery Task Queue (Valkey-backed)

### [PROMPT] — Phase 5 — Celery Tasks with Valkey

```
Write src/ingestion/tasks.py — Celery task definitions using Valkey as broker.

Celery app configuration:
  from celery import Celery
  from src.core.config import get_settings
  settings = get_settings()
  
  celery_app = Celery("doc_finder")
  celery_app.config_from_object({
    "broker_url": settings.valkey_url,          # valkey:// not redis://
    "result_backend": settings.valkey_url,
    "task_serializer": "json",
    "result_serializer": "json",
    "accept_content": ["json"],
    "worker_prefetch_multiplier": 1,            # critical: one at a time
    "task_acks_late": True,
    "worker_max_tasks_per_child": 50,           # recycle worker after 50 tasks
    "result_expires": 3600,
    "task_routes": {
      "src.ingestion.tasks.ingest_document_task": {"queue": "ingest"},
      "src.ingestion.tasks.batch_ingest_folder_task": {"queue": "ingest"},
      "src.ingestion.tasks.scheduled_batch_ingest": {"queue": "default"},
      "src.ingestion.tasks.check_tenant_promotion": {"queue": "default"},
      "src.ingestion.tasks.run_backup": {"queue": "default"},
    },
    "beat_schedule": {
      "nightly-batch-ingest": {
        "task": "src.ingestion.tasks.scheduled_batch_ingest",
        "schedule": crontab(hour=2, minute=0),
      },
      "daily-tenant-promotion-check": {
        "task": "src.ingestion.tasks.check_tenant_promotion",
        "schedule": crontab(hour=3, minute=30),  # 03:30 UTC daily
      },
      "nightly-full-backup": {
        "task": "src.ingestion.tasks.run_backup",
        "schedule": crontab(hour=3, minute=0),
        "kwargs": {"full": True}
      },
      "hourly-mongodb-backup": {
        "task": "src.ingestion.tasks.run_backup",
        "schedule": crontab(minute=0),
        "kwargs": {"mongodb": True}
      },
      "weekly-backup-cleanup": {
        "task": "src.ingestion.tasks.run_backup",
        "schedule": crontab(day_of_week=0, hour=4, minute=0),
        "kwargs": {"cleanup": True}
      }
    }
  })

Tasks:

1. @celery_app.task(bind=True, max_retries=3, default_retry_delay=30,
                    queue="ingest")
   def ingest_document_task(self, file_path: str, doc_id: str, tenant_id: str):
   
   Steps (all MongoDB ops must use synchronous Motor or Beanie sync API,
          or run_sync() wrapper since Celery is not async):
   
   a. Update DocRecord status="processing" in MongoDB (sync)
   b. documents = asyncio.run(load_document(file_path, doc_id, tenant_id))
   c. vector_store = get_vector_store(tenant_id)   # sync QdrantVectorStore
   d. pipeline = build_pipeline(vector_store)
   e. node_count = run_pipeline(documents, doc_id, tenant_id, vector_store)
   f. Update DocRecord: status="completed", page_count=len(docs),
      ingested_at=datetime.utcnow() (sync)
   g. On exception: update status="failed", error_msg=str(e)
      log with structlog including full traceback
      self.retry(exc=e)
   
   ⚠️ asyncio.run() pattern for calling async parsers from sync Celery tasks.
      Create a fresh event loop per task call. Document this prominently.

2. @celery_app.task(queue="ingest")
   def batch_ingest_folder_task(folder: str, tenant_id: str):
   - Glob *.pdf + *.docx in folder
   - For each file: sha256 → check MongoDB (sync) for existing hash+tenant_id
   - If new: insert DocRecord, apply_async ingest_document_task
   - Log: found N, skipped M duplicates, queued K

3. @celery_app.task(queue="default")
   def scheduled_batch_ingest():
   - Fetch all active tenants from MongoDB (sync)
   - For each tenant: dispatch batch_ingest_folder_task
   - Log count + timing

4. @celery_app.task(queue="default")
   def check_tenant_promotion():
   \"\"\"
   Auto-promote tenants to dedicated Qdrant shards when they exceed threshold.
   Scheduled daily at 03:30 UTC via Celery Beat.
   \"\"\"
   from qdrant_client import QdrantClient
   from src.models.db import Tenant
   
   PROMOTION_THRESHOLD = 20_000  # vectors
   
   client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
   tenants = Tenant.find(Tenant.is_active == True).to_list()  # sync
   
   for tenant in tenants:
     if tenant.tier == \"DEDICATED\":
       continue  # Already promoted
     
     # Count vectors for this tenant
     count_result = client.count(
       collection_name=settings.collection_name,
       count_filter=Filter(must=[
         FieldCondition(key=\"tenant_id\", match=MatchValue(value=str(tenant.id)))
       ])
     )
     
     if count_result.count >= PROMOTION_THRESHOLD:
       # Create dedicated shard key for tenant
       client.create_shard_key(
         collection_name=settings.collection_name,
         shard_key=str(tenant.id)
       )
       
       # Update tenant tier in MongoDB
       tenant.tier = \"DEDICATED\"
       tenant.save()  # sync
       
       log.info(\"tenant_promoted_to_dedicated_shard\",
                tenant_id=str(tenant.id),
                tenant_slug=tenant.slug,
                vector_count=count_result.count)

5. @celery_app.task(queue="default")
   def run_backup(full=False, mongodb=False, qdrant=False, 
                  documents=False, cleanup=False):
   \"\"\"
   Backup task for Celery Beat scheduling.
   See Section 15.5 for full BackupClient implementation.
   \"\"\"
   import asyncio
   from src.core.backup import BackupClient
   
   async def _run():
     client = BackupClient()
     if full or mongodb:
       await client.backup_mongodb()
     if full or qdrant:
       await client.backup_qdrant()
     if full or documents:
       await client.backup_documents()
     if cleanup:
       client.enforce_retention()
   
   asyncio.run(_run())
```

---

## Section 10 — Real-Time File Watcher

### [PROMPT] — Phase 6 — Watchdog Watcher

```
Write src/ingestion/watcher.py — file system watcher using watchdog.

Folder structure it watches:
  {WATCH_ROOT}/{tenant_slug}/inbox/      ← drop files here
  {WATCH_ROOT}/{tenant_slug}/processing/ ← moved here after pickup

TenantFolderWatcher:
  - PatternMatchingEventHandler, patterns=["*.pdf","*.docx"]
  - On file created/modified:
    a. sleep(0.5) — wait for write to complete
    b. Look up tenant by slug in MongoDB (sync — watchdog callbacks are sync)
    c. sha256 file → check MongoDB for duplicate
    d. Insert DocRecord(status="queued")
    e. ingest_document_task.apply_async(
         args=[file_path, doc_id, tenant_id],
         queue=f"ingest"
       )
    f. Move file to processing/ subfolder
    g. structlog: tenant_slug, filename, doc_id, action="queued"

__main__ block:
  - Discover all tenant inbox/ folders under WATCH_ROOT
  - Catch-up: process any files already in inbox/ at startup
  - Start Observer, loop until KeyboardInterrupt

MongoDB access in watchdog: use synchronous MongoClient (pymongo),
NOT motor. Watchdog events are not async-compatible.
Import get_settings() but create a separate sync pymongo connection.
```

---

## Section 11 — Query Engine & Hybrid Retrieval

### [PROMPT] — Phase 7 — LlamaIndex Query Engine

```
Write src/retrieval/engine.py — the hybrid retrieval + synthesis engine.

Module-level singletons (initialized once per API process):
  _llm_singleton = None
  _embed_singleton = None
  
  def get_llm_singleton():
    global _llm_singleton
    if _llm_singleton is None:
      _llm_singleton = get_llm()   # from providers
    return _llm_singleton

Settings.configure_llamaindex() — call at app startup:
  from llama_index.core import Settings as LISettings
  LISettings.llm = get_llm_singleton()
  LISettings.embed_model = get_embed_model_singleton()
  LISettings.chunk_size = settings.chunk_size
  LISettings.chunk_overlap = settings.chunk_overlap

build_query_engine(tenant_id: str, top_k: int = 8) -> RetrieverQueryEngine:
  
  # Provider check: use LlamaCloud index if configured
  if settings.index_provider == IndexProvider.LLAMACLOUD:
    return _build_llamacloud_query_engine(tenant_id, top_k)
  
  # Default: local Qdrant
  vector_store = get_vector_store(tenant_id)
  index = VectorStoreIndex.from_vector_store(vector_store)
  
  retriever = VectorIndexRetriever(
    index=index,
    similarity_top_k=top_k,
    vector_store_query_mode=VectorStoreQueryMode.HYBRID,  # dense+sparse
  )
  
  # Response synthesis — Gemma 4 via Ollama
  response_synthesizer = get_response_synthesizer(
    response_mode=ResponseMode.COMPACT,
    llm=get_llm_singleton(),
    streaming=False,
  )
  
  return RetrieverQueryEngine(
    retriever=retriever,
    response_synthesizer=response_synthesizer,
    node_postprocessors=[],   # add LLMRerank here in Phase E4
  )

[SWAP] _build_llamacloud_query_engine(tenant_id, top_k):
  # LlamaCloud managed index — requires LLAMA_CLOUD_API_KEY + INDEX_PROVIDER=llamacloud
  from llama_index.indices.managed.llama_cloud import LlamaCloudIndex
  index = LlamaCloudIndex(
    name=f"company_docs_{tenant_id}",
    api_key=settings.llama_cloud_api_key,
  )
  return index.as_query_engine(similarity_top_k=top_k)

QueryResult dataclass:
  answer: str
  source_nodes: list[SourceNodeInfo]  # text, score, filename, page, doc_id
  latency_ms: float
  provider_used: str  # "local_qdrant" | "llamacloud"

async def search(query: str, tenant_id: str, top_k: int = 8) -> QueryResult:
  # Check Valkey cache first
  cache_key = f"search:{tenant_id}:{hashlib.sha256(f'{query}{top_k}'.encode()).hexdigest()[:16]}"
  from src.core.valkey_client import get_valkey
  valkey = await get_valkey()
  cached = await valkey.get(cache_key)
  if cached:
    return QueryResult(**json.loads(cached))
  
  engine = build_query_engine(tenant_id, top_k)
  t0 = time.monotonic()
  response = engine.query(query)
  latency = (time.monotonic() - t0) * 1000
  
  result = QueryResult(
    answer=str(response),
    source_nodes=[...],   # extract from response.source_nodes
    latency_ms=latency,
    provider_used=settings.index_provider
  )
  
  # Cache for 5 minutes in Valkey
  await valkey.setex(cache_key, 300, json.dumps(result.model_dump()))
  return result
```

### [PROMPT] — Phase 7b — Summarizer

```
Write src/retrieval/summarizer.py — two summarization modes.

1. summarize_document(doc_id: str, tenant_id: str) -> str
   [SWAP] Check EXTRACT_PROVIDER:
     if llamaextract: use LlamaExtract cloud API with a SummarySchema
     else (default): use local LlamaIndex DocumentSummaryIndex

   Local path:
   a. Retrieve all Qdrant nodes for doc_id+tenant_id
      (MetadataFilter on both fields, limit=500)
   b. Build DocumentSummaryIndex from those nodes with local Ollama LLM
   c. summary_engine = index.as_query_engine(response_mode="tree_summarize")
   d. return str(summary_engine.query("Provide a comprehensive executive summary."))

2. summarize_topic(query: str, tenant_id: str, top_k: int = 20) -> str
   - Run search(query, tenant_id, top_k=20) to get diverse nodes
   - Synthesize a cross-document topic summary using Ollama
   - Useful for "summarize all HR policy documents" queries

3. classify_document(doc_id: str, tenant_id: str) -> str
   [SWAP] Check CLASSIFY_PROVIDER:
     if llamaclassify: use LlamaClassify cloud API
     else: prompt Gemma 4 with document summary to classify into preset categories
   Returns category string: "contract" | "policy" | "report" | "invoice" | "other"
```

---

## Section 12 — FastAPI REST API

### [PROMPT] — Phase 8 — All Endpoints

```
Write the complete FastAPI application — src/api/main.py and route modules.

App setup (main.py):
  @asynccontextmanager lifespan(app):
    # Startup
    await init_db()                          # MongoDB + Beanie
    await init_qdrant_connection()           # verify Qdrant reachable
    Settings.configure_llamaindex()          # set global LLM + embed model
    await pull_ollama_model_if_needed()      # check gemma4:e4b available
    log all active providers (parser, chunker, LLM, index)
    # Shutdown
    await close_db_connections()

Routes:

POST /auth/register          (no auth)
POST /auth/login             (no auth, rate limited: 5/min/IP)

POST /ingest/upload          (JWT required)
  - Accept: multipart/form-data, field "file" (PDF or DOCX, max 50MB)
  - Validate MIME type with python-magic (not just extension)
  - SHA-256 → check MongoDB for duplicate in this tenant
  - Save to UPLOAD_DIR/{tenant_id}/{doc_id}/{filename}
  - Insert DocRecord in MongoDB
  - dispatch ingest_document_task.apply_async()
  - Return {doc_id, status: "queued", filename}
  ⚠️ tenant_id from get_current_user() ONLY. Never from body.

GET  /ingest/status/{doc_id} (JWT)
  - Verify doc belongs to tenant (MongoDB lookup with tenant_id filter)
  - Return DocRecord + latest IngestionJob status
  - 404 if not found, 403 if wrong tenant

GET  /documents              (JWT)
  - Query DocRecord with tenant_id filter
  - Supports ?status=completed|failed|queued, ?page=1&limit=20
  - Return paginated list with Pydantic response model

DELETE /documents/{doc_id}   (JWT)
  - Verify ownership (tenant_id check in MongoDB)
  - Delete Qdrant points: client.delete(collection, points_selector=Filter(
      must=[FieldCondition("tenant_id"...), FieldCondition("doc_id"...)]
    ))
  - Delete DocRecord + IngestionJob from MongoDB
  - Return 204

POST /search                 (JWT)
  body: {query: str (5–500 chars), top_k: int = 8}
  - await search(query, tenant_id, top_k)  → QueryResult
  - Return answer + source_nodes + latency_ms + provider_used

POST /summarize/document/{doc_id}  (JWT)
  - Verify ownership
  - await summarize_document(doc_id, tenant_id)
  - Return {summary, doc_id, filename, generated_at}

POST /summarize/topic              (JWT)
  body: {query: str}
  - await summarize_topic(query, tenant_id)
  - Return {summary, query}

POST /classify/{doc_id}            (JWT)
  - await classify_document(doc_id, tenant_id)
  - Return {doc_id, category, provider_used}

GET  /health                       (no auth)
  - Check: Qdrant (collection info), Valkey (PING), MongoDB (ping command),
           Ollama (GET /api/tags), Unstructured (/healthcheck)
  - Return {status: "ok"|"degraded", services: {...}, active_providers: {...}}

Middleware stack (in order):
  1. RequestIDMiddleware (UUID4 per request, add to headers + structlog)
  2. TenantContextMiddleware (JWT decode + rate limiting)
  3. PrometheusMiddleware (metrics)
  4. CORSMiddleware (configurable origins)

Error handling:
  Global exception handler: HTTP 500 with sanitized message.
  Never expose MongoDB connection strings, file paths, or stack traces to client.
  Always log full error internally with structlog + request_id.
```

---

## Section 13 — LlamaCloud Upgrade Paths (Full Detail)

This section documents exactly how to activate each LlamaCloud service.
All require `LLAMA_CLOUD_API_KEY` to be set.

### [SWAP] Parse → LlamaParse v2

```bash
PARSER_PROVIDER=llamaparse
LLAMA_CLOUD_API_KEY=your_key_here
LLAMAPARSE_TIER=cost_effective  # fast | cost_effective | agentic | agentic_plus
```

```python
# Automatically used by get_parser() — no code changes needed
# LlamaParse v2 tiers:
# fast (1 credit/page): text only, no markdown
# cost_effective (3 credits/page): markdown output, tables  ← recommended default
# agentic (10 credits/page): complex layouts, images, charts
# agentic_plus (45 credits/page): maximum accuracy
```

### [SWAP] Split → LlamaSplit

```bash
SPLIT_PROVIDER=llamasplit
```

Activates `src/ingestion/splitter.py` — automatically splits concatenated PDFs
into logical documents before ingestion. Useful for invoice decks, contract batches.

### [SWAP] Extract → LlamaExtract

```bash
EXTRACT_PROVIDER=llamaextract
```

Replaces local Ollama extraction for structured data. Requires Pydantic schema.
Used by `summarize_document()` and any future structured data extraction endpoints.

### [SWAP] Classify → LlamaClassify

```bash
CLASSIFY_PROVIDER=llamaclassify
LLAMACLASSIFY_CATEGORIES=contract,policy,report,invoice,proposal,other
```

### [SWAP] Index → LlamaCloud Index

```bash
INDEX_PROVIDER=llamacloud
```

Replaces local Qdrant with LlamaCloud's managed RAG index.
`build_query_engine()` automatically uses `LlamaCloudIndex` when set.
**Warning:** Data leaves your infrastructure. Only use for non-sensitive documents.

### [SWAP] Agents → LlamaAgents

```bash
AGENT_PROVIDER=llamaagents
```

Enables LlamaCloud's hosted Workflows/Agents for multi-step document processing.
Local alternative: LlamaIndex Workflows (event-driven, async-first, FastAPI-compatible).

### LlamaCloud reference implementation

```python
# src/ingestion/parsers/llamaparse.py — full reference
from llama_parse import LlamaParse
import os

TIER_MAP = {
    "fast": {"premium_mode": False, "use_vendor_multimodal_model": False},
    "cost_effective": {"premium_mode": True, "use_vendor_multimodal_model": False},
    "agentic": {"premium_mode": True, "use_vendor_multimodal_model": True,
                "vendor_multimodal_model": "openai-gpt4o"},
    "agentic_plus": {"premium_mode": True, "use_vendor_multimodal_model": True,
                     "vendor_multimodal_model": "anthropic-claude-3-5-sonnet",
                     "take_screenshot": True},
}

class LlamaParseParser(BaseDocumentParser):
    def __init__(self):
        tier = os.getenv("LLAMAPARSE_TIER", "cost_effective")
        self.parser = LlamaParse(
            api_key=get_settings().llama_cloud_api_key,
            result_type="markdown",
            **TIER_MAP.get(tier, TIER_MAP["cost_effective"]),
            verbose=False,
        )
    
    async def parse(self, file_path, doc_id, tenant_id):
        docs = await self.parser.aload_data(file_path)
        for doc in docs:
            doc.metadata.update({
                "doc_id": doc_id, "tenant_id": tenant_id,
                "filename": Path(file_path).name, "parser": "llamaparse"
            })
        return docs
```

---

## Section 14 — Evaluation & Quality

### [PROMPT] — Phase 9 — RAGAS Eval with Local Gemma 4

```
Write tests/eval/rag_eval.py — RAGAS evaluation using local Ollama (NOT OpenAI).

Requirements:
1. Load 20 test documents (use a small corpus of company-style PDFs/DOCX)
2. Generate synthetic Q&A:
   from llama_index.core.evaluation import DatasetGenerator
   generator = DatasetGenerator.from_documents(
     documents, llm=get_llm_singleton(), num_questions_per_chunk=2
   )
   eval_questions = generator.generate_questions_from_nodes()

3. For each question, call the /search endpoint via httpx:
   async with httpx.AsyncClient() as client:
     resp = await client.post("http://localhost:8001/search",
       json={"query": q, "top_k": 8},
       headers={"Authorization": f"Bearer {TEST_JWT}"}
     )

4. Build RAGAS dataset:
   from ragas import EvaluationDataset, SingleTurnSample
   samples = [SingleTurnSample(
     user_input=q, response=result.answer,
     retrieved_contexts=[n.text for n in result.source_nodes]
   ) for q, result in zip(questions, results)]

5. Evaluate with LOCAL Ollama judge (not OpenAI):
   from ragas.llms import LangchainLLMWrapper
   from langchain_ollama import ChatOllama
   judge_llm = LangchainLLMWrapper(ChatOllama(model="gemma4:e4b"))
   
   from ragas.embeddings import LangchainEmbeddingsWrapper
   from langchain_huggingface import HuggingFaceEmbeddings
   judge_emb = LangchainEmbeddingsWrapper(
     HuggingFaceEmbeddings(model_name="BAAI/bge-large-en-v1.5")
   )
   
   from ragas.metrics import (
     context_precision, context_recall, faithfulness, answer_relevancy
   )
   results = evaluate(
     dataset, metrics=[context_precision, context_recall,
                       faithfulness, answer_relevancy],
     llm=judge_llm, embeddings=judge_emb
   )

6. Save to tests/eval/results_{timestamp}.json
7. pytest fixture: fail if faithfulness < 0.70 or context_recall < 0.65
   ⚠️ Gemma 4 as judge is slower than GPT-4. Set timeout=300s per eval call.
```

---

## Section 15 — Observability & Hardening

### [PROMPT] — Phase 10 — Production Observability

```
Add production observability and hardening.

1. Arize Phoenix tracing (src/core/tracing.py):
   from openinference.instrumentation.llama_index import LlamaIndexInstrumentor
   from opentelemetry.sdk.trace import TracerProvider
   from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
   
   provider = TracerProvider()
   exporter = OTLPSpanExporter(endpoint="http://phoenix:4317", insecure=True)
   provider.add_span_processor(BatchSpanProcessor(exporter))
   trace.set_tracer_provider(provider)
   LlamaIndexInstrumentor().instrument()
   # Every Qdrant query + Ollama call is now traced in Phoenix

2. Prometheus metrics (src/core/metrics.py):
   rag_search_latency = Histogram("rag_search_latency_seconds",
     "Search latency", ["tenant_id", "provider"])
   rag_ingest_latency = Histogram("rag_ingest_latency_seconds",
     "Ingestion latency", ["file_type", "parser"])
   rag_documents_total = Counter("rag_documents_total",
     "Documents ingested", ["tenant_id", "status"])
   rag_nodes_retrieved = Histogram("rag_nodes_retrieved",
     "Nodes returned per search", ["tenant_id"])
   rag_parse_provider = Gauge("rag_active_parser",
     "Active parser provider (label)", ["provider"])

3. structlog configuration:
   Production: JSON renderer, fields: timestamp, level, event, tenant_id,
               request_id, service, environment, git_sha, provider
   Development: ConsoleRenderer with colors
   Detect via ENVIRONMENT=production|development

4. Valkey-backed rate limiting via slowapi:
   from slowapi import Limiter
   from slowapi.util import get_remote_address
   
   limiter = Limiter(
     key_func=get_remote_address,
     storage_uri=settings.valkey_url.replace("valkey://", "valkey+async://")
   )
   # ⚠️ slowapi may need valkey:// URI scheme support — test and document workaround

5. File upload security:
   - python-magic MIME validation (not just extension)
   - Max 50MB enforced in FastAPI settings
   - Store outside web root (UPLOAD_DIR must not be under static file serving)
   - Never execute uploaded files

6. Qdrant resilience (tenacity):
   @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10),
          reraise=True)
   async def qdrant_search_with_retry(client, ...):
```

---

## Section 15.5 — S3/MinIO Production Backup Strategy

Production-grade backup system with S3-compatible storage support.

### [PROMPT] — Phase 11b — S3-Compatible Backup System

```
Write the production-grade backup system with S3/MinIO support.

1. src/core/backup.py — S3 Backup Client
   
   import boto3
   from botocore.config import Config
   from datetime import datetime, timedelta
   import subprocess
   import gzip
   import shutil
   import os
   
   class BackupClient:
     def __init__(self):
       settings = get_settings()
       self.destination = settings.backup_destination
       
       if self.destination == "s3":
         # Support both AWS S3 and MinIO
         self.s3 = boto3.client(
           's3',
           endpoint_url=settings.backup_s3_endpoint or None,  # None for AWS
           aws_access_key_id=settings.aws_access_key_id,
           aws_secret_access_key=settings.aws_secret_access_key,
           region_name=settings.aws_region or 'us-east-1',
           config=Config(signature_version='s3v4')
         )
         self.bucket = settings.backup_s3_bucket
         log.info("backup_client_initialized", destination="s3", 
                  bucket=self.bucket, endpoint=settings.backup_s3_endpoint)
       else:
         self.s3 = None
         self.local_path = "/backups"  # Mounted volume
       
       self.retention_days = settings.backup_retention_days
     
     async def backup_mongodb(self) -> str:
       """Run mongodump, compress, upload to S3 or local."""
       timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
       local_dump = f"/tmp/mongo_backup_{timestamp}"
       
       # Run mongodump
       subprocess.run([
         "mongodump",
         f"--uri={settings.mongodb_url}",
         f"--out={local_dump}"
       ], check=True)
       log.info("mongodump_complete", path=local_dump)
       
       # Compress to tar.gz
       archive_path = f"{local_dump}.tar.gz"
       shutil.make_archive(local_dump, 'gztar', local_dump)
       archive_size = os.path.getsize(archive_path)
       
       if self.destination == "s3":
         # Upload to S3/MinIO
         s3_key = f"mongodb/{timestamp}/dump.tar.gz"
         self.s3.upload_file(archive_path, self.bucket, s3_key)
         location = f"s3://{self.bucket}/{s3_key}"
       else:
         # Copy to local backup volume
         dest_dir = f"{self.local_path}/mongodb/{timestamp}"
         os.makedirs(dest_dir, exist_ok=True)
         shutil.copy(archive_path, f"{dest_dir}/dump.tar.gz")
         location = f"{dest_dir}/dump.tar.gz"
       
       # Cleanup temp files
       shutil.rmtree(local_dump)
       os.remove(archive_path)
       
       log.info("mongodb_backup_complete", location=location, size_mb=archive_size/1024/1024)
       return location
     
     async def backup_qdrant(self) -> str:
       """Create Qdrant snapshot, download, upload to destination."""
       timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
       
       # Trigger Qdrant snapshot via API
       async with httpx.AsyncClient(timeout=300) as client:
         resp = await client.post(
           f"http://{settings.qdrant_host}:{settings.qdrant_port}"
           f"/collections/{settings.collection_name}/snapshots"
         )
         resp.raise_for_status()
         snapshot_name = resp.json()["result"]["name"]
       
       log.info("qdrant_snapshot_created", snapshot=snapshot_name)
       
       # Download snapshot file
       local_path = f"/tmp/qdrant_{timestamp}.snapshot"
       async with httpx.AsyncClient(timeout=600) as client:
         resp = await client.get(
           f"http://{settings.qdrant_host}:{settings.qdrant_port}"
           f"/collections/{settings.collection_name}/snapshots/{snapshot_name}"
         )
         resp.raise_for_status()
         with open(local_path, 'wb') as f:
           f.write(resp.content)
       
       snapshot_size = os.path.getsize(local_path)
       
       if self.destination == "s3":
         s3_key = f"qdrant/{timestamp}/{snapshot_name}"
         self.s3.upload_file(local_path, self.bucket, s3_key)
         location = f"s3://{self.bucket}/{s3_key}"
       else:
         dest_dir = f"{self.local_path}/qdrant/{timestamp}"
         os.makedirs(dest_dir, exist_ok=True)
         shutil.copy(local_path, f"{dest_dir}/{snapshot_name}")
         location = f"{dest_dir}/{snapshot_name}"
       
       os.remove(local_path)
       log.info("qdrant_backup_complete", location=location, size_mb=snapshot_size/1024/1024)
       return location
     
     async def backup_documents(self) -> str:
       """Sync document uploads to backup destination."""
       timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
       
       if self.destination == "s3":
         # Use AWS CLI for efficient sync
         s3_prefix = f"s3://{self.bucket}/documents/{timestamp}/"
         cmd = ["aws", "s3", "sync", settings.upload_dir, s3_prefix]
         if settings.backup_s3_endpoint:
           cmd.extend(["--endpoint-url", settings.backup_s3_endpoint])
         subprocess.run(cmd, check=True)
         location = s3_prefix
       else:
         dest_dir = f"{self.local_path}/documents/{timestamp}"
         shutil.copytree(settings.upload_dir, dest_dir)
         location = dest_dir
       
       log.info("documents_backup_complete", location=location)
       return location
     
     def enforce_retention(self):
       """Delete backups older than retention_days."""
       cutoff = datetime.utcnow() - timedelta(days=self.retention_days)
       deleted_count = 0
       
       if self.destination == "s3":
         for prefix in ["mongodb/", "qdrant/", "documents/"]:
           paginator = self.s3.get_paginator('list_objects_v2')
           for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
             for obj in page.get('Contents', []):
               if obj['LastModified'].replace(tzinfo=None) < cutoff:
                 self.s3.delete_object(Bucket=self.bucket, Key=obj['Key'])
                 deleted_count += 1
       else:
         # Local cleanup
         for subdir in ["mongodb", "qdrant", "documents"]:
           base_path = f"{self.local_path}/{subdir}"
           if os.path.exists(base_path):
             for backup_dir in os.listdir(base_path):
               dir_path = f"{base_path}/{backup_dir}"
               mtime = datetime.fromtimestamp(os.path.getmtime(dir_path))
               if mtime < cutoff:
                 shutil.rmtree(dir_path)
                 deleted_count += 1
       
       log.info("backup_retention_enforced", deleted=deleted_count, 
                retention_days=self.retention_days)

2. scripts/backup.py — Backup CLI Script
   
   #!/usr/bin/env python
   """
   Production backup script. Run via cron or Celery Beat.
   
   Usage:
     python scripts/backup.py --full          # Full backup (all components)
     python scripts/backup.py --mongodb       # MongoDB only
     python scripts/backup.py --qdrant        # Qdrant only
     python scripts/backup.py --documents     # Document files only
     python scripts/backup.py --cleanup       # Enforce retention policy
   """
   import asyncio
   import argparse
   from src.core.backup import BackupClient
   
   async def main():
     parser = argparse.ArgumentParser(description="Company Doc Finder Backup")
     parser.add_argument('--full', action='store_true', help="Full backup")
     parser.add_argument('--mongodb', action='store_true', help="MongoDB only")
     parser.add_argument('--qdrant', action='store_true', help="Qdrant only")
     parser.add_argument('--documents', action='store_true', help="Documents only")
     parser.add_argument('--cleanup', action='store_true', help="Enforce retention")
     args = parser.parse_args()
     
     client = BackupClient()
     results = []
     
     if args.full or args.mongodb:
       results.append(("mongodb", await client.backup_mongodb()))
     if args.full or args.qdrant:
       results.append(("qdrant", await client.backup_qdrant()))
     if args.full or args.documents:
       results.append(("documents", await client.backup_documents()))
     if args.cleanup:
       client.enforce_retention()
     
     for component, location in results:
       print(f"{component}: {location}")
   
   if __name__ == "__main__":
     asyncio.run(main())

3. scripts/restore.py — Point-in-Time Restore Script
   
   #!/usr/bin/env python
   """
   Restore from backup. Use with caution — overwrites current data.
   
   Usage:
     python scripts/restore.py --mongodb 20260412_030000
     python scripts/restore.py --qdrant 20260412_030000
     python scripts/restore.py --list  # List available backups
   """
   # Implementation: download from S3, run mongorestore, 
   # POST to Qdrant /collections/{collection}/snapshots/recover

4. Add to Celery Beat schedule in src/ingestion/tasks.py:
   
   @celery_app.task
   def run_backup(full=False, mongodb=False, qdrant=False, 
                  documents=False, cleanup=False):
     """Backup task for Celery Beat scheduling."""
     import asyncio
     from src.core.backup import BackupClient
     
     async def _run():
       client = BackupClient()
       if full or mongodb:
         await client.backup_mongodb()
       if full or qdrant:
         await client.backup_qdrant()
       if full or documents:
         await client.backup_documents()
       if cleanup:
         client.enforce_retention()
     
     asyncio.run(_run())
   
   # Add to celery_app.config_from_object beat_schedule:
   "nightly-full-backup": {
     "task": "src.ingestion.tasks.run_backup",
     "schedule": crontab(hour=3, minute=0),  # 03:00 UTC daily
     "kwargs": {"full": True}
   },
   "hourly-mongodb-backup": {
     "task": "src.ingestion.tasks.run_backup", 
     "schedule": crontab(minute=0),  # Every hour, on the hour
     "kwargs": {"mongodb": True}
   },
   "weekly-cleanup": {
     "task": "src.ingestion.tasks.run_backup",
     "schedule": crontab(day_of_week=0, hour=4, minute=0),  # Sunday 04:00
     "kwargs": {"cleanup": True}
   },
```

### [CHECK] Phase 11b complete when:
- [ ] `scripts/backup.py --full` creates MongoDB dump + Qdrant snapshot
- [ ] Backups appear in MinIO console at http://localhost:9001
- [ ] `scripts/backup.py --cleanup` deletes backups older than retention days
- [ ] Celery Beat logs show nightly backup task execution
- [ ] `scripts/restore.py --list` shows available backup timestamps
- [ ] Test restore to empty MongoDB/Qdrant succeeds

---

## Section 16 — Emergent Capabilities

### E1 — Chat Memory (Conversational Search)

```bash
# Add to requirements:
pip install llama-index-memory-buffer
```

```python
# POST /chat/{session_id}
# Store ChatMemoryBuffer per (tenant_id, user_id, session_id) in Valkey
# TTL: 2 hours per session
from llama_index.core.memory import ChatMemoryBuffer
memory = ChatMemoryBuffer.from_defaults(token_limit=4096)
chat_engine = index.as_chat_engine(
  chat_mode="condense_plus_context", memory=memory, llm=get_llm_singleton()
)
```

### E2 — Document Classification on Ingest

Automatically classify every document after parsing. Stored in DocRecord.
Used to route documents to specialized query engines by category.

### E3 — Re-ranking (LLMRerank)

```python
# Add to build_query_engine() as node postprocessor
from llama_index.core.postprocessor import LLMRerank
node_postprocessors=[LLMRerank(top_n=4, llm=get_llm_singleton())]
# Improves precision at cost of ~2s latency
# Enable via ENABLE_RERANK=true env var
```

### E4 — LlamaSplit Integration for Bundled PDFs

```python
# When SPLIT_PROVIDER=llamasplit:
# Before ingestion, detect multi-document PDFs and split them
from llama_index.cloud import LlamaSplitClient
splitter = LlamaSplitClient(api_key=settings.llama_cloud_api_key)
segments = splitter.split(file_path, categories=["invoice","contract","report"])
# Ingest each segment as a separate document
```

### E5 — Auto Tenant Promotion (Qdrant)

```python
# scripts/promote_tenant.py
# Run: python scripts/promote_tenant.py --tenant-slug acme
# When tenant exceeds 20K vectors:
client.create_shard_key(collection_name, shard_key=tenant_id_str)
# Zero-downtime transfer via Qdrant shard transfer API
```

### E6 — Embedding Model Refresh

When switching from `bge-large-en-v1.5` to a better model:
Use Qdrant v1.16 conditional_update API to re-embed incrementally.
Run as a low-priority Celery Beat task.

---

## Section 17 — Full Technology Reference

### Dependency versions

```toml
[tool.poetry.dependencies]
python = "^3.11"

# LlamaIndex
llama-index = "^0.12"
llama-index-embeddings-huggingface = "^0.5"
llama-index-llms-ollama = "^0.5"
llama-index-vector-stores-qdrant = "^0.6"
llama-index-node-parser-semantic = "^0.1"

# LlamaCloud (optional — only needed for cloud providers)
llama-parse = "^0.5"

# API
fastapi = {extras=["standard"], version="^0.115"}
pydantic-settings = "^2.3"
python-jose = {extras=["cryptography"], version="^3.3"}
passlib = {extras=["bcrypt"], version="^1.7"}

# Task queue — VALKEY (not redis)
celery = {extras=["valkey"], version="^5.4"}
valkey = "^6.0"           # valkey-py: BSD-licensed Redis fork

# Database — MongoDB
motor = "^3.4"
beanie = "^1.26"
pymongo = "^4.8"          # for sync access in watchdog/Celery

# Document parsing
unstructured = {extras=["pdf","docx"], version="^0.15"}
python-magic = "^0.4"
liteparse = "^0.1"        # LlamaIndex local-first parser

# Ingestion utilities
watchdog = "^4.0"
pymupdf = "^1.24"         # fallback PDF reader

# Evaluation
ragas = "^0.2"
langchain-ollama = "^0.2"
langchain-huggingface = "^0.1"

# Observability
structlog = "^25.0"
openinference-instrumentation-llama-index = "^3.0"
opentelemetry-exporter-otlp-proto-grpc = "^1.25"
prometheus-fastapi-instrumentator = "^7.0"

# Resilience
tenacity = "^8.3"
httpx = "^0.27"
slowapi = "^0.1"
```

### Service port map

| Service | Port | UI |
|---------|------|----|
| FastAPI | 8001 | http://localhost:8001/docs |
| Qdrant | 6333 | http://localhost:6333/dashboard |
| Ollama | 11434 | http://localhost:11434 |
| Valkey | 6379 | — (CLI: `valkey-cli`) |
| MongoDB | 27017 | MongoDB Compass |
| Unstructured | 8000 | http://localhost:8000/healthcheck |
| Flower | 5555 | http://localhost:5555 |
| Phoenix | 6006 | http://localhost:6006 |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3000 | http://localhost:3000 |
| Unstructured LB | 8000 | http://localhost:8000/healthcheck |
| ClamAV | 3310 | — (clamdtop for monitoring) |
| MinIO API | 9000 | — |
| MinIO Console | 9001 | http://localhost:9001 |
| Embed Worker | 50051 | — (gRPC) |

### Provider env var quick reference

```bash
# Parser
PARSER_PROVIDER=unstructured   # default: self-hosted Unstructured.io
PARSER_PROVIDER=liteparse      # local-first, fast
PARSER_PROVIDER=llamaparse     # LlamaCloud (needs LLAMA_CLOUD_API_KEY)
UNSTRUCTURED_STRATEGY=fast     # fast | hi_res
LLAMAPARSE_TIER=cost_effective # fast | cost_effective | agentic | agentic_plus

# Chunking
CHUNKING_STRATEGY=sentence     # default: SentenceSplitter 512t
CHUNKING_STRATEGY=semantic     # SemanticSplitterNodeParser (expensive)

# LLM
LLM_PROVIDER=ollama            # default: Gemma 4 local
OLLAMA_MODEL=gemma4:e4b        # e2b | e4b | 26b | 31b
LLM_PROVIDER=llamacloud        # LlamaCloud hosted LLM

# Index
INDEX_PROVIDER=local_qdrant    # default: self-hosted Qdrant
INDEX_PROVIDER=llamacloud      # LlamaCloud managed index

# Extra providers
EXTRACT_PROVIDER=local         # default
EXTRACT_PROVIDER=llamaextract  # LlamaCloud structured extraction
SPLIT_PROVIDER=local           # default
SPLIT_PROVIDER=llamasplit      # LlamaCloud PDF splitting
CLASSIFY_PROVIDER=local        # default
CLASSIFY_PROVIDER=llamaclassify# LlamaCloud classification
AGENT_PROVIDER=local           # default: local Workflows
AGENT_PROVIDER=llamaagents     # LlamaCloud Agents

# Required for ANY LlamaCloud provider
LLAMA_CLOUD_API_KEY=llx-...
```

### Common pitfalls

| Pitfall | Cause | Fix |
|---------|-------|-----|
| `import redis` fails | Used redis-py instead of valkey-py | `from valkey import Valkey` |
| Celery can't connect | Broker URL uses `redis://` | Change to `valkey://` |
| Worker OOM | Embed model reloaded per task | Module-level singleton in worker |
| Tenant data leak | Missing Qdrant filter | Always use `get_vector_store(tenant_id)` |
| Unstructured timeout | Default strategy is hi_res | Set `UNSTRUCTURED_STRATEGY=fast` |
| RAGAS uses OpenAI | Default judge model | Override with `LangchainLLMWrapper(ChatOllama(...))` |
| Gemma 4 not found | Ollama v<0.20.0 | `ollama --version` → update if needed |
| Semantic chunking OOM | Embed model loaded twice | Reuse module-level singleton |
| asyncio in watchdog | Watchdog callbacks are sync | Use `asyncio.run()` or sync pymongo |
| MongoDB not async | Using pymongo in FastAPI | Use motor + beanie for async routes |
| ClamAV scan timeout | Large files, slow disk | Increase timeout in pyclamd config |
| ClamAV not ready | Definitions still downloading | Wait 5-10 min after container start |
| S3 backup fails | Wrong endpoint/credentials | Test: `aws s3 ls --endpoint-url` |
| MinIO not accessible | Port 9000 conflict | Change ports in docker-compose |
| Unstructured LB 502 | All parsing containers down | Check `docker compose logs unstructured-*` |
| PDF misclassified | Edge case in classifier | Set `ENABLE_PDF_CLASSIFICATION=false` |

---

## Phase Build Order

```
Phase 0  → Docker Compose + project scaffold
Phase 1  → Config + MongoDB models + Valkey client
Phase 2  → JWT auth + tenant middleware
Phase 3  → Provider factory (Section 3) ← build this before parsers
Phase 4a → Parser abstraction + Unstructured + LiteParse
Phase 4b → IngestionPipeline (swappable chunker)
Phase 4c → PDF classification + MIME-based routing (Section 8.5)
Phase 4d → ClamAV virus scanning (Section 8.6) [optional]
Phase 5  → Qdrant bootstrap (scripts/init_qdrant.py)
Phase 6  → Celery tasks (Valkey broker)
Phase 7  → File watcher
Phase 8  → Query engine + summarizer
Phase 9  → FastAPI endpoints
Phase 10 → RAGAS evaluation
Phase 11 → Observability + hardening
Phase 11b → S3/MinIO backup system (Section 15.5)
E1–E6   → Emergent capabilities
```

---

*Generated: April 2026 · Stack: LlamaIndex 0.12, Qdrant 1.16, Gemma 4 (Ollama 0.20+),*  
*Valkey 8 (valkey-py 6), MongoDB 8 (Motor 3, Beanie 1.26), Unstructured 0.15, LiteParse 0.1*
