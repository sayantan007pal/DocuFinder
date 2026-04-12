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
- **Recursive 512-token splitting ranked #1** in Vecta's Feb 2026 benchmark at **69% accuracy** vs SentenceSplitter at 64% vs Semantic at 54%
- `SentenceSplitter` at 512 tokens / 10–15% overlap remains a solid baseline (per NVIDIA NeMo Retriever benchmarks, Chroma research)
- Semantic chunking improves recall by 2–9% but requires embedding every sentence at parse time (expensive at 100K docs)
- **Decision:** Use `RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=50)` as **default** (Vecta 2026 winner). Expose `SentenceSplitter` via `CHUNKING_STRATEGY=sentence` and `SemanticSplitterNodeParser` via `CHUNKING_STRATEGY=semantic` as opt-in alternatives.

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

| LlamaCloud Service | Self-hosted Equivalent | Swap env var | Details |
|-------------------|----------------------|--------------|---------|
| `LlamaParse` — cloud OCR parsing | Unstructured.io + LiteParse | `PARSER_PROVIDER` | Tiers: fast/cost_effective/agentic/agentic_plus |
| `LiteParse` — local fast parse | Already local | built-in | ~6s/doc for text-dense PDFs |
| `LlamaExtract` — structured extraction | Custom Pydantic + Ollama extraction | `EXTRACT_PROVIDER` | Schema-based data extraction |
| `LlamaSplit` — split bundled PDFs | Custom page range detection | `SPLIT_PROVIDER` | Split invoice decks, contract batches |
| `LlamaClassify` — doc classification | Custom Ollama classifier | `CLASSIFY_PROVIDER` | Categories configurable via env var |
| `LlamaIndex Cloud Index` — managed RAG index | Local Qdrant + LlamaIndex | `INDEX_PROVIDER` | ⚠️ Data leaves infrastructure |
| `LlamaAgents` — deployed agents | Local LlamaIndex Workflows | `AGENT_PROVIDER` | Multi-step doc processing |
| `LlamaSheets` — table/spreadsheet extraction | PyMuPDF + Unstructured tables | `SHEETS_PROVIDER` | See Section 13.5 for full impl |

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
    RECURSIVE = "recursive"         # default: RecursiveCharacterTextSplitter 512t (Vecta 2026 winner at 69%)
    SENTENCE = "sentence"           # SentenceSplitter 512t (fallback option)
    SEMANTIC = "semantic"           # SemanticSplitterNodeParser (expensive, 2x memory)

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

class SheetsProvider(str, Enum):
    LOCAL = "local"                 # PyMuPDF + Unstructured table extraction
    LLAMASHEETS = "llamasheets"     # LlamaCloud LlamaSheets API
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
   - LangchainNodeParser(RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=50))
     if CHUNKING_STRATEGY=recursive (default) — Vecta 2026 benchmark winner at 69%
   - SentenceSplitter(chunk_size=512, chunk_overlap=50) if CHUNKING_STRATEGY=sentence
   - SemanticSplitterNodeParser(embed_model=get_embed_model(),
       breakpoint_percentile_threshold=90) if CHUNKING_STRATEGY=semantic
   Note: RecursiveCharacterTextSplitter uses LangChain via LangchainNodeParser wrapper.
         SemanticSplitterNodeParser needs the embed model, load lazily.
   Import: from langchain_text_splitters import RecursiveCharacterTextSplitter
           from llama_index.core.node_parser import LangchainNodeParser

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

6. get_sheet_extractor(provider: SheetsProvider | None = None) -> BaseSheetExtractor
   Returns:
   - LocalSheetExtractor() if SHEETS_PROVIDER=local (default)
     Uses PyMuPDF page.find_tables() for PDF, python-docx for DOCX
   - LlamaSheetsExtractor() if SHEETS_PROVIDER=llamasheets
     (requires LLAMA_CLOUD_API_KEY, raises ConfigError if missing)

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
  CHUNKING_STRATEGY=recursive             # default: RecursiveCharacterTextSplitter (Vecta 2026 winner at 69%)
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
  
  # === PER-TYPE PARSER OVERRIDES (optional — override ROUTING_TABLE defaults) ===
  # PARSER_TEXT_DENSE=liteparse         # Override for text-dense PDFs (default: liteparse)
  # PARSER_SCANNED=unstructured         # Override for scanned PDFs (default: unstructured)
  # PARSER_COMPLEX=llamaparse           # Override for complex layouts (default: unstructured)
  # PARSER_MIXED=unstructured           # Override for mixed content (default: unstructured)
  # PARSER_DOCX=unstructured            # Override for DOCX files (default: unstructured)

  # === TABLE/SPREADSHEET EXTRACTION (Section 13.5) ===
  SHEETS_PROVIDER=local                 # local | llamasheets
  # LlamaSheets cloud requires LLAMA_CLOUD_API_KEY to be set

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
  CHUNKING_STRATEGY=recursive             # default: RecursiveCharacterTextSplitter (Vecta 2026 winner 69%)
  # CHUNKING_STRATEGY=sentence            # alternative: SentenceSplitter 512t
  # CHUNKING_STRATEGY=semantic            # optional: enable with sufficient RAM (expensive)

  # === BACKUP - S3/MinIO (Section 15.5) ===
  BACKUP_DESTINATION=s3                 # local | s3
  BACKUP_S3_BUCKET=company-docs-backup
  BACKUP_S3_ENDPOINT=http://minio:9000  # Omit for AWS S3
  AWS_ACCESS_KEY_ID=minioadmin
  AWS_SECRET_ACCESS_KEY=minioadmin123
  AWS_REGION=us-east-1
  BACKUP_RETENTION_DAYS=30

  # === MinIO (self-hosted S3 alternative) ===
  # API:    http://127.0.0.1:9000 or http://192.168.0.176:9000
  # WebUI:  http://127.0.0.1:9001 or http://192.168.0.176:9001
  MINIO_ROOT_USER=minioadmin
  MINIO_ROOT_PASSWORD=minioadmin123

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
   
   **Per-type env var overrides** (optional — override ROUTING_TABLE defaults):
   ```bash
   PARSER_TEXT_DENSE=liteparse      # Override for text-dense PDFs
   PARSER_SCANNED=unstructured      # Override for scanned PDFs
   PARSER_COMPLEX=llamaparse        # Override for complex layouts (tables/charts)
   PARSER_MIXED=unstructured        # Override for mixed content
   PARSER_DOCX=unstructured         # Override for DOCX files
   ```
   
   @dataclass
   class ParserConfig:
     provider: ParserProvider
     strategy: str  # "fast" | "hi_res"
     ocr_enabled: bool
     priority: int  # 1=high, 3=low
     llamaparse_tier: str | None = None  # fast|cost_effective|agentic|agentic_plus
   
   # Default routing table — overridden by PARSER_* env vars if set
   ROUTING_TABLE = {
     # (mime_type, pdf_type) -> ParserConfig
     # TEXT_DENSE: fast extraction, no OCR needed
     ("application/pdf", PDFType.TEXT_DENSE): 
       ParserConfig(ParserProvider.LITEPARSE, "fast", False, 1),
     # SCANNED: requires OCR with hi_res for accuracy
     ("application/pdf", PDFType.SCANNED): 
       ParserConfig(ParserProvider.UNSTRUCTURED, "hi_res", True, 2,
                    llamaparse_tier="agentic"),  # If using LlamaParse: 10 credits/page
     # COMPLEX_LAYOUT: tables & charts need hi_res
     ("application/pdf", PDFType.COMPLEX_LAYOUT): 
       ParserConfig(ParserProvider.UNSTRUCTURED, "hi_res", False, 2,
                    llamaparse_tier="cost_effective"),  # If using LlamaParse: 3 credits/page
     # MIXED: balance speed and OCR capability
     ("application/pdf", PDFType.MIXED): 
       ParserConfig(ParserProvider.UNSTRUCTURED, "fast", True, 2,
                    llamaparse_tier="cost_effective"),
     # DOCX: always fast, no OCR
     ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", None):
       ParserConfig(ParserProvider.UNSTRUCTURED, "fast", False, 1),
   }
   
   def get_parser_override(pdf_type: PDFType | None) -> ParserProvider | None:
     """Check for per-type env var override."""
     overrides = {
       PDFType.TEXT_DENSE: settings.parser_text_dense,
       PDFType.SCANNED: settings.parser_scanned,
       PDFType.COMPLEX_LAYOUT: settings.parser_complex,
       PDFType.MIXED: settings.parser_mixed,
     }
     return overrides.get(pdf_type) if pdf_type else settings.parser_docx
   
   def route_to_parser(file_path: str, mime_type: str) -> ParserConfig:
     pdf_type = None
     if mime_type == "application/pdf":
       pdf_type = classify_pdf(file_path)
       log.info("pdf_classified", file=file_path, type=pdf_type)
     
     # Check for per-type env var override first
     override_provider = get_parser_override(pdf_type)
     if override_provider:
       log.info("parser_override_applied", type=pdf_type, provider=override_provider)
       # Get base config and replace provider
       key = (mime_type, pdf_type)
       base_config = ROUTING_TABLE.get(key, 
         ParserConfig(ParserProvider.UNSTRUCTURED, "fast", False, 3))
       return ParserConfig(
         provider=override_provider,
         strategy="hi_res" if override_provider == ParserProvider.LLAMAPARSE else base_config.strategy,
         ocr_enabled=base_config.ocr_enabled,
         priority=1,
         llamaparse_tier=base_config.llamaparse_tier
       )
     
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

