"""
src/api/routes/extract.py — Table extraction endpoints.
"""
import io
import csv

import structlog
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.api.routes.auth import get_current_user_dep
from src.models.db import DocRecord, ExtractedTableRecord, User

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/extract", tags=["extract"])


class TableOut(BaseModel):
    id: str
    doc_id: str
    page_number: int
    table_index: int
    headers: list[str]
    rows: list[list[str]]
    row_count: int
    column_count: int
    confidence: str
    source_parser: str


class ExtractionStatusResponse(BaseModel):
    doc_id: str
    filename: str
    total_tables: int
    pages_with_tables: list[int]
    provider_used: str
    extraction_time_ms: float


@router.post("/tables/{doc_id}", response_model=ExtractionStatusResponse)
async def extract_tables(
    doc_id: str,
    page_numbers: list[int] | None = Query(None),
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> ExtractionStatusResponse:
    """
    Extract tables from a document.
    Results are cached in MongoDB with 90-day TTL.
    """
    user, tenant_id = auth
    from src.core.config import get_settings
    from src.core.providers import get_sheet_extractor

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if doc.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Document not ready (status: {doc.status})",
        )

    extractor = get_sheet_extractor()
    result = await extractor.extract_tables(
        file_path=doc.storage_path,
        doc_id=doc_id,
        tenant_id=tenant_id,
        page_numbers=page_numbers,
    )

    # Cache extracted tables in MongoDB
    for table in result.tables:
        existing = await ExtractedTableRecord.find_one(
            ExtractedTableRecord.doc_id == PydanticObjectId(doc_id),
            ExtractedTableRecord.page_number == table.page_number,
            ExtractedTableRecord.table_index == table.table_index,
        )
        if not existing:
            tr = ExtractedTableRecord(
                doc_id=PydanticObjectId(doc_id),
                tenant_id=PydanticObjectId(tenant_id),
                page_number=table.page_number,
                table_index=table.table_index,
                headers=table.headers,
                rows=table.rows,
                row_count=table.row_count,
                column_count=table.column_count,
                confidence=table.confidence.value,
                source_parser=table.source_parser,
            )
            await tr.insert()

    return ExtractionStatusResponse(
        doc_id=doc_id,
        filename=doc.filename,
        total_tables=result.total_tables,
        pages_with_tables=result.pages_with_tables,
        provider_used=result.provider_used,
        extraction_time_ms=result.extraction_time_ms,
    )


@router.get("/tables/{doc_id}", response_model=list[TableOut])
async def get_tables(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> list[TableOut]:
    """Retrieve cached extracted tables for a document."""
    user, tenant_id = auth

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc or str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    records = await ExtractedTableRecord.find(
        ExtractedTableRecord.doc_id == PydanticObjectId(doc_id),
        ExtractedTableRecord.tenant_id == PydanticObjectId(tenant_id),
    ).sort("page_number", "table_index").to_list()

    return [
        TableOut(
            id=str(r.id),
            doc_id=doc_id,
            page_number=r.page_number,
            table_index=r.table_index,
            headers=r.headers,
            rows=r.rows,
            row_count=r.row_count,
            column_count=r.column_count,
            confidence=r.confidence,
            source_parser=r.source_parser,
        )
        for r in records
    ]


@router.get("/tables/{doc_id}/export")
async def export_tables_csv(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """Download all extracted tables as a single CSV file."""
    user, tenant_id = auth

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc or str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    records = await ExtractedTableRecord.find(
        ExtractedTableRecord.doc_id == PydanticObjectId(doc_id),
        ExtractedTableRecord.tenant_id == PydanticObjectId(tenant_id),
    ).sort("page_number").to_list()

    if not records:
        raise HTTPException(status_code=404, detail="No tables found")

    output = io.StringIO()
    writer = csv.writer(output)

    for r in records:
        writer.writerow([f"Page {r.page_number} — Table {r.table_index + 1}"])
        writer.writerow(r.headers)
        writer.writerows(r.rows)
        writer.writerow([])

    output.seek(0)
    filename = f"tables_{doc.filename}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tables/{doc_id}/summary")
async def tables_summary(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> dict:
    """Get a markdown summary of all extracted tables."""
    user, tenant_id = auth

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc or str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=404, detail="Document not found")

    records = await ExtractedTableRecord.find(
        ExtractedTableRecord.doc_id == PydanticObjectId(doc_id),
    ).sort("page_number").to_list()

    summaries = []
    for r in records:
        from src.extraction.sheets import ExtractedTable, TableConfidence
        t = ExtractedTable(
            page_number=r.page_number,
            table_index=r.table_index,
            headers=r.headers,
            rows=r.rows,
            confidence=TableConfidence(r.confidence),
            source_parser=r.source_parser,
        )
        summaries.append({
            "page": r.page_number,
            "table": r.table_index + 1,
            "markdown": t.to_markdown(),
        })

    return {
        "doc_id": doc_id,
        "filename": doc.filename,
        "tables": summaries,
    }
