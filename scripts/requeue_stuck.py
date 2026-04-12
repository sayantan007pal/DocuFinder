#!/usr/bin/env python3
"""
scripts/requeue_stuck.py — Re-queue documents stuck in 'queued' status.

Use this after starting Valkey + Celery to process documents that were
uploaded when the broker was unavailable.

Usage:
    python scripts/requeue_stuck.py
"""
import asyncio
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def main():
    from src.core.database import init_db
    from src.models.db import DocRecord, IngestionJob
    from src.ingestion.tasks import ingest_document_task

    print("Connecting to MongoDB...")
    await init_db()

    # Find all documents stuck in 'queued' status
    stuck = await DocRecord.find(DocRecord.status == "queued").to_list()
    print(f"Found {len(stuck)} stuck document(s) with status='queued'")

    if not stuck:
        print("Nothing to requeue. Exiting.")
        return

    requeued = 0
    failed = 0

    for doc in stuck:
        try:
            # Dispatch Celery task
            task = ingest_document_task.apply_async(
                args=[doc.storage_path, str(doc.id), str(doc.tenant_id)],
                queue="ingest",
            )

            # Create or update IngestionJob record
            existing_job = await IngestionJob.find_one(
                IngestionJob.document_id == doc.id
            )
            if existing_job:
                existing_job.celery_task_id = task.id
                existing_job.status = "pending"
                await existing_job.save()
            else:
                job = IngestionJob(
                    document_id=doc.id,
                    celery_task_id=task.id,
                    status="pending",
                )
                await job.insert()

            print(f"  ✓ Re-queued: {doc.filename} → task_id={task.id}")
            requeued += 1

        except Exception as e:
            print(f"  ✗ Failed to requeue {doc.filename}: {e}")
            failed += 1

    print(f"\nDone. Requeued: {requeued}, Failed: {failed}")
    print("Monitor progress with: celery -A src.ingestion.tasks flower")


if __name__ == "__main__":
    asyncio.run(main())