## Section 13.5 — LlamaSheets Implementation (Table/Spreadsheet Extraction)

Full implementation for extracting tables from PDFs and DOCX files.
Self-hosted default via PyMuPDF + Unstructured. LlamaCloud swap via `SHEETS_PROVIDER=llamasheets`.

### [PROMPT] — Phase 9a — Sheet Extractor Abstraction

```
Write the table/spreadsheet extraction abstraction layer.

1. src/extraction/sheets.py — Base Abstraction
   
   from abc import ABC, abstractmethod
   from dataclasses import dataclass, field
   from datetime import datetime
   from enum import Enum
   
   class TableConfidence(str, Enum):
     HIGH = "high"        # >90% structured, clear headers
     MEDIUM = "medium"    # 70-90% structured
     LOW = "low"          # <70%, may need manual review
   
   @dataclass
   class ExtractedTable:
     \"\"\"Represents a single extracted table from a document.\"\"\"
     page_number: int
     table_index: int          # Multiple tables per page (0-indexed)
     headers: list[str]
     rows: list[list[str]]     # Each row is a list of cell values
     row_count: int = field(init=False)
     column_count: int = field(init=False)
     bbox: tuple[float, float, float, float] | None = None  # x0, y0, x1, y1
     confidence: TableConfidence = TableConfidence.MEDIUM
     source_parser: str = "unknown"
     extracted_at: datetime = field(default_factory=datetime.utcnow)
     
     def __post_init__(self):
       self.row_count = len(self.rows)
       self.column_count = len(self.headers) if self.headers else (
         len(self.rows[0]) if self.rows else 0
       )
     
     def to_csv(self) -> str:
       \"\"\"Export table as CSV string.\"\"\"
       import csv
       import io
       output = io.StringIO()
       writer = csv.writer(output)
       if self.headers:
         writer.writerow(self.headers)
       writer.writerows(self.rows)
       return output.getvalue()
     
     def to_markdown(self) -> str:
       \"\"\"Export table as Markdown.\"\"\"
       if not self.headers and not self.rows:
         return ""
       lines = []
       if self.headers:
         lines.append("| " + " | ".join(self.headers) + " |")
         lines.append("|" + "|".join(["---"] * len(self.headers)) + "|")
       for row in self.rows:
         lines.append("| " + " | ".join(str(c) for c in row) + " |")
       return "\n".join(lines)
     
     def to_dict(self) -> dict:
       \"\"\"Export as JSON-serializable dict.\"\"\"
       return {
         "page_number": self.page_number,
         "table_index": self.table_index,
         "headers": self.headers,
         "rows": self.rows,
         "row_count": self.row_count,
         "column_count": self.column_count,
         "confidence": self.confidence.value,
         "source_parser": self.source_parser,
       }
   
   @dataclass
   class ExtractionResult:
     \"\"\"Result of table extraction from a document.\"\"\"
     doc_id: str
     tenant_id: str
     filename: str
     tables: list[ExtractedTable]
     total_tables: int = field(init=False)
     pages_with_tables: list[int] = field(default_factory=list)
     extraction_time_ms: float = 0
     provider_used: str = "unknown"
     
     def __post_init__(self):
       self.total_tables = len(self.tables)
       self.pages_with_tables = list(set(t.page_number for t in self.tables))
   
   class BaseSheetExtractor(ABC):
     \"\"\"Abstract base class for table extraction providers.\"\"\"
     
     @abstractmethod
     async def extract_tables(
       self, 
       file_path: str, 
       doc_id: str, 
       tenant_id: str,
       page_numbers: list[int] | None = None  # None = all pages
     ) -> ExtractionResult:
       \"\"\"Extract all tables from a document.\"\"\"
       ...
     
     @abstractmethod
     async def health_check(self) -> bool:
       \"\"\"Check if the extractor is healthy.\"\"\"
       ...
```

### [PROMPT] — Phase 9b — Local Sheet Extractor (PyMuPDF + Unstructured)

