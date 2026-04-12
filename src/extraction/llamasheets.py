"""
src/extraction/llamasheets.py — LlamaCloud LlamaSheets extractor.
[SWAP] Activated when SHEETS_PROVIDER=llamasheets and LLAMA_CLOUD_API_KEY set.
"""
import time
from pathlib import Path

import structlog

from src.core.config import get_settings
from src.extraction.sheets import (
    BaseSheetExtractor,
    ExtractionError,
    ExtractionResult,
    ExtractedTable,
    TableConfidence,
)

log = structlog.get_logger(__name__)


class LlamaSheetsExtractor(BaseSheetExtractor):
    """
    LlamaCloud LlamaSheets extraction.
    Cloud-based table extraction with high accuracy for complex tables.
    """

    def __init__(self):
        settings = get_settings()
        if not settings.llama_cloud_api_key:
            raise ValueError("LLAMA_CLOUD_API_KEY required for LlamaSheets")

        self.api_key = settings.llama_cloud_api_key
        self.base_url = "https://api.cloud.llamaindex.ai/v1"

    async def extract_tables(
        self,
        file_path: str,
        doc_id: str,
        tenant_id: str,
        page_numbers: list[int] | None = None,
    ) -> ExtractionResult:
        import httpx

        t0 = time.monotonic()
        path = Path(file_path)

        async with httpx.AsyncClient(timeout=300) as client:
            with open(file_path, "rb") as f:
                upload_response = await client.post(
                    f"{self.base_url}/sheets/extract",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    files={"file": (path.name, f, "application/octet-stream")},
                    data={
                        "mode": "tables",
                        "output_format": "structured",
                        "page_numbers": ",".join(map(str, page_numbers)) if page_numbers else "",
                    },
                )

        if upload_response.status_code != 200:
            log.error("llamasheets_extraction_failed",
                      status=upload_response.status_code,
                      detail=upload_response.text[:200])
            raise ExtractionError(
                f"LlamaSheets API error: {upload_response.status_code}"
            )

        result = upload_response.json()
        tables = []

        for idx, table_data in enumerate(result.get("tables", [])):
            conf_raw = table_data.get("confidence", "medium")
            try:
                confidence = TableConfidence(conf_raw)
            except ValueError:
                confidence = TableConfidence.MEDIUM

            bbox_raw = table_data.get("bbox")
            bbox = tuple(bbox_raw) if bbox_raw else None

            tables.append(ExtractedTable(
                page_number=table_data.get("page", 1),
                table_index=table_data.get("index", idx),
                headers=table_data.get("headers", []),
                rows=table_data.get("rows", []),
                bbox=bbox,
                confidence=confidence,
                source_parser="llamasheets",
            ))

        log.info("llamasheets_extraction_done",
                 doc_id=doc_id, table_count=len(tables))

        return ExtractionResult(
            doc_id=doc_id,
            tenant_id=tenant_id,
            filename=path.name,
            tables=tables,
            extraction_time_ms=(time.monotonic() - t0) * 1000,
            provider_used="llamasheets",
        )

    async def health_check(self) -> bool:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.base_url}/health",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                )
            return response.status_code == 200
        except Exception:
            return False
