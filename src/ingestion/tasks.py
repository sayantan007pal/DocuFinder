"""
src/ingestion/tasks.py — Celery task definitions using Valkey as broker.

⚠️ Celery tasks are synchronous. Async parsers are called via asyncio.run().
   Each task creates a fresh event loop. This is intentional and documented.
⚠️ worker_prefetch_multiplier=1 is critical: process one document at a time
   to prevent OOM from loading multiple embed models.
⚠️ Broker URL uses valkey:// not redis://
"""
import asyncio
import logging
from datetime import datetime

import structlog
from celery import Celery
from celery.schedules import crontab

from src.core.config import get_settings

log = structlog.get_logger(__name__)
settings = get_settings()

# ─── Celery App Configuration ─────────────────────────────────

celery_app = Celery("doc_finder")

celery_app.config_from_object(
    {
        "broker_url": settings.valkey_url,           # valkey:// not redis://
        "result_backend": settings.valkey_url,
        "task_serializer": "json",
        "result_serializer": "json",
        "accept_content": ["json"],
        "worker_prefetch_multiplier": 1,             # CRITICAL: one task at a time
        "task_acks_late": True,
        "worker_max_tasks_per_child": 50,            # Recycle worker after 50 tasks
        "result_expires": 3600,
        "task_routes": {
            "src.ingestion.tasks.ingest_document_task": {"queue": "ingest"},
            "src.ingestion.tasks.batch_ingest_folder_task": {"queue": "ingest"},
            "src.ingestion.tasks.scheduled_batch_ingest": {"queue": "default"},
            "src.ingestion.tasks.check_tenant_promotion": {"queue": "default"},
            "src.ingestion.tasks.run_backup": {"queue": "default"},
        },
        "beat_schedule": {
            "nightly-batch-ingest": {
                "task": "src.ingestion.tasks.scheduled_batch_ingest",
                "schedule": crontab(hour=2, minute=0),
            },
            "daily-tenant-promotion-check": {
                "task": "src.ingestion.tasks.check_tenant_promotion",
                "schedule": crontab(hour=3, minute=30),
            },
            "nightly-full-backup": {
                "task": "src.ingestion.tasks.run_backup",
                "schedule": crontab(hour=3, minute=0),
                "kwargs": {"full": True},
            },
            "hourly-mongodb-backup": {
                "task": "src.ingestion.tasks.run_backup",
                "schedule": crontab(minute=0),
                "kwargs": {"mongodb": True},
            },
            "weekly-backup-cleanup": {
                "task": "src.ingestion.tasks.run_backup",
                "schedule": crontab(day_of_week=0, hour=4, minute=0),
                "kwargs": {"cleanup": True},
            },
        },
    }
)


# ─── Async helper for sync Celery context ─────────────────────