```
Write the local table extraction implementation.

2. src/extraction/local_sheets.py — LocalSheetExtractor
   Uses PyMuPDF for fast extraction, falls back to Unstructured for complex tables.
   
   import fitz  # PyMuPDF
   import time
   from pathlib import Path
   from src.extraction.sheets import (
     BaseSheetExtractor, ExtractedTable, ExtractionResult, TableConfidence
   )
   
   class LocalSheetExtractor(BaseSheetExtractor):
     \"\"\"
     Local table extraction using PyMuPDF (primary) + Unstructured (fallback).
     
     Strategy:
     1. Try PyMuPDF page.find_tables() first — fast, works for simple tables
     2. If table detection confidence is low, fallback to Unstructured hi_res
     3. For DOCX files, use python-docx directly
     \"\"\"
     
     def __init__(self):
       self.unstructured_url = get_settings().unstructured_url
     
     async def extract_tables(
       self, file_path: str, doc_id: str, tenant_id: str,
       page_numbers: list[int] | None = None
     ) -> ExtractionResult:
       t0 = time.monotonic()
       path = Path(file_path)
       
       if path.suffix.lower() == ".pdf":
         tables = await self._extract_pdf_tables(file_path, page_numbers)
       elif path.suffix.lower() in (".docx", ".doc"):
         tables = await self._extract_docx_tables(file_path)
       else:
         raise ValueError(f"Unsupported file type: {path.suffix}")
       
       return ExtractionResult(
         doc_id=doc_id,
         tenant_id=tenant_id,
         filename=path.name,
         tables=tables,
         extraction_time_ms=(time.monotonic() - t0) * 1000,
         provider_used="local_pymupdf"
       )
     
     async def _extract_pdf_tables(
       self, file_path: str, page_numbers: list[int] | None
     ) -> list[ExtractedTable]:
       tables = []
       doc = fitz.open(file_path)
       
       pages_to_process = page_numbers or range(len(doc))
       
       for page_idx in pages_to_process:
         if page_idx >= len(doc):
           continue
         page = doc[page_idx]
         
         # PyMuPDF table detection
         page_tables = page.find_tables()
         
         for table_idx, table in enumerate(page_tables.tables):
           # Extract table data
           data = table.extract()
           if not data:
             continue
           
           # First row as headers (heuristic: if it looks like headers)
           headers = data[0] if data else []
           rows = data[1:] if len(data) > 1 else []
           
           # Confidence based on table structure
           confidence = self._assess_confidence(headers, rows, table)
           
           tables.append(ExtractedTable(
             page_number=page_idx + 1,  # 1-indexed for user display
             table_index=table_idx,
             headers=[str(h) if h else "" for h in headers],
             rows=[[str(c) if c else "" for c in row] for row in rows],
             bbox=table.bbox if hasattr(table, 'bbox') else None,
             confidence=confidence,
             source_parser="pymupdf"
           ))
       
       doc.close()
       
       # Fallback to Unstructured for low-confidence or no tables found
       if not tables or all(t.confidence == TableConfidence.LOW for t in tables):
         log.info("pymupdf_low_confidence_fallback", file=file_path)
         unstructured_tables = await self._extract_via_unstructured(file_path, page_numbers)
         if unstructured_tables:
           return unstructured_tables
       
       return tables
     
     async def _extract_docx_tables(self, file_path: str) -> list[ExtractedTable]:
       \"\"\"Extract tables from DOCX using python-docx.\"\"\"
       from docx import Document as DocxDocument
       tables = []
       
       doc = DocxDocument(file_path)
       
       for table_idx, table in enumerate(doc.tables):
         rows_data = []
         for row in table.rows:
           row_data = [cell.text.strip() for cell in row.cells]
           rows_data.append(row_data)
         
         if not rows_data:
           continue
         
         headers = rows_data[0] if rows_data else []
         rows = rows_data[1:] if len(rows_data) > 1 else []
         
         tables.append(ExtractedTable(
           page_number=1,  # DOCX doesn't have clear page boundaries
           table_index=table_idx,
           headers=headers,
           rows=rows,
           confidence=TableConfidence.HIGH,  # DOCX tables are well-structured
           source_parser="python_docx"
         ))
       
       return tables
     
     async def _extract_via_unstructured(
       self, file_path: str, page_numbers: list[int] | None
     ) -> list[ExtractedTable]:
       \"\"\"Fallback extraction via Unstructured API.\"\"\"
       import httpx
       
       async with httpx.AsyncClient(timeout=120) as client:
         with open(file_path, "rb") as f:
           response = await client.post(
             f"{self.unstructured_url}/general/v0/general",
             files={"files": (Path(file_path).name, f, "application/octet-stream")},
             data={"strategy": "hi_res", "include_metadata": "true"}
           )
       
       if response.status_code != 200:
         log.error("unstructured_table_extraction_failed", status=response.status_code)
         return []
       
       elements = response.json()
       tables = []
       table_idx = 0
       
       for element in elements:
         if element.get("type") != "Table":
           continue
         
         # Parse Unstructured table format
         text = element.get("text", "")
         metadata = element.get("metadata", {})
         page_num = metadata.get("page_number", 1)
         
         if page_numbers and page_num not in page_numbers:
           continue
         
         # Unstructured returns tables as text — parse into rows/cols
         # Simple heuristic: split by newline for rows, by tab/| for columns
         lines = text.strip().split("\n")
         if not lines:
           continue
         
         # Detect delimiter
         delimiter = "\t" if "\t" in lines[0] else "|" if "|" in lines[0] else ","
         
         parsed_rows = []
         for line in lines:
           cells = [c.strip() for c in line.split(delimiter) if c.strip()]
           if cells:
             parsed_rows.append(cells)
         
         if parsed_rows:
           tables.append(ExtractedTable(
             page_number=page_num,
             table_index=table_idx,
             headers=parsed_rows[0] if parsed_rows else [],
             rows=parsed_rows[1:] if len(parsed_rows) > 1 else [],
             confidence=TableConfidence.MEDIUM,
             source_parser="unstructured"
           ))
           table_idx += 1
       
       return tables
     
     def _assess_confidence(self, headers, rows, table) -> TableConfidence:
       \"\"\"Assess extraction confidence based on table structure.\"\"\"
       # High: clear headers, consistent column count, no empty cells
       # Medium: some structure issues
       # Low: many empty cells, inconsistent columns
       
       if not headers or not rows:
         return TableConfidence.LOW
       
       header_count = len(headers)
       consistent_cols = all(len(row) == header_count for row in rows)
       empty_cells = sum(1 for row in rows for cell in row if not str(cell).strip())
       total_cells = sum(len(row) for row in rows)
       empty_ratio = empty_cells / max(total_cells, 1)
       
       if consistent_cols and empty_ratio < 0.1:
         return TableConfidence.HIGH
       elif consistent_cols or empty_ratio < 0.3:
         return TableConfidence.MEDIUM
       else:
         return TableConfidence.LOW
     
     async def health_check(self) -> bool:
       return True  # Local extraction always available
```

### [PROMPT] — Phase 9c — LlamaSheets Cloud Extractor

