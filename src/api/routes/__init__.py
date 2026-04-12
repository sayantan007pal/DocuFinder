"""
src/api/routes/__init__.py — Export all route modules.
"""
from src.api.routes import auth, documents, extract, health, ingest, search, summarize

__all__ = ["auth", "documents", "extract", "health", "ingest", "search", "summarize"]
