"""
src/extraction/sheets.py — Abstract base classes for table extraction.
"""
import csv
import io
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class TableConfidence(str, Enum):
    HIGH = "high"       # >90% structured, clear headers
    MEDIUM = "medium"   # 70-90% structured
    LOW = "low"         # <70%, may need manual review


@dataclass
class ExtractedTable:
    """Represents a single extracted table from a document."""
    page_number: int
    table_index: int              # Multiple tables per page (0-indexed)
    headers: list[str]
    rows: list[list[str]]         # Each row is a list of cell values
    row_count: int = field(init=False)
    column_count: int = field(init=False)
    bbox: tuple[float, float, float, float] | None = None  # x0, y0, x1, y1
    confidence: TableConfidence = TableConfidence.MEDIUM
    source_parser: str = "unknown"
    extracted_at: datetime = field(default_factory=datetime.utcnow)

    def __post_init__(self):
        self.row_count = len(self.rows)
        self.column_count = len(self.headers) if self.headers else (
            len(self.rows[0]) if self.rows else 0
        )

    def to_csv(self) -> str:
        """Export table as CSV string."""
        output = io.StringIO()
        writer = csv.writer(output)
        if self.headers:
            writer.writerow(self.headers)
        writer.writerows(self.rows)
        return output.getvalue()

    def to_markdown(self) -> str:
        """Export table as Markdown."""
        if not self.headers and not self.rows:
            return ""
        lines = []
        if self.headers:
            lines.append("| " + " | ".join(self.headers) + " |")
            lines.append("|" + "|".join(["---"] * len(self.headers)) + "|")
        for row in self.rows:
            lines.append("| " + " | ".join(str(c) for c in row) + " |")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        """Export as JSON-serializable dict."""
        return {
            "page_number": self.page_number,
            "table_index": self.table_index,
            "headers": self.headers,
            "rows": self.rows,
            "row_count": self.row_count,
            "column_count": self.column_count,
            "confidence": self.confidence.value,
            "source_parser": self.source_parser,
        }


@dataclass
class ExtractionResult:
    """Result of table extraction from a document."""
    doc_id: str
    tenant_id: str
    filename: str
    tables: list[ExtractedTable]
    total_tables: int = field(init=False)
    pages_with_tables: list[int] = field(default_factory=list)
    extraction_time_ms: float = 0
    provider_used: str = "unknown"

    def __post_init__(self):
        self.total_tables = len(self.tables)
        self.pages_with_tables = sorted(set(t.page_number for t in self.tables))


class ExtractionError(Exception):
    """Raised when table extraction fails."""
    pass


class BaseSheetExtractor(ABC):
    """Abstract base class for table extraction providers."""

    @abstractmethod
    async def extract_tables(
        self,
        file_path: str,
        doc_id: str,
        tenant_id: str,
        page_numbers: list[int] | None = None,
    ) -> ExtractionResult:
        """Extract all tables from a document."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the extractor is healthy."""
        ...