```
Write the LlamaCloud LlamaSheets implementation.

3. src/extraction/llamasheets.py — LlamaSheetsExtractor
   [SWAP] Activated when SHEETS_PROVIDER=llamasheets and LLAMA_CLOUD_API_KEY set.
   
   import time
   from pathlib import Path
   from src.extraction.sheets import (
     BaseSheetExtractor, ExtractedTable, ExtractionResult, TableConfidence
   )
   from src.core.config import get_settings
   
   class LlamaSheetsExtractor(BaseSheetExtractor):
     \"\"\"
     LlamaCloud LlamaSheets extraction.
     Cloud-based table extraction with high accuracy for complex tables.
     
     Pricing (as of 2026):
     - Simple tables: 1 credit/page
     - Complex tables (merged cells, nested): 3 credits/page
     - Spreadsheet reconstruction: 5 credits/page
     \"\"\"
     
     def __init__(self):
       settings = get_settings()
       if not settings.llama_cloud_api_key:
         raise ConfigError("LLAMA_CLOUD_API_KEY required for LlamaSheets")
       
       self.api_key = settings.llama_cloud_api_key
       self.base_url = "https://api.cloud.llamaindex.ai/v1"
     
     async def extract_tables(
       self, file_path: str, doc_id: str, tenant_id: str,
       page_numbers: list[int] | None = None
     ) -> ExtractionResult:
       import httpx
       
       t0 = time.monotonic()
       path = Path(file_path)
       
       async with httpx.AsyncClient(timeout=300) as client:
         # Upload file to LlamaSheets
         with open(file_path, "rb") as f:
           upload_response = await client.post(
             f"{self.base_url}/sheets/extract",
             headers={"Authorization": f"Bearer {self.api_key}"},
             files={"file": (path.name, f, "application/octet-stream")},
             data={
               "mode": "tables",  # "tables" | "full_spreadsheet"
               "output_format": "structured",
               "page_numbers": ",".join(map(str, page_numbers)) if page_numbers else ""
             }
           )
       
       if upload_response.status_code != 200:
         log.error("llamasheets_extraction_failed", 
                   status=upload_response.status_code,
                   detail=upload_response.text)
         raise ExtractionError(f"LlamaSheets API error: {upload_response.status_code}")
       
       result = upload_response.json()
       
       tables = []
       for idx, table_data in enumerate(result.get("tables", [])):
         tables.append(ExtractedTable(
           page_number=table_data.get("page", 1),
           table_index=table_data.get("index", idx),
           headers=table_data.get("headers", []),
           rows=table_data.get("rows", []),
           bbox=tuple(table_data["bbox"]) if table_data.get("bbox") else None,
           confidence=TableConfidence(table_data.get("confidence", "medium")),
           source_parser="llamasheets"
         ))
       
       return ExtractionResult(
         doc_id=doc_id,
         tenant_id=tenant_id,
         filename=path.name,
         tables=tables,
         extraction_time_ms=(time.monotonic() - t0) * 1000,
         provider_used="llamasheets"
       )
     
     async def health_check(self) -> bool:
       \"\"\"Verify LlamaSheets API is accessible.\"\"\"
       import httpx
       try:
         async with httpx.AsyncClient(timeout=10) as client:
           response = await client.get(
             f"{self.base_url}/health",
             headers={"Authorization": f"Bearer {self.api_key}"}
           )
         return response.status_code == 200
       except Exception:
         return False
```

### [PROMPT] — Phase 9d — MongoDB Model + API Endpoints

```
Write the MongoDB model and FastAPI endpoints for table extraction.

4. Add to src/models/db.py — ExtractedTableRecord
   
   class ExtractedTableRecord(Document):
     \"\"\"
     Cached extracted table for re-use without re-extraction.
     Stored per-table (not per-document) for granular access.
     \"\"\"
     doc_id: PydanticObjectId
     tenant_id: PydanticObjectId
     page_number: int
     table_index: int
     headers: list[str]
     rows: list[list[str]]
     row_count: int
     column_count: int
     confidence: str          # "high" | "medium" | "low"
     source_parser: str       # "pymupdf" | "unstructured" | "llamasheets"
     extracted_at: datetime = Field(default_factory=datetime.utcnow)
     
     class Settings:
       name = "extracted_tables"
       indexes = [
         IndexModel([("doc_id", 1), ("page_number", 1), ("table_index", 1)], unique=True),
         IndexModel([("tenant_id", 1)]),
         IndexModel([("extracted_at", 1)], expireAfterSeconds=60*60*24*90)  # 90-day TTL
       ]

5. src/api/routes/extract.py — Table Extraction Endpoints
   
   from fastapi import APIRouter, Depends, HTTPException, Query
   from fastapi.responses import StreamingResponse
   import io
   
   router = APIRouter(prefix="/extract", tags=["extraction"])
   
   @router.post("/tables/{doc_id}")
   async def extract_tables(
     doc_id: str,
     page_numbers: list[int] | None = Query(None, description="Pages to extract (1-indexed)"),
     force_refresh: bool = Query(False, description="Re-extract even if cached"),
     current_user: tuple = Depends(get_current_user)
   ):
     \"\"\"
     Extract tables from a document.
     
     Returns cached results if available, unless force_refresh=true.
     \"\"\"
     user, tenant_id = current_user
     
     # Verify document ownership
     doc = await DocRecord.find_one(
       DocRecord.id == ObjectId(doc_id),
       DocRecord.tenant_id == ObjectId(tenant_id)
     )
     if not doc:
       raise HTTPException(404, "Document not found")
     if doc.status != "completed":
       raise HTTPException(400, f"Document not yet processed: {doc.status}")
     
     # Check cache first (unless force_refresh)
     if not force_refresh:
       cached = await ExtractedTableRecord.find(
         ExtractedTableRecord.doc_id == ObjectId(doc_id),
         ExtractedTableRecord.tenant_id == ObjectId(tenant_id)
       ).to_list()
       if cached:
         # Filter by page_numbers if specified
         if page_numbers:
           cached = [t for t in cached if t.page_number in page_numbers]
         return {
           "doc_id": doc_id,
           "tables": [t.dict(exclude={"id"}) for t in cached],
           "cached": True,
           "provider_used": cached[0].source_parser if cached else None
         }
     
     # Extract tables
     extractor = get_sheet_extractor()
     result = await extractor.extract_tables(
       file_path=doc.storage_path,
       doc_id=doc_id,
       tenant_id=tenant_id,
       page_numbers=page_numbers
     )
     
     # Cache results (delete old, insert new)
     await ExtractedTableRecord.find(
       ExtractedTableRecord.doc_id == ObjectId(doc_id)
     ).delete()
     
     for table in result.tables:
       await ExtractedTableRecord(
         doc_id=ObjectId(doc_id),
         tenant_id=ObjectId(tenant_id),
         page_number=table.page_number,
         table_index=table.table_index,
         headers=table.headers,
         rows=table.rows,
         row_count=table.row_count,
         column_count=table.column_count,
         confidence=table.confidence.value,
         source_parser=table.source_parser
       ).insert()
     
     return {
       "doc_id": doc_id,
       "tables": [t.to_dict() for t in result.tables],
       "cached": False,
       "extraction_time_ms": result.extraction_time_ms,
       "provider_used": result.provider_used
     }
   
   @router.get("/tables/{doc_id}/export")
   async def export_tables(
     doc_id: str,
     format: str = Query("csv", regex="^(csv|json|markdown)$"),
     table_index: int | None = Query(None, description="Export specific table only"),
     current_user: tuple = Depends(get_current_user)
   ):
     \"\"\"Export extracted tables in CSV, JSON, or Markdown format.\"\"\"
     user, tenant_id = current_user
     
     tables = await ExtractedTableRecord.find(
       ExtractedTableRecord.doc_id == ObjectId(doc_id),
       ExtractedTableRecord.tenant_id == ObjectId(tenant_id)
     ).to_list()
     
     if not tables:
       raise HTTPException(404, "No tables found. Run POST /extract/tables/{doc_id} first.")
     
     if table_index is not None:
       tables = [t for t in tables if t.table_index == table_index]
       if not tables:
         raise HTTPException(404, f"Table index {table_index} not found")
     
     if format == "json":
       return [t.dict(exclude={"id"}) for t in tables]
     
     elif format == "csv":
       output = io.StringIO()
       for table in tables:
         output.write(f"# Page {table.page_number}, Table {table.table_index}\n")
         # Write headers
         import csv
         writer = csv.writer(output)
         writer.writerow(table.headers)
         writer.writerows(table.rows)
         output.write("\n")
       
       return StreamingResponse(
         io.BytesIO(output.getvalue().encode()),
         media_type="text/csv",
         headers={"Content-Disposition": f"attachment; filename=tables_{doc_id}.csv"}
       )
     
     elif format == "markdown":
       md_output = []
       for table in tables:
         md_output.append(f"## Page {table.page_number}, Table {table.table_index}\n")
         et = ExtractedTable(
           page_number=table.page_number,
           table_index=table.table_index,
           headers=table.headers,
           rows=table.rows
         )
         md_output.append(et.to_markdown())
         md_output.append("\n")
       
       return StreamingResponse(
         io.BytesIO("\n".join(md_output).encode()),
         media_type="text/markdown",
         headers={"Content-Disposition": f"attachment; filename=tables_{doc_id}.md"}
       )
   
   @router.get("/tables/{doc_id}/summary")
   async def get_tables_summary(
     doc_id: str,
     current_user: tuple = Depends(get_current_user)
   ):
     \"\"\"Get summary of extracted tables without full data.\"\"\"
     user, tenant_id = current_user
     
     tables = await ExtractedTableRecord.find(
       ExtractedTableRecord.doc_id == ObjectId(doc_id),
       ExtractedTableRecord.tenant_id == ObjectId(tenant_id)
     ).to_list()
     
     return {
       "doc_id": doc_id,
       "total_tables": len(tables),
       "pages_with_tables": list(set(t.page_number for t in tables)),
       "tables": [
         {
           "page": t.page_number,
           "index": t.table_index,
           "rows": t.row_count,
           "columns": t.column_count,
           "confidence": t.confidence
         }
         for t in tables
       ]
     }
```

