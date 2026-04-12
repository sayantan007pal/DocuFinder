"""
src/api/routes/documents.py — Document listing and management.
"""
import os

import structlog
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.api.routes.auth import get_current_user_dep
from src.models.db import DocRecord, User

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentOut(BaseModel):
    id: str
    filename: str
    file_size: int
    status: str
    page_count: int
    pdf_type: str | None
    parser_used: str | None
    ingested_at: str | None
    created_at: str


class PaginatedDocuments(BaseModel):
    items: list[DocumentOut]
    total: int
    page: int
    page_size: int
    has_more: bool


@router.get("", response_model=PaginatedDocuments)
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> PaginatedDocuments:
    """List documents for the current tenant. Supports pagination and status filter."""
    user, tenant_id = auth
    tid = PydanticObjectId(tenant_id)
    skip = (page - 1) * page_size

    query = DocRecord.find(DocRecord.tenant_id == tid)
    if status:
        query = query.find(DocRecord.status == status)

    total = await query.count()
    docs = await query.skip(skip).limit(page_size).sort(-DocRecord.created_at).to_list()

    items = [
        DocumentOut(
            id=str(doc.id),
            filename=doc.filename,
            file_size=doc.file_size,
            status=doc.status,
            page_count=doc.page_count,
            pdf_type=doc.pdf_type,
            parser_used=doc.parser_used,
            ingested_at=doc.ingested_at.isoformat() if doc.ingested_at else None,
            created_at=doc.created_at.isoformat(),
        )
        for doc in docs
    ]

    return PaginatedDocuments(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(skip + page_size) < total,
    )


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> None:
    """
    Delete a document and its vectors from Qdrant.
    Enforces strict tenant isolation.
    """
    user, tenant_id = auth

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Delete vectors from Qdrant using doc_id payload filter
    from src.core.qdrant_client import get_async_qdrant_client
    from src.core.config import get_settings
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue

    settings = get_settings()
    qdrant = get_async_qdrant_client()

    await qdrant.delete(
        collection_name=settings.collection_name,
        points_selector=Filter(
            must=[
                FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                FieldCondition(key="doc_id", match=MatchValue(value=doc_id)),
            ]
        ),
    )

    # Delete file from disk
    if doc.storage_path and os.path.exists(doc.storage_path):
        os.unlink(doc.storage_path)

    # Delete MongoDB records
    from src.models.db import IngestionJob, ExtractedTableRecord
    await IngestionJob.find(IngestionJob.document_id == doc.id).delete()
    await ExtractedTableRecord.find(ExtractedTableRecord.doc_id == doc.id).delete()
    await doc.delete()

    log.info("document_deleted", doc_id=doc_id, tenant_id=tenant_id, filename=doc.filename)
