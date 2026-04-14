"""
src/api/routes/documents.py — Document listing and management.
"""
import os
import mimetypes
from pathlib import Path

import structlog
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
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


# MIME type mapping for common document formats
MIME_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".rtf": "application/rtf",
}


def _get_content_type(filename: str) -> str:
    """Get content type for a file based on extension."""
    ext = Path(filename).suffix.lower()
    if ext in MIME_TYPES:
        return MIME_TYPES[ext]
    # Fallback to mimetypes module
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"


async def _stream_file_with_range(file_path: str, start: int, end: int, chunk_size: int = 64 * 1024):
    """Generator to stream file content within a byte range."""
    with open(file_path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.get("/{doc_id}/file")
async def get_document_file(
    doc_id: str,
    request: Request,
    auth: tuple[User, str] = Depends(get_current_user_dep),
):
    """
    Stream the raw document file (PDF, DOCX, TXT, etc.).
    Supports HTTP Range headers for partial content (enabling PDF.js progressive loading).
    Enforces strict tenant isolation.
    """
    user, tenant_id = auth

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not doc.storage_path or not os.path.exists(doc.storage_path):
        raise HTTPException(status_code=404, detail="Document file not found on disk")

    file_path = doc.storage_path
    file_size = os.path.getsize(file_path)
    content_type = _get_content_type(doc.filename)

    # Parse Range header for partial content support
    range_header = request.headers.get("range")
    
    if range_header:
        # Parse "bytes=start-end" format
        try:
            range_spec = range_header.replace("bytes=", "")
            if "-" in range_spec:
                parts = range_spec.split("-")
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if parts[1] else file_size - 1
            else:
                start = int(range_spec)
                end = file_size - 1
            
            # Clamp values
            start = max(0, start)
            end = min(end, file_size - 1)
            
            if start > end or start >= file_size:
                raise HTTPException(status_code=416, detail="Range not satisfiable")
            
            content_length = end - start + 1
            
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Disposition": f'inline; filename="{doc.filename}"',
            }
            
            return StreamingResponse(
                _stream_file_with_range(file_path, start, end),
                status_code=206,
                media_type=content_type,
                headers=headers,
            )
        except ValueError:
            # Invalid range, fall through to full file response
            pass

    # Full file response (no Range header or invalid range)
    return FileResponse(
        path=file_path,
        media_type=content_type,
        filename=doc.filename,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": f'inline; filename="{doc.filename}"',
        },
    )


@router.get("/{doc_id}/metadata")
async def get_document_metadata(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> DocumentOut:
    """Get detailed metadata for a single document."""
    user, tenant_id = auth

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return DocumentOut(
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
