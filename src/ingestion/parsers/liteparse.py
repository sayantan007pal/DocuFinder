"""
src/ingestion/parsers/liteparse.py — LiteParseParser.

LiteParse is LlamaIndex's local-first parser.
~6s per document for text-dense PDFs (vs 40–140s for Unstructured hi_res).
Requires Node.js 20 + @llamaindex/liteparse installed in the Docker image.

Used by default for TEXT_DENSE PDFs per the PDF router.
"""
import subprocess
import tempfile
import json
from pathlib import Path

import structlog
from llama_index.core.schema import Document

from src.ingestion.parsers.base import BaseDocumentParser

log = structlog.get_logger(__name__)


class LiteParseParser(BaseDocumentParser):
    """
    Local-first document parser using LiteParse CLI.
    Installed via: npm install -g @llamaindex/liteparse
    """

    async def parse(
        self,
        file_path: str,
        doc_id: str,
        tenant_id: str,
    ) -> list[Document]:
        path = Path(file_path)
        log.info("liteparse_start", file=path.name, doc_id=doc_id)

        try:
            # Call liteparse CLI — outputs JSON to stdout
            result = subprocess.run(
                ["liteparse", "--json", str(file_path)],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode != 0:
                log.error("liteparse_cli_failed",
                          returncode=result.returncode,
                          stderr=result.stderr[:500])
                raise RuntimeError(f"liteparse failed: {result.stderr[:200]}")

            data = json.loads(result.stdout)

        except (subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            log.error("liteparse_error", file=path.name, error=str(exc))
            raise RuntimeError(f"LiteParse error: {exc}") from exc

        base_meta = self._base_metadata(file_path, doc_id, tenant_id, "liteparse")

        # LiteParse returns a list of page objects or a single text block
        documents: list[Document] = []

        if isinstance(data, list):
            for i, page in enumerate(data):
                text = page.get("text", "") if isinstance(page, dict) else str(page)
                if text.strip():
                    documents.append(Document(
                        text=text,
                        metadata={**base_meta, "page_number": i + 1},
                    ))
        elif isinstance(data, dict):
            text = data.get("text", "") or data.get("content", "")
            if text.strip():
                documents.append(Document(text=text, metadata=base_meta))
        else:
            text = str(data)
            if text.strip():
                documents.append(Document(text=text, metadata=base_meta))

        log.info("liteparse_done", file=path.name, doc_count=len(documents))
        return documents
