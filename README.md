# DocuFinder v2

**Multi-tenant AI document intelligence platform** — upload your company's PDFs and DOCX files, then ask questions across them using hybrid semantic search, LLM-powered summarization, and table extraction.

![Status](https://img.shields.io/badge/status-production--ready-brightgreen)
![Python](https://img.shields.io/badge/python-3.11-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Table of Contents

1. [What It Does](#1-what-it-does)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [How It Was Built](#4-how-it-was-built)
5. [Prerequisites](#5-prerequisites)
6. [Quick Start (Local Dev)](#6-quick-start-local-dev)
7. [Step-by-Step: Using the UI](#7-step-by-step-using-the-ui)
8. [Step-by-Step: Using the API](#8-step-by-step-using-the-api)
9. [Full Docker Deployment](#9-full-docker-deployment)
10. [Environment Variables Reference](#10-environment-variables-reference)
11. [Running Tests](#11-running-tests)
12. [API Reference](#12-api-reference)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What It Does

DocuFinder v2 lets your company:

| Feature | Description |
|---------|-------------|
| **Upload** | Drag-and-drop PDFs and DOCX files through a web UI or API |
| **Ingest** | Automatically parse, chunk, embed, and index documents with SHA-256 deduplication |
| **Search** | Hybrid semantic search (dense vectors + BM25 sparse) across all your documents |
| **Ask Questions** | Get LLM-synthesized answers citing exact source chunks and page numbers |
| **Summarize** | Summarize any single document or ask cross-document topic questions |
| **Extract Tables** | Pull structured tables from PDFs as JSON, CSV, or Markdown |
| **Multi-tenant** | Full data isolation — each company's data is completely separate |
| **Secure** | JWT authentication, bcrypt passwords, per-tenant Qdrant payload filters |
| **Observable** | Prometheus metrics at `/metrics`, structured JSON logs, Phoenix (OTEL) tracing |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│   Next.js 15 Frontend (TypeScript)     │   REST API Consumers   │
│   - Dark glassmorphism UI              │   - cURL / Postman     │
│   - TanStack Query v5                  │   - SDK / integrations │
│   - NextAuth.js session management     │                        │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP
┌─────────────────────────────────────────────────────────────────┐
│                      nginx REVERSE PROXY                        │
│            /api/v1/* → FastAPI :8001                            │
│            /* → Next.js :3000                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│              FASTAPI BACKEND (Python 3.11)                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Layer (src/api/)                                    │  │
│  │  auth · ingest · search · summarize · extract · health  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────┐  ┌────────┴──────────┐  ┌────────────────┐  │
│  │  Ingestion    │  │   Retrieval       │  │  Extraction    │  │
│  │  Pipeline     │  │   Engine          │  │  Pipeline      │  │
│  │  (LlamaIndex  │  │  (Hybrid Qdrant   │  │  (PyMuPDF +    │  │
│  │  + Parser)    │  │   dense+sparse)   │  │   LlamaSheets) │  │
│  └───────┬───────┘  └────────┬──────────┘  └────────────────┘  │
└──────────┼───────────────────┼────────────────────────────────┘
           │                   │
┌──────────▼───────────────────▼────────────────────────────────┐
│                    DATA LAYER                                  │
│                                                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │  Qdrant Cloud │  │   MongoDB     │  │   Valkey (Redis)  │  │
│  │  Vector DB    │  │   (Beanie ODM)│  │   Cache + Queue   │  │
│  │  text-dense   │  │   6 Collections│  │   Celery broker   │  │
│  │  text-sparse  │  │               │  │                   │  │
│  └───────────────┘  └───────────────┘  └───────────────────┘  │
└────────────────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│                    AI MODEL LAYER                               │
│                                                                 │
│  ┌──────────────────┐      ┌──────────────────────────────────┐ │
│  │  Ollama (local)  │      │  HuggingFace (local CPU)         │ │
│  │  gemma4:31b-cloud│      │  BAAI/bge-large-en-v1.5          │ │
│  │  LLM inference   │      │  1024-dim dense embeddings       │ │
│  └──────────────────┘      └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│               WORKER LAYER (Celery)                            │
│  celery_worker: ingest · maintenance · backup queues           │
│  Unstructured.io: advanced PDF/DOCX parsing                    │
│  ClamAV: optional virus scanning                               │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Tenancy Model

Every piece of data — MongoDB records, Qdrant vectors, Valkey cache keys — is scoped to a `tenant_id` extracted **only from the JWT**. It is never accepted from request bodies or query params. Every Qdrant query carries a mandatory payload filter:

```python
Filter(must=[FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))])
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend framework | FastAPI | 0.115+ |
| Language | Python | 3.11 |
| ODM | Beanie + Motor | 1.30 / 3.7 |
| Database | MongoDB | 7.x |
| Vector database | Qdrant Cloud | Managed |
| Cache / Queue broker | Valkey (Redis fork) | 8.x |
| Task queue | Celery | 5.x |
| LLM | Ollama (Gemma4 31B Cloud) | Latest |
| Embedding | BAAI/bge-large-en-v1.5 | HuggingFace |
| RAG framework | LlamaIndex | 0.12+ |
| PDF parsing | PyMuPDF / Unstructured.io | Latest |
| Auth | JWT (python-jose) + bcrypt | 5.x |
| Metrics | Prometheus + prometheus-fastapi-instrumentator | - |
| Tracing | Arize Phoenix (OTEL) | Optional |
| Frontend | Next.js 15 (TypeScript) | 15.x |
| Frontend state | TanStack Query v5 | 5.x |
| Auth (frontend) | NextAuth.js v5 | 5.x |
| Reverse proxy | nginx | 1.25 |
| Containerization | Docker + Docker Compose | - |

---

## 4. How It Was Built

DocuFinder v2 was built from scratch following a 16-phase implementation plan:

### Phase 0 — Project Scaffold
Created the repository structure, multi-stage `Dockerfile`, `docker-compose.yml` (Valkey, MongoDB, Unstructured, nginx, Celery, ClamAV, MinIO), `.gitignore`, and `pyproject.toml` with pinned dependencies.

### Phase 1 — Core Infrastructure
- **`src/core/config.py`**: Pydantic `Settings` class loading from `.env` via `python-dotenv`. All provider choices (LLM, embed, parser, indexer) are environment-switchable without code changes.
- **`src/core/database.py`**: Motor async MongoDB client + Beanie ODM initialization (pinned to 1.x for Motor 3.x compatibility).
- **`src/core/valkey_client.py`**: Async Valkey client singleton for caching and as Celery broker.
- **`src/core/tenant_context.py`**: Python `ContextVar` for storing the current `tenant_id` per async request, ensuring no cross-tenant leakage.

### Phase 2 — Data Models
Six Beanie ODM models in `src/models/db.py`:
- `Tenant` — organization with slug and plan tier
- `User` — bcrypt-hashed password, role (admin/member), linked to Tenant
- `DocRecord` — document metadata, SHA-256 hash, ingestion status
- `IngestionJob` — Celery task tracking per document
- `ParsedDocumentCache` — memoized parse results to avoid re-parsing duplicates
- `ExtractedTable` — structured table data with CSV/Markdown export

### Phase 3 — Qdrant Setup
Collection `company_docs` with two named vector spaces:
- `text-dense`: 1024-dimensional Cosine similarity (BAAI/bge-large-en-v1.5)
- `text-sparse`: BM25 keyword search (Qdrant's fastembed)

Four payload indexes for mandatory tenant isolation: `tenant_id`, `doc_id`, `filename`, `page_number`.

### Phase 4 — Ingestion Pipeline
`src/ingestion/` contains:
- **PDF classifier**: PyMuPDF heuristics to detect text-layer vs scanned PDFs
- **Parser router**: dispatches to Unstructured (Docker), LiteParse, or LlamaParse based on `PARSER_PROVIDER`
- **LlamaIndex `IngestionPipeline`**: `SentenceSplitter` (512 tokens, 50 overlap) → metadata enrichment → `HuggingFaceEmbedding` → Qdrant upsert
- **Celery tasks**: `ingest_document_task` on the `ingest` queue; maintenance and backup queues

### Phase 5 — Retrieval Engine
`src/retrieval/engine.py`:
- `build_query_engine(tenant_id, top_k)`: creates a `RetrieverQueryEngine` with `VectorStoreQueryMode.HYBRID`
- 5-minute Valkey result cache keyed by `tenant_id + sha256(query+top_k)`
- Optional `LLMRerank` post-processor (`ENABLE_RERANK=true`)

### Phase 6 — REST API
21 routes across 5 router modules:
- **auth**: `/register` + `/login`
- **ingest**: `/upload` + `/status/{doc_id}`
- **search**: `POST /search` + `GET /search`
- **summarize**: `/document/{doc_id}` + `/topic` + `/classify/{doc_id}`
- **extract**: `/tables/{doc_id}` (POST/GET) + `/export` + `/summary`

`TenantContextMiddleware` decodes JWT on every protected request and populates `ContextVar` + structured log context.

### Phase 7 — Frontend
Next.js 15 app in `/frontend`:
- `src/app/(dashboard)/documents/page.tsx`: drag-and-drop upload (react-dropzone), document list with status badges
- `src/app/(dashboard)/search/page.tsx`: AI answer display with source chunk cards
- `src/components/layout/sidebar.tsx`: collapsible navigation with active state
- Dark glassmorphism design with purple accent theme, Inter font, micro-animations

### Phase 8 — Observability
- **Prometheus metrics**: `rag_search_latency`, `rag_documents_total`, `rag_upload_file_size`, `rag_nodes_retrieved` histograms/counters
- **Structured logging**: `structlog` with JSON renderer in production
- **OTEL tracing**: Arize Phoenix (optional, non-fatal if not running)
- **RAGAS evaluation**: `tests/eval/rag_eval.py` for offline RAG quality assessment

---

## 5. Prerequisites

### For Local Development (minimal)
- Python 3.11+
- MongoDB (Homebrew: `brew install mongodb-community`)
- Ollama with at least one model (`brew install ollama`)
- Qdrant Cloud account (free tier works)

### For Full Stack (Docker)
- Docker Desktop 4.x
- 16 GB RAM recommended (Unstructured + Celery workers)

---

## 6. Quick Start (Local Dev)

```bash
# 1. Clone the repo
git clone https://github.com/sayantan007pal/DocuFinder.git
cd DocuFinder

# 2. Create Python venv and install dependencies
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# 3. Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set:
#   QDRANT_URL=https://your-cluster.qdrant.io:6333
#   QDRANT_API_KEY=your-api-key
#   JWT_SECRET_KEY=$(openssl rand -hex 32)

# 4. Start MongoDB (Homebrew)
mkdir -p /tmp/docufinder-mongo
mongod --dbpath /tmp/docufinder-mongo --port 27017 &

# 5. Start Ollama
ollama serve &
ollama pull gemma4:31b-cloud   # or any available model

# 6. Initialize Qdrant Cloud collection
python scripts/init_qdrant.py

# 7. Start the API
uvicorn src.api.main:app --host 0.0.0.0 --port 8001 --reload

# 8. Open API docs
open http://localhost:8001/docs
```

---

## 7. Step-by-Step: Using the UI

> **Prerequisites**: Run `npm install && npm run dev` inside `/frontend` with the API running at `:8001`

### Step 1 — Open the App
Navigate to `http://localhost:3000`. You will be automatically redirected to the login page.

### Step 2 — Create an Account
1. Click the **"Register"** tab
2. Fill in:
   - **Company Name**: e.g. `Acme Corp`
   - **Company Slug**: e.g. `acme` (lowercase, alphanumeric, hyphens only)
   - **Email**: your work email
   - **Password**: at least 8 characters
3. Click **Create Account**
4. You will be redirected to the dashboard with a JWT session stored

### Step 3 — Upload Documents
1. Click **Documents** in the left sidebar
2. Click **Upload Document** button (top right)
3. Drag and drop any **PDF** or **DOCX** file into the dropzone, or click to browse
4. Click **Upload** — the document appears in the list with status `queued`
5. In production (with Celery running), status transitions to `processing` → `completed` automatically
6. Repeat for all your company documents

### Step 4 — Search
1. Click **Search** in the left sidebar
2. Type a natural-language question, e.g.:
   - `"What is the vacation policy?"`
   - `"What was Q4 2025 revenue?"`
   - `"How do I deploy to production?"`
3. Press Enter or click the search button
4. You see:
   - An **AI-synthesized answer** at the top (generated by the LLM)
   - **Source chunks** below — the exact text snippets the answer is based on, with document name, page number, and relevance score

### Step 5 — Sign Out
Click your name in the bottom of the sidebar → **Sign Out**

---

## 8. Step-by-Step: Using the API

All protected endpoints require: `Authorization: Bearer <token>`

### Step 1 — Register a Tenant

```bash
curl -X POST http://localhost:8001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name": "Acme Corp",
    "tenant_slug": "acme",
    "email": "admin@acme.com",
    "password": "securepassword123"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer",
  "tenant_slug": "acme",
  "user_id": "60d21b4667d0d8992e610c85",
  "role": "admin"
}
```

Save the `access_token`. Set it as a variable:
```bash
TOKEN="eyJhbGci..."
```

### Step 2 — Login (existing users)

```bash
curl -X POST http://localhost:8001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@acme.com", "password": "securepassword123"}'
```

### Step 3 — Upload a Document

```bash
curl -X POST http://localhost:8001/api/v1/ingest/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/employee_handbook.pdf"
```

**Response:**
```json
{
  "doc_id": "60d21b4667d0d8992e610c86",
  "filename": "employee_handbook.pdf",
  "file_size": 524288,
  "status": "queued",
  "task_id": "a1b2c3d4-5678-...",
  "message": "Document queued for ingestion. Start Celery worker to process."
}
```

Save the `doc_id`:
```bash
DOC_ID="60d21b4667d0d8992e610c86"
```

### Step 4 — Check Ingestion Status

```bash
curl http://localhost:8001/api/v1/ingest/status/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "doc_id": "60d21b4667d0d8992e610c86",
  "filename": "employee_handbook.pdf",
  "status": "completed",
  "page_count": 12,
  "node_count": 47,
  "error_msg": null,
  "ingested_at": "2025-04-12T14:30:00Z"
}
```

Poll this endpoint until `status == "completed"`.

### Step 5 — List Your Documents

```bash
curl "http://localhost:8001/api/v1/documents?page=1&page_size=20" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "items": [
    {
      "doc_id": "60d21b4667d0d8992e610c86",
      "filename": "employee_handbook.pdf",
      "status": "completed",
      "file_size": 524288,
      "page_count": 12,
      "uploaded_at": "2025-04-12T14:25:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20,
  "has_more": false
}
```

### Step 6 — Semantic Search

```bash
curl -X POST http://localhost:8001/api/v1/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the vacation leave policy?",
    "top_k": 5
  }'
```

**Response:**
```json
{
  "answer": "Employees receive 20 days of paid annual leave per year, accrued at 1.67 days per month. Up to 5 unused days may be carried over into the next calendar year. Requests must be submitted 2 weeks in advance.",
  "results": [
    {
      "doc_id": "60d21b4667d0d8992e610c86",
      "filename": "employee_handbook.pdf",
      "page_number": 3,
      "chunk_text": "All full-time employees receive 20 days of paid annual leave...",
      "score": 0.9142
    }
  ],
  "total": 1,
  "took_ms": 1243.7,
  "cached": false,
  "provider_used": "local_qdrant"
}
```

You can also search via GET:
```bash
curl "http://localhost:8001/api/v1/search?q=vacation+policy&top_k=3" \
  -H "Authorization: Bearer $TOKEN"
```

### Step 7 — Summarize a Document

```bash
curl -X POST http://localhost:8001/api/v1/summarize/document/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "doc_id": "60d21b4667d0d8992e610c86",
  "filename": "employee_handbook.pdf",
  "summary": "This handbook covers Acme Corp's policies on working hours (9-6 PM, hybrid 3 days/week), vacation (20 days/year, 5-day carryover), sick leave (12 days/year), parental leave (16 weeks for primary caregivers), benefits (80% premium coverage), IT security, and expense reporting.",
  "provider_used": "local"
}
```

### Step 8 — Cross-Document Topic Summary

```bash
curl -X POST http://localhost:8001/api/v1/summarize/topic \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic": "company financial performance"}'
```

### Step 9 — Extract Tables

**Trigger extraction:**
```bash
curl -X POST http://localhost:8001/api/v1/extract/tables/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Get extracted tables:**
```bash
curl http://localhost:8001/api/v1/extract/tables/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Export as CSV:**
```bash
curl "http://localhost:8001/api/v1/extract/tables/$DOC_ID/export?format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o tables_export.csv
```

**Export as Markdown:**
```bash
curl "http://localhost:8001/api/v1/extract/tables/$DOC_ID/export?format=markdown" \
  -H "Authorization: Bearer $TOKEN"
```

### Step 10 — Delete a Document

```bash
curl -X DELETE http://localhost:8001/api/v1/documents/$DOC_ID \
  -H "Authorization: Bearer $TOKEN"
```

---

## 9. Full Docker Deployment

For production with all services:

```bash
# 1. Copy and configure your .env
cp .env.example .env
vim .env  # Set all required values

# 2. Build and start all services
docker compose up -d

# 3. Initialize Qdrant (only on first deploy)
docker compose exec api python scripts/init_qdrant.py

# 4. Check all services are healthy
docker compose ps
docker compose logs api --tail=50

# 5. Access the system
# API:      http://your-server:8001
# API Docs: http://your-server:8001/docs
# Frontend: http://your-server:3000 (or behind nginx at :80)
# Metrics:  http://your-server:8001/metrics
```

### Services included in `docker-compose.yml`

| Service | Port | Description |
|---------|------|-------------|
| `api` | 8001 | FastAPI backend |
| `celery_worker` | — | Document ingestion workers |
| `mongodb` | 27017 | Document metadata store |
| `valkey` | 6379 | Cache + Celery broker |
| `unstructured` | 8000 | Advanced PDF/DOCX parsing API |
| `nginx` | 80, 443 | Reverse proxy |
| `clamav` | — | Optional virus scanner |
| `minio` | 9000 | Object storage for large files |

---

## 10. Environment Variables Reference

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `QDRANT_URL` | — | **Yes** | Qdrant Cloud URL with port (`:6333`) |
| `QDRANT_API_KEY` | — | **Yes** | Qdrant Cloud API key (JWT format) |
| `MONGODB_URL` | `mongodb://localhost:27017` | No | MongoDB connection string |
| `MONGODB_DB_NAME` | `company_docs` | No | Database name |
| `VALKEY_URL` | `redis://localhost:6379/0` | No | Valkey/Redis URL |
| `JWT_SECRET_KEY` | — | **Yes** | Minimum 32-char random secret |
| `JWT_EXPIRE_HOURS` | `24` | No | Token expiry in hours |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | No | Ollama API endpoint |
| `OLLAMA_MODEL` | `gemma4:31b-cloud` | No | LLM model name |
| `EMBED_MODEL_NAME` | `BAAI/bge-large-en-v1.5` | No | HuggingFace embedding model |
| `PARSER_PROVIDER` | `unstructured` | No | `unstructured` \| `liteparse` \| `llamaparse` |
| `LLM_PROVIDER` | `ollama` | No | `ollama` \| `openai` \| `gemini` |
| `INDEX_PROVIDER` | `local_qdrant` | No | `local_qdrant` \| `llamacloud` |
| `CHUNK_SIZE` | `512` | No | Tokens per chunk |
| `CHUNK_OVERLAP` | `50` | No | Overlap between chunks |
| `MAX_UPLOAD_MB` | `50` | No | Max file size in MB |
| `UPLOAD_DIR` | `/app/uploads` | No | Local storage for uploaded files |
| `ENABLE_VIRUS_SCAN` | `false` | No | Enable ClamAV virus scan |
| `ENABLE_RERANK` | `false` | No | Enable LLMRerank post-processing |
| `COLLECTION_NAME` | `company_docs` | No | Qdrant collection name |
| `ENVIRONMENT` | `development` | No | `development` \| `production` |

---

## 11. Running Tests

### Generate Demo Data

```bash
# Creates 3 realistic company PDFs in tests/demo_data/
python scripts/generate_demo_data.py
```

Generated files:
- `employee_handbook.pdf` — HR policies, benefits table, leave policy
- `q4_2025_financial_report.pdf` — Revenue breakdowns, P&L table, KPIs
- `engineering_onboarding_guide.pdf` — Setup procedures, architecture, contacts

### Run E2E Tests

```bash
# Start API first: uvicorn src.api.main:app --port 8001
python tests/e2e/test_e2e.py
```

Tests cover:
1. Health check (Qdrant, MongoDB, Ollama connectivity)
2. Tenant registration and JWT issuance
3. Login and password validation
4. Document upload (3 PDFs)
5. Ingestion status polling
6. Document listing with pagination
7. Tenant isolation (Tenant B cannot see Tenant A's documents)
8. Semantic search (results shape, tenant scoping)
9. Summarization endpoints
10. Table extraction endpoints
11. Security (unauthenticated → 401, invalid JWT → 401, public routes accessible)

### Run Qdrant Init

```bash
# Idempotent — safe to re-run, skips if collection already exists
python scripts/init_qdrant.py
```

---

## 12. API Reference

**Base URL**: `http://localhost:8001`  
**Auth**: `Authorization: Bearer <jwt_token>` on all `/api/v1/*` routes except `/auth/*`  
**Interactive Docs**: [http://localhost:8001/docs](http://localhost:8001/docs) (Swagger UI)  
**ReDoc**: [http://localhost:8001/redoc](http://localhost:8001/redoc)

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | Public | Register tenant + first admin user |
| POST | `/api/v1/auth/login` | Public | Login, returns JWT |

### Ingestion
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/ingest/upload` | Required | Upload PDF or DOCX |
| GET | `/api/v1/ingest/status/{doc_id}` | Required | Get ingestion status |

### Documents
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/documents` | Required | List all documents (paginated) |
| DELETE | `/api/v1/documents/{doc_id}` | Required | Delete a document |

### Search
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/search` | Required | Hybrid semantic search |
| GET | `/api/v1/search?q=...&top_k=5` | Required | Search via query param |

### Summarization
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/summarize/document/{doc_id}` | Required | Summarize one document |
| POST | `/api/v1/summarize/topic` | Required | Cross-document topic summary |
| POST | `/api/v1/summarize/classify/{doc_id}` | Required | Classify document category |

### Extraction
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/extract/tables/{doc_id}` | Required | Trigger table extraction |
| GET | `/api/v1/extract/tables/{doc_id}` | Required | Get extracted tables |
| GET | `/api/v1/extract/tables/{doc_id}/export` | Required | Export as CSV or Markdown |
| GET | `/api/v1/extract/tables/{doc_id}/summary` | Required | AI summary of tables |

### System
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | Public | Service health check |
| GET | `/metrics` | Public | Prometheus metrics |
| GET | `/docs` | Public | Swagger UI |
| GET | `/redoc` | Public | ReDoc UI |

---

## 13. Troubleshooting

### API won't start — `TypeError: MotorDatabase object is not callable`
**Cause**: Beanie 2.x installed (incompatible with Motor 3.x)  
**Fix**: `pip install "beanie>=1.26,<2.0"` — already pinned in `pyproject.toml`

### `403 Forbidden` from Qdrant
**Cause**: `QDRANT_API_KEY` missing or wrong  
**Fix**: Set your API key in `.env`. Get it from https://cloud.qdrant.io → Your Cluster → API Keys

### Qdrant URL connection failed
**Cause**: Missing `:6333` port in URL  
**Fix**: Use `https://your-cluster.qdrant.io:6333` (not just `https://...qdrant.io`)

### `model 'gemma4:e4b' not found`
**Cause**: Wrong Ollama model name  
**Fix**: Run `curl http://localhost:11434/api/tags` to list available models, then set `OLLAMA_MODEL=` in `.env`

### Upload returns `ConnectionError: Error 61 connecting to localhost:6379`
**Cause**: Valkey/Redis not running  
**Fix**: Start Redis (`brew install redis && brew services start redis`) or run `docker compose up -d valkey`

### Upload returns `OSError: Read-only file system: '/app'`
**Cause**: `UPLOAD_DIR=/app/uploads` (Docker path) set in `.env` for local dev  
**Fix**: Set `UPLOAD_DIR=/tmp/docufinder/uploads` and `mkdir -p /tmp/docufinder/uploads`

### Password hashing error: `ValueError: password cannot be longer than 72 bytes`
**Cause**: `passlib` 1.7.4 incompatible with `bcrypt` 5.x  
**Fix**: Already fixed in `auth.py` — uses direct `bcrypt.hashpw()` calls

### Health shows `qdrant: false` after init
**Cause**: Minor `vectors_count` attribute rename in `qdrant-client` v1.17  
**Fix**: Already patched in `src/core/qdrant_client.py` and `scripts/init_qdrant.py`

### Search returns 0 results after uploading
**Expected behavior**: Documents are stored as `status=queued` until Celery processes them.  
**Fix**: Start the full stack with `docker compose up -d` and wait for status to become `completed`

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Run tests: `python tests/e2e/test_e2e.py`
4. Commit with conventional commits: `git commit -m "feat: add X"`
5. Open a pull request

## License

MIT — see [LICENSE](LICENSE)
