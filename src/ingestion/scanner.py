"""
src/ingestion/scanner.py — ClamAV virus scanner (optional).

Enabled via: ENABLE_VIRUS_SCAN=true
Adds ~100–300ms latency per upload. Only enable for sensitive environments.

⚠️ ClamAV container needs ~2GB RAM and downloads virus definitions on startup.
   First scan may be slow while definitions load (~5-10 minutes).
⚠️ Test with EICAR test file: https://www.eicar.org/download-anti-malware-testfile/
"""
import structlog

log = structlog.get_logger(__name__)


class VirusScanner:
    """ClamAV-based virus scanner for uploaded documents."""

    def __init__(self):
        from src.core.config import get_settings
        settings = get_settings()

        if settings.enable_virus_scan:
            import pyclamd
            self.clamd = pyclamd.ClamdNetworkSocket(
                host=settings.clamav_host,
                port=settings.clamav_port,
            )
            try:
                if not self.clamd.ping():
                    raise RuntimeError(
                        f"ClamAV not reachable at {settings.clamav_host}:{settings.clamav_port}"
                    )
                log.info("clamav_connected",
                         host=settings.clamav_host, port=settings.clamav_port)
            except Exception as exc:
                log.error("clamav_connection_failed", error=str(exc))
                raise
        else:
            self.clamd = None
            log.info("virus_scanning_disabled")

    async def scan_file(self, file_path: str) -> tuple[bool, str | None]:
        """
        Scan a file for viruses.
        Returns (is_clean, threat_name).
        is_clean=True means no virus found.
        is_clean=False means threat detected — delete the file immediately.
        """
        if self.clamd is None:
            return (True, None)  # Scanning disabled

        result = self.clamd.scan_file(file_path)

        if result is None:
            return (True, None)  # Clean

        # result format: {'/path/to/file': ('FOUND', 'Virus.Name')}
        status, threat = result.get(file_path, (None, None))
        if status == "FOUND":
            log.warning("virus_detected", file=file_path, threat=threat)
            return (False, threat)

        return (True, None)


# Module-level singleton — initialized once per worker
_scanner: VirusScanner | None = None


def get_scanner() -> VirusScanner:
    """Return the VirusScanner singleton."""
    global _scanner
    if _scanner is None:
        _scanner = VirusScanner()
    return _scanner
