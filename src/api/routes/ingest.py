"""
src/api/routes/ingest.py — Document upload + ingestion status endpoints.
"""
import hashlib
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Annotated

import structlog
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from src.api.middleware import check_upload_mb_limit
from src.api.routes.auth import get_current_user_dep
from src.core.config import get_settings
from src.core.metrics import rag_documents_total, rag_upload_file_size
from src.models.db import DocRecord, IngestionJob, Tenant, User

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/ingest", tags=["ingest"])

ALLOWED_EXTENSIONS = {".pdf", ".docx"}


class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    file_size: int
    status: str
    task_id: str | None = None
    message: str


class IngestStatusResponse(BaseModel):
    doc_id: str
    filename: str
    status: str
    page_count: int
    node_count: int | None
    error_msg: str | None
    ingested_at: str | None


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: Annotated[UploadFile, File(description="PDF or DOCX file to ingest")],
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> UploadResponse:
    """
    Upload a document for ingestion.
    - Validates file type and size
    - Checks for duplicates (SHA-256 hash)
    - Optionally scans for viruses (ENABLE_VIRUS_SCAN=true)
    - Inserts DocRecord + queues Celery ingest task
    """
    user, tenant_id = auth
    settings = get_settings()

    # Extension check
    filename = file.filename or "upload"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type {ext} not allowed. Use PDF or DOCX.",
        )

    # Size limit
    max_bytes = settings.max_upload_mb * 1024 * 1024
    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size {file_size / 1e6:.1f}MB exceeds limit of {settings.max_upload_mb}MB",
        )

    # MB/minute rate limit (skip gracefully if Valkey not running)
    try:
        await check_upload_mb_limit(tenant_id, file_size)
    except Exception as e:
        log.warning("upload_rate_limit_skipped", error=str(e),
                    hint="Start Valkey for rate limiting")

    # SHA-256 deduplication
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    existing = await DocRecord.find_one(
        DocRecord.tenant_id == PydanticObjectId(tenant_id),
        DocRecord.file_hash == file_hash,
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Document already ingested",
                "doc_id": str(existing.id),
                "filename": existing.filename,
                "status": existing.status,
            },
        )

    # Save file to disk
    tenant = await Tenant.get(PydanticObjectId(tenant_id))
    tenant_dir = Path(settings.upload_dir) / (tenant.slug if tenant else "unknown")
    tenant_dir.mkdir(parents=True, exist_ok=True)
    dest_path = tenant_dir / f"{file_hash[:16]}_{filename}"

    with open(dest_path, "wb") as f:
        f.write(file_bytes)

    # Virus scan (optional)
    if settings.enable_virus_scan:
        from src.ingestion.scanner import get_scanner
        scanner = get_scanner()
        is_clean, threat = await scanner.scan_file(str(dest_path))
        if not is_clean:
            os.unlink(dest_path)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Virus detected in uploaded file: {threat}",
            )

    # Create DocRecord
    doc = DocRecord(
        tenant_id=PydanticObjectId(tenant_id),
        filename=filename,
        file_hash=file_hash,
        mime_type="application/pdf" if ext == ".pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_size=file_size,
        status="queued",
        storage_path=str(dest_path),
    )
    await doc.insert()

    # Dispatch Celery ingestion task (non-fatal if broker down)
    task_id = None
    try:
        from src.ingestion.tasks import ingest_document_task
        task = ingest_document_task.apply_async(
            args=[str(dest_path), str(doc.id), tenant_id],
            queue="ingest",
        )
        task_id = task.id

        # Create IngestionJob record
        job = IngestionJob(
            document_id=doc.id,
            celery_task_id=task_id,
            status="pending",
        )
        await job.insert()
    except Exception as e:
        log.warning("celery_dispatch_failed", error=str(e),
                    doc_id=str(doc.id),
                    hint="Start Celery worker: celery -A src.ingestion.tasks worker")


    # Metrics
    try:
        rag_documents_total.labels(tenant_id=tenant_id[:8], status="queued").inc()
        rag_upload_file_size.labels(mime_type=doc.mime_type).observe(file_size)
    except Exception:
        pass

    log.info("document_uploaded",
             doc_id=str(doc.id), filename=filename,
             file_size=file_size, tenant_id=tenant_id,
             task_id=task_id)

    return UploadResponse(
        doc_id=str(doc.id),
        filename=filename,
        file_size=file_size,
        status="queued",
        task_id=task_id,
        message="Document queued for ingestion. Start Celery worker to process.",
    )


@router.get("/status/{doc_id}", response_model=IngestStatusResponse)
async def get_ingest_status(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> IngestStatusResponse:
    """Get the ingestion status of a specific document."""
    user, tenant_id = auth

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Tenant isolation — never expose another tenant's document
    if str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    job = await IngestionJob.find_one(IngestionJob.document_id == doc.id)

    return IngestStatusResponse(
        doc_id=str(doc.id),
        filename=doc.filename,
        status=doc.status,
        page_count=doc.page_count,
        node_count=job.node_count if job else None,
        error_msg=doc.error_msg,
        ingested_at=doc.ingested_at.isoformat() if doc.ingested_at else None,
    )


@router.post("/retry/{doc_id}", response_model=UploadResponse)
async def retry_document_ingestion(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> UploadResponse:
    """
    Retry ingestion for a document that failed or is stuck.
    Only works for documents with status: failed, queued, or processing.
    """
    user, tenant_id = auth

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Tenant isolation
    if str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Only allow retry for non-completed documents
    if doc.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document already successfully processed. Cannot retry.",
        )

    # Check if file still exists
    if not os.path.exists(doc.storage_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Original file no longer exists. Please upload again.",
        )

    # Reset document status
    doc.status = "queued"
    doc.error_msg = None
    doc.updated_at = datetime.utcnow()
    await doc.save()

    # Dispatch new Celery task
    task_id = None
    try:
        from src.ingestion.tasks import ingest_document_task
        task = ingest_document_task.apply_async(
            args=[doc.storage_path, str(doc.id), tenant_id],
            queue="ingest",
        )
        task_id = task.id

        # Update or create IngestionJob
        job = await IngestionJob.find_one(IngestionJob.document_id == doc.id)
        if job:
            job.celery_task_id = task_id
            job.status = "pending"
            job.error_detail = None
            job.started_at = None
            job.finished_at = None
            await job.save()
        else:
            job = IngestionJob(
                document_id=doc.id,
                celery_task_id=task_id,
                status="pending",
            )
            await job.insert()
    except Exception as e:
        log.warning("celery_dispatch_failed", error=str(e),
                    doc_id=str(doc.id),
                    hint="Start Celery worker: celery -A src.ingestion.tasks worker")

    log.info("document_retry_queued",
             doc_id=str(doc.id), filename=doc.filename,
             tenant_id=tenant_id, task_id=task_id)

    return UploadResponse(
        doc_id=str(doc.id),
        filename=doc.filename,
        file_size=doc.file_size,
        status="queued",
        task_id=task_id,
        message="Document re-queued for ingestion.",
    )
