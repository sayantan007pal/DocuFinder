"""
src/ingestion/watcher.py — File system watcher using watchdog.
Monitors tenant inbox/ folders and triggers ingestion on new files.

Folder structure watched:
  {WATCH_ROOT}/{tenant_slug}/inbox/      ← drop files here
  {WATCH_ROOT}/{tenant_slug}/processing/ ← moved here after pickup

⚠️ Watchdog callbacks are synchronous — use asyncio.run() or sync pymongo.
   Do NOT use Motor/Beanie here. Use pymongo sync client.
"""
import asyncio
import hashlib
import os
import shutil
import time
from pathlib import Path

import structlog
from watchdog.events import FileSystemEventHandler, PatternMatchingEventHandler
from watchdog.observers import Observer

from src.core.config import get_settings

log = structlog.get_logger(__name__)


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


class TenantFolderWatcher(PatternMatchingEventHandler):
    """Watches a single tenant's inbox/ folder."""

    def __init__(self, tenant_slug: str, tenant_id: str, mongo_client):
        super().__init__(
            patterns=["*.pdf", "*.docx"],
            ignore_directories=True,
            case_sensitive=False,
        )
        self.tenant_slug = tenant_slug
        self.tenant_id = tenant_id
        self.mongo = mongo_client
        settings = get_settings()
        self.watch_root = settings.watch_root

    def on_created(self, event):
        self._handle_file(event.src_path)

    def on_modified(self, event):
        self._handle_file(event.src_path)

    def _handle_file(self, file_path: str):
        # Wait for write to complete
        time.sleep(0.5)

        path = Path(file_path)
        if not path.exists() or not path.is_file():
            return

        # Skip files already in processing/
        if "processing" in str(path):
            return

        file_hash = _sha256(str(path))

        # Check for duplicate (sync pymongo)
        db = self.mongo["company_docs"]
        existing = db.documents.find_one({
            "tenant_id": self.tenant_id,
            "file_hash": file_hash,
        })
        if existing:
            log.info("watcher_duplicate_skipped",
                     tenant_slug=self.tenant_slug,
                     filename=path.name,
                     file_hash=file_hash)
            return

        # Insert DocRecord
        from datetime import datetime
        import bson
        file_size = path.stat().st_size
        doc_id = str(bson.ObjectId())

        db.documents.insert_one({
            "_id": bson.ObjectId(doc_id),
            "tenant_id": self.tenant_id,
            "filename": path.name,
            "file_hash": file_hash,
            "file_size": file_size,
            "status": "queued",
            "storage_path": str(path),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        })

        # Move to processing/
        processing_dir = Path(self.watch_root) / self.tenant_slug / "processing"
        processing_dir.mkdir(parents=True, exist_ok=True)
        dest = processing_dir / path.name
        shutil.move(str(path), str(dest))

        # Dispatch Celery task
        from src.ingestion.tasks import ingest_document_task
        ingest_document_task.apply_async(
            args=[str(dest), doc_id, self.tenant_id],
            queue="ingest",
        )

        log.info("watcher_file_queued",
                 tenant_slug=self.tenant_slug,
                 filename=path.name,
                 doc_id=doc_id,
                 action="queued")


def _get_mongo_client():
    """Sync pymongo client — watchdog callbacks are sync."""
    import pymongo
    settings = get_settings()
    return pymongo.MongoClient(settings.mongodb_url)


def start_watcher():
    """
    Discover all tenant inbox/ folders, set up observers, run event loop.
    Also processes any files already in inbox/ at startup (catch-up).
    """
    settings = get_settings()
    watch_root = Path(settings.watch_root)
    watch_root.mkdir(parents=True, exist_ok=True)

    mongo_client = _get_mongo_client()
    db = mongo_client["company_docs"]

    observer = Observer()
    watchers_started = 0

    # Discover all tenant folders
    for tenant_dir in watch_root.iterdir():
        if not tenant_dir.is_dir():
            continue

        tenant_slug = tenant_dir.name
        tenant = db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            log.warning("watcher_tenant_not_found", slug=tenant_slug)
            continue

        tenant_id = str(tenant["_id"])
        inbox_dir = tenant_dir / "inbox"
        inbox_dir.mkdir(exist_ok=True)
        (tenant_dir / "processing").mkdir(exist_ok=True)

        handler = TenantFolderWatcher(tenant_slug, tenant_id, mongo_client)

        # Catch-up: process existing files
        for existing_file in inbox_dir.glob("*.pdf"):
            handler._handle_file(str(existing_file))
        for existing_file in inbox_dir.glob("*.docx"):
            handler._handle_file(str(existing_file))

        observer.schedule(handler, str(inbox_dir), recursive=False)
        watchers_started += 1
        log.info("watcher_started", tenant_slug=tenant_slug, inbox=str(inbox_dir))

    log.info("file_watcher_ready", tenant_count=watchers_started)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        log.info("file_watcher_stopped")

    observer.join()


if __name__ == "__main__":
    start_watcher()
