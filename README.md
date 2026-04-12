# Company Document Finder v2

Self-hosted, multi-tenant document RAG system built with **LlamaIndex**, **Qdrant**, **MongoDB**, **Valkey**, and **Ollama (Gemma 4)**.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 15 Frontend (React 19, shadcn/ui, TanStack Query)  │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api/v1/*
┌──────────────────────────▼──────────────────────────────────┐
│  FastAPI  ·  JWT Auth  ·  TenantContextMiddleware            │
└──────────────────────────┬──────────────────────────────────┘
         ┌─────────────────┼─────────────────┐
    Valkey (queue)    MongoDB (docs)    Qdrant Cloud (vectors)
         └─────────────────┼─────────────────┘
                           │
               Celery Worker (ingest)
                           │
         ┌─────────────────┼─────────────────┐
      Parser Router   Classifier      Embed Model
     (Unstructured)  (PyMuPDF)      (BGE-large-en)
                           │
                     Ollama (Gemma 4)
```

## Quick Start

### 1. Configure Environment
```bash
cp .env.example .env
# Edit .env with your values (Qdrant API key, JWT secret, etc.)
```

### 2. Initialize Qdrant Collection
```bash
pip install -e .
python scripts/init_qdrant.py
```

### 3. Start Services
```bash
docker compose up -d
```

### 4. Start Frontend (optional)
```bash
cd frontend && npm install && npm run dev
```

### 5. API is available at
- API:     http://localhost:8001
- Docs:    http://localhost:8001/docs
- Flower:  http://localhost:5555
- Phoenix: http://localhost:6006
- MinIO:   http://localhost:9001

## Provider Swapping

All providers can be swapped via environment variables — **zero code changes**:

| Component   | Default (Self-hosted)      | Cloud Alternative         |
|-------------|---------------------------|---------------------------|
| Parser      | `PARSER_PROVIDER=unstructured` | `llamaparse`           |
| LLM         | `LLM_PROVIDER=ollama`          | `llamacloud`           |
| Index       | `INDEX_PROVIDER=local_qdrant`  | `llamacloud`           |
| Tables      | `SHEETS_PROVIDER=local`        | `llamasheets`          |
| Classify    | `CLASSIFY_PROVIDER=local`      | `llamaclassify`        |

## API Reference

### Authentication
```bash
# Register
curl -X POST http://localhost:8001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenant_name":"Acme","tenant_slug":"acme","email":"admin@acme.com","password":"secret123"}'

# Login
TOKEN=$(curl -s -X POST http://localhost:8001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"secret123"}' | jq -r .access_token)
```

### Upload & Search
```bash
# Upload document
curl -X POST http://localhost:8001/api/v1/ingest/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/document.pdf"

# Search
curl -X POST http://localhost:8001/api/v1/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the vacation policy?","top_k":8}'
```

## Chunking Strategy

Default: **RecursiveCharacterTextSplitter** (512 tokens) — Vecta Feb 2026 benchmark #1 at 69% accuracy.

```bash
CHUNKING_STRATEGY=recursive   # Default — best accuracy
CHUNKING_STRATEGY=sentence    # Faster, slightly lower accuracy
CHUNKING_STRATEGY=semantic    # Best for long-form docs, 2x RAM
```

## Multi-tenancy

- Every JWT contains `tenant_id`
- Every Qdrant query is **automatically filtered** by `tenant_id`
- **Zero cross-tenant data leakage** by design
- Tenants with >20K vectors are auto-promoted to dedicated Qdrant shards

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Vector DB | Qdrant Cloud | 1.16 |
| LLM | Gemma 4 via Ollama | 0.20+ |
| Embeddings | BAAI/bge-large-en-v1.5 | - |
| Orchestration | LlamaIndex | 0.12 |
| Task Queue | Celery + Valkey | 5.4 + 8 |
| Database | MongoDB | 8 (Motor + Beanie) |
| API | FastAPI | 0.115 |
| Parser | Unstructured.io | 0.15 |
| Frontend | Next.js | 15 |
