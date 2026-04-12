"""
src/ingestion/router.py — Intelligent Parser Router.
Routes documents to the optimal parser based on PDF classification.
Supports per-type env var overrides.
"""
from dataclasses import dataclass, field

import structlog

from src.core.config import get_settings
from src.core.providers import ParserProvider
from src.ingestion.classifier import PDFType, classify_pdf

log = structlog.get_logger(__name__)


@dataclass
class ParserConfig:
    provider: ParserProvider
    strategy: str                       # "fast" | "hi_res"
    ocr_enabled: bool
    priority: int                       # 1=high, 3=low
    llamaparse_tier: str | None = None  # fast|cost_effective|agentic|agentic_plus


# Default routing table — overridden by PARSER_* env vars if set
ROUTING_TABLE: dict[tuple, ParserConfig] = {
    # TEXT_DENSE: fast extraction, no OCR needed
    ("application/pdf", PDFType.TEXT_DENSE):
        ParserConfig(ParserProvider.LITEPARSE, "fast", False, 1),
    # SCANNED: requires OCR with hi_res for accuracy
    ("application/pdf", PDFType.SCANNED):
        ParserConfig(ParserProvider.UNSTRUCTURED, "hi_res", True, 2,
                     llamaparse_tier="agentic"),
    # COMPLEX_LAYOUT: tables & charts need hi_res
    ("application/pdf", PDFType.COMPLEX_LAYOUT):
        ParserConfig(ParserProvider.UNSTRUCTURED, "hi_res", False, 2,
                     llamaparse_tier="cost_effective"),
    # MIXED: balance speed and OCR capability
    ("application/pdf", PDFType.MIXED):
        ParserConfig(ParserProvider.UNSTRUCTURED, "fast", True, 2,
                     llamaparse_tier="cost_effective"),
    # DOCX: always fast, no OCR
    ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", None):
        ParserConfig(ParserProvider.UNSTRUCTURED, "fast", False, 1),
}


def get_parser_override(pdf_type: PDFType | None) -> ParserProvider | None:
    """Check for per-type env var overrides (PARSER_TEXT_DENSE, etc.)."""
    settings = get_settings()
    overrides = {
        PDFType.TEXT_DENSE: settings.parser_text_dense,
        PDFType.SCANNED: settings.parser_scanned,
        PDFType.COMPLEX_LAYOUT: settings.parser_complex,
        PDFType.MIXED: settings.parser_mixed,
    }
    if pdf_type is None:
        # DOCX override
        raw = settings.parser_docx
    else:
        raw = overrides.get(pdf_type)

    if raw:
        return ParserProvider(raw)
    return None


def route_to_parser(file_path: str, mime_type: str) -> ParserConfig:
    """
    Determine the optimal parser configuration for a document.
    1. Classify PDF type (if applicable)
    2. Check per-type env var overrides
    3. Look up ROUTING_TABLE
    4. Fall back to Unstructured fast
    """
    settings = get_settings()
    pdf_type = None

    if mime_type == "application/pdf" and settings.enable_pdf_classification:
        pdf_type = classify_pdf(file_path)

    # Check for env var override
    override_provider = get_parser_override(pdf_type)
    if override_provider:
        key = (mime_type, pdf_type)
        base_config = ROUTING_TABLE.get(
            key,
            ParserConfig(ParserProvider.UNSTRUCTURED, "fast", False, 3),
        )
        new_config = ParserConfig(
            provider=override_provider,
            strategy="hi_res" if override_provider == ParserProvider.LLAMAPARSE else base_config.strategy,
            ocr_enabled=base_config.ocr_enabled,
            priority=1,
            llamaparse_tier=base_config.llamaparse_tier,
        )
        log.info("parser_override_applied",
                 mime_type=mime_type, pdf_type=str(pdf_type),
                 provider=override_provider.value)
        return new_config

    # Exact match
    key = (mime_type, pdf_type)
    if key in ROUTING_TABLE:
        config = ROUTING_TABLE[key]
        log.info("parser_routed",
                 mime_type=mime_type, pdf_type=str(pdf_type),
                 provider=config.provider.value, strategy=config.strategy)
        return config

    # Generic fallback (e.g., DOCX without pdf_type in key)
    generic_key = (mime_type, None)
    if generic_key in ROUTING_TABLE:
        return ROUTING_TABLE[generic_key]

    # Ultimate fallback
    log.warning("parser_routing_fallback", mime_type=mime_type)
    return ParserConfig(ParserProvider.UNSTRUCTURED, "fast", False, 3)