### [CHECK] Phase 9 (LlamaSheets) complete when:
- [ ] `LocalSheetExtractor` extracts tables from PDF with PyMuPDF
- [ ] `LocalSheetExtractor` falls back to Unstructured for complex tables
- [ ] `LlamaSheetsExtractor` works with `SHEETS_PROVIDER=llamasheets` + API key
- [ ] `POST /extract/tables/{doc_id}` returns extracted tables
- [ ] `GET /extract/tables/{doc_id}/export?format=csv` downloads CSV
- [ ] Tables cached in MongoDB with 90-day TTL
- [ ] `/health` endpoint shows sheets provider status

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
- [ ] Backups appear in MinIO console at http://127.0.0.1:9001 (login: minioadmin / minioadmin123)
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
langchain-text-splitters = "^0.3"  # RecursiveCharacterTextSplitter for default chunking

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
| MinIO API | 9000 | http://127.0.0.1:9000 (user: minioadmin / pass: minioadmin123) |
| MinIO Console | 9001 | http://127.0.0.1:9001 (user: minioadmin / pass: minioadmin123) |
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
CHUNKING_STRATEGY=recursive    # default: RecursiveCharacterTextSplitter 512t (Vecta 2026 winner at 69%)
CHUNKING_STRATEGY=sentence     # SentenceSplitter 512t (alternative)
CHUNKING_STRATEGY=semantic     # SemanticSplitterNodeParser (expensive, 2x memory)

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
SHEETS_PROVIDER=local          # default: PyMuPDF + Unstructured tables
SHEETS_PROVIDER=llamasheets    # LlamaCloud LlamaSheets extraction

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
| RecursiveCharacterTextSplitter not found | Missing langchain-text-splitters | `pip install langchain-text-splitters` |
| LangchainNodeParser import error | Wrong import path | `from llama_index.core.node_parser import LangchainNodeParser` |
| Table extraction empty | PDF has image-based tables | Use `SHEETS_PROVIDER=llamasheets` or Unstructured hi_res |
| LlamaSheets auth failed | Missing or invalid API key | Check `LLAMA_CLOUD_API_KEY` env var |
| Next.js hydration error | Server/client mismatch | Wrap client-only code in `useEffect` or use `suppressHydrationWarning` |
| next-auth session undefined | Missing SessionProvider | Wrap app in `<SessionProvider>` in providers.tsx |
| API calls fail in production | Wrong NEXT_PUBLIC_API_URL | Set build-time env var, not runtime |
| CORS errors in dev | Backend doesn't allow localhost:3000 | Add origin to FastAPI CORS middleware |
| Zustand state lost on refresh | Missing persist middleware | Use `persist()` from zustand/middleware |
| TanStack Query cache stale | Default staleTime too short | Set `staleTime: 60 * 1000` in QueryClient |

---

## Section 18 — Next.js Frontend Application

> **Purpose:** Production-ready React frontend for the document finder. Connects to the FastAPI backend via REST API. Supports file upload, semantic search, document viewer, table extraction preview, and tenant-scoped authentication.

---

### 18.1 Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Framework** | Next.js | 15.x | App Router, Server Components, Server Actions |
| **React** | React | 19.x | Concurrent features, use() hook, Suspense boundaries |
| **Styling** | Tailwind CSS | 4.x | CSS-first config, container queries, P3 colors |
| **UI Components** | shadcn/ui | latest | Copy-paste components, Radix primitives, fully customizable |
| **State** | Zustand | 5.x | Lightweight global state for UI (sidebar, modals) |
| **Data Fetching** | TanStack Query | 5.x | Server state, caching, optimistic updates, infinite scroll |
| **Forms** | React Hook Form | 7.x | + Zod for validation, same schemas as backend |
| **Auth** | next-auth (Auth.js) | 5.x | Credentials provider → FastAPI JWT flow |
| **HTTP Client** | ky | 1.x | Tiny fetch wrapper, automatic retries, hooks |
| **File Upload** | react-dropzone | 14.x | Drag & drop, chunked uploads via presigned URLs |
| **Tables** | TanStack Table | 8.x | Headless table for extracted data preview |
| **PDF Viewer** | react-pdf | 9.x | Inline PDF rendering with page navigation |
| **Icons** | Lucide React | latest | Tree-shakeable, consistent with shadcn |
| **Testing** | Vitest + Testing Library | latest | Fast unit tests, component tests |
| **E2E** | Playwright | latest | Cross-browser e2e tests |

**Key Dependencies (package.json):**
```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-query": "^5.60.0",
    "zustand": "^5.0.0",
    "next-auth": "^5.0.0-beta.25",
    "ky": "^1.7.0",
    "react-hook-form": "^7.54.0",
    "@hookform/resolvers": "^3.9.0",
    "zod": "^3.24.0",
    "react-dropzone": "^14.3.0",
    "@tanstack/react-table": "^8.20.0",
    "react-pdf": "^9.1.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0",
    "class-variance-authority": "^0.7.0",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "vitest": "^2.1.0",
    "@testing-library/react": "^16.0.0",
    "@playwright/test": "^1.48.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0"
  }
}
```

---

### 18.2 Project Structure (frontend/ folder)

