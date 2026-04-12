"""
src/core/backup.py — S3/MinIO backup client.
"""
import structlog
from datetime import datetime

log = structlog.get_logger(__name__)


class BackupClient:
    """Manages backups of MongoDB, uploaded documents, and Qdrant snapshots to S3/MinIO."""

    def __init__(self):
        from src.core.config import get_settings
        import boto3

        self.settings = get_settings()
        s3_kwargs = {
            "aws_access_key_id": self.settings.aws_access_key_id,
            "aws_secret_access_key": self.settings.aws_secret_access_key,
            "region_name": self.settings.aws_region,
        }
        if self.settings.backup_s3_endpoint:
            s3_kwargs["endpoint_url"] = self.settings.backup_s3_endpoint

        self.s3 = boto3.client("s3", **s3_kwargs)
        self.bucket = self.settings.backup_s3_bucket

    def _ensure_bucket(self):
        """Create the backup bucket if it doesn't exist."""
        try:
            self.s3.head_bucket(Bucket=self.bucket)
        except Exception:
            self.s3.create_bucket(Bucket=self.bucket)
            log.info("backup_bucket_created", bucket=self.bucket)

    async def backup_mongodb(self) -> str:
        """Export MongoDB collections to JSON and upload to S3."""
        import subprocess
        from pathlib import Path

        self._ensure_bucket()
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        backup_file = f"/tmp/mongodb_backup_{timestamp}.gz"

        log.info("backup_mongodb_start", timestamp=timestamp)

        result = subprocess.run(
            [
                "mongodump",
                "--uri", self.settings.mongodb_url,
                "--db", self.settings.mongodb_db_name,
                "--archive", backup_file,
                "--gzip",
            ],
            capture_output=True,
        )

        if result.returncode != 0:
            log.error("backup_mongodb_failed", error=result.stderr.decode()[:500])
            raise RuntimeError(f"mongodump failed: {result.stderr.decode()[:200]}")

        key = f"mongodb/{timestamp}.gz"
        self.s3.upload_file(backup_file, self.bucket, key)
        log.info("backup_mongodb_done", s3_key=key)

        import os
        os.unlink(backup_file)
        return key

    async def backup_documents(self) -> str:
        """Upload all documents directory to S3 as a tar.gz."""
        import subprocess
        import os

        self._ensure_bucket()
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        archive = f"/tmp/documents_backup_{timestamp}.tar.gz"

        result = subprocess.run(
            ["tar", "-czf", archive, self.settings.upload_dir],
            capture_output=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"tar failed: {result.stderr.decode()[:200]}")

        key = f"documents/{timestamp}.tar.gz"
        self.s3.upload_file(archive, self.bucket, key)
        log.info("backup_documents_done", s3_key=key)
        os.unlink(archive)
        return key

    async def backup_qdrant(self) -> str:
        """Create a Qdrant collection snapshot (only available for self-hosted)."""
        from src.core.config import get_settings

        if self.settings.qdrant_is_cloud:
            log.warning("backup_qdrant_skipped",
                        reason="Qdrant Cloud manages its own backups")
            return "N/A"

        from qdrant_client import QdrantClient
        client = QdrantClient(
            host=self.settings.qdrant_host, port=self.settings.qdrant_port
        )

        snapshot = client.create_snapshot(collection_name=self.settings.collection_name)
        log.info("backup_qdrant_snapshot_created",
                 collection=self.settings.collection_name,
                 snapshot=snapshot.name)
        return snapshot.name

    def enforce_retention(self) -> None:
        """Delete backup objects older than BACKUP_RETENTION_DAYS."""
        from datetime import timedelta
        import boto3

        cutoff = datetime.utcnow() - timedelta(days=self.settings.backup_retention_days)

        for prefix in ["mongodb/", "documents/", "qdrant/"]:
            response = self.s3.list_objects_v2(Bucket=self.bucket, Prefix=prefix)
            for obj in response.get("Contents", []):
                if obj["LastModified"].replace(tzinfo=None) < cutoff:
                    self.s3.delete_object(Bucket=self.bucket, Key=obj["Key"])
                    log.info("backup_retention_deleted", key=obj["Key"])
