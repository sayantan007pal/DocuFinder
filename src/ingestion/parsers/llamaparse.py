"""
src/ingestion/parsers/llamaparse.py — LlamaCloud LlamaParse parser.
[SWAP] Only activated when PARSER_PROVIDER=llamaparse and LLAMA_CLOUD_API_KEY is set.

Tiers (as of 2026):
  fast (1 credit/page): text only, no markdown
  cost_effective (3 credits/page): markdown, tables  ← default
  agentic (10 credits/page): complex layouts, images, charts
  agentic_plus (45 credits/page): maximum accuracy
"""
import os
from pathlib import Path

import structlog
from llama_index.core.schema import Document

from src.core.config import get_settings
from src.ingestion.parsers.base import BaseDocumentParser

log = structlog.get_logger(__name__)

# Tier → LlamaParse v2 config flags
TIER_MAP = {
    "fast": {
        "premium_mode": False,
        "use_vendor_multimodal_model": False,
    },
    "cost_effective": {
        "premium_mode": True,
        "use_vendor_multimodal_model": False,
    },
    "agentic": {
        "premium_mode": True,
        "use_vendor_multimodal_model": True,
        "vendor_multimodal_model": "openai-gpt4o",
    },
    "agentic_plus": {
        "premium_mode": True,
        "use_vendor_multimodal_model": True,
        "vendor_multimodal_model": "anthropic-claude-3-5-sonnet",
        "take_screenshot": True,
    },
}


class LlamaParseParser(BaseDocumentParser):
    """
    LlamaCloud cloud-based document parser.
    Requires LLAMA_CLOUD_API_KEY and PARSER_PROVIDER=llamaparse.
    """

    def __init__(self):
        from llama_parse import LlamaParse

        settings = get_settings()
        if not settings.llama_cloud_api_key:
            raise ValueError("LLAMA_CLOUD_API_KEY is required for LlamaParseParser")

        tier = settings.llamaparse_tier
        tier_config = TIER_MAP.get(tier, TIER_MAP["cost_effective"])

        self.parser = LlamaParse(
            api_key=settings.llama_cloud_api_key,
            result_type="markdown",
            verbose=False,
            parsing_instruction="Extract all text, tables, and structure faithfully.",
            **tier_config,
        )
        self.tier = tier
        log.info("llamaparse_initialized", tier=tier)

    async def parse(
        self,
        file_path: str,
        doc_id: str,
        tenant_id: str,
    ) -> list[Document]:
        path = Path(file_path)
        log.info("llamaparse_start", file=path.name, tier=self.tier, doc_id=doc_id)

        documents = await self.parser.aload_data(file_path)

        base_meta = self._base_metadata(file_path, doc_id, tenant_id, "llamaparse")

        for doc in documents:
            doc.metadata.update({
                **base_meta,
                "llamaparse_tier": self.tier,
            })

        log.info("llamaparse_done", file=path.name, doc_count=len(documents))
        return documents