```
frontend/
├── .env.local.example           # Copy to .env.local
├── .env.production
├── next.config.ts               # Next.js 15 config (turbopack, images, rewrites)
├── tailwind.config.ts           # Tailwind 4 CSS config
├── postcss.config.mjs
├── tsconfig.json
├── package.json
├── components.json              # shadcn/ui config
├── Dockerfile                   # Multi-stage production build
├── docker-compose.frontend.yml  # Standalone frontend dev/prod
│
├── public/
│   ├── favicon.ico
│   └── logo.svg
│
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # Root layout (providers, fonts, metadata)
│   │   ├── page.tsx             # Home → redirect to /documents
│   │   ├── globals.css          # Tailwind imports + CSS vars
│   │   │
│   │   ├── (auth)/              # Auth route group (no sidebar)
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/         # Dashboard route group (with sidebar)
│   │   │   ├── layout.tsx       # Sidebar + header wrapper
│   │   │   ├── documents/
│   │   │   │   ├── page.tsx               # Document list + upload
│   │   │   │   └── [docId]/page.tsx       # Document detail + viewer
│   │   │   ├── search/page.tsx            # Semantic search interface
│   │   │   ├── tables/
│   │   │   │   └── [docId]/page.tsx       # Extracted tables viewer
│   │   │   └── settings/page.tsx          # User/tenant settings
│   │   │
│   │   └── api/                 # Next.js API routes (BFF pattern)
│   │       └── auth/[...nextauth]/route.ts
│   │
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives (button, input, card, etc.)
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── mobile-nav.tsx
│   │   ├── documents/
│   │   │   ├── document-list.tsx
│   │   │   ├── document-card.tsx
│   │   │   ├── upload-dropzone.tsx
│   │   │   └── upload-progress.tsx
│   │   ├── search/
│   │   │   ├── search-input.tsx
│   │   │   ├── search-results.tsx
│   │   │   └── result-card.tsx
│   │   ├── viewer/
│   │   │   ├── pdf-viewer.tsx
│   │   │   └── docx-preview.tsx
│   │   └── tables/
│   │       ├── extracted-table.tsx
│   │       └── table-download.tsx
│   │
│   ├── lib/
│   │   ├── api-client.ts        # ky instance with auth interceptor
│   │   ├── auth.ts              # next-auth config
│   │   ├── utils.ts             # cn(), formatDate(), etc.
│   │   └── constants.ts
│   │
│   ├── hooks/
│   │   ├── use-documents.ts     # TanStack Query: list, upload, delete
│   │   ├── use-search.ts        # TanStack Query: semantic search
│   │   ├── use-tables.ts        # TanStack Query: extracted tables
│   │   └── use-upload.ts        # Chunked upload with progress
│   │
│   ├── stores/
│   │   └── ui-store.ts          # Zustand: sidebar state, modals
│   │
│   ├── types/
│   │   ├── api.ts               # API response types (mirror backend schemas)
│   │   ├── document.ts
│   │   └── auth.ts
│   │
│   └── schemas/
│       ├── login.ts             # Zod schema for login form
│       ├── upload.ts            # Zod schema for upload metadata
│       └── search.ts            # Zod schema for search params
│
└── tests/
    ├── components/              # Vitest component tests
    └── e2e/                     # Playwright e2e tests
```

---

### [PHASE 12a] — Next.js Project Setup

**[PROMPT]**

```
Create the Next.js 15 frontend project with this exact structure:

1. Initialize project:
   cd frontend && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

2. Install dependencies (exact versions from 18.1 table)

3. Configure next.config.ts:
   - Enable turbopack for dev
   - Configure images (allow backend domain)
   - Add rewrites to proxy /api/v1/* to backend during dev
   - Set output: 'standalone' for Docker

4. Set up Tailwind 4:
   - Use @tailwindcss/postcss
   - Configure CSS variables in globals.css for shadcn theming
   - Add container queries plugin

5. Initialize shadcn/ui:
   npx shadcn@latest init
   - Style: new-york
   - Base color: zinc
   - CSS variables: yes

6. Install core shadcn components:
   npx shadcn@latest add button input card dialog dropdown-menu avatar badge separator skeleton toast

7. Create src/lib/utils.ts with cn() helper

8. Create .env.local.example:
   NEXT_PUBLIC_API_URL=http://localhost:8000
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-secret-here
```

**src/lib/utils.ts:**
```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
```

**src/app/layout.tsx:**
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "DocuFinder",
  description: "Company Document Finder & Summarizer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**src/components/providers.tsx:**
```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

**src/lib/api-client.ts:**
```typescript
import ky from "ky";
import { getSession } from "next-auth/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = ky.create({
  prefixUrl: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  hooks: {
    beforeRequest: [
      async (request) => {
        const session = await getSession();
        if (session?.accessToken) {
          request.headers.set("Authorization", `Bearer ${session.accessToken}`);
        }
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          // Token expired - redirect to login
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
        }
        return response;
      },
    ],
  },
});

// Type-safe API methods
export const apiClient = {
  get: <T>(url: string, options?: Parameters<typeof api.get>[1]) =>
    api.get(url, options).json<T>(),
  post: <T>(url: string, json?: unknown, options?: Parameters<typeof api.post>[1]) =>
    api.post(url, { json, ...options }).json<T>(),
  put: <T>(url: string, json?: unknown, options?: Parameters<typeof api.put>[1]) =>
    api.put(url, { json, ...options }).json<T>(),
  delete: <T>(url: string, options?: Parameters<typeof api.delete>[1]) =>
    api.delete(url, options).json<T>(),
};
```

**src/types/api.ts:**
```typescript
// Mirror backend Pydantic models

export interface User {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  role: "admin" | "user" | "viewer";
  created_at: string;
}

export interface Document {
  id: string;
  tenant_id: string;
  filename: string;
  file_hash: string;
  mime_type: string;
  file_size: number;
  status: "pending" | "processing" | "completed" | "failed";
  page_count?: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  doc_id: string;
  filename: string;
  chunk_text: string;
  score: number;
  page_number?: number;
  metadata: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  took_ms: number;
}

export interface ExtractedTable {
  id: string;
  doc_id: string;
  page_number: number;
  table_index: number;
  headers: string[];
  rows: string[][];
  confidence: number;
  extracted_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface ApiError {
  detail: string;
  code?: string;
}
```

**[CHECK]**
```bash
cd frontend
npm run dev
# Open http://localhost:3000 — should see Next.js default page
# No console errors
# TanStack Query devtools visible in bottom-right
```

---

### [PHASE 12b] — Authentication Flow (next-auth + FastAPI JWT)

**[PROMPT]**

```
Implement next-auth v5 with Credentials provider that authenticates against
the FastAPI backend. The backend issues JWT tokens at POST /api/v1/auth/login.

Requirements:
1. User logs in with email/password
2. Frontend sends credentials to FastAPI /api/v1/auth/login
3. FastAPI returns { access_token, token_type, user }
4. Store access_token in next-auth session
5. Attach token to all API requests via api-client.ts
6. Handle token refresh (FastAPI returns new token in response header)
7. Redirect to /documents after login, /login on 401
```

**src/lib/auth.ts:**
```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!response.ok) {
            return null;
          }

          const data = await response.json();

          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            tenantId: data.user.tenant_id,
            role: data.user.role,
            accessToken: data.access_token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.tenantId = user.tenantId;
        token.role = user.role;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.tenantId = token.tenantId as string;
      session.user.role = token.role as string;
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

