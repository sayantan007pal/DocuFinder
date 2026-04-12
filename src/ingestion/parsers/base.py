"""
src/ingestion/parsers/base.py — Abstract base class for document parsers.
All parser implementations must inherit from BaseDocumentParser.
"""
import hashlib
from abc import ABC, abstractmethod
from pathlib import Path

from llama_index.core.schema import Document


class BaseDocumentParser(ABC):
    """
    Abstract document parser. Implementations:
    - UnstructuredParser — self-hosted Unstructured.io Docker service
    - LiteParseParser — local-first fast parser
    - LlamaParseParser — LlamaCloud cloud API (upgrade path)
    """

    @abstractmethod
    async def parse(
        self,
        file_path: str,
        doc_id: str,
        tenant_id: str,
    ) -> list[Document]:
        """
        Parse a document file and return LlamaIndex Document objects.

        Args:
            file_path: Absolute path to the document file
            doc_id: MongoDB document ID (str) — included in metadata
            tenant_id: Tenant identifier from JWT — included in metadata

        Returns:
            List of LlamaIndex Document objects (typically 1 per page or logical section)
        """
        ...

    def sha256(self, path: str) -> str:
        """Compute SHA-256 hash of file content."""
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()

    def _base_metadata(self, file_path: str, doc_id: str, tenant_id: str, parser: str) -> dict:
        """Common metadata fields added to every parsed document."""
        p = Path(file_path)
        return {
            "doc_id": doc_id,
            "tenant_id": tenant_id,
            "filename": p.name,
            "file_type": p.suffix.lower().lstrip("."),
            "parser": parser,
        }
