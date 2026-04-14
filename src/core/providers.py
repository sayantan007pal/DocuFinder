"""
src/core/providers.py — Provider Abstraction Layer.
The architectural backbone. All major components have a self-hosted default
and a LlamaCloud upgrade path toggled by environment variables.
Zero code changes needed to swap providers.
"""
from enum import Enum
from functools import lru_cache

import structlog

from src.core.config import get_settings

log = structlog.get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Provider Enums
# ─────────────────────────────────────────────────────────────────────────────

class ParserProvider(str, Enum):
    LITEPARSE = "liteparse"         # default: local-first, fast (~6s/doc)
    LLAMAPARSE = "llamaparse"       # LlamaCloud cloud API
    PYTHONDOCX = "python-docx"      # pure Python DOCX parser (no LibreOffice)


class ChunkingStrategy(str, Enum):
    RECURSIVE = "recursive"         # default: RecursiveCharacterTextSplitter 512t (Vecta 2026 #1 @ 69%)
    SENTENCE = "sentence"           # SentenceSplitter 512t (fallback)
    SEMANTIC = "semantic"           # SemanticSplitterNodeParser (expensive, 2x RAM)


class LLMProvider(str, Enum):
    OLLAMA = "ollama"               # default: Gemma 4 local via Ollama
    LLAMACLOUD = "llamacloud"       # LlamaCloud hosted LLM


class IndexProvider(str, Enum):
    LOCAL_QDRANT = "local_qdrant"   # default: self-hosted / cloud Qdrant
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
    LOCAL = "local"                 # PyMuPDF table extraction
    LLAMASHEETS = "llamasheets"     # LlamaCloud LlamaSheets API


class ClassifyProvider(str, Enum):
    LOCAL = "local"
    LLAMACLASSIFY = "llamaclassify"


class ConfigError(Exception):
    """Raised when a required env var is missing for a cloud provider."""
    pass


# ─────────────────────────────────────────────────────────────────────────────
# Factory Functions
# ─────────────────────────────────────────────────────────────────────────────

@lru_cache()
def get_embed_model():
    """
    Returns HuggingFaceEmbedding — always local, no cloud option.
    Cached as a module-level singleton to avoid reloading the model.
    """
    from llama_index.embeddings.huggingface import HuggingFaceEmbedding

    settings = get_settings()
    log.info("embed_model_loading", model=settings.embed_model_name, device="cpu")

    model = HuggingFaceEmbedding(
        model_name=settings.embed_model_name,
        embed_batch_size=settings.embed_batch_size,
        device="cpu",
    )
    log.info("embed_model_ready", model=settings.embed_model_name)
    return model


@lru_cache()
def get_llm(provider: LLMProvider | None = None):
    """
    Returns the configured LLM.
    Default: Ollama (Gemma 4:e4b) local.
    Swap: LLM_PROVIDER=llamacloud
    """
    settings = get_settings()
    _provider = provider or LLMProvider(settings.llm_provider)

    if _provider == LLMProvider.LLAMACLOUD:
        if not settings.llama_cloud_api_key:
            raise ConfigError("LLAMA_CLOUD_API_KEY is required for LLM_PROVIDER=llamacloud")
        # Placeholder: LlamaCloud LLM wrapper
        raise NotImplementedError("LlamaCloud LLM not yet implemented — use OLLAMA default")

    # Default: Ollama (Gemma 4)
    from llama_index.llms.ollama import Ollama

    log.info("llm_provider_active", provider="ollama", model=settings.ollama_model,
             timeout=settings.ollama_request_timeout)
    return Ollama(
        model=settings.ollama_model,
        base_url=settings.ollama_base_url,
        request_timeout=settings.ollama_request_timeout,
        temperature=0.1,
    )