**src/types/next-auth.d.ts:**
```typescript
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      tenantId: string;
      role: string;
    };
    accessToken: string;
  }

  interface User {
    id: string;
    email: string;
    name: string;
    tenantId: string;
    role: string;
    accessToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string;
    role: string;
    accessToken: string;
  }
}
```

**src/app/api/auth/[...nextauth]/route.ts:**
```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

**src/app/(auth)/login/page.tsx:**
```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2 } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/documents";
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);

    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <FileText className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">DocuFinder</CardTitle>
          <p className="text-muted-foreground">
            Sign in to access your documents
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**src/middleware.ts:**
```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isLoggedIn = !!session;
  const isAuthPage = nextUrl.pathname.startsWith("/login");
  const isApiRoute = nextUrl.pathname.startsWith("/api");
  const isPublicRoute = nextUrl.pathname === "/";

  // Allow API routes and public routes
  if (isApiRoute || isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from login page
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/documents", nextUrl));
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn && !isAuthPage) {
    const callbackUrl = encodeURIComponent(nextUrl.pathname);
    return NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
```

**[CHECK]**
```bash
# 1. Ensure FastAPI backend is running on :8000
# 2. Start frontend: npm run dev
# 3. Navigate to http://localhost:3000/documents
#    → Should redirect to /login
# 4. Login with valid credentials
#    → Should redirect to /documents
# 5. Open DevTools Network tab
#    → Subsequent API calls should have Authorization header
```

---

### [PHASE 12c] — Core UI Components

**[PROMPT]**

```
Build the core UI components for the dashboard:
1. Sidebar with navigation (documents, search, settings)
2. Upload dropzone with drag-and-drop and progress
3. Semantic search interface with results
4. Extracted table viewer with export

Use shadcn/ui components where possible. All data fetching via TanStack Query hooks.
```

**src/components/layout/sidebar.tsx:**
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  FileText,
  Search,
  Table2,
  Settings,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useUIStore } from "@/stores/ui-store";

