"""
src/ingestion/loaders.py — Document loading dispatcher.
Routes documents to the appropriate parser based on MIME type + PDF classification.
"""
import magic
import structlog

from src.core.config import get_settings
from src.core.providers import get_parser
from src.ingestion.router import route_to_parser
from src.ingestion.parsers.unstructured import UnstructuredParser

log = structlog.get_logger(__name__)

# Allowed MIME types
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc (legacy)
}


async def load_document(
    file_path: str,
    doc_id: str,
    tenant_id: str,
) -> list:
    """
    Load and parse a document using the appropriate parser.
    Validates MIME type, classifies PDF, routes to optimal parser.

    Returns list of LlamaIndex Document objects.
    """
    # MIME type validation using python-magic (not just file extension)
    mime_type = magic.from_file(file_path, mime=True)
    if mime_type not in ALLOWED_MIME_TYPES:
        raise ValueError(
            f"Unsupported file type: {mime_type}. "
            f"Allowed: {', '.join(ALLOWED_MIME_TYPES)}"
        )

    settings = get_settings()

    if settings.enable_pdf_classification:
        # Intelligent routing: classify PDF, pick optimal parser
        config = route_to_parser(file_path, mime_type)
        parser = get_parser(config.provider)

        # If unstructured, pass the routing-determined strategy
        if isinstance(parser, UnstructuredParser):
            parser = UnstructuredParser(strategy=config.strategy)

        log.info("parser_selected",
                 doc_id=doc_id,
                 provider=config.provider.value,
                 strategy=config.strategy,
                 mime_type=mime_type)
    else:
        # Simple mode: use default provider from settings
        parser = get_parser()
        log.info("parser_default",
                 doc_id=doc_id,
                 provider=settings.parser_provider,
                 mime_type=mime_type)

    documents = await parser.parse(file_path, doc_id, tenant_id)
    log.info("document_loaded",
             doc_id=doc_id, doc_count=len(documents), mime_type=mime_type)
    return documents