def _run_async(coro):
    """
    Run an async coroutine from a sync Celery task.
    Creates a fresh event loop — intentional pattern for Celery compatibility.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─── Init DB helper for Celery workers ────────────────────────

_db_initialized = False


def _ensure_db():
    """Initialize MongoDB + Beanie for sync Celery usage."""
    global _db_initialized
    if not _db_initialized:
        from src.core.database import init_db
        _run_async(init_db())
        _db_initialized = True


# ─── Tasks ────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="ingest",
    name="src.ingestion.tasks.ingest_document_task",
)
def ingest_document_task(self, file_path: str, doc_id: str, tenant_id: str):
    """
    Main ingestion task. Parse → embed → upsert to Qdrant.
    Called by the upload endpoint and file watcher.

    ⚠️ asyncio.run() pattern: async parsers called from sync Celery task.
    """
    _ensure_db()

    from beanie import PydanticObjectId
    from src.models.db import DocRecord, IngestionJob
    from src.core.qdrant_client import get_vector_store
    from src.ingestion.loaders import load_document
    from src.ingestion.pipeline import run_pipeline

    doc_obj_id = PydanticObjectId(doc_id)

    try:
        # a. Mark as processing
        _run_async(
            DocRecord.find_one(DocRecord.id == doc_obj_id).update(
                {"$set": {"status": "processing", "updated_at": datetime.utcnow()}}
            )
        )
        _run_async(
            IngestionJob.find_one(IngestionJob.document_id == doc_obj_id).update(
                {"$set": {"status": "running", "started_at": datetime.utcnow()}}
            )
        )
        log.info("ingest_task_started", doc_id=doc_id, tenant_id=tenant_id)

        # b. Parse document (async → sync bridge)
        documents = _run_async(load_document(file_path, doc_id, tenant_id))

        if not documents:
            raise ValueError("No content extracted from document")

        # c. Get tenant-scoped vector store
        vector_store = get_vector_store(tenant_id)

        # d. Run ingestion pipeline
        node_count = run_pipeline(documents, doc_id, tenant_id, vector_store)

        # e. Mark as completed
        _run_async(
            DocRecord.find_one(DocRecord.id == doc_obj_id).update(
                {
                    "$set": {
                        "status": "completed",
                        "page_count": len(documents),
                        "ingested_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                    }
                }
            )
        )
        _run_async(
            IngestionJob.find_one(IngestionJob.document_id == doc_obj_id).update(
                {
                    "$set": {
                        "status": "success",
                        "finished_at": datetime.utcnow(),
                        "node_count": node_count,
                    }
                }
            )
        )
        log.info("ingest_task_complete",
                 doc_id=doc_id, tenant_id=tenant_id,
                 pages=len(documents), nodes=node_count)

    except Exception as exc:
        log.error("ingest_task_failed",
                  doc_id=doc_id, tenant_id=tenant_id,
                  error=str(exc), exc_info=True)
        # Mark as failed
        _run_async(
            DocRecord.find_one(DocRecord.id == doc_obj_id).update(
                {
                    "$set": {
                        "status": "failed",
                        "error_msg": str(exc)[:500],
                        "updated_at": datetime.utcnow(),
                    }
                }
            )
        )
        _run_async(
            IngestionJob.find_one(IngestionJob.document_id == doc_obj_id).update(
                {
                    "$set": {
                        "status": "failed",
                        "finished_at": datetime.utcnow(),
                        "error_detail": str(exc)[:1000],
                    }
                }
            )
        )
        raise self.retry(exc=exc)


@celery_app.task(
    queue="ingest",
    name="src.ingestion.tasks.batch_ingest_folder_task",
)
def batch_ingest_folder_task(folder: str, tenant_id: str):
    """Batch ingest all PDF/DOCX files in a folder for a tenant."""
    import hashlib
    from pathlib import Path
    from beanie import PydanticObjectId
    from src.models.db import DocRecord, Tenant

    _ensure_db()

    folder_path = Path(folder)
    files = list(folder_path.glob("*.pdf")) + list(folder_path.glob("*.docx"))

    found = len(files)
    skipped = 0
    queued = 0

    tenant = _run_async(Tenant.find_one({"tier": {"$exists": True}}))  # placeholder

    for file_path in files:
        # Compute SHA-256
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        file_hash = h.hexdigest()

        # Check for duplicate
        existing = _run_async(
            DocRecord.find_one(
                DocRecord.tenant_id == PydanticObjectId(tenant_id),
                DocRecord.file_hash == file_hash,
            )
        )
        if existing:
            skipped += 1
            continue

        # Insert DocRecord + dispatch task
        doc = DocRecord(
            tenant_id=PydanticObjectId(tenant_id),
            filename=file_path.name,
            file_hash=file_hash,
            storage_path=str(file_path),
            status="queued",
        )
        _run_async(doc.insert())

        ingest_document_task.apply_async(
            args=[str(file_path), str(doc.id), tenant_id],
            queue="ingest",
        )
        queued += 1

    log.info("batch_ingest_complete",
             folder=folder, tenant_id=tenant_id,
             found=found, skipped=skipped, queued=queued)


@celery_app.task(
    queue="default",
    name="src.ingestion.tasks.scheduled_batch_ingest",
)
def scheduled_batch_ingest():
    """Nightly: ingest all files in tenant inbox/ folders."""
    _ensure_db()
    from src.models.db import Tenant

    tenants = _run_async(Tenant.find(Tenant.is_active == True).to_list())
    log.info("scheduled_batch_ingest_start", tenant_count=len(tenants))

    settings = get_settings()
    for tenant in tenants:
        tenant_folder = f"{settings.watch_root}/{tenant.slug}/inbox"
        batch_ingest_folder_task.apply_async(
            args=[tenant_folder, str(tenant.id)],
            queue="ingest",
        )


@celery_app.task(
    queue="default",
    name="src.ingestion.tasks.check_tenant_promotion",
)
def check_tenant_promotion():
    """
    Auto-promote tenants to dedicated Qdrant shards when > 20K vectors.
    Scheduled daily at 03:30 UTC via Celery Beat.
    """
    _ensure_db()
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue
    from src.models.db import Tenant

    PROMOTION_THRESHOLD = 20_000

    settings = get_settings()

    if settings.qdrant_is_cloud:
        qdrant_kwargs = {"url": settings.qdrant_url}
        if settings.qdrant_api_key:
            qdrant_kwargs["api_key"] = settings.qdrant_api_key
    else:
        qdrant_kwargs = {"host": settings.qdrant_host, "port": settings.qdrant_port}

    client = QdrantClient(**qdrant_kwargs)
    tenants = _run_async(Tenant.find(Tenant.is_active == True).to_list())

    for tenant in tenants:
        if tenant.tier == "DEDICATED":
            continue

        count_result = client.count(
            collection_name=settings.collection_name,
            count_filter=Filter(
                must=[FieldCondition(key="tenant_id", match=MatchValue(value=str(tenant.id)))]
            ),
        )

        if count_result.count >= PROMOTION_THRESHOLD:
            client.create_shard_key(
                collection_name=settings.collection_name,
                shard_key=str(tenant.id),
            )
            _run_async(
                tenant.update({"$set": {"tier": "DEDICATED"}})
            )
            log.info("tenant_promoted_to_dedicated_shard",
                     tenant_id=str(tenant.id),
                     tenant_slug=tenant.slug,
                     vector_count=count_result.count)


@celery_app.task(
    queue="default",
    name="src.ingestion.tasks.run_backup",
)
def run_backup(full=False, mongodb=False, qdrant=False, documents=False, cleanup=False):
    """Backup task for Celery Beat scheduling. See src/core/backup.py."""
    from src.core.backup import BackupClient

    async def _run():
        client = BackupClient()
        if full or mongodb:
            await client.backup_mongodb()
        if full or qdrant:
            await client.backup_qdrant()
        if full or documents:
            await client.backup_documents()
        if cleanup:
            client.enforce_retention()

    _run_async(_run())