const navItems = [
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/search", label: "Search", icon: Search },
  { href: "/tables", label: "Tables", icon: Table2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-card border-r transition-all duration-300",
        sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b">
        <FileText className="h-8 w-8 text-primary shrink-0" />
        {!sidebarCollapsed && (
          <span className="ml-3 text-lg font-semibold">DocuFinder</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={toggleSidebar}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              sidebarCollapsed && "rotate-180"
            )}
          />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                  "hover:bg-muted",
                  pathname.startsWith(item.href)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* User */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback>
              {session?.user?.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {session?.user?.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {session?.user?.email}
              </p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
```

**src/stores/ui-store.ts:**
```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: "ui-storage",
    }
  )
);
```

**src/components/documents/upload-dropzone.tsx:**
```tsx
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, File, X, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api-client";

interface UploadFile {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

export function UploadDropzone() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      return api
        .post("documents/upload", {
          body: formData,
          timeout: 120000, // 2 min for large files
          onUploadProgress: (progress) => {
            if (progress.percent) {
              setFiles((prev) =>
                prev.map((f) =>
                  f.file.name === file.name
                    ? { ...f, progress: progress.percent! }
                    : f
                )
              );
            }
          },
        })
        .json();
    },
    onSuccess: (_data, file) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.file.name === file.name ? { ...f, status: "success" } : f
        )
      );
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error, file) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.file.name === file.name
            ? { ...f, status: "error", error: (error as Error).message }
            : f
        )
      );
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles: UploadFile[] = acceptedFiles.map((file) => ({
        file,
        progress: 0,
        status: "pending" as const,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      // Upload each file
      for (const { file } of newFiles) {
        setFiles((prev) =>
          prev.map((f) =>
            f.file.name === file.name ? { ...f, status: "uploading" } : f
          )
        );
        uploadMutation.mutate(file);
      }
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  const removeFile = (fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.file.name !== fileName));
  };

  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== "success"));
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">
          {isDragActive ? "Drop files here" : "Drag & drop files here"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          or click to browse. PDF and DOCX files up to 50MB.
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Uploads</h4>
            {files.some((f) => f.status === "success") && (
              <Button variant="ghost" size="sm" onClick={clearCompleted}>
                Clear completed
              </Button>
            )}
          </div>
          {files.map((f) => (
            <div
              key={f.file.name}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-md"
            >
              <File className="h-5 w-5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.file.name}</p>
                {f.status === "uploading" && (
                  <Progress value={f.progress} className="h-1 mt-1" />
                )}
                {f.status === "error" && (
                  <p className="text-xs text-destructive mt-1">{f.error}</p>
                )}
              </div>
              {f.status === "success" && (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              {f.status === "error" && (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              {f.status !== "uploading" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => removeFile(f.file.name)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**src/components/search/search-interface.tsx:**
```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, FileText, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import type { SearchResponse } from "@/types/api";
import { useDebounce } from "@/hooks/use-debounce";

export function SearchInterface() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const {
    data: searchResults,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () =>
      apiClient.get<SearchResponse>(`search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length >= 3,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents semantically..."
          className="pl-10 pr-10 h-12 text-lg"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={() => setQuery("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search hint */}
      {!searchResults && !isLoading && query.length < 3 && query.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Type at least 3 characters to search
        </p>
      )}

      {/* Loading state */}
      {(isLoading || isFetching) && debouncedQuery.length >= 3 && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-full mb-1" />
                <Skeleton className="h-3 w-5/6" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {searchResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {searchResults.total} results in {searchResults.took_ms}ms
            </p>
          </div>

          {searchResults.results.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No documents match your search
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.results.map((result, index) => (
                <Card
                  key={`${result.doc_id}-${index}`}
                  className="hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">
                            {result.filename}
                          </h3>
                          <Badge variant="secondary" className="shrink-0">
                            {Math.round(result.score * 100)}%
                          </Badge>
                          {result.page_number && (
                            <Badge variant="outline" className="shrink-0">
                              Page {result.page_number}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {result.chunk_text}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**src/hooks/use-debounce.ts:**
```typescript
import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

**src/components/tables/extracted-table.tsx:**
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import type { ExtractedTable as ExtractedTableType } from "@/types/api";

interface ExtractedTableProps {
  docId: string;
}

export function ExtractedTable({ docId }: ExtractedTableProps) {
  const { data: tables, isLoading } = useQuery({
    queryKey: ["tables", docId],
    queryFn: () =>
      apiClient.get<ExtractedTableType[]>(`extract/tables/${docId}`),
  });

  const downloadCSV = (table: ExtractedTableType) => {
    const csvContent = [
      table.headers.join(","),
      ...table.rows.map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${table.page_number}-${table.table_index}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No tables extracted from this document
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tables.map((table) => (
        <Card key={table.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">
              Page {table.page_number}, Table {table.table_index + 1}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSV(table)}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    {table.headers.map((header, i) => (
                      <TableHead key={i} className="whitespace-nowrap">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {table.rows.length} rows · Confidence:{" "}
              {Math.round(table.confidence * 100)}%
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**src/app/(dashboard)/layout.tsx:**
```tsx
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="container max-w-6xl py-8">{children}</div>
      </main>
    </div>
  );
}
```

**src/app/(dashboard)/documents/page.tsx:**
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UploadDropzone } from "@/components/documents/upload-dropzone";
import { DocumentList } from "@/components/documents/document-list";
import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse, Document } from "@/types/api";

export default function DocumentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: () => apiClient.get<PaginatedResponse<Document>>("documents"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground">
            Upload and manage your documents
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Documents</DialogTitle>
            </DialogHeader>
            <UploadDropzone />
          </DialogContent>
        </Dialog>
      </div>

      <DocumentList documents={data?.items || []} isLoading={isLoading} />
    </div>
  );
}
```

**[CHECK]**
```bash
cd frontend && npm run dev
# Open http://localhost:3000/documents
# ✓ Sidebar renders with navigation
# ✓ Upload dialog opens, drag-drop works
# ✓ /search page shows search input
# ✓ Tables page renders (empty state OK)
# ✓ Sidebar collapse button works
# ✓ Logout button redirects to /login
```

---

### [PHASE 12d] — Docker & Production Deployment

**[PROMPT]**

```
Create Docker configuration for the Next.js frontend:
1. Multi-stage Dockerfile (builder → runner)
2. Output standalone mode for minimal image
3. Docker Compose for frontend + backend integration
4. Production environment variables
5. Nginx reverse proxy for unified API
```

**frontend/Dockerfile:**
```dockerfile
# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Stage 1: Dependencies
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ─────────────────────────────────────────────────────────────
# Stage 2: Builder
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 3: Runner
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**frontend/next.config.ts:**
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
      },
      {
        protocol: "https",
        hostname: process.env.BACKEND_HOST || "api.example.com",
      },
    ],
  },

  // API proxy for development
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            source: "/api/v1/:path*",
            destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/:path*`,
          },
        ]
      : [];
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },

  // Enable Turbopack for dev
  experimental: {
    turbo: {
      rules: {
        // Custom Turbopack rules if needed
      },
    },
  },
};

export default nextConfig;
```

**docker-compose.frontend.yml:**
```yaml
# Frontend development/production with backend integration
version: "3.9"

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://backend:8000}
    ports:
      - "3000:3000"
    environment:
      - NEXTAUTH_URL=${NEXTAUTH_URL:-http://localhost:3000}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET:?Set NEXTAUTH_SECRET}
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://backend:8000}
    depends_on:
      - backend
    networks:
      - docufinder
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  backend:
    # Reference main docker-compose.yml backend service
    extends:
      file: docker-compose.yml
      service: backend
    networks:
      - docufinder

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - frontend
      - backend
    networks:
      - docufinder
    restart: unless-stopped

networks:
  docufinder:
    driver: bridge
```

**nginx/nginx.conf:**
```nginx
# Production nginx config for DocuFinder
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript 
               application/xml application/rss+xml application/atom+xml image/svg+xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=upload:10m rate=2r/s;

    # Upstream servers
    upstream frontend {
        server frontend:3000;
        keepalive 32;
    }

    upstream backend {
        server backend:8000;
        keepalive 32;
    }

    server {
        listen 80;
        server_name _;

        # Security headers
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # API routes → FastAPI backend
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";
            
            # Timeouts for long-running requests
            proxy_connect_timeout 60s;
            proxy_send_timeout 120s;
            proxy_read_timeout 120s;
        }

        # File uploads with larger body limit
        location /api/v1/documents/upload {
            limit_req zone=upload burst=5 nodelay;
            client_max_body_size 100M;
            
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_request_buffering off;
        }

        # Health check endpoints
        location /health {
            proxy_pass http://backend/health;
            proxy_http_version 1.1;
        }

        # Everything else → Next.js frontend
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # Next.js static files
        location /_next/static/ {
            proxy_pass http://frontend;
            proxy_cache_valid 200 365d;
            add_header Cache-Control "public, max-age=31536000, immutable";
        }
    }
}
```

**frontend/.env.production:**
```bash
# Production environment variables
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXTAUTH_URL=https://yourdomain.com
NEXTAUTH_SECRET=your-production-secret-here
```

**[CHECK]**
```bash
# Build and run full stack
docker compose -f docker-compose.yml -f docker-compose.frontend.yml up --build

# Verify:
# ✓ Frontend accessible at http://localhost:3000
# ✓ API calls proxied correctly (check Network tab)
# ✓ Login flow works end-to-end
# ✓ File upload completes successfully
# ✓ Search returns results from backend

# Production build size check
docker images | grep docufinder-frontend
# Should be < 200MB
```

---

### [CHECK] — Next.js Frontend Verification Checklist

| Check | Command/Action | Expected |
|-------|----------------|----------|
| Dependencies install | `cd frontend && npm ci` | No errors, node_modules created |
| TypeScript compiles | `npm run type-check` | No type errors |
| Lint passes | `npm run lint` | No lint errors |
| Dev server starts | `npm run dev` | http://localhost:3000 accessible |
| Auth redirect works | Visit /documents unauthenticated | Redirects to /login |
| Login flow | Enter valid credentials | Redirects to /documents |
| Session persists | Refresh page after login | Still authenticated |
| Upload works | Drag PDF to dropzone | Progress shown, document appears in list |
| Search works | Enter 3+ chars in search | Results from backend displayed |
| Tables render | Navigate to /tables/[docId] | Extracted tables shown (or empty state) |
| Logout works | Click logout in sidebar | Redirects to /login, session cleared |
| Docker builds | `docker build -t frontend ./frontend` | Image < 200MB |
| Production mode | `npm run build && npm start` | No hydration errors |
| Responsive design | Resize to mobile width | Sidebar collapses, UI adapts |

---

## Phase Build Order

```
Phase 0  → Docker Compose + project scaffold
Phase 1  → Config + MongoDB models + Valkey client
Phase 2  → JWT auth + tenant middleware
Phase 3  → Provider factory (Section 3) ← build this before parsers
Phase 4a → Parser abstraction + Unstructured + LiteParse
Phase 4b → IngestionPipeline (swappable chunker with RECURSIVE default)
Phase 4c → PDF classification + MIME-based routing (Section 8.5)
Phase 4d → ClamAV virus scanning (Section 8.6) [optional]
Phase 5  → Qdrant bootstrap (scripts/init_qdrant.py)
Phase 6  → Celery tasks (Valkey broker)
Phase 7  → File watcher
Phase 8  → Query engine + summarizer
Phase 9  → FastAPI endpoints
Phase 9a-d → LlamaSheets table extraction (Section 13.5)
Phase 10 → RAGAS evaluation
Phase 11 → Observability + hardening
Phase 11b → S3/MinIO backup system (Section 15.5)
Phase 12a → Next.js project setup + providers + API client (Section 18)
Phase 12b → Authentication flow (next-auth + FastAPI JWT)
Phase 12c → Core UI components (sidebar, upload, search, tables)
Phase 12d → Docker & production deployment + nginx proxy
E1–E6   → Emergent capabilities
```

---

*Generated: April 2026 · Stack: LlamaIndex 0.12, Qdrant 1.16, Gemma 4 (Ollama 0.20+),*  
*Valkey 8 (valkey-py 6), MongoDB 8 (Motor 3, Beanie 1.26), Unstructured 0.15, LiteParse 0.1,*  
*LangChain Text Splitters 0.3, Next.js 15, React 19, Tailwind CSS 4, shadcn/ui, TanStack Query v5, next-auth v5*
