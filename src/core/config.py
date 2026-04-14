"""
src/core/config.py — Application settings via pydantic-settings.
All configuration is loaded from environment variables / .env file.
"""
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Environment ────────────────────────────────────────────
    environment: str = "development"
    git_sha: str = "local"

    # ── Valkey (BSD-licensed Redis fork) ───────────────────────
    valkey_url: str = "valkey://localhost:6379/0"

    # ── MongoDB ────────────────────────────────────────────────
    mongodb_url: str = "mongodb://admin:password@localhost:27017"
    mongodb_db_name: str = "company_docs"

    # ── Qdrant ─────────────────────────────────────────────────
    # Use qdrant_url for cloud (full URL). If empty, use host+port.
    qdrant_url: str = ""                           # Cloud: full HTTPS URL
    qdrant_api_key: str = ""                       # Cloud API key
    qdrant_host: str = "localhost"                 # Local fallback host
    qdrant_port: int = 6333                        # Local fallback port
    collection_name: str = "company_docs"

    # ── Ollama ─────────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4:e4b"
    ollama_api_key: str = ""
    ollama_request_timeout: float = 300.0          # Timeout in seconds (increase for large models)

    # ── Embedding ──────────────────────────────────────────────
    embed_model_name: str = "BAAI/bge-large-en-v1.5"
    embed_provider: str = "local"                  # local | gpu_worker
    embed_worker_url: str = "http://embed-worker:50051"
    embed_batch_size: int = 32

    # ── Auth ───────────────────────────────────────────────────
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # ── Parsing ────────────────────────────────────────────────
    parser_provider: str = "liteparse"             # liteparse | llamaparse
    enable_pdf_classification: bool = False

    # ── Per-type parser overrides (optional) ───────────────────
    parser_text_dense: Optional[str] = None        # liteparse | llamaparse
    parser_scanned: Optional[str] = None
    parser_complex: Optional[str] = None
    parser_mixed: Optional[str] = None
    parser_docx: Optional[str] = "python-docx"     # python-docx | llamaparse (default: python-docx)

    # ── LlamaCloud ─────────────────────────────────────────────
    llama_cloud_api_key: str = ""
    llamaparse_tier: str = "cost_effective"        # fast|cost_effective|agentic|agentic_plus

    # ── Chunking ───────────────────────────────────────────────
    chunking_strategy: str = "recursive"           # recursive | sentence | semantic
    chunk_size: int = 512
    chunk_overlap: int = 50

    # ── LLM Provider ───────────────────────────────────────────
    llm_provider: str = "ollama"                   # ollama | llamacloud

    # ── Index Provider ─────────────────────────────────────────
    index_provider: str = "local_qdrant"           # local_qdrant | llamacloud

    # ── Extra Providers ─────────────────────────────────────────
    extract_provider: str = "local"                # local | llamaextract
    split_provider: str = "local"                  # local | llamasplit
    classify_provider: str = "local"               # local | llamaclassify
    agent_provider: str = "local"                  # local | llamaagents
    sheets_provider: str = "local"                 # local | llamasheets

    # ── Retrieval ──────────────────────────────────────────────
    top_k: int = 8
    enable_rerank: bool = False

    # ── File paths ─────────────────────────────────────────────
    watch_root: str = "/app/watch_root"
    upload_dir: str = "/app/uploads"
    max_upload_mb: int = 50

    # ── Rate limiting ──────────────────────────────────────────
    upload_mb_limit_per_minute: int = 100
    rate_limit_storage: str = "auto"           # auto | valkey | memory

    # ── Virus scanning ─────────────────────────────────────────
    enable_virus_scan: bool = False
    clamav_host: str = "clamav"
    clamav_port: int = 3310

    # ── Backup ─────────────────────────────────────────────────
    backup_destination: str = "s3"                 # local | s3
    backup_s3_bucket: str = "company-docs-backup"
    backup_s3_endpoint: str = ""                   # Empty for AWS S3
    aws_access_key_id: str = "minioadmin"
    aws_secret_access_key: str = "minioadmin123"
    aws_region: str = "us-east-1"
    backup_retention_days: int = 30

    # ── Observability ──────────────────────────────────────────
    tracing_enabled: bool = False  # Set True to enable Arize Phoenix tracing
    phoenix_endpoint: str = "http://phoenix:4317"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def qdrant_is_cloud(self) -> bool:
        """True if using cloud Qdrant (URL set)."""
        return bool(self.qdrant_url)


@lru_cache()
def get_settings() -> Settings:
    """Return cached Settings singleton."""
    return Settings()
