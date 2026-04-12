"""
src/ingestion/parsers/unstructured.py — Unstructured.io self-hosted parser.

Posts files to the Unstructured Docker service. Groups elements by page_number
and returns one LlamaIndex Document per page group.

⚠️ Unstructured is slow (40–140s per page for hi_res).
   Use UNSTRUCTURED_STRATEGY=fast (default) for text-dense docs.
   Hi-res is used automatically for scanned docs via the PDF router.
"""
from collections import defaultdict
from pathlib import Path

import httpx
import structlog
from llama_index.core.schema import Document

from src.core.config import get_settings
from src.ingestion.parsers.base import BaseDocumentParser

log = structlog.get_logger(__name__)

# Element types to skip — add noise without value
_SKIP_ELEMENT_TYPES = {"Header", "Footer", "PageBreak", "PageNumber"}


class UnstructuredParser(BaseDocumentParser):
    """
    Parse documents via self-hosted Unstructured.io Docker service.
    Supports PDF and DOCX with OCR fallback.
    """

    def __init__(self, strategy: str | None = None):
        settings = get_settings()
        self.strategy = strategy or settings.unstructured_strategy
        self.base_url = settings.unstructured_url

    async def parse(
        self,
        file_path: str,
        doc_id: str,
        tenant_id: str,
    ) -> list[Document]:
        settings = get_settings()
        path = Path(file_path)

        log.info("unstructured_parse_start",
                 file=path.name, strategy=self.strategy,
                 doc_id=doc_id, tenant_id=tenant_id)

        async with httpx.AsyncClient(timeout=360) as client:
            with open(file_path, "rb") as f:
                response = await client.post(
                    f"{self.base_url}/general/v0/general",
                    files={"files": (path.name, f, "application/octet-stream")},
                    data={
                        "strategy": self.strategy,
                        "coordinates": "false",
                    },
                )

        if response.status_code != 200:
            log.error("unstructured_parse_failed",
                      status=response.status_code, body=response.text[:500])
            raise RuntimeError(
                f"Unstructured returned {response.status_code}: {response.text[:200]}"
            )

        elements = response.json()
        log.info("unstructured_parse_done",
                 file=path.name, element_count=len(elements))

        return self._build_documents(elements, file_path, doc_id, tenant_id)

    def _build_documents(
        self,
        elements: list[dict],
        file_path: str,
        doc_id: str,
        tenant_id: str,
    ) -> list[Document]:
        """Group elements by page number, return one Document per page."""
        # Group by page_number (default page 1 if missing)
        page_groups: dict[int, list[str]] = defaultdict(list)
        page_element_types: dict[int, set[str]] = defaultdict(set)

        for element in elements:
            etype = element.get("type", "")
            if etype in _SKIP_ELEMENT_TYPES:
                continue

            text = element.get("text", "").strip()
            if not text:
                continue

            metadata = element.get("metadata", {})
            page_num = metadata.get("page_number", 1)

            page_groups[page_num].append(text)
            page_element_types[page_num].add(etype)

        if not page_groups:
            log.warning("unstructured_no_text_extracted", doc_id=doc_id)
            return []

        total_pages = max(page_groups.keys())
        base_meta = self._base_metadata(file_path, doc_id, tenant_id, "unstructured")

        documents: list[Document] = []
        for page_num, texts in sorted(page_groups.items()):
            doc = Document(
                text="\n\n".join(texts),
                metadata={
                    **base_meta,
                    "page_number": page_num,
                    "total_pages": total_pages,
                    "element_types": sorted(page_element_types[page_num]),
                },
            )
            documents.append(doc)

        log.info("unstructured_documents_built",
                 doc_id=doc_id, page_count=len(documents))
        return documents