def get_chunker(strategy: ChunkingStrategy | None = None):
    """
    Returns the configured chunking transform.
    Default: RecursiveCharacterTextSplitter via LangchainNodeParser
             (Vecta Feb 2026 benchmark winner at 69% accuracy).
    """
    settings = get_settings()
    _strategy = strategy or ChunkingStrategy(settings.chunking_strategy)

    if _strategy == ChunkingStrategy.RECURSIVE:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from llama_index.core.node_parser import LangchainNodeParser

        log.info("chunker_active", strategy="recursive",
                 chunk_size=settings.chunk_size, overlap=settings.chunk_overlap)
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        return LangchainNodeParser(splitter)

    elif _strategy == ChunkingStrategy.SENTENCE:
        from llama_index.core.node_parser import SentenceSplitter

        log.info("chunker_active", strategy="sentence",
                 chunk_size=settings.chunk_size, overlap=settings.chunk_overlap)
        return SentenceSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

    elif _strategy == ChunkingStrategy.SEMANTIC:
        log.warning("chunker_semantic_warning",
                    msg="SemanticSplitterNodeParser uses 2x RAM — embed model loaded during chunking")
        from llama_index.node_parser.semantic_splitter import SemanticSplitterNodeParser

        return SemanticSplitterNodeParser(
            embed_model=get_embed_model(),
            breakpoint_percentile_threshold=90,
        )

    raise ValueError(f"Unknown chunking strategy: {_strategy}")


def get_parser(provider: ParserProvider | None = None):
    """
    Returns the configured document parser.
    Default: LiteParseParser for PDFs, PythonDocxParser for DOCX.
    Swap: PARSER_PROVIDER=llamaparse for cloud API
    """
    settings = get_settings()
    _provider = provider or ParserProvider(settings.parser_provider)

    if _provider == ParserProvider.LITEPARSE:
        from src.ingestion.parsers.liteparse import LiteParseParser
        log.info("parser_active", provider="liteparse")
        return LiteParseParser()

    elif _provider == ParserProvider.LLAMAPARSE:
        if not settings.llama_cloud_api_key:
            raise ConfigError(
                "LLAMA_CLOUD_API_KEY is required for PARSER_PROVIDER=llamaparse"
            )
        from src.ingestion.parsers.llamaparse import LlamaParseParser
        log.info("parser_active", provider="llamaparse", tier=settings.llamaparse_tier)
        return LlamaParseParser()

    elif _provider == ParserProvider.PYTHONDOCX:
        from src.ingestion.parsers.pythondocx import PythonDocxParser
        log.info("parser_active", provider="python-docx")
        return PythonDocxParser()

    raise ValueError(f"Unknown parser provider: {_provider}")


def get_sheet_extractor(provider: SheetsProvider | None = None):
    """
    Returns the configured table/sheet extractor.
    Default: LocalSheetExtractor (PyMuPDF).
    Swap: SHEETS_PROVIDER=llamasheets
    """
    settings = get_settings()
    _provider = provider or SheetsProvider(settings.sheets_provider)

    if _provider == SheetsProvider.LOCAL:
        from src.extraction.local_sheets import LocalSheetExtractor
        log.info("sheet_extractor_active", provider="local_pymupdf")
        return LocalSheetExtractor()

    elif _provider == SheetsProvider.LLAMASHEETS:
        if not settings.llama_cloud_api_key:
            raise ConfigError(
                "LLAMA_CLOUD_API_KEY is required for SHEETS_PROVIDER=llamasheets"
            )
        from src.extraction.llamasheets import LlamaSheetsExtractor
        log.info("sheet_extractor_active", provider="llamasheets")
        return LlamaSheetsExtractor()

    raise ValueError(f"Unknown sheets provider: {_provider}")


def get_index_provider() -> str:
    """Returns the current INDEX_PROVIDER setting."""
    return get_settings().index_provider


def log_active_providers() -> None:
    """Log all active providers at startup."""
    settings = get_settings()
    log.info(
        "active_providers",
        parser=settings.parser_provider,
        chunking=settings.chunking_strategy,
        llm=settings.llm_provider,
        index=settings.index_provider,
        embed="huggingface_local",
        sheets=settings.sheets_provider,
        extract=settings.extract_provider,
        classify=settings.classify_provider,
        virus_scan="enabled" if settings.enable_virus_scan else "disabled",
        qdrant="cloud" if settings.qdrant_is_cloud else "local",
    )
